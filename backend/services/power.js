// servicios/fieldShift/services/power.js — NASA POWER API.
//
// Sin auth ni login. Dos consultas:
//   daily       → serie diaria reciente (lluvia, temperatura, humedad de
//                 suelo modelada GWETTOP/ROOT/PROF) para el estado actual.
//   climatology → promedios mensuales multianuales para la ventana de
//                 siembra y el ajuste de especies por lluvia anual.
// Caché en memoria por coordenada redondeada (~1 km) para no martillar la
// API: la ficha de un predio no cambia entre requests.

const cnf = require('../config');

const cache = new Map(); // clave → { ts, data }
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h

function _redondear(v) { return Math.round(Number(v) * 100) / 100; }

async function _get(url) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), cnf.power.timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
		if (!res.ok) throw new Error('POWER HTTP ' + res.status);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}

function _yyyymmdd(d) {
	const p = (n) => String(n).padStart(2, '0');
	return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}

// Serie diaria de los últimos `dias` para lat/lon.
// Devuelve { parametros: {PRECTOTCORR:{yyyymmdd:v},...}, header } o null.
async function diario(lat, lon, dias = 120) {
	const key = 'd:' + _redondear(lat) + ',' + _redondear(lon) + ':' + dias;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

	const fin = new Date();
	const ini = new Date(Date.now() - dias * 86400000);
	const url = cnf.power.base + '/temporal/daily/point'
		+ '?parameters=' + cnf.power.dailyParams
		+ '&community=AG&longitude=' + lon + '&latitude=' + lat
		+ '&start=' + _yyyymmdd(ini) + '&end=' + _yyyymmdd(fin)
		+ '&format=JSON&time-standard=UTC';
	try {
		const json = await _get(url);
		const data = { parametros: json && json.properties ? json.properties.parameter : null, header: json && json.header ? { title: json.header.title, source: 'NASA POWER', api: json.header.api && json.header.api.version } : { source: 'NASA POWER' } };
		if (data.parametros) cache.set(key, { ts: Date.now(), data });
		return data.parametros ? data : null;
	} catch (err) {
		console.log(cnf.tag + ' [warn] power.diario: ' + err.message);
		return null;
	}
}

// Climatología mensual multianual (PROMEDIOS, parámetro MENSUAL/ANN).
// Devuelve { mensual: {PARAM:{JAN..DEC, ANN}}, header } o null.
async function climatologia(lat, lon) {
	const key = 'c:' + _redondear(lat) + ',' + _redondear(lon);
	const hit = cache.get(key);
	if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

	const url = cnf.power.base + '/temporal/climatology/point'
		+ '?parameters=' + cnf.power.climaParams
		+ '&community=AG&longitude=' + lon + '&latitude=' + lat
		+ '&format=JSON';
	try {
		const json = await _get(url);
		const data = { mensual: json && json.properties ? json.properties.parameter : null, header: json && json.header ? { title: json.header.title, source: 'NASA POWER' } : { source: 'NASA POWER' } };
		if (data.mensual) cache.set(key, { ts: Date.now(), data });
		return data.mensual ? data : null;
	} catch (err) {
		console.log(cnf.tag + ' [warn] power.climatologia: ' + err.message);
		return null;
	}
}

// Resumen compacto para análisis: lluvia anual media, lluvia del último
// mes, humedad de suelo reciente (promedio de los últimos 7 datos) y la
// anomalía de lluvia del último mes vs climatología.
function resumen(daily, clima) {
	const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
	const out = { lluviaAnualMedia: null, lluviaUltimoMes: null, humedadSueloReciente: null, anomaliaLluvia: null };
	if (clima && clima.mensual && clima.mensual.PRECTOTCORR) {
		const m = clima.mensual.PRECTOTCORR;
		out.lluviaAnualMedia = m.ANN != null ? Math.round(m.ANN * 365) : null; // mm/día→mm/año aprox
	}
	if (daily && daily.parametros) {
		const pre = daily.parametros.PRECTOTCORR || {};
		const fechas = Object.keys(pre).sort();
		const ultimos30 = fechas.slice(-30);
		const lluviaMes = ultimos30.reduce((s, f) => s + (pre[f] > -900 ? pre[f] : 0), 0);
		out.lluviaUltimoMes = Math.round(lluviaMes);
		const gw = daily.parametros.GWETROOT || {};
		const gwFechas = Object.keys(gw).sort().slice(-7).filter((f) => gw[f] > -900);
		if (gwFechas.length) out.humedadSueloReciente = Math.round((gwFechas.reduce((s, f) => s + gw[f], 0) / gwFechas.length) * 100) / 100;
		if (out.lluviaAnualMedia && ultimos30.length) {
			const mediaMes = out.lluviaAnualMedia / 12;
			out.anomaliaLluvia = Math.round(((lluviaMes - mediaMes) / mediaMes) * 100); // %
		}
	}
	return out;
}

module.exports = { diario, climatologia, resumen, MESES: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] };
