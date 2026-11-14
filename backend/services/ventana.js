// servicios/fieldShift/services/ventana.js — ventana de siembra forrajera.
//
// Enfoque 3 del top-10: cuándo sembrar pasturas/cultivos de servicio.
// Cruza la climatología mensual de POWER (lluvia media por mes) con el
// estado actual del suelo (humedad GWETROOT reciente + lluvia del último
// mes vs la media). Una ventana es un tramo de meses consecutivos donde
// la lluvia mensual esperada supera el umbral de establecimiento de la
// especie (~60 mm/mes por defecto).
//
// La respuesta llega en español llano para el técnico: meses buenos,
// estado de hoy y el riesgo declarado por Sueleen (lluvia tardía o
// cortada → pérdida de germinación).

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_KEY = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function _lluviaMensual(clima) {
	if (!clima || !clima.mensual || !clima.mensual.PRECTOTCORR) return null;
	const m = clima.mensual.PRECTOTCORR;
	const dias = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return MESES_KEY.map((k, i) => (m[k] != null ? Math.round(m[k] * dias[i]) : null)); // mm/mes
}

// Tramos consecutivos de meses con lluvia >= umbral (circular: dic→ene).
function _ventanas(mmPorMes, umbral) {
	const bueno = mmPorMes.map((v) => v != null && v >= umbral);
	const tramos = [];
	const iniciosUsados = new Set();
	let inicio = -1;
	for (let i = 0; i < 24; i++) {
		const m = i % 12;
		if (bueno[m] && inicio === -1) inicio = m;
		if (!bueno[m] && inicio !== -1) { tramos.push([inicio, (m + 11) % 12]); iniciosUsados.add(inicio); inicio = -1; }
	}
	// Cierre circular: solo si el tramo quedó abierto y su inicio no fue
	// registrado ya en la segunda pasada del barrido.
	if (inicio !== -1 && !iniciosUsados.has(inicio)) tramos.push([inicio, (inicio + 11) % 12]);

	// Eliminar tramos contenidos en otro (p. ej. ene–jun dentro de oct–jun
	// cuando la ventana cruza el cambio de año).
	const mesesDe = ([a, b]) => { const r = []; for (let m = a; ; m = (m + 1) % 12) { r.push(m); if (m === b) break; } return r; };
	return tramos.filter((t) => {
		const mt = mesesDe(t);
		return !tramos.some((u) => {
			if (u === t) return false;
			const mu = mesesDe(u);
			return mu.length > mt.length && mt.every((m) => mu.includes(m));
		});
	});
}

function evaluar({ clima, resumenPower, especie }) {
	const mmPorMes = _lluviaMensual(clima);
	if (!mmPorMes) return { ok: false, error: 'sin_climatologia' };

	const umbral = 60; // mm/mes mínimo para establecer forraje en secano
	const tramos = _ventanas(mmPorMes, umbral);
	const mesActual = new Date().getUTCMonth();

	const ventanas = tramos.map(([a, b]) => ({
		desde: MESES[a],
		hasta: MESES[b],
		lluviaMinMes: Math.min(...rango(a, b).map((m) => mmPorMes[m])),
		lluviaMaxMes: Math.max(...rango(a, b).map((m) => mmPorMes[m]))
	}));

	function rango(a, b) {
		const r = [];
		for (let m = a; ; m = (m + 1) % 12) { r.push(m); if (m === b) break; }
		return r;
	}

	const dentro = tramos.some(([a, b]) => rango(a, b).includes(mesActual));
	const estado = {
		mes: MESES[mesActual],
		dentroDeVentana: dentro,
		lluviaUltimoMes: resumenPower ? resumenPower.lluviaUltimoMes : null,
		humedadSuelo: resumenPower ? resumenPower.humedadSueloReciente : null,
		anomaliaLluvia: resumenPower ? resumenPower.anomaliaLluvia : null
	};

	let veredicto;
	if (dentro && (estado.anomaliaLluvia == null || estado.anomaliaLluvia >= -25)) {
		veredicto = 'favorable_ahora';
	} else if (dentro) {
		veredicto = 'ventana_pero_seco'; // dentro de ventana climática pero lluvia actual baja
	} else {
		veredicto = 'esperar';
	}

	const riesgos = [];
	if (estado.anomaliaLluvia != null && estado.anomaliaLluvia < -25) {
		riesgos.push('El último mes llovió ' + Math.abs(estado.anomaliaLluvia) + '% menos que la media: siembra solo si el suelo llega húmedo o espera al primer aguacero firme.');
	}
	riesgos.push('Si la lluvia se corta en los primeros 15 días, la germinación queda expuesta (riesgo declarado por la Hacienda).');

	return {
		ok: true,
		especie: especie || null,
		umbralLluviaMes: umbral,
		lluviaPorMes: mmPorMes.map((v, i) => ({ mes: MESES[i], mm: v })),
		ventanas,
		estado,
		veredicto,
		riesgos,
		fuente: 'NASA POWER (climatología multianual + serie diaria)'
	};
}

module.exports = { evaluar, MESES };
