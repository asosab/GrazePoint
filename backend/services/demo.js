// servicios/grazepoint/services/demo.js — acceso de un clic para jueces y
// visitantes: la entrega de Space Apps exige probar la app sin crear
// cuenta ni manejar llaves.
//
// POST /auth/demo devuelve un JWT de la cuenta de prueba compartida
// (demo@grazepoint.run). El usuario queda con verificado=true, sin clave
// (nadie entra por contraseña) y rol 'registrado'. Si no tiene ningún
// predio activo se siembra uno de muestra — potreros cerca de Lomas de
// Arena con especies estilo Hacienda Patiño, historial de pastoreo,
// aforos y una medición PRIAS — para que la demo arranque con datos.
// Borrar la cuenta o el predio se autocura: el próximo /auth/demo lo
// vuelve a crear.

const GpUser = require('../models/gpUserModel');
const Predio = require('../models/predioModel');
const cnf = require('../config');
const { firmarToken } = require('../middleware/auth');
const { usuarioPublico } = require('./auth');

const DEMO_EMAIL = 'demo@grazepoint.run';
const DEMO_NOMBRE = 'GrazePoint Demo';

const DIA_MS = 24 * 60 * 60 * 1000;

// Anillo cuadrado cerrado (antihorario) alrededor de (lon, lat).
function anillo(cx, cy, dx, dy) {
	return [[
		[cx - dx, cy - dy],
		[cx + dx, cy - dy],
		[cx + dx, cy + dy],
		[cx - dx, cy + dy],
		[cx - dx, cy - dy]
	]];
}

function sembrarPredio(ownerId) {
	const hoy = Date.now();
	return Predio.create({
		owner: String(ownerId),
		nombre: 'Predio demo (Lomas de Arena)',
		descripcion: 'Lote de muestra con potreros polifíticos estilo Hacienda Patiño.',
		centro: { type: 'Point', coordinates: [-63.3700, -17.9501] },
		hato: { cabezas: 38, pesoKg: 420 },
		parcelas: [
			{
				nombre: 'Potrero Norte',
				tipo: 'potrero',
				geometry: { type: 'Polygon', coordinates: anillo(-63.3700, -17.9492, 0.0006, 0.00055) },
				especieActual: 'Brachiaria brizantha cv. Marandú',
				fechaSiembraActual: new Date(hoy - 380 * DIA_MS),
				cortes: [{ fecha: new Date(hoy - 21 * DIA_MS), tipo: 'pastoreo' }],
				aforos: [{ fecha: new Date(hoy - 21 * DIA_MS), kgMSHa: 1900, metodo: 'cuadrante' }],
				suelos: [{
					fecha: new Date(hoy - 60 * DIA_MS), ph: 5.6, materiaOrganica: 2.8,
					nitrogeno: 0.14, textura: 'franco arenoso', fuente: 'laboratorio'
				}]
			},
			{
				nombre: 'Potrero Sur',
				tipo: 'potrero',
				geometry: { type: 'Polygon', coordinates: anillo(-63.3700, -17.9512, 0.0006, 0.00055) },
				especieActual: 'Gatton Panic (Megathyrsus maximus)',
				fechaSiembraActual: new Date(hoy - 340 * DIA_MS),
				cortes: [{ fecha: new Date(hoy - 41 * DIA_MS), tipo: 'pastoreo' }],
				aforos: [{ fecha: new Date(hoy - 41 * DIA_MS), kgMSHa: 2500, metodo: 'cuadrante' }]
			},
			{
				nombre: 'Potrero Quebrada',
				tipo: 'potrero',
				geometry: { type: 'Polygon', coordinates: anillo(-63.3718, -17.9501, 0.0006, 0.00055) },
				especieActual: 'Sorgo forrajero',
				fechaSiembraActual: new Date(hoy - 56 * DIA_MS),
				aforos: [{ fecha: new Date(hoy - 5 * DIA_MS), kgMSHa: 5200, metodo: 'estimado' }]
			}
		]
	});
}

// POST /auth/demo → { ok, token, usuario }
async function entrar() {
	let user = await GpUser.findOne({ email: DEMO_EMAIL });
	if (!user) {
		user = await GpUser.create({
			email: DEMO_EMAIL,
			nombre: DEMO_NOMBRE,
			verificado: true,
			demo: true,
			rol: 'registrado',
			activo: true,
			legalAceptadoEn: new Date(),
			legalVersion: cnf.legalVersion
		});
	} else if (!user.activo) {
		user.activo = true;
	}
	user.ultimoLogin = new Date();
	await user.save();

	const tienePredio = await Predio.exists({ owner: String(user._id), activo: true });
	if (!tienePredio) await sembrarPredio(user._id).catch(() => {});

	return { ok: true, token: firmarToken(user._id), usuario: usuarioPublico(user) };
}

module.exports = { entrar };
