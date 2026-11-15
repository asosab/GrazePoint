// servicios/grazepoint/services/gibsValores.js — valor real por punto
// desde tiles de NASA GIBS.
//
// GIBS no expone valores por punto; pero el tile PNG donde cae el
// centroide sí los lleva codificados en color. Bajamos el tile del
// zoom nativo de la capa, decodificamos el píxel del punto y lo
// cruzamos con el colormap oficial (colormaps/v1.3/<nombre>.xml:
// rgb → rango de valor real). Resultado: NDVI, humedad SMAP y demás
// capas como número, no solo como imagen.
//
// Caché: colormaps por nombre (casi no cambian) y tiles por
// capa+fecha+xyz (6 h, como power.js).

const { PNG } = require('pngjs');
const cnf = require('../config');
const muestreo = require('./muestreo');

const TILE_TTL = 6 * 60 * 60 * 1000;
const tiles = new Map();
const luts = new Map();

const GIBS = 'https://gibs.earthdata.nasa.gov';
const CAPAS = {
	ndvi: {
		layer: 'MODIS_Terra_NDVI_8Day',
		tms: 'GoogleMapsCompatible_Level9',
		z: 9,
		cmap: 'MODIS_NDVI'
	},
	smap: {
		layer: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
		tms: 'GoogleMapsCompatible_Level6',
		z: 6,
		cmap: 'SMAP_Soil_Moisture'
	}
};

async function _get(url, buf) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), cnf.power.timeoutMs);
	try {
		const res = await fetch(url, { signal: ctrl.signal });
		if (!res.ok) return null;
		return buf ? Buffer.from(await res.arrayBuffer()) : res.text();
	} catch (err) {
		return null;
	} finally {
		clearTimeout(t);
	}
}

// Parsear "value" del colormap: "[a,b)" → (a+b)/2 ; "[x]" → x.
function _puntoMedio(v) {
	if (!v) return null;
	const m = v.match(/[\[\(](-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)[\)\]]/);
	if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
	const s = v.match(/[\[\(](-?\d+(?:\.\d+)?)[\)\]]/);
	return s ? parseFloat(s[1]) : null;
}

// LUT: Map "r,g,b" → { v, nodata } construida del colormap oficial.
async function _lut(nombre) {
	const hit = luts.get(nombre);
	if (hit) return hit;
	const xml = await _get(GIBS + '/colormaps/v1.3/' + nombre + '.xml', false);
	if (!xml) return null;
	const lut = new Map();
	const re = /ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*value="([^"]+)"[^>]*?(nodata="true")?/g;
	let m;
	while ((m = re.exec(xml))) {
		const r = +m[1], g = +m[2], b = +m[3];
		const v = _puntoMedio(m[4]);
		lut.set(r + ',' + g + ',' + b, { v, nodata: !!m[5] });
	}
	const out = lut.size ? lut : null;
	if (out) luts.set(nombre, out);
	return out;
}

// Web-Mercator: punto → tile xyz + píxel dentro del tile.
function _pixel(lat, lon, z) {
	const n = Math.pow(2, z);
	const x = ((lon + 180) / 360) * n;
	const latR = (lat * Math.PI) / 180;
	const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
	return { xt: Math.floor(x), yt: Math.floor(y), px: Math.floor((x % 1) * 256), py: Math.floor((y % 1) * 256) };
}

// Valor de `capa` ('ndvi' | 'smap') en el punto, para la fecha dada.
// Devuelve número o null (nube/sin dato/fuera de rango).
async function valor(capa, lat, lon, ymd) {
	const c = CAPAS[capa];
	if (!c) return null;
	const { xt, yt, px, py } = _pixel(lat, lon, c.z);
	const key = capa + ':' + ymd + ':' + xt + ':' + yt;
	const hit = tiles.get(key);
	let png = hit && Date.now() - hit.ts < TILE_TTL ? hit.png : null;
	if (!png) {
		const buf = await _get(GIBS + '/wmts/epsg3857/best/' + c.layer + '/default/' + ymd + '/' + c.tms + '/' + c.z + '/' + yt + '/' + xt + '.png', true);
		if (!buf) return null;
		try { png = PNG.sync.read(buf); } catch (e) { return null; }
		tiles.set(key, { ts: Date.now(), png });
	}
	const lut = await _lut(c.cmap);
	if (!lut) return null;
	const i = (png.width * py + px) << 2;
	if (png.data[i + 3] < 10) return null; // píxel transparente
	const exacta = lut.get(png.data[i] + ',' + png.data[i + 1] + ',' + png.data[i + 2]);
	if (exacta) return exacta.nodata ? null : exacta.v;
	// Sin match exacto: color más cercano dentro de tolerancia
	let mejor = null, mejorD = 30 * 30;
	for (const [k, e] of lut) {
		const p = k.split(',');
		const d = (png.data[i] - p[0]) ** 2 + (png.data[i + 1] - p[1]) ** 2 + (png.data[i + 2] - p[2]) ** 2;
		if (d < mejorD) { mejorD = d; mejor = e; }
	}
	return mejor && !mejor.nodata ? mejor.v : null;
}

// Camina fechas hacia atrás hasta hallar un tile con dato: los
// productos de 8 días solo existen en fechas de inicio de periodo y
// publican con días de retraso. Devuelve { valor, fecha } o null.
async function valorBuscando(capa, lat, lon, diasAtras, paso, intentos) {
	for (let i = 0; i < intentos; i++) {
		const d = new Date(Date.now() - (diasAtras + i * paso) * 86400000);
		const ymd = d.toISOString().slice(0, 10);
		const v = await valor(capa, lat, lon, ymd);
		if (v != null) return { valor: v, fecha: ymd };
	}
	return null;
}

// Serie NDVI del punto: una muestra cada `paso` días hasta `dias`
// atrás, ascendente y sin fechas repetidas de tile (el producto es de
// 8 días: pedir días consecutivos solo repite el mismo tile).
async function serieNdvi(lat, lon, dias, paso) {
	const out = [];
	const n = Math.max(2, Math.round(dias / paso));
	for (let i = n; i >= 0; i--) {
		const r = await valorBuscando('ndvi', lat, lon, i * paso, 8, 2);
		if (r && (!out.length || out[out.length - 1].fecha !== r.fecha)) {
			out.push({ fecha: r.fecha, valor: r.valor });
		}
	}
	return out;
}

// ── Muestreo por área ────────────────────────────────────────────────────
// El valor no es de un punto sino de la parcela: grilla de puntos
// dentro del polígono con el paso del píxel nativo de la capa
// (NDVI ~305 m en z9, SMAP ~2.4 km en z6). Los tiles se cachean por
// xyz, así que muchos puntos sobre el mismo tile no cuestan fichas.
// Devuelve { media, min, max, n, nTotal } o null si ningún punto dio
// dato (nube / fuera de cobertura). Parcelas más chicas que el paso
// caen a un único punto interior.
const PASO_M = { ndvi: 300, smap: 2400 };
const MAX_PUNTOS = 40;

async function valorZona(capa, geometry, ymd) {
	if (!CAPAS[capa]) return null;
	let pts = muestreo.puntosMuestra(geometry, PASO_M[capa] || 300, MAX_PUNTOS);
	if (!pts.length) {
		const p = muestreo.puntoDentro(geometry);
		if (!p) return null;
		pts = [[p.lon, p.lat]];
	}
	const vals = [];
	for (const [lon, lat] of pts) {
		const v = await valor(capa, lat, lon, ymd);
		if (v != null) vals.push(v);
	}
	if (!vals.length) return null;
	vals.sort((a, b) => a - b);
	return {
		media: vals[Math.floor(vals.length / 2)],
		min: vals[0],
		max: vals[vals.length - 1],
		n: vals.length,
		nTotal: pts.length,
		muestras: vals // serie ordenada: histogramas y clases por hectárea
	};
}

// Igual que valorBuscando pero por área: camina fechas hacia atrás
// hasta que la parcela tenga al menos un píxel con dato.
async function valorBuscandoZona(capa, geometry, diasAtras, paso, intentos) {
	for (let i = 0; i < intentos; i++) {
		const d = new Date(Date.now() - (diasAtras + i * paso) * 86400000);
		const ymd = d.toISOString().slice(0, 10);
		const z = await valorZona(capa, geometry, ymd);
		if (z) return { zona: z, fecha: ymd };
	}
	return null;
}

module.exports = { valor, valorBuscando, serieNdvi, valorZona, valorBuscandoZona };
