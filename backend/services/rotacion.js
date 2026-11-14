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

	return { puntos, razones };
}

// contexto: { ph, mo, textura, lluviaAnual, especieAnterior, familiaAnterior, grupoAnterior }
async function recomendar({ parcela, clima, limite = 3, lang }) {
	const T = RAZONES[langOk(lang)];
	const catalogoArr = await catalogo();
	const suelo = _ultimoSuelo(parcela);
	const textura = suelo && suelo.textura ? String(suelo.textura).toLowerCase() : '';
	const arenoso = /aren/.test(textura);
	const ctx = {
		ph: suelo && suelo.ph != null ? suelo.ph : null,
		moBaja: suelo && suelo.materiaOrganica != null ? suelo.materiaOrganica < 2 : false,
		arenoso,
		lluviaAnual: clima && clima.lluviaAnualMedia != null ? clima.lluviaAnualMedia : null,
		especieAnterior: parcela && parcela.especieActual ? parcela.especieActual : null,
		familiaAnterior: _familiaDe(parcela && parcela.especieActual, catalogoArr),
		grupoAnterior: (() => {
			const c = catalogoArr.find((x) => x.especie.toLowerCase() === String(parcela && parcela.especieActual || '').toLowerCase());
			return c ? c.grupo : null;
		})()
	};

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
				notas: (langOk(lang) === 'en' ? c.notas_en : null) || c.notas || null
			};
		})
		.sort((a, b) => b.puntaje - a.puntaje)
		.slice(0, limite);

	return { contexto: ctx, recomendaciones: rankeados };
}

module.exports = { recomendar, catalogo };
