// servicios/fieldShift/models/predioModel.js — predios del usuario.
//
// Un predio (la propiedad/terreno) agrupa parcelas/potreros con su
// polígono GeoJSON, la siembra actual, el histórico de siembras, las
// mediciones de suelo (PRIAS: pH, MO, N, textura) y los aforos
// forrajeros. Todo embebido: el documento es la ficha completa que ve el
// técnico en campo y la que alimenta el informe PDF.

const mongoose = require('mongoose');
const { conn } = require('../db');

const puntoSchema = new mongoose.Schema(
	{ type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: undefined } },
	{ _id: false }
);

const poligonoSchema = new mongoose.Schema(
	{
		type: { type: String, enum: ['Polygon'], default: 'Polygon' },
		coordinates: { type: [[[Number]]], required: true }
	},
	{ _id: false }
);

const siembraSchema = new mongoose.Schema(
	{
		especie: { type: String, required: true, trim: true },
		variedad: { type: String, default: null, trim: true }, // variedad o híbrido
		campania: { type: String, default: null, trim: true },  // «verano 2024/25», libre
		superficieHa: { type: Number, default: null },          // ha sembradas si difieren de la parcela
		inicio: { type: Date, default: null },
		fin: { type: Date, default: null },          // null = siembra vigente
		preparacion: { type: String, default: null, trim: true }, // siembra-directa | labranza-convencional | labranza-minima | otra | no-sabe
		fertilizantes: { type: String, default: null, trim: true },
		aplicaciones: { type: String, default: null, trim: true }, // si | no | no-recuerda
		problemas: { type: [String], default: [] },  // sequia | exceso-lluvia | malezas | plagas | enfermedades | deficiencias | otro | ninguno
		rendimiento: { type: Number, default: null },
		rendimientoUnidad: { type: String, default: null, trim: true }, // kg/ha | qq/ha | t/ha | kg MS/ha
		notas: { type: String, default: null, maxlength: 500 }
	},
	{ _id: true }
);

const medicionSueloSchema = new mongoose.Schema(
	{
		fecha: { type: Date, required: true },
		ph: { type: Number, default: null },
		materiaOrganica: { type: Number, default: null }, // %
		nitrogeno: { type: Number, default: null },       // %
		textura: { type: String, default: null, trim: true },
		fuente: { type: String, default: 'laboratorio', trim: true }, // laboratorio | campo | estimado
		notas: { type: String, default: null, maxlength: 500 }
	},
	{ _id: true }
);

const aforoSchema = new mongoose.Schema(
	{
		fecha: { type: Date, required: true },
		kgMSHa: { type: Number, default: null }, // forraje disponible estimado
		metodo: { type: String, default: null, trim: true },
		notas: { type: String, default: null, maxlength: 500 }
	},
	{ _id: true }
);

const corteSchema = new mongoose.Schema(
	{
		fecha: { type: Date, required: true },
		tipo: { type: String, default: 'pastoreo', trim: true }, // pastoreo | corte | ensilaje | desbroce
		notas: { type: String, default: null, maxlength: 500 }
	},
	{ _id: true }
);

const parcelaSchema = new mongoose.Schema(
	{
		nombre: { type: String, required: true, trim: true, maxlength: 120 },
		tipo: { type: String, default: 'potrero', trim: true }, // potrero | parcela | otro
		geometry: { type: poligonoSchema, required: true },
		especieActual: { type: String, default: null, trim: true },
		fechaSiembraActual: { type: Date, default: null },
		// Datos del terreno que el dueño conoce de memoria; todo opcional.
		riego: { type: String, default: null, trim: true },      // no | gravedad | aspersion | goteo | otro
		fuenteAgua: { type: String, default: null, trim: true }, // pozo | rio | represa | red | otra
		pendiente: { type: String, default: null, trim: true },  // plano | ondulado | quebrado
		drenaje: { type: String, default: null, trim: true },    // bueno | regular | encharca
		aniosUso: { type: Number, default: null },               // años trabajando el lote
		problemasLote: { type: [String], default: [] },          // compactacion | salinidad | pedregoso | erosion | malezas | otro
		notas: { type: String, default: null, maxlength: 500 },
		historial: { type: [siembraSchema], default: [] },
		suelos: { type: [medicionSueloSchema], default: [] },
		aforos: { type: [aforoSchema], default: [] },
		cortes: { type: [corteSchema], default: [] },
		// Dedo de la alerta de Telegram: último estado avisado para no
		// reenviar el mismo «punto óptimo» en cada barrido diario.
		avisoForraje: {
			estado: { type: String, default: null },
			en: { type: Date, default: null }
		}
	},
	{ _id: true }
);

const predioSchema = new mongoose.Schema(
	{
		owner: { type: String, required: true, index: true }, // id fsUser (JWT sub)
		nombre: { type: String, required: true, trim: true, maxlength: 160 },
		descripcion: { type: String, default: null, maxlength: 1000 },
		centro: { type: puntoSchema, default: undefined },
		parcelas: { type: [parcelaSchema], default: [] },
		activo: { type: Boolean, default: true }
	},
	{ timestamps: true, versionKey: false }
);

predioSchema.index({ 'parcelas.geometry': '2dsphere' });
predioSchema.index({ centro: '2dsphere' });

module.exports = conn.model('Predio', predioSchema);
