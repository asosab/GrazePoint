// servicios/fieldShift/services/rotacion.js — recomendador de rotación.
//
// Enfoque 1 del top-10: «qué sembrar después de X» con 3 opciones
// rankeadas. El puntaje cruza:
//   - suelo medido de la parcela (último análisis PRIAS: pH, MO, textura)
//   - clima del predio (lluvia anual media POWER vs lluviaMin)
//   - historia: no repetir familia/especie; bonus N si lo anterior fue
//     gramínea o cultivo de alta extracción; penaliza leguminosa tras
//     leguminosa.
// Devuelve las 3 mejores con razones legibles para el técnico.

const Cultivo = require('../models/cultivoModel');
const { CATALGO_EMBEBIDO } = require('./catalogo');
const { RAZONES, langOk } = require('./i18n');

async function catalogo() {
	try {
		const docs = await Cultivo.find().lean();
		if (docs && docs.length) return docs;
	} catch (e) { /* BD sin catálogo: fallback */ }
	return CATALGO_EMBEBIDO;
}

function _ultimoSuelo(parcela) {
	if (!parcela || !Array.isArray(parcela.suelos) || !parcela.suelos.length) return null;
	return parcela.suelos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
}

function _familiaDe(especieNombre, catalogoArr) {
	const c = catalogoArr.find((x) => x.especie.toLowerCase() === String(especieNombre || '').toLowerCase());
	return c ? c.familia : null;
}

// Puntaje 0–100 por cultivo candidato.
function _puntaje(c, ctx, T) {
	let puntos = 50;
	const razones = [];

	// Lluvia anual vs requerimiento
	if (c.lluviaMin != null && ctx.lluviaAnual != null) {
		if (ctx.lluviaAnual >= c.lluviaMin) { puntos += 10; }
		else { puntos -= 20; razones.push(T.mas_lluvia(ctx.lluviaAnual)); }
	}

	// pH medido vs rango de la especie
	if (ctx.ph != null && c.phMin != null && c.phMax != null) {
		if (ctx.ph >= c.phMin && ctx.ph <= c.phMax) { puntos += 10; }
		else { puntos -= 15; razones.push(T.ph_fuera(ctx.ph, c.phMin, c.phMax)); }
	}

	// Textura arenosa
	if (ctx.arenoso) {
		if (c.toleraArenosos) { puntos += 10; razones.push(T.arenosos); }
		else { puntos -= 10; }
	}

	// Rotación: familia y aporte de nitrógeno
	if (ctx.familiaAnterior && c.familia === ctx.familiaAnterior) {
		puntos -= 15; razones.push(T.misma_familia);
	}
	if (ctx.familiaAnterior === 'Poaceae' && c.fijaN) {
		puntos += 15; razones.push(T.leg_tras_gram);
	}
	if (c.fijaN && ctx.familiaAnterior === 'Fabaceae') {
		puntos -= 5; razones.push(T.leg_tras_leg);
	}
	if (ctx.especieAnterior && c.especie.toLowerCase() === ctx.especieAnterior.toLowerCase()) {
		puntos -= 30; razones.push(T.misma_especie);
	}
	if (ctx.grupoAnterior === 'pastura' && c.grupo === 'pastura') {
		puntos -= 5; // resiembra directa: posible pero no aporta rotación
	}

	// MO baja: preferir cultivos de servicio que la levanten
	if (ctx.moBaja && (c.grupo === 'cultivo-servicio' || c.fijaN)) {
		puntos += 8; razones.push(T.levanta_mo);
	}

	// Temporada seca (últimos 6 meses por debajo de lo habitual):
	// favorece especies de bajo requerimiento y castiga las sedientas.
	if (ctx.tendenciaSeca && c.lluviaMin != null) {
		if (c.lluviaMin <= 700) { puntos += 8; razones.push(T.seca_favor); }
		else if (c.lluviaMin >= 1000) { puntos -= 10; razones.push(T.seca_castiga); }
	}

	// Vegetación débil o cayendo en el satélite (NDVI del punto):
	// el terreno pide cobertura, no otro cultivo extractor.
	if (ctx.ndviBajo && (c.grupo === 'cultivo-servicio' || c.fijaN)) {
		puntos += 8; razones.push(T.ndvi_bajo);
	}
	if (ctx.ndviCae && c.grupo === 'cultivo-servicio') {
		puntos += 6; razones.push(T.ndvi_cae);
	}

	// Nitrógeno bajo (SoilGrids, g/kg): las leguminosas lo reponen.
	if (ctx.nBajo && c.fijaN) {
		puntos += 8; razones.push(T.n_bajo);
	}

	// CIC baja: el suelo retiene poco nutriente; una extracción alta
	// de N lo deja peor de lo que estaba.
	if (ctx.cicBajo && c.extraccion && c.extraccion.n >= 150) {
		puntos -= 10; razones.push(T.cic_bajo);
	}

	// Suelo compactado (densidad aparente alta): cobertura de raíz gruesa.
	if (ctx.denso && c.grupo === 'cultivo-servicio') {
		puntos += 5; razones.push(T.denso);
	}

	return { puntos, razones };
}

// contexto: { ph, mo, textura, lluviaAnual, especieAnterior, familiaAnterior, grupoAnterior }
// sueloWeb (SoilGrids/ISRIC) rellena lo que el PRIAS aún no tiene medido:
// pH, materia orgánica estimada (SOC×1.724), textura por fracciones,
// nitrógeno, CIC y densidad. terreno trae NDVI y SMAP del satélite;
// tiempo trae la tendencia de los últimos 6 meses vs su climatología.
async function recomendar({ parcela, clima, sueloWeb, terreno, tiempo, limite = 3, lang }) {
	const T = RAZONES[langOk(lang)];
	const catalogoArr = await catalogo();
	const suelo = _ultimoSuelo(parcela);
	const textura = suelo && suelo.textura ? String(suelo.textura).toLowerCase() : '';
	const arenoso = /aren/.test(textura) || (!textura && sueloWeb && sueloWeb.textura === 'arenosa');
	const ctx = {
		ph: (suelo && suelo.ph != null) ? suelo.ph : (sueloWeb ? sueloWeb.ph : null),
		moBaja: (suelo && suelo.materiaOrganica != null) ? suelo.materiaOrganica < 2
			: (sueloWeb && sueloWeb.moEstimada != null ? sueloWeb.moEstimada < 2 : false),
		arenoso,
		// Señales del terreno remoto (SoilGrids) y del satélite (GIBS):
		// nitrogeno llega en % N total; < 0.12 % es suelo pobre en N.
		nBajo: !!(sueloWeb && sueloWeb.nitrogeno != null && sueloWeb.nitrogeno < 0.12),
		cicBajo: !!(sueloWeb && sueloWeb.cec != null && sueloWeb.cec < 10),
		denso: !!(sueloWeb && sueloWeb.densidad != null && sueloWeb.densidad > 1.45),
		ndviBajo: !!(terreno && terreno.ndvi != null && terreno.ndvi < 0.3),
		ndviCae: !!(terreno && terreno.ndvi != null && terreno.ndviAnt != null && terreno.ndviAnt - terreno.ndvi > 0.15),
		// Señal temporal: la temporada reciente viene por debajo de lo normal.
		tendenciaSeca: !!(tiempo && tiempo.tendenciaSeca),
		sueloFuente: suelo ? 'PRIAS' : (sueloWeb ? 'SoilGrids' : null),
		texturaEstimada: textura || (sueloWeb ? sueloWeb.textura : null),
		lluviaAnual: clima && clima.lluviaAnualMedia != null ? clima.lluviaAnualMedia : null,
		especieAnterior: parcela && parcela.especieActual ? parcela.especieActual : null,
		familiaAnterior: _familiaDe(parcela && parcela.especieActual, catalogoArr),
		grupoAnterior: (() => {
			const c = catalogoArr.find((x) => x.especie.toLowerCase() === String(parcela && parcela.especieActual || '').toLowerCase());
			return c ? c.grupo : null;
		})()
	};

	// Si el catálogo de BD aún no tiene notas_en, se toma la del catálogo
	// embebido por especie antes de caer a la nota en castellano.
	const notasEnEmb = new Map(CATALGO_EMBEBIDO.map((x) => [x.especie.toLowerCase(), x.notas_en]));
	const rankeados = catalogoArr
		.map((c) => {
			const { puntos, razones } = _puntaje(c, ctx, T);
			return {
				especie: c.especie,
				grupo: c.grupo,
				familia: c.familia,
				cicloDias: c.cicloDias,
				fijaN: !!c.fijaN,
				puntaje: Math.max(0, Math.min(100, puntos)),
				razones,
				notas: (langOk(lang) === 'en' ? (c.notas_en || notasEnEmb.get(String(c.especie || '').toLowerCase())) : null) || c.notas || null
			};
		})
		.sort((a, b) => b.puntaje - a.puntaje)
		.slice(0, limite);

	return { contexto: ctx, recomendaciones: rankeados };
}

module.exports = { recomendar, catalogo };
