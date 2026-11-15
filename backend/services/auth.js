// servicios/grazepoint/services/auth.js — flujo de registro y sesión.
//
// Registro con email + clave → código de 6 dígitos por correo (Gmail SMTP
// con clave de aplicación). Login con clave. Recuperación por código.
// Códigos: 30 min de vida, 5 intentos, cooldown de reenvío 60 s, bloqueo
// 15 min si se abusa. Flujo self-contained, sin dependencias externas de auth.

const cnf = require('../config');
const GpUser = require('../models/gpUserModel');
const { hashClave, verificarClave, nuevoCodigo, hashCodigo, rolParaEmail } = require('../models/gpUserModel');
const mail = require('./mail');
const { firmarToken } = require('../middleware/auth');

const CODIGO_TTL_MS = 30 * 60 * 1000;
const MAX_INTENTOS = 5;
const COOLDOWN_MS = 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;

function normalizarEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function emailValido(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function usuarioPublico(u) {
	return {
		id: String(u._id),
		email: u.email,
		nombre: u.nombre || null,
		rol: u.rol,
		verificado: !!u.verificado,
		demo: !!u.demo,
		creadoEn: u.createdAt || null,
		telegram: u.telegramChatId
			? { vinculado: true, username: u.telegramUsername || null, desde: u.telegramVinculadoEn || null }
			: { vinculado: false }
	};
}

async function _emitirCodigo(user, tipo, lang) {
	const ahora = Date.now();
	if (user.codigoEnviadoEn && ahora - user.codigoEnviadoEn.getTime() < COOLDOWN_MS) {
		return { ok: false, error: 'espera_unos_segundos', cooldown: true };
	}
	const codigo = nuevoCodigo();
	user.codigoHash = hashCodigo(codigo);
	user.codigoExpira = new Date(ahora + CODIGO_TTL_MS);
	user.codigoIntentos = 0;
	user.codigoTipo = tipo;
	user.codigoEnviadoEn = new Date(ahora);
	await user.save();
	if (tipo === 'verificacion') await mail.enviarVerificacion(user.email, codigo, user.nombre, lang);
	else await mail.enviarReset(user.email, codigo, user.nombre, lang);
	return { ok: true };
}

// POST /auth/registro {email, clave, nombre, lang, legal}
// legal:true es la aceptación de términos y privacidad (checkbox en la app);
// queda fecha + versión como prueba de consentimiento.
async function registro({ email, clave, nombre, lang, legal }) {
	const e = normalizarEmail(email);
	if (!emailValido(e)) return { ok: false, status: 400, error: 'email_invalido' };
	if (!clave || String(clave).length < 8) return { ok: false, status: 400, error: 'clave_minima_8' };
	if (legal !== true) return { ok: false, status: 400, error: 'legal_requerido' };

	let user = await GpUser.findOne({ email: e });
	if (user && user.verificado) return { ok: false, status: 409, error: 'email_ya_registrado' };
	if (!user) {
		user = new GpUser({ email: e });
	}
	user.nombre = nombre ? String(nombre).trim().slice(0, 120) : user.nombre;
	user.claveHash = hashClave(clave);
	user.legalAceptadoEn = new Date();
	user.legalVersion = cnf.legalVersion;
	user.rol = rolParaEmail(e);
	user.verificado = false;
	await user.save();
	const envio = await _emitirCodigo(user, 'verificacion', lang);
	if (!envio.ok) return { ok: false, status: 429, error: envio.error };
	return { ok: true, status: 202, requiereVerificacion: true };
}

// POST /auth/verificar {email, codigo} → token
async function verificar({ email, codigo }) {
	const e = normalizarEmail(email);
	const user = await GpUser.findOne({ email: e });
	if (!user) return { ok: false, status: 404, error: 'usuario_inexistente' };
	if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) return { ok: false, status: 429, error: 'bloqueado_temporal' };
	if (!user.codigoHash || user.codigoTipo !== 'verificacion' || !user.codigoExpira || user.codigoExpira < new Date()) {
		return { ok: false, status: 400, error: 'codigo_vencido' };
	}
	if (hashCodigo(codigo) !== user.codigoHash) {
		user.codigoIntentos = (user.codigoIntentos || 0) + 1;
		if (user.codigoIntentos >= MAX_INTENTOS) user.bloqueadoHasta = new Date(Date.now() + BLOQUEO_MS);
		await user.save();
		return { ok: false, status: 400, error: 'codigo_incorrecto' };
	}
	user.verificado = true;
	user.codigoHash = null; user.codigoExpira = null; user.codigoIntentos = 0; user.codigoTipo = null;
	user.ultimoLogin = new Date();
	await user.save();
	return { ok: true, token: firmarToken(user._id), usuario: usuarioPublico(user) };
}

// POST /auth/login {email, clave, lang} → token
async function login({ email, clave, lang }) {
	const e = normalizarEmail(email);
	const user = await GpUser.findOne({ email: e, activo: true });
	if (!user || !verificarClave(clave, user.claveHash)) {
		return { ok: false, status: 401, error: 'credenciales_invalidas' };
	}
	if (!user.verificado) {
		await _emitirCodigo(user, 'verificacion', lang).catch(() => {});
		return { ok: false, status: 403, error: 'email_sin_verificar', requiereVerificacion: true };
	}
	user.rol = rolParaEmail(user.email);
	user.ultimoLogin = new Date();
	await user.save();
	return { ok: true, token: firmarToken(user._id), usuario: usuarioPublico(user) };
}

// POST /auth/recuperar {email, lang} → siempre 202 (no revelar si existe)
async function recuperar({ email, lang }) {
	const e = normalizarEmail(email);
	const user = await GpUser.findOne({ email: e, activo: true });
	if (user) await _emitirCodigo(user, 'reset', lang).catch(() => {});
	return { ok: true, status: 202 };
}

// POST /auth/restablecer {email, codigo, clave} → token
async function restablecer({ email, codigo, clave }) {
	const e = normalizarEmail(email);
	if (!clave || String(clave).length < 8) return { ok: false, status: 400, error: 'clave_minima_8' };
	const user = await GpUser.findOne({ email: e, activo: true });
	if (!user) return { ok: false, status: 404, error: 'usuario_inexistente' };
	if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) return { ok: false, status: 429, error: 'bloqueado_temporal' };
	if (!user.codigoHash || user.codigoTipo !== 'reset' || !user.codigoExpira || user.codigoExpira < new Date()) {
		return { ok: false, status: 400, error: 'codigo_vencido' };
	}
	if (hashCodigo(codigo) !== user.codigoHash) {
		user.codigoIntentos = (user.codigoIntentos || 0) + 1;
		if (user.codigoIntentos >= MAX_INTENTOS) user.bloqueadoHasta = new Date(Date.now() + BLOQUEO_MS);
		await user.save();
		return { ok: false, status: 400, error: 'codigo_incorrecto' };
	}
	user.claveHash = hashClave(clave);
	user.verificado = true;
	user.codigoHash = null; user.codigoExpira = null; user.codigoIntentos = 0; user.codigoTipo = null;
	user.ultimoLogin = new Date();
	await user.save();
	return { ok: true, token: firmarToken(user._id), usuario: usuarioPublico(user) };
}

// POST /auth/reenviar {email, lang} — reenvío de código de verificación
async function reenviar({ email, lang }) {
	const e = normalizarEmail(email);
	const user = await GpUser.findOne({ email: e, activo: true });
	if (!user || user.verificado) return { ok: true, status: 202 };
	const envio = await _emitirCodigo(user, 'verificacion', lang);
	if (!envio.ok) return { ok: false, status: 429, error: envio.error };
	return { ok: true, status: 202 };
}

module.exports = { registro, verificar, login, recuperar, restablecer, reenviar, usuarioPublico };
