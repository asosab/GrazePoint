// servicios/grazepoint/services/forraje.js — punto óptimo de
// pastoreo / corte / ensilaje por potrero.
//
// La idea: el ganado no espera al satélite, espera a que el pasto
// rebrote. Cada especie tiene su ventana de rebrote (catálogo
// `rebrote.min/pasado`), pero en días EFECTIVOS: un día sin agua o sin
// calor apenas cuenta. Acá se cruza la última fecha de uso (último
// corte/pastoreo anotado, o la siembra, o una caída de NDVI detectada
// en el propio potrero) con la serie diaria de POWER (T2M + humedad de
// raíz) para estimar dónde va ese reloj.
//
// Encima de eso se suman tres lecturas del terreno:
//   - NDVI actual: si el reloj dice «listo» pero la vegetación no
//     despegó, algo pasa (estrés, plaga, error de fecha) → se avisa.
//   - Aforos con su NDVI de la fecha: regresión local kg MS/ha ≈
//     a + b·NDVI que convierte el aforo moroso en calibración, no en
//     trámite.
//   - GDD base 10 °C para especies de ensilar (sorgo, maíz): el punto
//     de grano pastoso va por grados-día, no por rebrote.
//
// Estados: sin_especie | sin_dato | rebrote | punto_optimo | pasado
// (y para ensilaje: creciendo | punto_ensilaje | pasado_ensilaje).
// `desacuerdo: 'revisar'` marca el choque reloj-vs-NDVI.

const power = require('./power');
const gibs = require('./gibsValores');
const muestreo = require('./muestreo');
const { CATALGO_EMBEBIDO } = require('./catalogo');
const { langOk, FORRAJE } = require('./i18n');

const TBASE = 10;   // °C: base de especies C4 tropicales
const TOPT = 28;    // °C: óptimo
const HUM_MIN = 0.30; // GWETROOT: bajo esto el pasto estresa
const NDVI_BAJO = 0.25; // dosel aún débil
const CAIDA_NDVI = 0.10; // salto que sugiere pastoreo/corte
const SECO21 = 15;    // días de las últimas 3 semanas muy secos → estrés hídrico
const SMAP_ANEGADO = 0.50; // cm³/cm³ de raíz: arriba de esto está empozado
const UTIL = 0.50;        // aprovechamiento del forraje parado
const CONSUMO_DIA = 10;   // kg MS/día: animal de ~450 kg (unidad ganadera)

// El punto de consulta es un punto dentro del polígono (el centroide
// si cae adentro), no el primer vértice anotado.
function _centro(parcela) {
	return muestreo.puntoDentro(parcela && parcela.geometry);
}

const areaHa = muestreo.areaHa;

// Especie del catálogo por nombre libre (exacto o contenido).
function _especieDoc(catalogo, nombre) {
	if (!nombre) return null;
	const n = nombre.toLowerCase();
	return catalogo.find((c) => c.especie.toLowerCase() === n)
		|| catalogo.find((c) => n.includes(c.especie.toLowerCase().split(' ')[0] + ' ' + c.especie.toLowerCase().split(' ')[1]))
		|| catalogo.find((c) => n.includes(c.especie.toLowerCase()) || c.especie.toLowerCase().includes(n))
		|| catalogo.find((c) => {
			const g = c.especie.split(' ')[0].toLowerCase();
			return g.length > 4 && n.includes(g);
		})
		|| null;
}

// Último uso registrado del potrero: corte/pastoreo anotado o siembra.
function _ultimoUso(parcela) {
	const cortes = (parcela.cortes || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
	if (cortes.length && cortes[0].fecha) return { t0: new Date(cortes[0].fecha), fuente: 'corte', tipo: cortes[0].tipo };
	if (parcela.fechaSiembraActual) return { t0: new Date(parcela.fechaSiembraActual), fuente: 'siembra' };
	return null;
}

// Caída brusca de NDVI seguida de recuperación (o reciente): el
// potrero se usó y nadie lo anotó. Devuelve la fecha del último
// evento detectado o null.
function detectarCorte(serie) {
	if (!serie || serie.length < 3) return null;
	let t0 = null;
	for (let i = 1; i < serie.length; i++) {
		const caida = serie[i - 1].valor - serie[i].valor;
		const rebota = i + 1 >= serie.length || serie[i + 1].valor > serie[i].valor;
		if (caida > CAIDA_NDVI && rebota) t0 = serie[i].fecha;
	}
	return t0;
}

// Recorre la serie diaria POWER desde `desde`: suma días efectivos
// (fAgua × fTemp), GDD base 10 y el ritmo reciente para proyectar
// cuántos días de calendario falta.
function _reloj(parametros, desde) {
	const t2 = (parametros && parametros.T2M) || {};
	const gw = (parametros && parametros.GWETROOT) || {};
	const hoy = Date.now();
	let ef = 0, gdd = 0;
	const ult = [];
	const gwUlt = [];
	for (const f of Object.keys(t2).sort()) {
		const d = Date.UTC(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8));
		if (d < desde.getTime() || d > hoy) continue;
		const t = t2[f], g = gw[f];
		const tOk = t != null && t > -900;
		const fT = tOk ? Math.min(1, Math.max(0, (t - TBASE) / (TOPT - TBASE))) : 0.5;
		const fA = g != null && g > -900 ? Math.min(1, Math.max(0.15, g / HUM_MIN)) : 0.5;
		const de = fT * fA;
		ef += de;
		if (tOk) gdd += Math.max(0, t - TBASE);
		ult.push({ de, gdd: tOk ? Math.max(0, t - TBASE) : 0 });
		if (ult.length > 14) ult.shift();
		if (g != null && g > -900) gwUlt.push(g);
		if (gwUlt.length > 21) gwUlt.shift();
	}
	const ritmo = ult.length ? ult.reduce((a, u) => a + u.de, 0) / ult.length : 0.5;
	const ritmoGdd = ult.length ? ult.reduce((a, u) => a + u.gdd, 0) / ult.length : 0;
	// Estrés hídrico sostenido: días de las últimas 3 semanas con la
	// raíz muy por debajo del umbral — aunque el reloj marque punto,
	// el rebote no despega.
	const secos21 = gwUlt.filter((g) => g < HUM_MIN * 0.7).length;
	return {
		efectivos: Math.round(ef * 10) / 10,
		gdd: Math.round(gdd),
		ritmo: Math.max(0.1, ritmo),
		ritmoGdd: Math.max(1, ritmoGdd),
		secos21,
		estresHidrico: secos21 >= SECO21
	};
}

// Regresión kgMS/ha ≈ a + b·NDVI calibrada con los aforos de la
// parcela (NDVI del tile de cada fecha de aforo). Con menos de dos
// pares o sin NDVI actual no hay estimación honesta → null.
async function kgMSHaEst(parcela, lat, lon, ndviHoy) {
	if (ndviHoy == null) return null;
	const pares = [];
	const aforos = (parcela.aforos || []).filter((a) => a.kgMSHa && a.fecha).slice(-6);
	for (const a of aforos) {
		const atras = Math.round((Date.now() - new Date(a.fecha).getTime()) / 86400000);
		if (atras < 0) continue;
		const r = await gibs.valorBuscando('ndvi', lat, lon, atras, 8, 3);
		if (r) pares.push({ x: r.valor, y: a.kgMSHa });
	}
	if (pares.length < 2) return null;
	const xm = pares.reduce((a, p) => a + p.x, 0) / pares.length;
	const ym = pares.reduce((a, p) => a + p.y, 0) / pares.length;
	let num = 0, den = 0;
	for (const p of pares) { num += (p.x - xm) * (p.y - ym); den += (p.x - xm) ** 2; }
	if (!den) return null;
	const b = num / den;
	if (b <= 0) return null; // más verde = menos forraje: calibración inválida
	const est = ym - b * xm + b * ndviHoy;
	return est > 0 ? Math.round(est) : 0;
}

// Estado forrajero completo de una parcela. `catalogo` lo pasa el
// llamador (BD o embebido); los textos salen en `lang`.
// `ligero: true` (informe PDF): saltea la detección de cortes por
// serie NDVI y la calibración de aforos, que cuestan varias fichas
// de tile por parcela. El estado con reloj y NDVI actual igual sale.
async function evaluar(parcela, { catalogo, lang, ligero }) {
	const L = langOk(lang);
	const T = FORRAJE[L];
	const centro = _centro(parcela);
	const cat = catalogo && catalogo.length ? catalogo : CATALGO_EMBEBIDO;
	const esp = _especieDoc(cat, parcela.especieActual);
	const out = {
		estado: 'sin_especie', texto: T.sin_especie,
		especie: parcela.especieActual || null,
		areaHa: areaHa(parcela.geometry)
	};
	if (!esp || (!esp.rebrote && !esp.gddEnsilaje)) return out;
	out.rebrote = esp.rebrote || null;
	out.gddEnsilaje = esp.gddEnsilaje || null;
	if (!centro) { out.estado = 'sin_dato'; out.texto = T.sin_dato; return out; }

	const uso = _ultimoUso(parcela);
	// NDVI por área: mediana de los píxeles dentro del polígono, no
	// del punto solo. En ligero (PDF) se saltea el año pasado y el
	// SMAP, que son fichas extra.
	const [dia, ndviZona, ndviZonaAnt, smapZona] = await Promise.all([
		power.diario(centro.lat, centro.lon, 400),
		gibs.valorBuscandoZona('ndvi', parcela.geometry, 0, 8, 4),
		ligero ? Promise.resolve(null) : gibs.valorBuscandoZona('ndvi', parcela.geometry, 365, 8, 6),
		ligero ? Promise.resolve(null) : gibs.valorBuscandoZona('smap', parcela.geometry, 3, 1, 6)
	]);
	const parametros = dia && dia.parametros;
	if (!parametros || !parametros.T2M) { out.estado = 'sin_dato'; out.texto = T.sin_clima; return out; }

	let t0 = uso && uso.t0, t0Fuente = uso && uso.fuente;
	if (!t0 && !ligero) {
		// Sin registro: el satélite intenta adivinar cuándo se usó.
		const serie = await gibs.serieNdvi(centro.lat, centro.lon, 96, 8);
		out.ndviSerie = serie; // el informe la dibuja sin volver a pedirla
		const detectado = detectarCorte(serie);
		if (detectado) { t0 = new Date(detectado); t0Fuente = 'ndvi'; }
	}
	const z = ndviZona && ndviZona.zona;
	out.ndvi = z ? z.media : null;
	out.ndviMuestras = z ? z.muestras : null;
	out.ndviRango = z && z.n > 1 ? { min: z.min, max: z.max, n: z.n } : null;
	out.ndviFecha = ndviZona ? ndviZona.fecha : null;
	out.ndviAnt = ndviZonaAnt && ndviZonaAnt.zona ? ndviZonaAnt.zona.media : null;
	out.ndviAntFecha = ndviZonaAnt ? ndviZonaAnt.fecha : null;
	out.smap = smapZona && smapZona.zona ? smapZona.zona.media : null;
	out.smapFecha = smapZona ? smapZona.fecha : null;
	if (!t0) { out.estado = 'sin_dato'; out.texto = T.sin_dato; return out; }

	out.t0 = t0.toISOString().slice(0, 10);
	out.t0Fuente = t0Fuente;
	const reloj = _reloj(parametros, t0);
	out.diasEfectivos = reloj.efectivos;
	out.gdd = reloj.gdd;
	out.estresHidrico = reloj.estresHidrico;
	// Siembra reciente sin agua encima: la lluvia llegó tarde o se
	// cortó y la raíz está seca → riesgo de falla de germinación.
	// Ventana de vigilancia: primeras 3 semanas.
	if (t0Fuente === 'siembra' && (Date.now() - t0.getTime()) < 21 * 86400000) {
		const pre = parametros.PRECTOTCORR || {};
		const gw = parametros.GWETROOT || {};
		let mm = 0, gwSum = 0, gwN = 0;
		for (const f of Object.keys(pre)) {
			const d = Date.UTC(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8));
			if (d < t0.getTime() || d > Date.now()) continue;
			if (pre[f] > -900) mm += pre[f];
			if (gw[f] != null && gw[f] > -900) { gwSum += gw[f]; gwN++; }
		}
		out.lluviaDesdeSembra = Math.round(mm);
		const gwMedia = gwN ? gwSum / gwN : null;
		if (mm < 15 && (gwMedia == null || gwMedia < HUM_MIN)) out.riesgoGerminacion = true;
	}
	out.kgMSHaEst = ligero ? null : await kgMSHaEst(parcela, centro.lat, centro.lon, out.ndvi);
	// Capacidad de carga orientativa: con el forraje parado y
	// aprovechamiento del 50 %, cuántos animales de ~450 kg sostiene
	// el potrero durante 30 días.
	if (out.kgMSHaEst != null && out.areaHa) {
		out.ev30 = Math.round(out.kgMSHaEst * out.areaHa * UTIL / (CONSUMO_DIA * 30) * 10) / 10;
	}

	// Variante ensilaje: el reloj va por grados-día al grano pastoso.
	if (esp.gddEnsilaje && t0Fuente === 'siembra') {
		const meta = esp.gddEnsilaje;
		if (reloj.gdd < meta * 0.85) {
			out.estado = 'creciendo';
			out.diasFaltantes = Math.ceil((meta * 0.85 - reloj.gdd) / reloj.ritmoGdd);
			out.texto = T.creciendo(out.diasFaltantes);
		} else if (reloj.gdd <= meta * 1.1) {
			out.estado = 'punto_ensilaje';
			out.texto = T.punto_ensilaje;
		} else {
			out.estado = 'pasado_ensilaje';
			out.texto = T.pasado_ensilaje;
		}
		return out;
	}

	if (!esp.rebrote) { out.texto = T.sin_especie; return out; }
	const { min, max, pasado } = esp.rebrote;
	if (reloj.efectivos < min) {
		out.estado = 'rebrote';
		out.diasFaltantes = Math.ceil((min - reloj.efectivos) / reloj.ritmo);
		out.texto = T.rebrote(out.diasFaltantes);
	} else if (reloj.efectivos < pasado) {
		out.estado = 'punto_optimo';
		out.tardio = reloj.efectivos > (max || pasado);
		out.texto = out.tardio ? T.punto_tardio : T.punto_optimo;
	} else {
		out.estado = 'pasado';
		out.texto = T.pasado;
	}
	// El reloj dice listo pero la vegetación no despegó: estrés o
	// fecha mal anotada → se señala, no se oculta.
	if (out.estado === 'punto_optimo' && out.ndvi != null && out.ndvi < NDVI_BAJO) {
		out.desacuerdo = 'revisar';
		out.texto = T.desacuerdo;
	}
	return out;
}

// Balance oferta/demanda del predio: cuántos días cubre el forraje
// parado al hato declarado, con el mismo aprovechamiento que ev30.
// Sin cabezas anotadas devuelve null (la UI invita a cargarlas).
function balance(predio, forrajeTotalKgMS) {
	const hato = (predio && predio.hato) || {};
	const cabezas = Number(hato.cabezas) || 0;
	if (!cabezas || !forrajeTotalKgMS) return null;
	const peso = Number(hato.pesoKg) || 450;
	const consumoDia = cabezas * (peso / 450) * CONSUMO_DIA;
	const dias = Math.floor(forrajeTotalKgMS * UTIL / consumoDia);
	return {
		cabezas,
		pesoKg: peso,
		consumoDiaKgMS: Math.round(consumoDia),
		diasCobertura: dias,
		fechaDeficit: new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
	};
}

module.exports = { evaluar, detectarCorte, areaHa, kgMSHaEst, balance };
