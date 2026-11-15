// servicios/fieldShift/services/i18n.js — cadenas visibles del backend.
//
// El idioma llega por parámetro `lang` en cada llamada (body o query):
// 'es' activa el español; cualquier otro valor cae al inglés, que es el
// idioma por defecto del producto. Los textos en inglés pasaron por el
// filtro humanamente-en: sin em dashes ni tics de IA.

const langOk = (l) => (l === 'es' ? 'es' : 'en');

const MESES = {
	es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
	en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

const GRUPO = {
	es: { pastura: 'pastura', leguminosa: 'leguminosa', 'cultivo-servicio': 'cultivo de servicio', ensilaje: 'ensilaje', grano: 'grano' },
	en: { pastura: 'pasture', leguminosa: 'legume', 'cultivo-servicio': 'cover crop', ensilaje: 'silage', grano: 'grain' }
};

const TIPO = {
	es: { potrero: 'Potrero', parcela: 'Parcela' },
	en: { potrero: 'Paddock', parcela: 'Plot' }
};

const grupoDe = (g, lang) => (GRUPO[langOk(lang)] && GRUPO[langOk(lang)][g]) || g;
const tipoDe = (tp, lang) => (TIPO[langOk(lang)] && TIPO[langOk(lang)][tp]) || tp;

// Razones del recomendador de rotación (funciones: interpolan valores).
const RAZONES = {
	es: {
		mas_lluvia: (mm) => 'pide más lluvia de la que cae aquí (' + mm + ' mm/año)',
		ph_fuera: (ph, a, b) => 'tu pH ' + ph + ' sale de su rango (' + a + '–' + b + ')',
		arenosos: 'tolera tus suelos arenosos',
		misma_familia: 'misma familia que lo anterior',
		leg_tras_gram: 'leguminosa tras gramínea: aporta N al suelo',
		leg_tras_leg: 'leguminosa tras leguminosa suma poco',
		misma_especie: 'repetir la misma especie',
		levanta_mo: 'ayuda a levantar la materia orgánica',
		seca_favor: 'la temporada viene seca y esta aguanta con poca agua',
		seca_castiga: 'la temporada viene seca y esta pide bastante lluvia',
		ndvi_bajo: 'la vegetación se ve débil en el satélite: le devuelve cobertura',
		ndvi_cae: 'la vegetación viene cayendo frente al año pasado',
		n_bajo: 'tu suelo anda corto de nitrógeno: esta lo repone sola',
		cic_bajo: 'suelo de baja retención: su alta extracción de N la resiente',
		denso: 'suelo compactado: sus raíces gruesas lo aflojan'
	},
	en: {
		mas_lluvia: (mm) => 'needs more rain than falls here (' + mm + ' mm/year)',
		ph_fuera: (ph, a, b) => 'your pH ' + ph + ' is outside its range (' + a + '–' + b + ')',
		arenosos: 'tolerates your sandy soils',
		misma_familia: 'same family as the previous crop',
		leg_tras_gram: 'legume after grass: adds N to the soil',
		leg_tras_leg: 'legume after legume adds little',
		misma_especie: 'repeats the same species',
		levanta_mo: 'helps build organic matter back up',
		seca_favor: 'the season is running dry and this one gets by on little water',
		seca_castiga: 'the season is running dry and this one asks for plenty of rain',
		ndvi_bajo: 'satellite shows weak vegetation: it brings the cover back',
		ndvi_cae: 'vegetation keeps dropping versus last year',
		n_bajo: 'your soil is short on nitrogen: this one rebuilds it on its own',
		cic_bajo: 'low-retention soil: its heavy N uptake hits it hard',
		denso: 'compacted soil: its thick roots loosen it'
	}
};

// Ventana de siembra forrajera.
const VENTANA = {
	es: {
		fuente: 'NASA POWER (climatología multianual + serie diaria)',
		lluvia_baja: (pct) => 'El último mes llovió ' + pct + '% menos que la media: siembra solo si el suelo llega húmedo o espera al primer aguacero firme.',
		corte_germinacion: 'Si la lluvia se corta en los primeros 15 días, la germinación queda expuesta (riesgo declarado por la Hacienda).'
	},
	en: {
		fuente: 'NASA POWER (multi-year climatology + daily series)',
		lluvia_baja: (pct) => 'Last month\'s rain was ' + pct + '% below average: plant only if the soil is already moist, or wait for the first solid downpour.',
		corte_germinacion: 'If the rain cuts off in the first 15 days, germination is left exposed (risk flagged by Hacienda Patiño).'
	}
};

// Informe PDF.
const INFORME = {
	es: {
		titulo: 'Field Shift — informe de predio',
		generado: 'Generado el ',
		para: ' para ',
		nota_clima: 'Datos climáticos: NASA POWER (serie diaria y climatología multianual). Recomendaciones orientadas a pasturas y cultivos de servicio.',
		predio: 'Predio: ',
		descripcion: 'Descripción',
		parcelas_registradas: 'Parcelas registradas',
		ubicacion: 'Ubicación',
		clima_h: 'Clima del predio (NASA POWER)',
		lluvia_anual: 'Lluvia anual media',
		lluvia_mes: 'Lluvia último mes',
		humedad_suelo: 'Humedad de suelo reciente (raíz)',
		anomalia: 'Anomalía de lluvia del último mes',
		siembra_actual: 'Siembra actual',
		sembrado_el: 'Sembrado el',
		ultimo_suelo: (f, fuente) => 'Último análisis de suelo (' + f + ', ' + fuente + ')',
		mo: 'Materia orgánica',
		nitrogeno: 'Nitrógeno',
		textura: 'Textura',
		historial_h: 'Historial de siembras',
		vigente: 'vigente',
		aforos_h: 'Aforos',
		rotacion_h: (x) => 'Rotación sugerida tras ' + x,
		siembra_vacia: 'la siembra actual',
		ventana_h: 'Ventana de siembra forrajera',
		veredicto: 'Veredicto',
		mes_actual: 'Mes actual',
		v_favorable: 'Favorable ahora',
		v_seco: 'En ventana, pero seco',
		v_esperar: 'Esperar',
		ventana_item: (a, b, min, max) => '• Ventana: ' + a + ' a ' + b + ' (' + min + '–' + max + ' mm/mes)',
		sin_ventana: (u) => 'Sin meses por encima de ' + u + ' mm/mes en la climatología del punto.',
		riesgos_h: 'Riesgos',
		pie: 'Field Shift · PRIAS digital · Recomendaciones de apoyo a la decisión: contrastar siempre con el técnico de campo.',
		parcelas_n: (n) => n + ' parcela(s)',
		sin_coords: 'Sin coordenadas: agrega el polígono de al menos una parcela para incluir clima y análisis.'
	},
	en: {
		titulo: 'Field Shift: farm report',
		generado: 'Generated on ',
		para: ' for ',
		nota_clima: 'Climate data: NASA POWER (daily series and multi-year climatology). Recommendations focus on pastures and cover crops.',
		predio: 'Farm: ',
		descripcion: 'Description',
		parcelas_registradas: 'Plots on record',
		ubicacion: 'Location',
		clima_h: 'Farm climate (NASA POWER)',
		lluvia_anual: 'Mean annual rainfall',
		lluvia_mes: 'Rain last month',
		humedad_suelo: 'Recent root-zone soil moisture',
		anomalia: 'Rain anomaly last month',
		siembra_actual: 'Current planting',
		sembrado_el: 'Planted on',
		ultimo_suelo: (f, fuente) => 'Latest soil test (' + f + ', ' + fuente + ')',
		mo: 'Organic matter',
		nitrogeno: 'Nitrogen',
		textura: 'Texture',
		historial_h: 'Planting history',
		vigente: 'ongoing',
		aforos_h: 'Forage estimates',
		rotacion_h: (x) => 'Suggested rotation after ' + x,
		siembra_vacia: 'the current planting',
		ventana_h: 'Forage planting window',
		veredicto: 'Verdict',
		mes_actual: 'Current month',
		v_favorable: 'Favorable now',
		v_seco: 'In window, but dry',
		v_esperar: 'Wait',
		ventana_item: (a, b, min, max) => '• Window: ' + a + ' to ' + b + ' (' + min + '–' + max + ' mm/month)',
		sin_ventana: (u) => 'No months above ' + u + ' mm/month in this location\'s climatology.',
		riesgos_h: 'Risks',
		pie: 'Field Shift · digital PRIAS · Decision aid only: always check with your field technician.',
		parcelas_n: (n) => n + ' plot(s)',
		sin_coords: 'No coordinates: draw at least one plot polygon to include climate and analysis.'
	}
};

// Correos (verificación y restablecer clave).
const MAIL = {
	es: {
		saludo: (n) => (n ? 'Hola ' + n + ',' : 'Hola,'),
		firma: '— Equipo Field Shift',
		verif_asunto: (c) => 'Tu código de Field Shift: ' + c,
		verif_texto: (c) => 'Tu código de verificación es ' + c + '. Vale por 30 minutos.\n\nSi no pediste registrarte en Field Shift, ignora este correo.',
		verif_html: (c) => '<p>Tu código de verificación es <b style="font-size:1.4em;letter-spacing:2px">' + c + '</b>. Vale por 30 minutos.</p><p>Si no pediste registrarte en Field Shift, ignora este correo.</p>',
		reset_asunto: 'Restablecer tu clave de Field Shift',
		reset_texto: (c) => 'Pediste restablecer tu clave. Tu código es ' + c + '. Vale por 30 minutos.\n\nSi no fuiste tú, ignora este correo: tu clave sigue igual.',
		reset_html: (c) => '<p>Pediste restablecer tu clave. Tu código es <b style="font-size:1.4em;letter-spacing:2px">' + c + '</b>. Vale por 30 minutos.</p><p>Si no fuiste tú, ignora este correo: tu clave sigue igual.</p>'
	},
	en: {
		saludo: (n) => (n ? 'Hi ' + n + ',' : 'Hi,'),
		firma: 'The Field Shift team',
		verif_asunto: (c) => 'Your Field Shift code: ' + c,
		verif_texto: (c) => 'Your verification code is ' + c + '. It expires in 30 minutes.\n\nIf you did not sign up for Field Shift, ignore this email.',
		verif_html: (c) => '<p>Your verification code is <b style="font-size:1.4em;letter-spacing:2px">' + c + '</b>. It expires in 30 minutes.</p><p>If you did not sign up for Field Shift, ignore this email.</p>',
		reset_asunto: 'Reset your Field Shift password',
		reset_texto: (c) => 'You asked to reset your password. Your code is ' + c + '. It expires in 30 minutes.\n\nIf it was not you, ignore this email: your password stays the same.',
		reset_html: (c) => '<p>You asked to reset your password. Your code is <b style="font-size:1.4em;letter-spacing:2px">' + c + '</b>. It expires in 30 minutes.</p><p>If it was not you, ignore this email: your password stays the same.</p>'
	}
};

module.exports = { langOk, MESES, GRUPO, TIPO, grupoDe, tipoDe, RAZONES, VENTANA, INFORME, MAIL };
