// servicios/fieldShift/services/sueloWeb.js — tipo de suelo por punto.
//
// Fuente: SoilGrids (ISRIC). La REST v2.0 (rest.isric.org) está
// degradada y devuelve nulls; el WMS público sí responde: con
// REQUEST=GetFeatureInfo + INFO_FORMAT=text/html devuelve el valor
// crudo del píxel del mapa. Una consulta por propiedad, caché en
// memoria por coordenada redondeada (~1 km), como power.js.
//
// Devuelve propiedades de la capa 0–5 cm: pH, arena/arcilla/limo %,
// carbono orgánico, nitrógeno, CIC, densidad y textura estimada.
// El recomendador los usa como respaldo cuando la parcela no tiene
// análisis PRIAS medido a mano.

const cnf = require('../config');

const cache = new Map(); // clave → { ts, data }
const TTL_MS = 24 * 60 * 60 * 1000; // el suelo no cambia entre sesiones

const PROPS = [
	['phh2o', 'phh2o_0-5cm_mean'],
	['clay', 'clay_0-5cm_mean'],
	['sand', 'sand_0-5cm_mean'],
	['silt', 'silt_0-5cm_mean'],
	['soc', 'soc_0-5cm_mean'],
	['nitrogen', 'nitrogen_0-5cm_mean'],
	['cec', 'cec_0-5cm_mean'],
	['bdod', 'bdod_0-5cm_mean']
];

function _redondear(v) { return Math.round(Number(v) * 100) / 100; }

async function _valor(prop, layer, lat, lon) {
	// BBOX ±0.05° (~5 km) centrado en el punto; X/Y 50 = centro.
	const d = 0.05;
	const url = 'https://maps.isric.org/mapserv?map=/map/' + prop + '.map'
		+ '&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo'
		+ '&LAYERS=' + layer + '&QUERY_LAYERS=' + layer + '&STYLES='
		+ '&SRS=EPSG:4326&BBOX=' + (lon - d) + ',' + (lat - d) + ',' + (lon + d) + ',' + (lat + d)
		+ '&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text/html';
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), cnf.power.timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
		if (!res.ok) return null;
		const html = await res.text();
		const m = html.match(/id="value">(-?\d+(?:\.\d+)?)</);
		const u = html.match(/<b>Unit: <\/b>([^<]+)/);
		if (!m) return null;
		return { v: parseFloat(m[1]), unidad: u ? u[1].trim() : '' };
	} catch (err) {
		return null;
	} finally {
		clearTimeout(t);
	}
}

// USDA simplificado por fracciones (%)
function _textura(arena, arcilla, limon) {
	if (arena == null || arcilla == null) return null;
	if (arcilla >= 40) return 'arcillosa';
	if (arena >= 65) return 'arenosa';
	if (arena >= 45 && arcilla < 20) return 'franco_arenosa';
	if (arcilla >= 27) return 'franco_arcillosa';
	return 'franca';
}

async function consultar(lat, lon) {
	const key = _redondear(lat) + ',' + _redondear(lon);
	const hit = cache.get(key);
	if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

	const res = await Promise.all(PROPS.map(([prop, layer]) => _valor(prop, layer, lat, lon)));
	const raw = {};
	PROPS.forEach(([prop], i) => { raw[prop] = res[i] ? res[i].v : null; });

	// Nada de valor si ni pH ni textura llegaron (punto sin cobertura)
	if (raw.phh2o == null && raw.clay == null && raw.sand == null) return null;

	const arena = raw.sand != null ? Math.round(raw.sand / 10) : null;        // g/kg → %
	const arcilla = raw.clay != null ? Math.round(raw.clay / 10) : null;
	const limon = raw.silt != null ? Math.round(raw.silt / 10) : null;
	const socGkg = raw.soc != null ? raw.soc / 10 : null;                   // dg/kg → g/kg

	const data = {
		ok: true,
		ph: raw.phh2o != null ? Math.round(raw.phh2o) / 10 : null,          // pH*10 → pH
		arena,
		arcilla,
		limon,
		soc: socGkg != null ? Math.round(socGkg * 10) / 10 : null,
		moEstimada: socGkg != null ? Math.round(socGkg * 1.724) / 10 : null, // van Bemmelen → MO %
		nitrogeno: raw.nitrogen != null ? raw.nitrogen / 1000 : null,        // cg/kg → g/kg ≈ ‰
		cec: raw.cec != null ? Math.round(raw.cec) / 10 : null,              // mmol/kg → cmol/kg
		densidad: raw.bdod != null ? raw.bdod / 100 : null,                  // cg/cm³ → kg/dm³
		textura: _textura(arena, arcilla, limon),
		fuente: 'SoilGrids (ISRIC)'
	};
	cache.set(key, { ts: Date.now(), data });
	return data;
}

module.exports = { consultar };
