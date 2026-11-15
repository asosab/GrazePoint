// servicios/fieldShift/routes/fieldShift.js — API del proyecto.
//
// Autoloader de nodeLab la monta en /api/fieldShift. En el backend
// standalone (fieldShift/backend) se monta igual.
//
// Público:  POST /auth/{registro,verificar,login,recuperar,restablecer,reenviar}
//           GET  /salud
// Sesión:   GET  /me · /catalogo
//           CRUD /predios y sub-recursos parcelas/siembras/suelos/aforos
//           GET  /predios/:id/analisis · /predios/:id/informe.pdf
// Admin:    GET  /admin/usuarios · PUT /admin/usuarios/:id/rol

const express = require('express');
const router = express.Router();
const cnf = require('../config');
const db = require('../db');
const authSrv = require('../services/auth');
const { authenticate, soloAdmin } = require('../middleware/auth');
const Predio = require('../models/predioModel');
const FsUser = require('../models/fsUserModel');
const rotacion = require('../services/rotacion');
const ventana = require('../services/ventana');
const power = require('../services/power');
const sueloWeb = require('../services/sueloWeb');
const informe = require('../services/informe');

// Conexión propia al cargar el módulo (reintenta sola si mongo aún no está).
db.init();

// CORS propio: Bearer, sin cookies. En nodeLab ya hay cors() global abierto;
// esto mantiene el comportamiento en el backend standalone.
router.use((req, res, next) => {
	const origin = req.get('Origin');
	if (origin && cnf.corsOrigins.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.setHeader('Vary', 'Origin');
	}
	if (req.method === 'OPTIONS') return res.sendStatus(204);
	next();
});

const wrap = (fn) => async (req, res) => {
	try {
		await fn(req, res);
	} catch (err) {
		console.log(cnf.tag + ' [error] ' + req.method + ' ' + req.path + ': ' + (err && err.message ? err.message : err));
		res.status(500).json({ ok: false, error: 'error_interno' });
	}
};

const sinDb = (res) => res.status(503).json({ ok: false, error: 'bd_no_disponible' });

// 'es' solo si el cliente lo pide; el inglés es el idioma por defecto.
const langDe = (req) => {
	const l = (req.query && req.query.lang) || (req.body && req.body.lang);
	return l === 'es' ? 'es' : 'en';
};

// ── Salud / meta ────────────────────────────────────────────────────────────

router.get('/salud', (req, res) => {
	res.json({ ok: true, servicio: cnf.name, bd: db.lista(), hora: new Date().toISOString() });
});

// ── Auth ────────────────────────────────────────────────────────────────────

router.post('/auth/registro', wrap(async (req, res) => {
	if (!db.lista()) return sinDb(res);
	const r = await authSrv.registro(req.body || {});
	res.status(r.status || 200).json(r.ok ? { ok: true, requiereVerificacion: true } : { ok: false, error: r.error });
}));

router.post('/auth/verificar', wrap(async (req, res) => {
	const r = await authSrv.verificar(req.body || {});
	res.status(r.status || 200).json(r.ok ? { ok: true, token: r.token, usuario: r.usuario } : { ok: false, error: r.error });
}));

router.post('/auth/login', wrap(async (req, res) => {
	const r = await authSrv.login(req.body || {});
	res.status(r.status || 200).json(r.ok ? { ok: true, token: r.token, usuario: r.usuario } : { ok: false, error: r.error, requiereVerificacion: r.requiereVerificacion });
}));

router.post('/auth/recuperar', wrap(async (req, res) => {
	const r = await authSrv.recuperar(req.body || {});
	res.status(r.status || 202).json({ ok: true });
}));

router.post('/auth/restablecer', wrap(async (req, res) => {
	const r = await authSrv.restablecer(req.body || {});
	res.status(r.status || 200).json(r.ok ? { ok: true, token: r.token, usuario: r.usuario } : { ok: false, error: r.error });
}));

router.post('/auth/reenviar', wrap(async (req, res) => {
	const r = await authSrv.reenviar(req.body || {});
	res.status(r.status || 202).json(r.ok ? { ok: true } : { ok: false, error: r.error });
}));

// ── Sesión ──────────────────────────────────────────────────────────────────

router.get('/me', authenticate, (req, res) => {
	res.json({ ok: true, usuario: authSrv.usuarioPublico(req.fsUser) });
});

router.get('/catalogo', authenticate, wrap(async (req, res) => {
	res.json({ ok: true, data: await rotacion.catalogo() });
}));

// ── Predios ─────────────────────────────────────────────────────────────────

function _predioPropio(req) {
	return { owner: String(req.fsUser._id), activo: true };
}

function _puedeVer(req, predio) {
	return req.fsUser.rol === 'admin' || String(predio.owner) === String(req.fsUser._id);
}

router.get('/predios', authenticate, wrap(async (req, res) => {
	const filtro = (req.fsUser.rol === 'admin' && req.query.todos === '1') ? { activo: true } : _predioPropio(req);
	const docs = await Predio.find(filtro).select('-parcelas.historial -parcelas.suelos -parcelas.aforos').lean();
	res.json({ ok: true, data: docs });
}));

router.post('/predios', authenticate, wrap(async (req, res) => {
	const b = req.body || {};
	if (!b.nombre) return res.status(400).json({ ok: false, error: 'nombre_requerido' });
	const doc = await Predio.create({
		owner: String(req.fsUser._id),
		nombre: String(b.nombre).slice(0, 160),
		descripcion: b.descripcion ? String(b.descripcion).slice(0, 1000) : null,
		centro: b.centro && Array.isArray(b.centro) ? { type: 'Point', coordinates: [Number(b.centro[0]), Number(b.centro[1])] } : undefined,
		parcelas: []
	});
	res.status(201).json({ ok: true, data: doc });
}));

async function _cargarPredio(req, res) {
	const predio = await Predio.findById(req.params.id);
	if (!predio || !predio.activo) { res.status(404).json({ ok: false, error: 'predio_inexistente' }); return null; }
	if (!_puedeVer(req, predio)) { res.status(403).json({ ok: false, error: 'sin_permiso' }); return null; }
	return predio;
}

router.get('/predios/:id', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (predio) res.json({ ok: true, data: predio });
}));

router.put('/predios/:id', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const b = req.body || {};
	if (b.nombre) predio.nombre = String(b.nombre).slice(0, 160);
	if (b.descripcion !== undefined) predio.descripcion = b.descripcion ? String(b.descripcion).slice(0, 1000) : null;
	if (b.centro && Array.isArray(b.centro)) predio.centro = { type: 'Point', coordinates: [Number(b.centro[0]), Number(b.centro[1])] };
	await predio.save();
	res.json({ ok: true, data: predio });
}));

router.delete('/predios/:id', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	predio.activo = false;
	await predio.save();
	res.json({ ok: true });
}));

// ── Parcelas ────────────────────────────────────────────────────────────────

function _geoValida(g) {
	return g && g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0]) && g.coordinates[0].length >= 3;
}

router.post('/predios/:id/parcelas', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const b = req.body || {};
	if (!b.nombre) return res.status(400).json({ ok: false, error: 'nombre_requerido' });
	if (!_geoValida(b.geometry)) return res.status(400).json({ ok: false, error: 'poligono_invalido' });
	predio.parcelas.push({
		nombre: String(b.nombre).slice(0, 120),
		tipo: b.tipo === 'parcela' ? 'parcela' : 'potrero',
		geometry: { type: 'Polygon', coordinates: b.geometry.coordinates },
		especieActual: b.especieActual || null,
		fechaSiembraActual: b.fechaSiembraActual || null,
		notas: b.notas || null
	});
	await predio.save();
	res.status(201).json({ ok: true, data: predio.parcelas[predio.parcelas.length - 1] });
}));

function _parcela(predio, res) {
	const p = predio.parcelas.id(res.req.params.pid);
	if (!p) { res.status(404).json({ ok: false, error: 'parcela_inexistente' }); return null; }
	return p;
}

router.put('/predios/:id/parcelas/:pid', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const p = _parcela(predio, res);
	if (!p) return;
	const b = req.body || {};
	if (b.nombre) p.nombre = String(b.nombre).slice(0, 120);
	if (b.tipo) p.tipo = b.tipo === 'parcela' ? 'parcela' : 'potrero';
	if (b.geometry) {
		if (!_geoValida(b.geometry)) return res.status(400).json({ ok: false, error: 'poligono_invalido' });
		p.geometry = { type: 'Polygon', coordinates: b.geometry.coordinates };
	}
	if (b.especieActual !== undefined) {
		// Si cambia la especie, la anterior pasa al historial.
		if (p.especieActual && p.especieActual !== b.especieActual) {
			p.historial.push({ especie: p.especieActual, inicio: p.fechaSiembraActual || null, fin: new Date() });
		}
		p.especieActual = b.especieActual;
	}
	if (b.fechaSiembraActual !== undefined) p.fechaSiembraActual = b.fechaSiembraActual || null;
	['riego', 'fuenteAgua', 'pendiente', 'drenaje'].forEach((c) => {
		if (b[c] !== undefined) p[c] = b[c] ? String(b[c]).trim() : null;
	});
	if (b.aniosUso !== undefined) p.aniosUso = b.aniosUso != null ? Number(b.aniosUso) : null;
	if (b.problemasLote !== undefined) p.problemasLote = Array.isArray(b.problemasLote) ? b.problemasLote.map(String).slice(0, 12) : [];
	if (b.notas !== undefined) p.notas = b.notas;
	await predio.save();
	res.json({ ok: true, data: p });
}));

router.delete('/predios/:id/parcelas/:pid', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const p = _parcela(predio, res);
	if (!p) return;
	p.deleteOne();
	await predio.save();
	res.json({ ok: true });
}));

// ── Sub-registros: siembras, suelos (PRIAS), aforos ─────────────────────────

function _append(campo, armar) {
	return wrap(async (req, res) => {
		const predio = await _cargarPredio(req, res);
		if (!predio) return;
		const p = _parcela(predio, res);
		if (!p) return;
		const item = armar(req.body || {}, res);
		if (!item) return; // armar ya respondió 400
		p[campo].push(item);
		await predio.save();
		res.status(201).json({ ok: true, data: p[campo][p[campo].length - 1] });
	});
}

router.post('/predios/:id/parcelas/:pid/siembras', authenticate, _append('historial', (b, res) => {
	if (!b.especie) { res.status(400).json({ ok: false, error: 'especie_requerida' }); return null; }
	return {
		especie: String(b.especie).trim(),
		variedad: b.variedad || null,
		campania: b.campania || null,
		superficieHa: b.superficieHa != null ? Number(b.superficieHa) : null,
		inicio: b.inicio || null,
		fin: b.fin || null,
		preparacion: b.preparacion || null,
		fertilizantes: b.fertilizantes || null,
		aplicaciones: b.aplicaciones || null,
		problemas: Array.isArray(b.problemas) ? b.problemas.map(String).slice(0, 12) : [],
		rendimiento: b.rendimiento != null ? Number(b.rendimiento) : null,
		rendimientoUnidad: b.rendimientoUnidad || null,
		notas: b.notas || null
	};
}));

router.post('/predios/:id/parcelas/:pid/suelos', authenticate, _append('suelos', (b, res) => {
	if (!b.fecha) { res.status(400).json({ ok: false, error: 'fecha_requerida' }); return null; }
	return { fecha: b.fecha, ph: b.ph != null ? Number(b.ph) : null, materiaOrganica: b.materiaOrganica != null ? Number(b.materiaOrganica) : null, nitrogeno: b.nitrogeno != null ? Number(b.nitrogeno) : null, textura: b.textura || null, fuente: b.fuente || 'laboratorio', notas: b.notas || null };
}));

router.post('/predios/:id/parcelas/:pid/aforos', authenticate, _append('aforos', (b, res) => {
	if (!b.fecha) { res.status(400).json({ ok: false, error: 'fecha_requerida' }); return null; }
	return { fecha: b.fecha, kgMSHa: b.kgMSHa != null ? Number(b.kgMSHa) : null, metodo: b.metodo || null, notas: b.notas || null };
}));

// ── Análisis: clima + rotación + ventana ────────────────────────────────────

function _centroDe(predio, parcela) {
	if (parcela && parcela.geometry && parcela.geometry.coordinates[0] && parcela.geometry.coordinates[0][0]) {
		return { lon: parcela.geometry.coordinates[0][0][0], lat: parcela.geometry.coordinates[0][0][1] };
	}
	if (predio.centro && predio.centro.coordinates) return { lon: predio.centro.coordinates[0], lat: predio.centro.coordinates[1] };
	return null;
}

router.get('/predios/:id/analisis', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const parcela = req.query.parcela ? predio.parcelas.id(req.query.parcela) : predio.parcelas[0];
	const centro = _centroDe(predio, parcela);
	if (!centro) return res.status(400).json({ ok: false, error: 'sin_coordenadas' });

	const [clim, dia, sueloW] = await Promise.all([
		power.climatologia(centro.lat, centro.lon),
		power.diario(centro.lat, centro.lon, 120),
		sueloWeb.consultar(centro.lat, centro.lon)
	]);
	const resumenPower = power.resumen(dia, clim);
	const lang = langDe(req);
	const [rec, ven] = await Promise.all([
		parcela ? rotacion.recomendar({ parcela, clima: resumenPower, sueloWeb: sueloW, lang }) : Promise.resolve(null),
		Promise.resolve(ventana.evaluar({ clima: clim, resumenPower, especie: parcela ? parcela.especieActual : null, lang }))
	]);

	res.json({
		ok: true,
		data: {
			centro,
			clima: resumenPower,
			sueloWeb: sueloW,
			lluviaPorMes: ven && ven.ok ? ven.lluviaPorMes : null,
			rotacion: rec,
			ventana: ven,
			fuentes: [
				lang === 'es' ? 'NASA POWER (serie diaria + climatología)' : 'NASA POWER daily + climatology',
				'SoilGrids (ISRIC)'
			]
		}
	});
}));

// ── Informe PDF ─────────────────────────────────────────────────────────────

router.get('/predios/:id/informe.pdf', authenticate, wrap(async (req, res) => {
	const predio = await _cargarPredio(req, res);
	if (!predio) return;
	const parcela = req.query.parcela ? predio.parcelas.id(req.query.parcela) : null;
	const pdf = await informe.generar({ predio, parcela, solicitadoPor: req.fsUser.nombre || req.fsUser.email, lang: langDe(req) });
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', 'inline; filename="fieldshift-' + predio._id + '.pdf"');
	res.send(pdf);
}));

// ── Admin ───────────────────────────────────────────────────────────────────

router.get('/admin/usuarios', authenticate, soloAdmin, wrap(async (req, res) => {
	const docs = await FsUser.find({}, { claveHash: 0, codigoHash: 0 }).lean();
	res.json({ ok: true, data: docs });
}));

router.put('/admin/usuarios/:uid/rol', authenticate, soloAdmin, wrap(async (req, res) => {
	const rol = req.body && req.body.rol;
	if (!['admin', 'especial', 'registrado'].includes(rol)) return res.status(400).json({ ok: false, error: 'rol_invalido' });
	const u = await FsUser.findByIdAndUpdate(req.params.uid, { rol }, { new: true });
	if (!u) return res.status(404).json({ ok: false, error: 'usuario_inexistente' });
	res.json({ ok: true, data: authSrv.usuarioPublico(u) });
}));

module.exports = router;
