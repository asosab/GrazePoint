// servicios/fieldShift/db.js — conexión propia del proyecto a MongoDB.
//
// Field Shift NO usa la conexión por defecto de nodeLab (BD `test` de
// Contabo): tiene su propia base `fieldShift`, local en desarrollo y en
// el mismo servidor Contabo en producción. Se conecta con
// mongoose.createConnection y reintenta con backoff, mismo espíritu que
// config/mongo.js pero aislado: si la BD principal se cae, el servicio
// sigue sirviendo (los usuarios viven en fsUser, dentro de esa BD).

const mongoose = require('mongoose');
const cnf = require('./config');

const conn = mongoose.createConnection();
let retryMs = 1000;
let intentos = 0;

function programarReintento() {
	if (conn.readyState === 1 || conn.readyState === 2) return;
	intentos++;
	setTimeout(async () => {
		try {
			await conn.openUri(cnf.mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 5000, family: 4 });
		} catch (err) {
			console.log(cnf.tag + ' [warn] db.connect: reintento #' + intentos + ' falló: ' + err.message);
			retryMs = Math.min(retryMs * 1.5, 120000);
			programarReintento();
		}
	}, retryMs);
}

conn.on('connected', () => {
	console.log(cnf.tag + ' [info] db: conectado a ' + cnf.dbName + (intentos ? ' tras ' + intentos + ' intento(s)' : ''));
	retryMs = 1000;
	intentos = 0;
});

conn.on('disconnected', () => {
	console.log(cnf.tag + ' [warn] db: conexión perdida, reintentando…');
	programarReintento();
});

conn.on('error', (err) => {
	console.log(cnf.tag + ' [error] db: ' + err.message);
	if (conn.readyState !== 1) programarReintento();
});

async function init() {
	try {
		await conn.openUri(cnf.mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 5000, family: 4 });
		return true;
	} catch (err) {
		console.log(cnf.tag + ' [warn] db.init: conexión inicial fallida: ' + err.message + ' — se reintentará');
		programarReintento();
		return false;
	}
}

const lista = () => conn.readyState === 1;

module.exports = { conn, init, lista };
