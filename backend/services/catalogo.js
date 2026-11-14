// servicios/fieldShift/services/catalogo.js — catálogo agronómico.
//
// Fallback embebido con las polifíticas y cultivos de servicio validados
// por la Hacienda Patiño (informes 2023–2025) más granos de referencia.
// Si la colección `cultivos` de la BD tiene docs, el recomendador la usa;
// este arreglo es la semilla inicial y el respaldo offline.
// `notas` en castellano, `notas_en` en inglés: el recomendador elige
// según el `lang` de la petición.

const CATALGO_EMBEBIDO = [
	{ especie: 'Brachiaria brizantha cv. Marandú', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], extraccion: { n: 180, p: 25, k: 220 }, notas: 'Base ganadera; responde bien a pastoreo racional.', notas_en: 'Cattle base; responds well to rotational grazing.' },
	{ especie: 'Brachiaria brizantha cv. Mombaza', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Polifítica Hacienda Patiño.', notas_en: 'Hacienda Patiño multi-species pasture.' },
	{ especie: 'Brachiaria brizantha cv. Tanzania', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Polifítica Hacienda Patiño.', notas_en: 'Hacienda Patiño multi-species pasture.' },
	{ especie: 'Brachiaria decumbens', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.0, phMax: 7.0, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Muy rústica en suelos pobres; polifítica Patiño.', notas_en: 'Very hardy on poor soils; Patiño mix.' },
	{ especie: 'Brachiaria humidicola', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.0, phMax: 7.0, lluviaMin: 1000, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Tolera anegamiento; polifítica Patiño.', notas_en: 'Tolerates waterlogging; Patiño mix.' },
	{ especie: 'Gatton Panic (Megathyrsus maximus)', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 5.0, phMax: 7.5, lluviaMin: 900, cicloDias: 75, toleraArenosos: false, zonas: ['llanos'], notas: 'Alta producción; consociada con Glycine en Patiño.', notas_en: 'High yield; intercropped with Glycine at Patiño.' },
	{ especie: 'Stylosanthes spp.', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.0, phMax: 7.0, lluviaMin: 700, cicloDias: 120, toleraArenosos: true, zonas: ['llanos'], notas: 'Leguminosa forrajera de suelos ácidos pobres.', notas_en: 'Forage legume for poor acid soils.' },
	{ especie: 'Calopogonium mucunoides', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.0, lluviaMin: 1200, cicloDias: 90, toleraArenosos: false, zonas: ['llanos'], notas: 'Cobertura y mezcla forrajera; polifítica Patiño.', notas_en: 'Cover and forage mix; Patiño blend.' },
	{ especie: 'Desmodium spp.', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 900, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Leguminosa rastrera de consociación.', notas_en: 'Creeping legume for intercropping.' },
	{ especie: 'Glycine wightii', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.0, lluviaMin: 900, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Consociada con Gatton Panic en Patiño.', notas_en: 'Intercropped with Gatton Panic at Patiño.' },
	{ especie: 'Arachis pintoi (Archer/mani forrajero)', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.0, lluviaMin: 1000, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Cobertura viva; polifítica Patiño.', notas_en: 'Living ground cover; Patiño mix.' },
	{ especie: 'Mucuna pruriens', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 1000, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], extraccion: { n: -120, p: 10, k: 60 }, notas: 'Abono verde de alta biomasa; restaura suelos.', notas_en: 'High-biomass green manure; restores soils.' },
	{ especie: 'Crotalaria juncea', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 600, cicloDias: 90, toleraArenosos: true, zonas: ['llanos', 'valle'], notas: 'Abono verde rápido, controla nematodos.', notas_en: 'Fast green manure; keeps nematodes down.' },
	{ especie: 'Canavalia ensiformis', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.5, lluviaMin: 700, cicloDias: 120, toleraArenosos: true, zonas: ['llanos'], notas: 'Muy rústica; cobertura en suelos degradados.', notas_en: 'Very hardy; cover for degraded soils.' },
	{ especie: 'Sorgo forrajero', grupo: 'ensilaje', familia: 'Poaceae', fijaN: false, phMin: 5.5, phMax: 8.0, lluviaMin: 500, cicloDias: 90, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Forraje verde hidropónico probado en Patiño.', notas_en: 'Hydroponic green forage, proven at Patiño.' },
	{ especie: 'Maíz', grupo: 'grano', familia: 'Poaceae', fijaN: false, phMin: 5.5, phMax: 7.5, lluviaMin: 600, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], extraccion: { n: 220, p: 40, k: 180 }, notas: 'Alta extracción; rotar tras leguminosa.', notas_en: 'Heavy feeder; rotate after a legume.' },
	{ especie: 'Soya', grupo: 'grano', familia: 'Fabaceae', fijaN: true, phMin: 5.5, phMax: 7.0, lluviaMin: 700, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Cultivo dominante de la zona; agota estructura.', notas_en: 'The dominant crop in the area; wears soil structure down.' },
	{ especie: 'Girasol', grupo: 'grano', familia: 'Asteraceae', fijaN: false, phMin: 6.0, phMax: 8.0, lluviaMin: 500, cicloDias: 110, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Opción de corta estación seca.', notas_en: 'Short-season option for the dry months.' },
	{ especie: 'Veza (Vicia sativa)', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.5, phMax: 8.0, lluviaMin: 450, cicloDias: 90, toleraArenosos: false, zonas: ['valle', 'altiplano'], notas: 'Abono verde de clima fresco (Pairumani).', notas_en: 'Cool-climate green manure (Pairumani).' }
];

module.exports = { CATALGO_EMBEBIDO };
