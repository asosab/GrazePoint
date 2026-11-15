// servicios/grazepoint/services/tiempo.js — tendencia temporal del punto.
//
// Agrega la serie diaria de POWER en meses calendario y compara:
//   - lluvia de los últimos 6 meses vs los mismos 6 meses del año
//     anterior (el "ciclo pasado")
//   - cuántos de esos meses quedaron por debajo del 75 % de su media
//     climatológica (meses secos)
//   - humedad de raíz reciente vs su media climatológica del mes
// Sirve tanto al recomendador (temporada viene seca/húmeda) como a la
// sábana de análisis, que muestra los números al técnico.

const MESES_KEY = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Agrupa la serie daily {PARAM:{yyyymmdd:v}} por mes calendario.
function _porMes(parametros) {
	const pre = (parametros && parametros.PRECTOTCORR) || {};
	const t2 = (parametros && parametros.T2M) || {};
	const gw = (parametros && parametros.GWETROOT) || {};
	const meses = new Map(); // 'YYYY-MM' → {lluvia, ts, tn, gs, gn}
	for (const f of Object.keys(pre)) {
		if (pre[f] <= -900) continue;
		const k = f.slice(0, 4) + '-' + f.slice(4, 6);
		if (!meses.has(k)) meses.set(k, { lluvia: 0, ts: 0, tn: 0, gs: 0, gn: 0 });
		const m = meses.get(k);
		m.lluvia += pre[f];
		if (t2[f] != null && t2[f] > -900) { m.ts += t2[f]; m.tn++; }
		if (gw[f] != null && gw[f] > -900) { m.gs += gw[f]; m.gn++; }
	}
	return [...meses.entries()].map(([k, m]) => ({
		mes: k,
		lluvia: Math.round(m.lluvia),
		temp: m.tn ? Math.round((m.ts / m.tn) * 10) / 10 : null,
		humedad: m.gn ? Math.round((m.gs / m.gn) * 100) / 100 : null
	})).sort((a, b) => (a.mes < b.mes ? -1 : 1));
}

// daily: objeto de power.diario (parametros) — conviene pedir ~400 días
// para cubrir los últimos 6 meses y los mismos del año pasado.
// clima: objeto de power.climatologia (mensual JAN..DEC).
function analizar(daily, clima) {
	const meses = _porMes(daily && daily.parametros);
	if (meses.length < 4) return null;

	const ahora = new Date();
	const ult6 = meses.filter((m) => {
		const d = new Date(m.mes + '-15T00:00:00Z');
		const dif = (ahora - d) / (30.44 * 86400000);
		return dif >= 0 && dif < 6;
	});
	const ant6 = meses.filter((m) => {
		const d = new Date(m.mes + '-15T00:00:00Z');
		const dif = (ahora - d) / (30.44 * 86400000);
		return dif >= 6 && dif < 18;
	});

	const lluvia6m = ult6.reduce((s, m) => s + m.lluvia, 0);
	const lluvia6mAnt = ant6.reduce((s, m) => s + m.lluvia, 0);
	const pctVsAnio = lluvia6mAnt > 0 ? Math.round(((lluvia6m - lluvia6mAnt) / lluvia6mAnt) * 100) : null;

	// Meses por debajo del 75 % de su media climatológica
	let mesesSecos = 0;
	if (clima && clima.mensual && clima.mensual.PRECTOTCORR) {
		const cm = clima.mensual.PRECTOTCORR;
		for (const m of ult6) {
			const idx = +m.mes.slice(5, 7) - 1;
			const media = cm[MESES_KEY[idx]] != null ? cm[MESES_KEY[idx]] * DIAS[idx] : null;
			if (media != null && media > 0 && m.lluvia < media * 0.75) mesesSecos++;
		}
	}

	// Humedad de raíz reciente vs media del mes
	let humedadVsTipica = null;
	const ultima = ult6[ult6.length - 1];
	if (ultima && ultima.humedad != null && clima && clima.mensual && clima.mensual.GWETROOT) {
		const idx = +ultima.mes.slice(5, 7) - 1;
		const media = clima.mensual.GWETROOT[MESES_KEY[idx]];
		if (media != null) humedadVsTipica = Math.round((ultima.humedad - media) * 100) / 100;
	}

	return {
		meses,
		lluvia6m,
		lluvia6mAnt: ant6.length ? lluvia6mAnt : null,
		pctVsAnio,
		mesesSecos,
		humedadVsTipica,
		tendenciaSeca: mesesSecos >= 3 || (pctVsAnio != null && pctVsAnio < -30)
	};
}

module.exports = { analizar };
