// servicios/fieldShift/models/cultivoModel.js — catálogo de especies.
//
// Catálogo agronómico usado por el recomendador de rotación y la ventana
// de siembra: requerimientos edafoclimáticos por especie, ciclo, aporte
// al suelo y datos de la Hacienda Patiño (polifíticas validadas por ellos).
// Se siembra en BD con scripts/fieldshift-seed.js; si la colección está
// vacía, el recomendador usa el catálogo embebido de
// services/catalogo.js como fallback.

const mongoose = require('mongoose');
const { conn } = require('../db');

const cultivoSchema = new mongoose.Schema(
	{
		especie: { type: String, required: true, unique: true, trim: true },
		grupo: { type: String, default: null, trim: true }, // pastura | leguminosa | cultivo-servicio | grano | ensilaje
		familia: { type: String, default: null, trim: true },
		fijaN: { type: Boolean, default: false },
		extraccion: {
			n: { type: Number, default: null }, // kg/ha por ciclo, aprox
			p: { type: Number, default: null },
			k: { type: Number, default: null }
		},
		phMin: { type: Number, default: null },
		phMax: { type: Number, default: null },
		lluviaMin: { type: Number, default: null }, // mm/año
		cicloDias: { type: Number, default: null }, // establecimiento o cosecha
		rebrote: {
			min: { type: Number, default: null },    // días efectivos para punto óptimo
			max: { type: Number, default: null },    // fin de la ventana ideal
			pasado: { type: Number, default: null }  // desde acá la calidad ya cayó
		},
		gddEnsilaje: { type: Number, default: null }, // grados-día base 10 al punto de ensilar
		toleraArenosos: { type: Boolean, default: false },
		zonas: { type: [String], default: [] },     // piso ecológico: llanos | valle | altiplano
		notas: { type: String, default: null, maxlength: 500 },
		notas_en: { type: String, default: null, maxlength: 500 }
	},
	{ timestamps: true, versionKey: false }
);

module.exports = conn.model('Cultivo', cultivoSchema);
