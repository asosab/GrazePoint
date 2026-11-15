// servicios/grazepoint/services/informe.js — informe PDF por predio.
//
// Estructura inspirada en los diagnósticos de pastura que el técnico
// reenvía por WhatsApp: diagnóstico general del predio (ficha, clima,
// tendencia, suelo, balance del hato), tabla resumen de parcelas por
// prioridad de intervención con mapa vectorial y tabla de clases NDVI,
// una página por parcela en tres bloques (qué muestran los datos /
// qué significa / qué se recomienda hacer), ventana de siembra con
// lluvia mensual y metodología con fechas de tile.
//
// A diferencia de la versión ligera, el informe corre `forraje.evaluar`
// completo (NDVI del año pasado, SMAP, calibración de aforos, serie
// NDVI para el minigráfico): los tiles GIBS se cachean por xyz, así el
// costo extra son fichas de fechas distintas, no de píxeles repetidos.
// `lang` ('es'|'en') decide el idioma de todo el documento.

const PDFDocument = require('pdfkit');
const rotacion = require('./rotacion');
const ventana = require('./ventana');
const power = require('./power');
const forraje = require('./forraje');
const tiempo = require('./tiempo');
const sueloWeb = require('./sueloWeb');
const muestreo = require('./muestreo');
const gibs = require('./gibsValores');
const { INFORME, FORRAJE, grupoDe, tipoDe, langOk } = require('./i18n');

function _f(d, lang) { return d ? new Date(d).toLocaleDateString(langOk(lang) === 'es' ? 'es-BO' : 'en-US') : '—'; }
function _n(v, u) { return v == null ? '—' : v + (u || ''); }

function _titulo(doc, texto) {
	// doc.x puede quedar a la derecha tras tablas o dibujos: el título
	// siempre arranca del margen.
	doc.x = doc.page.margins.left;
	doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor('#1c1c1c').text(texto);
	doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#8fa68e').lineWidth(1).stroke();
	doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#333');
}

function _fila(doc, etiqueta, valor) {
	doc.font('Helvetica-Bold').text(etiqueta + ': ', { continued: true }).font('Helvetica').text(String(valor == null ? '—' : valor));
}

// Garantiza `h` puntos de alto antes de dibujar: salta de página si
// no entra en la actual.
function _lugar(doc, h) {
	if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
	return doc.y;
}

// Tabla sencilla con cabecera repetida al saltar de página y filas
// sombreadas en alternancia. cols: [{ titulo, w, align }].
function _tabla(doc, cols, filas) {
	const x0 = doc.page.margins.left;
	const totalW = cols.reduce((a, c) => a + c.w, 0);
	const yFin = doc.page.height - doc.page.margins.bottom - 20;
	doc.fontSize(8);
	let y = doc.y;
	function cabecera() {
		const hCab = Math.max(...cols.map((c) => doc.heightOfString(c.titulo, { width: c.w - 4 })));
		doc.font('Helvetica-Bold').fillColor('#333');
		let x = x0;
		cols.forEach((c) => { doc.text(c.titulo, x, y, { width: c.w - 4, align: c.align || 'left' }); x += c.w; });
		y = y + hCab + 2;
		doc.moveTo(x0, y).lineTo(x0 + totalW, y).strokeColor('#8fa68e').lineWidth(0.8).stroke();
		y += 4;
		doc.font('Helvetica');
	}
	cabecera();
	filas.forEach((fila, i) => {
		const h = Math.max(...fila.map((v, j) => doc.heightOfString(String(v == null ? '—' : v), { width: cols[j].w - 4 }))) + 3;
		if (y + h > yFin) { doc.addPage(); y = doc.y; cabecera(); }
		if (i % 2 === 0) doc.rect(x0, y - 1, totalW, h).fill('#f2f5f0');
		doc.fillColor('#333');
		let x = x0;
		fila.forEach((v, j) => { doc.text(String(v == null ? '—' : v), x, y, { width: cols[j].w - 4, align: cols[j].align || 'left' }); x += cols[j].w; });
		y += h;
	});
	doc.fillColor('#333').fontSize(10);
	doc.x = doc.page.margins.left;
	doc.y = y + 4;
}

// Prioridad de intervención por parcela: combina el estado forrajero
// con la vegetación del satélite y los problemas que el dueño anotó.
const ORDEN_PRIO = { muy_alta: 0, alta: 1, media: 2, baja: 3, conservacion: 4 };
const COLOR_PRIO = { muy_alta: '#b0392e', alta: '#c96a1e', media: '#b7950b', baja: '#5a8f5a', conservacion: '#2e7d4f' };

function _prioridad(fe, p) {
	let s = 0;
	if (fe && fe.ndvi != null) {
		if (fe.ndvi < 0.2) s += 40;
		else if (fe.ndvi < 0.3) s += 30;
		else if (fe.ndvi < 0.45) s += 15;
	}
	if (fe && fe.ndvi != null && fe.ndviAnt != null) {
		const d = fe.ndviAnt - fe.ndvi;
		if (d > 0.15) s += 15;
		else if (d > 0.08) s += 8;
	}
	if (fe && fe.estresHidrico) s += 15;
	if (fe && fe.smap != null && fe.smap >= 0.5) s += 10;
	if (fe && (fe.estado === 'pasado' || fe.estado === 'pasado_ensilaje')) s += 15;
	if (fe && fe.desacuerdo) s += 10;
	if (fe && fe.riesgoGerminacion) s += 10;
	const probs = ((p && p.problemasLote) || []).filter((x) => x !== 'otro' && x !== 'ninguno');
	s += Math.min(15, probs.length * 7);
	if (s >= 55) return 'muy_alta';
	if (s >= 35) return 'alta';
	if (s >= 15) return 'media';
	if (s > 0) return 'baja';
	return 'conservacion';
}

// La acción de la tabla resumen y del bloque «qué hacer»: primero lo
// que pide el estado forrajero; sin estado útil, la prioridad decide.
function _accionKey(fe, prio) {
	if (fe) {
		if (fe.riesgoGerminacion) return 'germinacion';
		if (fe.smap != null && fe.smap >= 0.5) return 'saturado';
		if (fe.desacuerdo) return 'revisar';
		switch (fe.estado) {
			case 'punto_optimo': return 'entrar';
			case 'punto_ensilaje': return 'ensilar';
			case 'pasado': return prio === 'muy_alta' || prio === 'alta' ? 'reformar' : 'reserva';
			case 'pasado_ensilaje': return 'pasado_ens';
			case 'rebrote':
			case 'creciendo': return 'esperar';
			default: break;
		}
	}
	if (prio === 'muy_alta') return 'reformar';
	if (prio === 'alta') return 'recuperar';
	if (prio === 'media') return 'manejo';
	return 'conservar';
}

const _accTxt = (acc, fe) => ({
	corto: typeof acc.corto === 'function' ? acc.corto(fe && fe.diasFaltantes != null ? fe.diasFaltantes : 0) : acc.corto,
	largo: typeof acc.largo === 'function' ? acc.largo(fe && fe.diasFaltantes != null ? fe.diasFaltantes : 0) : acc.largo
});

function _claseNdvi(v) {
	if (v < 0.20) return 0;
	if (v < 0.35) return 1;
	if (v < 0.55) return 2;
	return 3;
}

// ── Dibujos (paso 2) ────────────────────────────────────────────────

// Mapa vectorial del predio: polígonos GeoJSON proyectados en
// equirectangular y coloreados por prioridad. Sin servicios externos.
function _mapaPredio(doc, evals, T) {
	const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const H = 180;
	let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
	evals.forEach((e) => {
		const ring = e.p.geometry && e.p.geometry.coordinates && e.p.geometry.coordinates[0];
		(ring || []).forEach(([lon, lat]) => {
			if (lon < xa) xa = lon; if (lon > xb) xb = lon;
			if (lat < ya) ya = lat; if (lat > yb) yb = lat;
		});
	});
	if (xa > xb || ya > yb) return;
	const y0 = _lugar(doc, H + 30);
	const x0 = doc.page.margins.left;
	const latMed = (ya + yb) / 2;
	const cosLat = Math.max(0.2, Math.cos((latMed * Math.PI) / 180));
	const esc = Math.min((W - 16) / (((xb - xa) * cosLat) || 1e-9), (H - 16) / ((yb - ya) || 1e-9));
	const px = (lon) => x0 + 8 + (lon - xa) * cosLat * esc;
	const py = (lat) => y0 + H - 8 - (lat - ya) * esc;
	doc.save();
	evals.forEach((e) => {
		const anillos = e.p.geometry && e.p.geometry.coordinates;
		if (!anillos || !anillos[0] || anillos[0].length < 3) return;
		anillos.forEach((ring, ri) => {
			doc.path('M' + ring.map(([lon, lat]) => px(lon).toFixed(1) + ' ' + py(lat).toFixed(1)).join('L') + 'Z');
			if (ri === 0) doc.fillOpacity(0.45).fill(COLOR_PRIO[e.prio] || '#999');
			else doc.fillOpacity(1).fill('#ffffff');
		});
		anillos.forEach((ring) => {
			doc.path('M' + ring.map(([lon, lat]) => px(lon).toFixed(1) + ' ' + py(lat).toFixed(1)).join('L') + 'Z')
				.lineWidth(0.8).strokeColor('#444').stroke();
		});
		const c = muestreo.puntoDentro(e.p.geometry);
		if (c) {
			const etiqueta = String(e.p.nombre || '').slice(0, 14);
			doc.fillOpacity(1).fontSize(6.5).fillColor('#1c1c1c').text(etiqueta, px(c.lon) - 40, py(c.lat) - 3, { width: 80, align: 'center' });
		}
	});
	doc.restore();
	// Leyenda de prioridades
	let lx = x0;
	const ly = y0 + H + 4;
	doc.fontSize(7);
	Object.keys(ORDEN_PRIO).forEach((k) => {
		doc.rect(lx, ly, 7, 7).fill(COLOR_PRIO[k]);
		doc.fillColor('#444').text(T.prio[k], lx + 9, ly, { lineBreak: false });
		lx += 9 + doc.widthOfString(T.prio[k]) + 14;
	});
	doc.fillColor('#333').fontSize(10);
	doc.x = doc.page.margins.left;
	doc.y = ly + 14;
}

// Minigráfico NDVI: línea de la serie de 8 días con las caídas >0.10
// marcadas (posible pastoreo o corte no anotado).
function _sparkNdvi(doc, serie) {
	if (!serie || serie.length < 3) return;
	const W = Math.min(300, doc.page.width - doc.page.margins.left - doc.page.margins.right);
	const H = 55;
	const y = _lugar(doc, H + 20);
	const x0 = doc.page.margins.left;
	const vals = serie.map((s) => s.valor);
	let vMin = Math.min(...vals), vMax = Math.max(...vals);
	const pad = (vMax - vMin) * 0.15 || 0.05;
	vMin -= pad; vMax += pad;
	const px = (i) => x0 + (i / (serie.length - 1)) * W;
	const py = (v) => y + H - ((v - vMin) / (vMax - vMin)) * H;
	doc.save();
	doc.lineWidth(0.5).strokeColor('#ccc').moveTo(x0, y).lineTo(x0, y + H).lineTo(x0 + W, y + H).stroke();
	doc.lineWidth(1.2).strokeColor('#2e7d4f').moveTo(px(0), py(vals[0]));
	for (let i = 1; i < serie.length; i++) doc.lineTo(px(i), py(vals[i]));
	doc.stroke();
	serie.forEach((s, i) => {
		doc.circle(px(i), py(s.valor), 1.6).fill('#2e7d4f');
		if (i > 0 && serie[i - 1].valor - s.valor > 0.10) {
			doc.circle(px(i), py(s.valor), 3.5).lineWidth(0.8).strokeColor('#b0392e').stroke();
		}
	});
	doc.fontSize(6.5).fillColor('#777');
	doc.text(serie[0].fecha.slice(5), x0, y + H + 2);
	doc.text(serie[serie.length - 1].fecha.slice(5), x0 + W - 30, y + H + 2, { width: 30, align: 'right' });
	doc.restore();
	doc.x = doc.page.margins.left;
	doc.y = y + H + 10;
}

// Barra del reloj de rebrote (o de GDD para ensilaje): bandas del
// catálogo y marcador en la posición actual.
function _relojBarra(doc, fe) {
	const esGdd = !!(fe && fe.gddEnsilaje && fe.t0Fuente === 'siembra');
	const r = fe && fe.rebrote;
	if (!fe || (!r && !esGdd)) return;
	const W = Math.min(320, doc.page.width - doc.page.margins.left - doc.page.margins.right);
	const H = 9;
	const y = _lugar(doc, H + 24);
	const x0 = doc.page.margins.left;
	let maximo, pos, marcas;
	if (esGdd) {
		maximo = fe.gddEnsilaje * 1.2;
		pos = fe.gdd || 0;
		marcas = [Math.round(fe.gddEnsilaje * 0.85), fe.gddEnsilaje, Math.round(fe.gddEnsilaje * 1.1)];
		doc.rect(x0, y, W, H).fill('#dfe5df');
		doc.rect(x0 + (marcas[0] / maximo) * W, y, ((marcas[2] - marcas[0]) / maximo) * W, H).fill('#7fb069');
		doc.rect(x0 + (marcas[2] / maximo) * W, y, ((maximo - marcas[2]) / maximo) * W, H).fill('#e07a5f');
	} else {
		maximo = (r.pasado || r.max || 60) * 1.15;
		pos = fe.diasEfectivos || 0;
		marcas = [r.min, r.max, r.pasado].filter((v) => v != null);
		const esc = (v) => x0 + Math.min(1, v / maximo) * W;
		const band = (a, b, c) => { if (a != null && b != null && b > a) doc.rect(esc(a), y, Math.max(1, esc(b) - esc(a)), H).fill(c); };
		band(0, r.min != null ? r.min : r.pasado, '#dfe5df');
		band(r.min, r.max != null ? r.max : r.pasado, '#7fb069');
		band(r.max != null ? r.max : r.min, r.pasado, '#e9c46a');
		band(r.pasado, maximo, '#e07a5f');
	}
	const mx = x0 + Math.min(1, pos / maximo) * W;
	doc.moveTo(mx, y - 3).lineTo(mx, y + H + 3).lineWidth(1.4).strokeColor('#1c1c1c').stroke();
	doc.fontSize(6.5).fillColor('#777');
	marcas.forEach((v) => {
		doc.text(String(v), x0 + Math.min(1, v / maximo) * W - 10, y + H + 4, { width: 20, align: 'center' });
	});
	doc.fillColor('#333').fontSize(10);
	doc.x = doc.page.margins.left;
	doc.y = y + H + 16;
}

// Barras de lluvia esperada por mes con la línea del umbral de
// establecimiento (~60 mm/mes).
function _barrasLluvia(doc, lluviaPorMes, umbral) {
	if (!lluviaPorMes || !lluviaPorMes.length) return;
	const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const H = 70;
	const y = _lugar(doc, H + 26);
	const x0 = doc.page.margins.left;
	const max = Math.max(umbral * 1.3, ...lluviaPorMes.map((m) => m.mm || 0));
	const bw = W / lluviaPorMes.length;
	const mesActual = new Date().getUTCMonth();
	lluviaPorMes.forEach((m, i) => {
		const bh = m.mm ? (m.mm / max) * H : 0;
		doc.rect(x0 + i * bw + 2, y + H - bh, bw - 4, Math.max(0.5, bh)).fill(i === mesActual ? '#2e7d4f' : '#9db8a4');
		doc.fontSize(6).fillColor('#666').text(String(m.mes || '').slice(0, 3), x0 + i * bw, y + H + 3, { width: bw, align: 'center' });
	});
	const uy = y + H - (umbral / max) * H;
	doc.moveTo(x0, uy).lineTo(x0 + W, uy).lineWidth(0.7).dash(3, { space: 2 }).strokeColor('#b0392e').stroke().undash();
	doc.fontSize(6.5).fillColor('#b0392e').text(umbral + ' mm', x0 + W + 3, uy - 3);
	doc.fillColor('#333').fontSize(10);
	doc.x = doc.page.margins.left;
	doc.y = y + H + 18;
}

// ── Informe ─────────────────────────────────────────────────────────

async function generar({ predio, parcela, solicitadoPor, lang }) {
	const L = langOk(lang);
	const T = INFORME[L];
	const F = FORRAJE[L];
	const f = (d) => _f(d, L);
	const parcelas = parcela ? [parcela] : (predio.parcelas || []);

	// Centro del predio: punto interior de la parcela pedida, centro
	// anotado del predio o el de la primera parcela con geometría.
	let centro = parcela ? muestreo.puntoDentro(parcela.geometry) : null;
	if (!centro && predio.centro && predio.centro.coordinates) {
		centro = { lon: predio.centro.coordinates[0], lat: predio.centro.coordinates[1] };
	}
	if (!centro) {
		for (const p of parcelas) {
			const c = muestreo.puntoDentro(p.geometry);
			if (c) { centro = c; break; }
		}
	}

	if (!centro) {
		const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
		const chunks = [];
		doc.on('data', (c) => chunks.push(c));
		const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
		doc.font('Helvetica-Bold').fontSize(20).text(T.titulo);
		doc.font('Helvetica').fontSize(10).text(T.predio + predio.nombre + ' · ' + T.parcelas_n(predio.parcelas.length));
		doc.text(T.sin_coords);
		doc.end();
		return fin;
	}

	const [clim, dia] = await Promise.all([power.climatologia(centro.lat, centro.lon), power.diario(centro.lat, centro.lon, 400)]);
	const climaMeta = power.resumen(dia, clim);
	const tendencia = tiempo.analizar(dia, clim);
	const catalogo = await rotacion.catalogo();
	const sueloPredio = await sueloWeb.consultar(centro.lat, centro.lon);
	const ven = ventana.evaluar({ clima: clim, resumenPower: climaMeta, especie: (parcela || parcelas[0] || {}).especieActual || null, lang: L });

	// Evaluación completa por parcela en lotes de 4: forraje.evaluar ya
	// trae NDVI actual + año pasado + SMAP por zona, y las fichas GIBS
	// se cachean por tile entre parcelas vecinas.
	const evals = [];
	for (let i = 0; i < parcelas.length; i += 4) {
		const lote = await Promise.all(parcelas.slice(i, i + 4).map(async (p) => {
			const c = muestreo.puntoDentro(p.geometry);
			const [fe, sueloW] = await Promise.all([
				forraje.evaluar(p, { catalogo, lang: L }),
				c ? sueloWeb.consultar(c.lat, c.lon) : Promise.resolve(null)
			]);
			const terreno = { ndvi: fe ? fe.ndvi : null, ndviAnt: fe ? fe.ndviAnt : null };
			let rec = null;
			try {
				rec = await rotacion.recomendar({ parcela: p, clima: climaMeta, sueloWeb: sueloW, terreno, tiempo: tendencia, lang: L });
			} catch (e) { /* sin recomendación, el resto del informe sale igual */ }
			return { p, fe, sueloW, rec, prio: _prioridad(fe, p) };
		}));
		evals.push(...lote);
	}
	// Serie NDVI para el minigráfico: evaluar solo la pidió cuando no
	// había uso anotado; acá se completa para todas.
	for (let i = 0; i < evals.length; i += 4) {
		await Promise.all(evals.slice(i, i + 4).map(async (e) => {
			if (e.fe && !e.fe.ndviSerie) {
				const c = muestreo.puntoDentro(e.p.geometry);
				if (c) e.fe.ndviSerie = await gibs.serieNdvi(c.lat, c.lon, 96, 8);
			}
		}));
	}
	evals.sort((a, b) => ORDEN_PRIO[a.prio] - ORDEN_PRIO[b.prio]);

	let forrajeTotal = 0;
	evals.forEach((e) => {
		if (e.fe && e.fe.kgMSHaEst != null && e.fe.areaHa) forrajeTotal += e.fe.kgMSHaEst * e.fe.areaHa;
	});
	forrajeTotal = Math.round(forrajeTotal);
	const bal = forraje.balance(predio, forrajeTotal);
	const areaTotal = evals.reduce((s, e) => s + (e.fe && e.fe.areaHa ? e.fe.areaHa : 0), 0);

	// Clases de NDVI ponderadas por hectárea (histograma de píxeles).
	const clasesHa = [0, 0, 0, 0];
	evals.forEach((e) => {
		const ha = e.fe && e.fe.areaHa;
		if (!ha) return;
		const ms = e.fe.ndviMuestras;
		if (ms && ms.length) ms.forEach((v) => { clasesHa[_claseNdvi(v)] += ha / ms.length; });
		else if (e.fe.ndvi != null) clasesHa[_claseNdvi(e.fe.ndvi)] += ha;
	});

	const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, info: { Title: T.titulo + ' · ' + predio.nombre, Author: 'GrazePoint' } });
	const chunks = [];
	doc.on('data', (c) => chunks.push(c));
	const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
	const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

	doc.font('Helvetica-Bold').fontSize(20).fillColor('#1c1c1c').text(T.titulo);
	doc.font('Helvetica').fontSize(10).fillColor('#555').text(T.generado + f(new Date()) + (solicitadoPor ? T.para + solicitadoPor : ''));
	doc.moveDown(0.5);
	doc.fontSize(9).fillColor('#777').text(T.nota_clima);

	// ── Ficha del predio ──
	_titulo(doc, T.predio + predio.nombre);
	if (predio.descripcion) _fila(doc, T.descripcion, predio.descripcion);
	_fila(doc, T.parcelas_registradas, predio.parcelas.length);
	_fila(doc, T.ubicacion, 'lat ' + centro.lat.toFixed(5) + ', lon ' + centro.lon.toFixed(5));
	if (areaTotal) _fila(doc, T.area_total, Math.round(areaTotal * 10) / 10 + ' ha');

	if (climaMeta) {
		_titulo(doc, T.clima_h);
		_fila(doc, T.lluvia_anual, _n(climaMeta.lluviaAnualMedia, ' mm'));
		_fila(doc, T.lluvia_mes, _n(climaMeta.lluviaUltimoMes, ' mm'));
		_fila(doc, T.humedad_suelo, climaMeta.humedadSueloReciente != null ? climaMeta.humedadSueloReciente + ' (0–1)' : '—');
		if (climaMeta.anomaliaLluvia != null) _fila(doc, T.anomalia, climaMeta.anomaliaLluvia + ' %');
	}

	if (tendencia) {
		_titulo(doc, T.tendencia_h);
		_fila(doc, T.lluvia_6m, tendencia.lluvia6m + ' mm' + (tendencia.pctVsAnio != null ? ' (' + T.vs_anio(tendencia.pctVsAnio) + ')' : ''));
		if (tendencia.mesesSecos) doc.text('– ' + T.meses_secos(tendencia.mesesSecos));
		if (tendencia.tendenciaSeca) doc.text('– ' + T.tendencia_seca);
		if (tendencia.humedadVsTipica != null) doc.text('– ' + T.humedad_vs(tendencia.humedadVsTipica));
	}

	if (sueloPredio) {
		_titulo(doc, T.suelo_predio_h);
		if (sueloPredio.ph != null) _fila(doc, 'pH', sueloPredio.ph);
		if (sueloPredio.textura) _fila(doc, T.textura, T.textura_nom[sueloPredio.textura] || sueloPredio.textura);
		if (sueloPredio.moEstimada != null) _fila(doc, T.mo_est, sueloPredio.moEstimada + ' %');
		if (sueloPredio.cec != null) _fila(doc, T.cic, sueloPredio.cec + ' cmol/kg');
		if (sueloPredio.densidad != null) _fila(doc, T.densidad, sueloPredio.densidad + ' kg/dm³');
	}

	if (predio.hato && predio.hato.cabezas) {
		_titulo(doc, T.hato_h);
		_fila(doc, 'Hato', T.hato_linea(predio.hato.cabezas, predio.hato.pesoKg || 450));
		if (bal) {
			_fila(doc, T.consumo_hato, '~' + bal.consumoDiaKgMS + (L === 'es' ? ' kg MS/día' : ' kg DM/day'));
			if (forrajeTotal) _fila(doc, T.forraje_total, '~' + forrajeTotal.toLocaleString(L === 'es' ? 'es-BO' : 'en-US') + (L === 'es' ? ' kg MS' : ' kg DM'));
			_fila(doc, T.cobertura, T.dias_cob(bal.diasCobertura) + ' · ' + T.deficit(f(bal.fechaDeficit)));
		}
	}

	// ── Diagnóstico por parcela: mapa + tabla resumen + clases ──
	if (evals.length) {
		doc.addPage();
		_titulo(doc, T.resumen_h);
		doc.fontSize(9).fillColor('#666').text(T.resumen_nota);
		doc.fontSize(10).fillColor('#333');
		_mapaPredio(doc, evals, T);
		const cols = [
			{ titulo: T.th_parcela, w: 92 },
			{ titulo: T.th_ha, w: 34, align: 'right' },
			{ titulo: T.th_especie, w: 80 },
			{ titulo: T.th_ndvi, w: 34, align: 'right' },
			{ titulo: T.th_vs, w: 38, align: 'right' },
			{ titulo: T.th_estado, w: 62 },
			{ titulo: T.th_prio, w: 56 },
			{ titulo: T.th_accion, w: 99 }
		];
		const filas = evals.map((e) => {
			const fe = e.fe;
			const delta = fe && fe.ndvi != null && fe.ndviAnt != null ? fe.ndvi - fe.ndviAnt : null;
			const acc = T.acc[_accionKey(fe, e.prio)];
			return [
				e.p.nombre,
				fe && fe.areaHa != null ? fe.areaHa : '—',
				e.p.especieActual || '—',
				fe && fe.ndvi != null ? fe.ndvi.toFixed(2) : '—',
				delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) : '—',
				fe ? (F.estados[fe.estado] || fe.estado) : '—',
				T.prio[e.prio],
				_accTxt(acc, fe).corto
			];
		});
		_tabla(doc, cols, filas);

		const totalClases = clasesHa.reduce((a, b) => a + b, 0);
		if (totalClases > 0) {
			_titulo(doc, T.clases_h);
			_tabla(doc, [
				{ titulo: T.th_clase, w: 260 },
				{ titulo: 'ha', w: 60, align: 'right' },
				{ titulo: T.th_pct, w: 50, align: 'right' }
			], clasesHa.map((ha, i) => [
				T['clase_' + i],
				Math.round(ha * 10) / 10,
				Math.round((ha / totalClases) * 100) + ' %'
			]));
		}
	}

	// ── Página por parcela ──
	for (const e of evals) {
		const { p, fe, sueloW, rec, prio } = e;
		doc.addPage();
		_titulo(doc, tipoDe(p.tipo, L) + ': ' + p.nombre);
		doc.fontSize(9).fillColor(COLOR_PRIO[prio])
			.text(T.prio[prio].toUpperCase() + (fe && fe.areaHa ? ' · ' + fe.areaHa + ' ha' : ''));
		doc.fillColor('#333').fontSize(10);

		// Qué muestran los datos
		_titulo(doc, T.datos_h);
		_fila(doc, T.siembra_actual, p.especieActual || '—');
		if (p.fechaSiembraActual) _fila(doc, T.sembrado_el, f(p.fechaSiembraActual));
		if (fe && fe.t0) {
			_fila(doc, T.ultimo_uso, f(fe.t0) + (fe.t0Fuente === 'ndvi' ? ' (' + F.fuente_ndvi + ')' : ''));
		}
		const cortes = (p.cortes || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 4);
		if (cortes.length) {
			doc.font('Helvetica-Bold').text(T.cortes_h + ':');
			doc.font('Helvetica');
			cortes.forEach((c) => doc.text('   • ' + f(c.fecha) + ' · ' + (F['tipo_' + c.tipo] || c.tipo)));
		}
		if (fe && fe.ndvi != null) {
			_fila(doc, T.ndvi_actual, fe.ndvi.toFixed(2) + (fe.ndviFecha ? ' (' + T.tile_de(f(fe.ndviFecha)) + ')' : ''));
			if (fe.ndviRango) doc.text('   ' + T.ndvi_rango(fe.ndviRango.min.toFixed(2), fe.ndviRango.max.toFixed(2), fe.ndviRango.n));
		}
		if (fe && fe.ndviAnt != null) {
			_fila(doc, T.ndvi_ant, fe.ndviAnt.toFixed(2) + (fe.ndviAntFecha ? ' (' + T.tile_de(f(fe.ndviAntFecha)) + ')' : ''));
		}
		if (fe && fe.smap != null) {
			_fila(doc, T.smap_raiz, fe.smap.toFixed(2) + (fe.smapFecha ? ' (' + T.tile_de(f(fe.smapFecha)) + ')' : '') + (fe.smap >= 0.5 ? ' — ' + T.smap_saturada : ''));
		}

		const suelo = (p.suelos || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
		if (suelo) {
			_titulo(doc, T.ultimo_suelo(f(suelo.fecha), T.suelo_fuente[suelo.fuente] || suelo.fuente || 'laboratorio'));
			_fila(doc, 'pH', _n(suelo.ph));
			_fila(doc, T.mo, _n(suelo.materiaOrganica, ' %'));
			_fila(doc, T.nitrogeno, _n(suelo.nitrogeno, ' %'));
			_fila(doc, T.textura, suelo.textura || '—');
		} else if (sueloW) {
			_titulo(doc, T.suelo_sg_h);
			if (sueloW.ph != null) _fila(doc, 'pH', sueloW.ph);
			if (sueloW.textura) _fila(doc, T.textura, T.textura_nom[sueloW.textura] || sueloW.textura);
			if (sueloW.arena != null) _fila(doc, T.arena + ' / ' + T.arcilla + ' / ' + T.limo, sueloW.arena + ' / ' + sueloW.arcilla + ' / ' + sueloW.limon + ' %');
			if (sueloW.moEstimada != null) _fila(doc, T.mo_est, sueloW.moEstimada + ' %');
			if (sueloW.nitrogeno != null) _fila(doc, T.nitrogeno, sueloW.nitrogeno + ' ‰');
			if (sueloW.cec != null) _fila(doc, T.cic, sueloW.cec + ' cmol/kg');
			if (sueloW.densidad != null) _fila(doc, T.densidad, sueloW.densidad + ' kg/dm³');
		} else {
			doc.text(T.suelo_sin);
		}

		if (p.riego) _fila(doc, T.riego, T.riego_nom[p.riego] || p.riego);
		if (p.drenaje) _fila(doc, T.drenaje, T.drenaje_nom[p.drenaje] || p.drenaje);
		if (p.pendiente) _fila(doc, T.pendiente, T.pendiente_nom[p.pendiente] || p.pendiente);
		if (p.aniosUso != null) _fila(doc, T.anios, p.aniosUso);
		if (p.problemasLote && p.problemasLote.length) {
			_fila(doc, T.problemas_lote, p.problemasLote.map((x) => T.prob_nombres[x] || x).join(', '));
		}
		if (p.notas) _fila(doc, T.notas, p.notas);

		if (p.historial && p.historial.length) {
			_titulo(doc, T.historial_h);
			p.historial.slice().sort((a, b) => new Date(b.inicio || 0) - new Date(a.inicio || 0)).slice(0, 8).forEach((s) => {
				const extra = [s.campania, T.prep_nom[s.preparacion] || s.preparacion, s.rendimiento ? s.rendimiento + ' ' + (s.rendimientoUnidad || 'kg MS/ha') : null]
					.filter(Boolean).join(' · ');
				doc.text('• ' + s.especie + '  (' + f(s.inicio) + ' – ' + (s.fin ? f(s.fin) : T.vigente) + ')' + (extra ? ' · ' + extra : ''));
				if (s.problemas && s.problemas.length) {
					doc.text('   ' + s.problemas.map((x) => T.prob_siembra[x] || T.prob_nombres[x] || x).join(', '), { oblique: true });
				}
			});
		}

		if (p.aforos && p.aforos.length) {
			_titulo(doc, T.aforos_h);
			p.aforos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5).forEach((a) => {
				doc.text('• ' + f(a.fecha) + ': ' + _n(a.kgMSHa, L === 'es' ? ' kg MS/ha' : ' kg DM/ha') + (a.metodo ? ' (' + a.metodo + ')' : ''));
			});
		}

		if (fe && fe.ndviSerie && fe.ndviSerie.length > 2) {
			doc.fontSize(8).fillColor('#555').text(T.spark_h);
			_sparkNdvi(doc, fe.ndviSerie);
			doc.fillColor('#333').fontSize(10);
		}

		// Qué significa
		_titulo(doc, T.significa_h);
		if (fe && fe.estado !== 'sin_especie' && fe.estado !== 'sin_dato' && fe.estado !== 'sin_clima') {
			_fila(doc, F.estados[fe.estado] || fe.estado, fe.texto);
			if (fe.t0) _fila(doc, F.pdf_desde, f(fe.t0) + (fe.t0Fuente === 'ndvi' ? ' (' + F.fuente_ndvi + ')' : ''));
			if (fe.diasEfectivos != null) _fila(doc, F.pdf_efectivos, fe.diasEfectivos);
			if (fe.gdd) _fila(doc, T.gdd, fe.gdd);
			if (fe.diasFaltantes != null) doc.text(F.pdf_faltan(fe.diasFaltantes));
			_relojBarra(doc, fe);
		} else if (fe) {
			doc.text(fe.texto);
		}
		const sigs = [];
		if (fe) {
			if (fe.estresHidrico) sigs.push(T.sig_estres);
			if (fe.riesgoGerminacion) sigs.push(T.sig_germinacion(fe.lluviaDesdeSembra != null ? fe.lluviaDesdeSembra : 0));
			if (fe.kgMSHaEst != null) sigs.push(T.sig_kgms(fe.kgMSHaEst, Math.round(fe.kgMSHaEst * (fe.areaHa || 0))));
			if (fe.ev30 != null) sigs.push(T.sig_ev30(fe.ev30));
			if (fe.ndvi != null && fe.ndviAnt != null) {
				const d = fe.ndvi - fe.ndviAnt;
				if (d < -0.08) sigs.push(T.sig_peor(Math.abs(d).toFixed(2)));
				else if (d > 0.08) sigs.push(T.sig_mejor);
				else sigs.push(T.sig_estable);
			}
		}
		const phS = suelo ? suelo.ph : (sueloW ? sueloW.ph : null);
		const moS = suelo ? suelo.materiaOrganica : (sueloW ? sueloW.moEstimada : null);
		const nS = suelo ? suelo.nitrogeno : (sueloW ? sueloW.nitrogeno : null);
		const sFlags = [];
		if (phS != null && phS < 5.5) sFlags.push(T.suelo_acido(phS));
		if (moS != null && moS < 2) sFlags.push(T.suelo_mo);
		if (nS != null && nS < 0.12) sFlags.push(T.suelo_n);
		if (sueloW) {
			if (sueloW.cec != null && sueloW.cec < 10) sFlags.push(T.suelo_cic);
			if (sueloW.densidad != null && sueloW.densidad > 1.45) sFlags.push(T.suelo_denso);
		}
		if (sFlags.length) sigs.push(T.suelo_flags(sFlags.join(' · ')));
		sigs.forEach((s) => doc.text('– ' + s));

		// Qué se recomienda hacer
		_titulo(doc, T.hacer_h);
		const acc = T.acc[_accionKey(fe, prio)];
		doc.font('Helvetica-Bold').text('» ' + _accTxt(acc, fe).largo);
		doc.font('Helvetica');
		if (rec && rec.recomendaciones && rec.recomendaciones.length) {
			_titulo(doc, T.rotacion_h(p.especieActual || T.siembra_vacia));
			rec.recomendaciones.forEach((c, i) => {
				doc.font('Helvetica-Bold').text((i + 1) + '. ' + c.especie + '  (' + c.puntaje + '/100, ' + grupoDe(c.grupo, L) + ')');
				doc.font('Helvetica');
				c.razones.slice(0, 3).forEach((z) => doc.text('   – ' + z));
				if (c.notas) doc.text('   ' + c.notas, { oblique: true });
				doc.moveDown(0.2);
			});
		}
	}

	// ── Ventana de siembra + metodología ──
	if (ven && ven.ok) {
		doc.addPage();
		_titulo(doc, T.ventana_h);
		const v = { favorable_ahora: T.v_favorable, ventana_pero_seco: T.v_seco, esperar: T.v_esperar }[ven.veredicto] || ven.veredicto;
		_fila(doc, T.veredicto, v);
		_fila(doc, T.mes_actual, ven.estado.mes);
		ven.ventanas.forEach((w) => doc.text(T.ventana_item(w.desde, w.hasta, w.lluviaMinMes, w.lluviaMaxMes)));
		if (!ven.ventanas.length) doc.text(T.sin_ventana(ven.umbralLluviaMes));
		if (ven.lluviaPorMes && ven.lluviaPorMes.length) {
			_titulo(doc, T.lluvia_mes_h);
			_barrasLluvia(doc, ven.lluviaPorMes, ven.umbralLluviaMes);
		}
		_titulo(doc, T.riesgos_h);
		ven.riesgos.forEach((r) => doc.text('• ' + r));
	}

	_lugar(doc, 120);
	_titulo(doc, T.metodo_h);
	doc.fontSize(9).fillColor('#555');
	doc.text(T.metodo_area);
	const fNdvi = evals.map((e) => e.fe && e.fe.ndviFecha).find(Boolean);
	const fSmap = evals.map((e) => e.fe && e.fe.smapFecha).find(Boolean);
	if (fNdvi) doc.text('– ' + T.metodo_ndvi(fNdvi));
	if (fSmap) doc.text('– ' + T.metodo_smap(fSmap));
	doc.text('– ' + T.metodo_power);
	doc.text('– ' + T.metodo_suelo);
	const maxN = Math.max(0, ...evals.map((e) => (e.fe && e.fe.ndviRango ? e.fe.ndviRango.n : 0)));
	if (maxN) doc.text('– ' + T.metodo_muestras(maxN));

	doc.moveDown(1);
	doc.fontSize(8).fillColor('#999').text(T.pie, { align: 'center' });
	doc.end();
	return fin;
}

module.exports = { generar };
