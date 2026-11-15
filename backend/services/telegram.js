// servicios/fieldShift/services/telegram.js — bot propio
// (@fieldshift_bot) y vínculo de cuenta web ↔ chat.
//
// Flujo de vinculación (prueba de que el usuario web es el mismo que
// está del otro lado del chat):
//   1. Web autenticada pide POST /me/telegram/codigo → se emite un
//      código FS-XXXXXX (solo se guarda el sha-256, 10 min de vida) y
//      un deep-link t.me/<bot>?start=FS-XXXXXX.
//   2. El usuario abre el link: Telegram entrega /start FS-XXXXXX al
//      bot (o el usuario escribe /vincular FS-XXXXXX a mano).
//   3. El poller recibe el update, busca al dueño del código, guarda
//      chatId + username y confirma. El código es de un solo uso.
//
// El poller usa getUpdates con long-polling (30 s): no hace falta
// webhook ni certificado, y corre igual en standalone y en nodeLab.
// Si el chat ya estaba vinculado a otra cuenta, se reasigna: quien
// generó el código tiene la sesión web, así que la verdad más nueva
// gana — y el chat queda avisado.
//
// `adminId` (env) es el código de control: solo ese chat recibe el
// comando /estado con estadísticas y, más adelante, los avisos de
// administración.

const cnf = require('../config');
const FsUser = require('../models/fsUserModel');
const { nuevoCodigoTelegram, hashCodigo } = require('../models/fsUserModel');
const { TG } = require('./i18n');

const TTL_MS = 10 * 60 * 1000;      // el código de vínculo dura 10 min
const COOLDOWN_MS = 60 * 1000;
const POLL_S = 30;
const ESPERA_ERROR_MS = 5000;

let _offset = 0;
let _corriendo = false;

const _api = (m) => 'https://api.telegram.org/bot' + cnf.telegram.token + '/' + m;
const _langDe = (msg) => (String(msg && msg.from && msg.from.language_code || '').toLowerCase().startsWith('es') ? 'es' : 'en');
const _normCodigo = (c) => String(c || '').trim().toUpperCase().replace(/^FS-?/, 'FS-');

async function _call(metodo, body) {
	try {
		const res = await fetch(_api(metodo), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body || {})
		});
		return await res.json();
	} catch (e) {
		console.log(cnf.tag + ' [error] telegram._call ' + metodo + ': ' + e.message);
		return null;
	}
}

async function enviar(chatId, texto) {
	return _call('sendMessage', { chat_id: chatId, text: texto });
}

// POST /me/telegram/codigo — emite código + deep-link para el usuario
// web autenticado. Devuelve {codigo, url} o {error}.
async function crearCodigo(user) {
	const ahora = Date.now();
	if (user.telegramCodigoEnviadoEn && ahora - user.telegramCodigoEnviadoEn.getTime() < COOLDOWN_MS) {
		return { ok: false, error: 'espera_unos_segundos', cooldown: true };
	}
	const codigo = nuevoCodigoTelegram();
	user.telegramCodigoHash = hashCodigo(codigo);
	user.telegramCodigoExpira = new Date(ahora + TTL_MS);
	user.telegramCodigoEnviadoEn = new Date(ahora);
	await user.save();
	return { ok: true, codigo, url: 'https://t.me/' + cnf.telegram.botUser + '?start=' + codigo };
}

// El chat pide vincular con un código: busca al dueño, enlaza y
// devuelve el texto de respuesta para el bot.
async function vincular(codigo, msg, T) {
	const hash = hashCodigo(_normCodigo(codigo));
	const user = await FsUser.findOne({
		telegramCodigoHash: hash,
		telegramCodigoExpira: { $gt: new Date() }
	});
	if (!user) return T.codigo_malo;

	// Si este chat ya estaba en otra cuenta, se reasigna (quien generó
	// el código tiene la sesión web viva).
	const otro = await FsUser.findOne({ telegramChatId: msg.chat.id, _id: { $ne: user._id } });
	const reasignado = !!otro;
	if (otro) {
		otro.telegramChatId = null; otro.telegramUsername = null; otro.telegramVinculadoEn = null;
		await otro.save();
	}

	user.telegramChatId = msg.chat.id;
	user.telegramUsername = (msg.from && msg.from.username) || null;
	user.telegramVinculadoEn = new Date();
	user.telegramCodigoHash = null;
	user.telegramCodigoExpira = null;
	user.telegramCodigoEnviadoEn = null;
	await user.save();

	const conf = T.vinculado_ok(user.nombre, user.email);
	return reasignado ? conf + ' ' + T.vinculado_re(user.email) : conf;
}

// /resumen — estado forrajero de los potreros del usuario vinculado,
// como texto plano. Requires perezosos: el poller arranca antes de
// que mongo esté lista y estos modelos esperan la conexión.
async function _resumen(msg, T, lang) {
	const yo = await FsUser.findOne({ telegramChatId: msg.chat.id });
	if (!yo) return T.estado_no;
	const Predio = require('../models/predioModel');
	const forraje = require('./forraje');
	const rotacion = require('./rotacion');
	const predios = await Predio.find({ owner: String(yo._id), activo: true }).select('nombre hato parcelas.nombre parcelas.tipo parcelas.geometry parcelas.especieActual parcelas.fechaSiembraActual parcelas.cortes parcelas.aforos');
	if (!predios.length || !predios.some((p) => p.parcelas.length)) return T.resumen_vacio;
	const catalogo = await rotacion.catalogo();
	const lineas = [T.resumen_h];
	let n = 0;
	for (const predio of predios) {
		if (!predio.parcelas.length) continue;
		lineas.push(predio.nombre + ':');
		let forrajeTotal = 0;
		for (const p of predio.parcelas.slice(0, 15)) {
			const e = await forraje.evaluar(p, { catalogo, lang });
			lineas.push('• ' + p.nombre + ' — ' + e.texto);
			if (e.kgMSHaEst != null && e.areaHa) forrajeTotal += e.kgMSHaEst * e.areaHa;
			n++;
		}
		const bal = forraje.balance(predio, forrajeTotal);
		if (bal) lineas.push(T.resumen_cobertura(bal.diasCobertura, bal.cabezas, bal.fechaDeficit));
	}
	return n ? lineas.join('\n') : T.resumen_vacio;
}

async function _procesar(upd) {
	const msg = upd.message;
	if (!msg || !msg.text) return;
	const lang = _langDe(msg);
	const T = TG[lang];
	const partes = msg.text.trim().split(/\s+/);
	const cmd = partes[0].split('@')[0].toLowerCase();
	const arg = partes.slice(1).join(' ').trim();

	if (cmd === '/start' && arg) return enviar(msg.chat.id, await vincular(arg, msg, T));
	if (cmd === '/vincular' || cmd === '/link') {
		if (!arg) return enviar(msg.chat.id, T.bienvenida);
		return enviar(msg.chat.id, await vincular(arg, msg, T));
	}
	if (cmd === '/start') return enviar(msg.chat.id, T.bienvenida);
	if (cmd === '/resumen' || cmd === '/summary') return enviar(msg.chat.id, await _resumen(msg, T, lang));
	if (cmd === '/estado' || cmd === '/status') {
		if (cnf.telegram.adminId && msg.chat.id === cnf.telegram.adminId) {
			const n = await FsUser.countDocuments({ telegramChatId: { $ne: null } });
			return enviar(msg.chat.id, T.estado_admin(n));
		}
		const yo = await FsUser.findOne({ telegramChatId: msg.chat.id });
		return enviar(msg.chat.id, yo ? T.estado_si(yo.email) : T.estado_no);
	}
	return enviar(msg.chat.id, T.ayuda);
}

// Long-polling: getUpdates con offset persistente en memoria (si el
// proceso reinicia, Telegram re-entrega los updates no confirmados).
async function _ciclo() {
	const r = await _call('getUpdates', { offset: _offset, timeout: POLL_S, allowed_updates: ['message'] });
	if (r && r.ok && Array.isArray(r.result)) {
		for (const upd of r.result) {
			_offset = upd.update_id + 1;
			try { await _procesar(upd); } catch (e) {
				console.log(cnf.tag + ' [error] telegram._procesar: ' + e.message);
			}
		}
		return 0;
	}
	return ESPERA_ERROR_MS;
}

async function iniciar() {
	if (_corriendo) return;
	if (!cnf.telegram.token) {
		console.log(cnf.tag + ' [log] telegram.iniciar: sin FIELDSHIFT_TG_TOKEN, bot apagado');
		return;
	}
	_corriendo = true;
	console.log(cnf.tag + ' [log] telegram.iniciar: poller de @' + cnf.telegram.botUser + ' arrancado');
	// Borra webhook viejo si quedó de otra instalación; luego cicla.
	await _call('deleteWebhook', { drop_pending_updates: false });
	while (_corriendo) {
		const espera = await _ciclo();
		if (espera) await new Promise((r) => setTimeout(r, espera));
	}
}

// Quita el vínculo de un usuario (DELETE /me/telegram).
async function desvincular(user) {
	user.telegramChatId = null;
	user.telegramUsername = null;
	user.telegramVinculadoEn = null;
	await user.save();
	return { ok: true };
}

module.exports = { iniciar, crearCodigo, vincular, desvincular, enviar };
