// servicios/fieldShift/models/fsUserModel.js — usuarios del proyecto.
//
// Auth propio (sin Buddy): email + clave con hash scrypt, verificación de
// correo por código de 6 dígitos, recuperación de clave por código.
// El rol sale del email contra config.roles:
//   'admin'      → correos prescritos (asosab, lefehur)
//   'especial'   → correos marcados a mano en config o por un admin
//   'registrado' → el resto; hoy ve todas las áreas
// codigo* se reusa para verificación y para reset: el campo codigoTipo
// dice para qué se emitió el último código ('verificacion' | 'reset').

const mongoose = require('mongoose');
const crypto = require('crypto');
const { conn } = require('../db');
const cnf = require('../config');

const fsUserSchema = new mongoose.Schema(
	{
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		nombre: { type: String, default: null, trim: true, maxlength: 120 },
		claveHash: { type: String, default: null },
		rol: { type: String, enum: ['admin', 'especial', 'registrado'], default: 'registrado' },
		verificado: { type: Boolean, default: false },

		codigoHash: { type: String, default: null },
		codigoExpira: { type: Date, default: null },
		codigoIntentos: { type: Number, default: 0 },
		codigoTipo: { type: String, enum: ['verificacion', 'reset', null], default: null },
		codigoEnviadoEn: { type: Date, default: null },
		bloqueadoHasta: { type: Date, default: null },

		ultimoLogin: { type: Date, default: null },
		activo: { type: Boolean, default: true },

		// Vínculo con el bot de Telegram (@fieldshift_bot): la app web
		// emite un código FS-XXXXXX (se guarda hasheado, 10 min de vida)
		// y el usuario lo manda al bot; el bot confirma y queda el
		// chatId para avisos. telegramCodigo* no pisa codigo* porque es
		// para otro propósito (vincular, no auth).
		telegramChatId: { type: Number, default: null },
		telegramUsername: { type: String, default: null, trim: true },
		telegramVinculadoEn: { type: Date, default: null },
		telegramCodigoHash: { type: String, default: null },
		telegramCodigoExpira: { type: Date, default: null },
		telegramCodigoEnviadoEn: { type: Date, default: null }
	},
	{ timestamps: true, versionKey: false }
);

// ── Claves (scrypt, formato "scrypt$salt$hash") ─────────────────────────────

function hashClave(clave) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.scryptSync(String(clave), salt, 64).toString('hex');
	return 'scrypt$' + salt + '$' + hash;
}

function verificarClave(clave, guardado) {
	try {
		const parts = String(guardado || '').split('$');
		if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
		const hash = crypto.scryptSync(String(clave), parts[1], 64);
		const esperado = Buffer.from(parts[2], 'hex');
		return hash.length === esperado.length && crypto.timingSafeEqual(hash, esperado);
	} catch (e) {
		return false;
	}
}

// ── Códigos de 6 dígitos (solo se guarda el sha-256) ────────────────────────

function nuevoCodigo() {
	return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Código de vínculo Telegram: FS- + 6 chars sin ambiguos (nada de
// 0/O/1/I/L). Va en el deep-link t.me/<bot>?start=FS-XXXXXX.
function nuevoCodigoTelegram() {
	const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	let c = 'FS-';
	for (let i = 0; i < 6; i++) c += ABC[crypto.randomInt(0, ABC.length)];
	return c;
}

function hashCodigo(codigo) {
	return crypto.createHash('sha256').update(String(codigo), 'utf8').digest('hex');
}

function rolParaEmail(email) {
	const e = String(email || '').trim().toLowerCase();
	if (!e) return 'registrado';
	if (cnf.roles.admins.map((a) => a.toLowerCase()).includes(e)) return 'admin';
	if (cnf.roles.especiales.map((a) => a.toLowerCase()).includes(e)) return 'especial';
	return 'registrado';
}

module.exports = conn.model('FsUser', fsUserSchema);
module.exports.hashClave = hashClave;
module.exports.verificarClave = verificarClave;
module.exports.nuevoCodigo = nuevoCodigo;
module.exports.nuevoCodigoTelegram = nuevoCodigoTelegram;
module.exports.hashCodigo = hashCodigo;
module.exports.rolParaEmail = rolParaEmail;
