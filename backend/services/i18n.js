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

// Bot de Telegram (respuestas del bot; el idioma sale del
// language_code del usuario de Telegram, no del JWT).
const TG = {
	es: {
		bienvenida: 'Hola, soy el bot de Field Shift. Para vincular tu cuenta abre la app, entra a tu perfil y toca «Vincular Telegram»: te va a dar un código como FS-ABC123 para mandarme acá.',
		vinculado_ok: (n, e) => 'Listo' + (n ? ', ' + n : '') + ': este Telegram quedó vinculado a la cuenta ' + e + '. Por acá te van a llegar los avisos de tu predio.',
		vinculado_re: (e) => 'Este Telegram estaba vinculado a otra cuenta: ahora quedó con ' + e + '.',
		codigo_malo: 'Ese código no sirve o ya venció. Genera uno nuevo en la app, en tu perfil: dura 10 minutos.',
		estado_si: (e) => 'Estás vinculado a la cuenta ' + e + '.',
		estado_no: 'Este Telegram no está vinculado a ninguna cuenta todavía. Vinculalo desde tu perfil en la app.',
		estado_admin: (n) => 'Bot funcionando. Usuarios con Telegram vinculado: ' + n + '.',
		ayuda: 'Comandos: /vincular <código> para vincular tu cuenta · /estado para ver tu vínculo.'
	},
	en: {
		bienvenida: 'Hi, I am the Field Shift bot. To link your account, open the app, go to your profile and tap "Link Telegram": it will give you a code like FS-ABC123 to send me here.',
		vinculado_ok: (n, e) => 'Done' + (n ? ', ' + n : '') + ': this Telegram is now linked to the account ' + e + '. Your farm alerts will arrive here.',
		vinculado_re: (e) => 'This Telegram was linked to a different account: it now belongs to ' + e + '.',
		codigo_malo: 'That code is invalid or already expired. Generate a new one in the app, in your profile: it lasts 10 minutes.',
		estado_si: (e) => 'You are linked to the account ' + e + '.',
		estado_no: 'This Telegram is not linked to any account yet. Link it from your profile in the app.',
		estado_admin: (n) => 'Bot is running. Users with linked Telegram: ' + n + '.',
		ayuda: 'Commands: /link <code> to link your account · /status to check your link.'
	}
};

// Estado forrajero del potrero (services/forraje.js). Los textos se
// leen en la app, el PDF y los avisos de Telegram.
const FORRAJE = {
	es: {
		sin_especie: 'Sin especie forrajera registrada: anota qué pasto hay para estimar el punto de corte.',
		sin_dato: 'Sin fecha de inicio: anota el último pastoreo o la fecha de siembra para arrancar el reloj.',
		sin_clima: 'Sin datos de clima para estimar el rebrote.',
		rebrote: (d) => 'En rebrote: faltan unos ' + d + ' días para entrar.',
		punto_optimo: 'En punto óptimo: buen momento para entrar el lote o cortar.',
		punto_tardio: 'En punto pero al límite: entrar pronto, la calidad ya empieza a bajar.',
		pasado: 'Pasado de punto: la fibra ya gana; si queda pie, mejor cortar para reserva.',
		desacuerdo: 'El reloj marca punto pero la vegetación no despegó: revisar el potrero (estrés o fecha mal anotada).',
		creciendo: (d) => 'Creciendo para ensilar: faltan unos ' + d + ' días al grano pastoso.',
		punto_ensilaje: 'Punto de ensilar: grano pastoso, cortar para silo ahora.',
		pasado_ensilaje: 'Pasó el punto de ensilar: el grano ya endureció.',
		fuente_ndvi: 'inicio estimado por satélite, sin registro anotado',
		kgms: (v, ha) => 'Forraje estimado: ~' + v + ' kg MS/ha' + (ha ? ' (~' + Math.round(v * ha) + ' kg MS en el potrero)' : ''),
		estados: { sin_especie: 'sin especie', sin_dato: 'sin dato', rebrote: 'en rebrote', punto_optimo: 'punto óptimo', pasado: 'pasado', creciendo: 'creciendo', punto_ensilaje: 'punto de ensilar', pasado_ensilaje: 'pasado de ensilar' },
		aviso_tg: (p, predio, esp) => 'El potrero «' + p + '» de ' + predio + ' llegó a su punto óptimo de ' + (esp || 'pasto') + ': buen momento para entrar el lote o cortar.',
		pdf_h: 'Estado de los potreros',
		pdf_desde: 'desde',
		pdf_efectivos: 'días efectivos de rebrote',
		pdf_faltan: (d) => 'faltan ~' + d + ' días',
		pdf_forraje: 'forraje estimado',
		pdf_total: (v) => 'Forraje total estimado del predio: ~' + v + ' kg MS',
		tipo_pastoreo: 'pastoreo', tipo_corte: 'corte', tipo_ensilaje: 'ensilaje', tipo_desbroce: 'desbroce'
	},
	en: {
		sin_especie: 'No forage species recorded: note what grass is there to estimate the cutting point.',
		sin_dato: 'No start date: note the last grazing or the planting date to start the clock.',
		sin_clima: 'No weather data to estimate regrowth.',
		rebrote: (d) => 'Still regrowing: about ' + d + ' days left before grazing.',
		punto_optimo: 'At its best point: good time to move the herd in or cut.',
		punto_tardio: 'Still good but at the edge: graze soon, quality is starting to drop.',
		pasado: 'Past its best: fiber is winning; if left standing, better cut it for reserve.',
		desacuerdo: 'The clock says ready but the canopy did not take off: check the paddock (stress or a wrong date).',
		creciendo: (d) => 'Growing for silage: about ' + d + ' days to soft-dough stage.',
		punto_ensilaje: 'Silage point: soft-dough grain, cut for silo now.',
		pasado_ensilaje: 'Past silage point: the grain has hardened.',
		fuente_ndvi: 'start estimated from satellite, no logged record',
		kgms: (v, ha) => 'Estimated forage: ~' + v + ' kg DM/ha' + (ha ? ' (~' + Math.round(v * ha) + ' kg DM in the paddock)' : ''),
		estados: { sin_especie: 'no species', sin_dato: 'no data', rebrote: 'regrowing', punto_optimo: 'best point', pasado: 'overmature', creciendo: 'growing', punto_ensilaje: 'silage point', pasado_ensilaje: 'past silage point' },
		aviso_tg: (p, predio, esp) => 'The paddock "' + p + '" at ' + predio + ' reached its best point for ' + (esp || 'forage') + ': good time to move the herd in or cut.',
		pdf_h: 'Paddock status',
		pdf_desde: 'since',
		pdf_efectivos: 'effective regrowth days',
		pdf_faltan: (d) => '~' + d + ' days left',
		pdf_forraje: 'estimated forage',
		pdf_total: (v) => 'Estimated total forage on the farm: ~' + v + ' kg DM',
		tipo_pastoreo: 'grazing', tipo_corte: 'cut', tipo_ensilaje: 'silage', tipo_desbroce: 'bush-hogging'
	}
};

module.exports = { langOk, MESES, GRUPO, TIPO, grupoDe, tipoDe, RAZONES, VENTANA, INFORME, MAIL, TG, FORRAJE };
