// servicios/fieldShift/services/alertas.js — avisos de potreros por
// Telegram.
//
// Una vez al día recorre las parcelas de los usuarios con Telegram
// vinculado, calcula el estado forrajero y escribe cuando una
// condición ENTRA (no mientras siga): entrar a punto óptimo o de
// ensilar, el desacuerdo reloj-vs-NDVI, estrés hídrico sostenido,
// vegetación peor que el año pasado y suelo anegado. El dedo por
// tipo `avisos {tipo: fecha}` en la parcela evita reenviar y se
// limpia solo cuando la condición sale.
//
// Sin token del bot no hace nada. Un fallo en una parcela nunca tira
// el barrido completo.

const db = require('../db');
const cnf = require('../config');
const telegram = require('./telegram');
const forraje = require('./forraje');
const rotacion = require('./rotacion');
const { langOk, FORRAJE } = require('./i18n');

const DIA_MS = 24 * 60 * 60 * 1000;
const NDVI_CAIDA_ANIO = 0.10; // peor que la misma época del año pasado
const SMAP_ANEGADO = 0.50;    // raíz saturada: no entrar el lote

// Cada tipo mira una condición del resultado de forraje.evaluar.
// El orden es el de importancia para el productor.
const TIPOS = [
	['punto', (e) => e.estado === 'punto_optimo' || e.estado === 'punto_ensilaje',
		(T, p, predio) => T.aviso_tg(p.nombre, predio, p.especieActual)],
	['revisar', (e) => e.desacuerdo === 'revisar',
		(T, p, predio) => T.aviso_revisar(p.nombre, predio)],
	['estres', (e) => !!e.estresHidrico,
		(T, p, predio) => T.aviso_estres(p.nombre, predio)],
	['ndvi_cae', (e) => e.ndvi != null && e.ndviAnt != null && e.ndviAnt - e.ndvi >= NDVI_CAIDA_ANIO,
		(T, p, predio) => T.aviso_ndvi_cae(p.nombre, predio)],
	['saturado', (e) => e.smap != null && e.smap >= SMAP_ANEGADO,
		(T, p, predio) => T.aviso_saturado(p.nombre, predio)],
	['germinacion', (e) => !!e.riesgoGerminacion,
		(T, p, predio) => T.aviso_germinacion(p.nombre, predio, e.lluviaDesdeSembra)]
];

// Compat: el dedo viejo era avisoForraje.estado con el nombre del
// estado; lo traducimos a 'punto' la primera vez.
function _dedo(p) {
	if (!p.avisos) p.avisos = {};
	const viejo = p.avisoForraje && p.avisoForraje.estado;
	if (viejo && !p.avisos.punto) {
		p.avisos.punto = p.avisoForraje.en || new Date();
		p.avisoForraje = { estado: null, en: new Date() };
	}
	return p.avisos;
}

async function _barrido() {
	const FsUser = require('../models/fsUserModel');
	const Predio = require('../models/predioModel');
	if (!db.lista()) return;
	const usuarios = await FsUser.find({ telegramChatId: { $ne: null } }).select('_id nombre telegramChatId').lean();
	if (!usuarios.length) return;
	const catalogo = await rotacion.catalogo();
	for (const u of usuarios) {
		const predios = await Predio.find({ owner: String(u._id), activo: true });
		for (const predio of predios) {
			let sucio = false;
			for (const p of predio.parcelas) {
				try {
					const e = await forraje.evaluar(p, { catalogo, lang: 'es' });
					const T = FORRAJE[langOk('es')];
					const dedo = _dedo(p);
					for (const [tipo, activa, texto] of TIPOS) {
						const estaba = !!dedo[tipo];
						if (activa(e) && !estaba) {
							const okEnvio = await telegram.enviar(u.telegramChatId, texto(T, p, predio.nombre));
							dedo[tipo] = new Date();
							sucio = true;
							console.log(cnf.tag + ' [info] alertas: aviso ' + tipo + ' parcela ' + p.nombre + ' → chat ' + u.telegramChatId + (okEnvio ? '' : ' (envío falló)'));
						} else if (!activa(e) && estaba) {
							// Salió de la condición: el dedo se limpia para el próximo ciclo.
							delete dedo[tipo];
							sucio = true;
						}
					}
				} catch (err) {
					console.log(cnf.tag + ' [warn] alertas ' + p.nombre + ': ' + err.message);
				}
			}
			if (sucio) {
				predio.markModified('parcelas');
				await predio.save();
			}
		}
	}
}

function iniciar() {
	if (!cnf.telegram || !cnf.telegram.token) return;
	// Espera a que mongo y el poller del bot asienten antes del primer barrido.
	setTimeout(() => _barrido().catch((e) => console.log(cnf.tag + ' [warn] alertas: ' + e.message)), 120 * 1000);
	setInterval(() => _barrido().catch((e) => console.log(cnf.tag + ' [warn] alertas: ' + e.message)), DIA_MS);
	console.log(cnf.tag + ' [info] alertas de forraje: barrido diario programado');
}

module.exports = { iniciar, _barrido };
