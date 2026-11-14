// servicios/fieldShift/services/catalogo.js — catálogo agronómico.
//
// Fallback embebido con las polifíticas y cultivos de servicio validados
// por la Hacienda Patiño (informes 2023–2025) más granos de referencia.
// Si la colección `cultivos` de la BD tiene docs, el recomendador la usa;
// este arreglo es la semilla inicial y el respaldo offline.

const CATALGO_EMBEBIDO = [
	{ especie: 'Brachiaria brizantha cv. Marandú', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], extraccion: { n: 180, p: 25, k: 220 }, notas: 'Base ganadera; responde bien a pastoreo racional.' },
	{ especie: 'Brachiaria brizantha cv. Mombaza', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Polifítica Hacienda Patiño.' },
	{ especie: 'Brachiaria brizantha cv. Tanzania', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.5, phMax: 7.5, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Polifítica Hacienda Patiño.' },
	{ especie: 'Brachiaria decumbens', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.0, phMax: 7.0, lluviaMin: 800, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Muy rústica en suelos pobres; polifítica Patiño.' },
	{ especie: 'Brachiaria humidicola', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 4.0, phMax: 7.0, lluviaMin: 1000, cicloDias: 90, toleraArenosos: true, zonas: ['llanos'], notas: 'Tolera anegamiento; polifítica Patiño.' },
	{ especie: 'Gatton Panic (Megathyrsus maximus)', grupo: 'pastura', familia: 'Poaceae', fijaN: false, phMin: 5.0, phMax: 7.5, lluviaMin: 900, cicloDias: 75, toleraArenosos: false, zonas: ['llanos'], notas: 'Alta producción; consociada con Glycine en Patiño.' },
	{ especie: 'Stylosanthes spp.', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.0, phMax: 7.0, lluviaMin: 700, cicloDias: 120, toleraArenosos: true, zonas: ['llanos'], notas: 'Leguminosa forrajera de suelos ácidos pobres.' },
	{ especie: 'Calopogonium mucunoides', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.0, lluviaMin: 1200, cicloDias: 90, toleraArenosos: false, zonas: ['llanos'], notas: 'Cobertura y mezcla forrajera; polifítica Patiño.' },
	{ especie: 'Desmodium spp.', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 900, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Leguminosa rastrera de consociación.' },
	{ especie: 'Glycine wightii', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.0, lluviaMin: 900, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Consociada con Gatton Panic en Patiño.' },
	{ especie: 'Arachis pintoi (Archer/mani forrajero)', grupo: 'leguminosa', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.0, lluviaMin: 1000, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Cobertura viva; polifítica Patiño.' },
	{ especie: 'Mucuna pruriens', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 1000, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], extraccion: { n: -120, p: 10, k: 60 }, notas: 'Abono verde de alta biomasa; restaura suelos.' },
	{ especie: 'Crotalaria juncea', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.0, phMax: 7.5, lluviaMin: 600, cicloDias: 90, toleraArenosos: true, zonas: ['llanos', 'valle'], notas: 'Abono verde rápido, controla nematodos.' },
	{ especie: 'Canavalia ensiformis', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 4.5, phMax: 7.5, lluviaMin: 700, cicloDias: 120, toleraArenosos: true, zonas: ['llanos'], notas: 'Muy rústica; cobertura en suelos degradados.' },
	{ especie: 'Sorgo forrajero', grupo: 'ensilaje', familia: 'Poaceae', fijaN: false, phMin: 5.5, phMax: 8.0, lluviaMin: 500, cicloDias: 90, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Forraje verde hidropónico probado en Patiño.' },
	{ especie: 'Maíz', grupo: 'grano', familia: 'Poaceae', fijaN: false, phMin: 5.5, phMax: 7.5, lluviaMin: 600, cicloDias: 120, toleraArenosos: false, zonas: ['llanos', 'valle'], extraccion: { n: 220, p: 40, k: 180 }, notas: 'Alta extracción; rotar tras leguminosa.' },
	{ especie: 'Soya', grupo: 'grano', familia: 'Fabaceae', fijaN: true, phMin: 5.5, phMax: 7.0, lluviaMin: 700, cicloDias: 120, toleraArenosos: false, zonas: ['llanos'], notas: 'Cultivo dominante de la zona; agota estructura.' },
	{ especie: 'Girasol', grupo: 'grano', familia: 'Asteraceae', fijaN: false, phMin: 6.0, phMax: 8.0, lluviaMin: 500, cicloDias: 110, toleraArenosos: false, zonas: ['llanos', 'valle'], notas: 'Opción de corta estación seca.' },
	{ especie: 'Veza (Vicia sativa)', grupo: 'cultivo-servicio', familia: 'Fabaceae', fijaN: true, phMin: 5.5, phMax: 8.0, lluviaMin: 450, cicloDias: 90, toleraArenosos: false, zonas: ['valle', 'altiplano'], notas: 'Abono verde de clima fresco (Pairumani).' }
];

module.exports = { CATALGO_EMBEBIDO };
