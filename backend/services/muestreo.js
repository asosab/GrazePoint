// servicios/fieldShift/services/muestreo.js — puntos dentro del
// polígono para muestrear capas raster.
//
// El análisis es del área de la parcela, no de todo el mapa ni del
// primer vértice que se anotó: genera una grilla regular de puntos
// dentro del polígono (paso en metros) y un punto representativo
// garantizado adentro (el centroide cae fuera en parcelas en «C»
// o en «L»). gibsValores muestrea cada punto; los tiles se cachean
// por xyz, así que repetir tile no cuesta fichas extra.

const DEG = Math.PI / 180;
const M_LAT = 110540;   // metros por grado de latitud
const M_LON = 111320;   // metros por grado de longitud en el ecuador

// Punto en anillo (ray casting). anillo: [[lon,lat],...]
function pip(x, y, anillo) {
	let r = false;
	for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
		const a = anillo[i], b = anillo[j];
		if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r;
	}
	return r;
}

// Dentro del polígono: anillo exterior sí, huecos no.
function dentro(x, y, geometry) {
	const anillos = geometry && geometry.coordinates;
	if (!anillos || !anillos[0] || anillos[0].length < 3) return false;
	if (!pip(x, y, anillos[0])) return false;
	for (let i = 1; i < anillos.length; i++) {
		if (pip(x, y, anillos[i])) return false;
	}
	return true;
}

function _bbox(anillo) {
	let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
	for (const p of anillo) {
		if (p[0] < x0) x0 = p[0];
		if (p[0] > x1) x1 = p[0];
		if (p[1] < y0) y0 = p[1];
		if (p[1] > y1) y1 = p[1];
	}
	return { x0, x1, y0, y1 };
}

// Grilla de [lon,lat] dentro del polígono, espaciada `pasoM` metros.
// maxN recorta con stride regular para no quemar fichas de tile en
// parcelas enormes. Devuelve [] si el polígono no tiene puntos dentro
// del paso pedido (llamador cae a puntoDentro).
function puntosMuestra(geometry, pasoM, maxN) {
	const anillo = geometry && geometry.coordinates && geometry.coordinates[0];
	if (!anillo || anillo.length < 3) return [];
	const b = _bbox(anillo);
	const latMed = (b.y0 + b.y1) / 2;
	const dx = pasoM / (M_LON * Math.max(0.05, Math.cos(latMed * DEG)));
	const dy = pasoM / M_LAT;
	let pts = [];
	for (let y = b.y0 + dy / 2; y < b.y1; y += dy) {
		for (let x = b.x0 + dx / 2; x < b.x1; x += dx) {
			if (dentro(x, y, geometry)) pts.push([x, y]);
		}
	}
	if (maxN && pts.length > maxN) {
		const salto = Math.ceil(pts.length / maxN);
		pts = pts.filter((_, i) => i % salto === 0);
	}
	return pts;
}

// Centroide del anillo exterior (área firmada).
function _centroide(anillo) {
	let s = 0, cx = 0, cy = 0;
	for (let i = 0; i < anillo.length - 1; i++) {
		const a = anillo[i], b = anillo[i + 1];
		const w = a[0] * b[1] - b[0] * a[1];
		s += w; cx += (a[0] + b[0]) * w; cy += (a[1] + b[1]) * w;
	}
	if (!s) return [anillo[0][0], anillo[0][1]];
	return [cx / (3 * s), cy / (3 * s)];
}

// Un punto representativo garantizado adentro: el centroide si cae
// dentro; si no, el punto de grilla más cercano a él.
function puntoDentro(geometry) {
	const anillo = geometry && geometry.coordinates && geometry.coordinates[0];
	if (!anillo || anillo.length < 3) return null;
	const c = _centroide(anillo);
	if (dentro(c[0], c[1], geometry)) return { lon: c[0], lat: c[1] };
	const pts = puntosMuestra(geometry, 150, 400);
	if (!pts.length) return null;
	let best = null, bd = 1e18;
	for (const p of pts) {
		const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
		if (d < bd) { bd = d; best = p; }
	}
	return { lon: best[0], lat: best[1] };
}

// Área del polígono en hectáreas (fórmula esférica de anillos).
function areaHa(geometry) {
	const ring = geometry && geometry.coordinates && geometry.coordinates[0];
	if (!ring || ring.length < 3) return null;
	const R = 6378137;
	let s = 0;
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i], b = ring[(i + 1) % ring.length];
		s += ((b[0] - a[0]) * DEG) * (2 + Math.sin(a[1] * DEG) + Math.sin(b[1] * DEG));
	}
	return Math.round(Math.abs(s * R * R / 2) / 10000 * 10) / 10;
}

module.exports = { pip, dentro, puntosMuestra, puntoDentro, areaHa };
