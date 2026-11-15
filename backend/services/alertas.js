// servicios/fieldShift/services/alertas.js — avisos de potreros por
// Telegram.
//
// Una vez al día recorre las parcelas de los usuarios con Telegram
// vinculado, calcula el estado forrajero y escribe cuando un potrero
// ENTRA a punto óptimo o punto de ensilar (solo al entrar: la marca
// `avisoForraje` en la parcela evita repetir el aviso cada día; al
// salir del punto se limpia sola para el próximo ciclo).
//
// Sin token del bot no hace nada. Un fallo en una parcela nunca tira
// el barrido completo.

const db = require('../db');
const cnf = require('../config');
const telegram = require('./telegram');
const forraje = require('./forraje');
const rotacion = require('./rotacion');
const { langOk, FORRAJE } = require('./i18n');

const DIA_MS = 24 * 60 * 60 * 1000;
const AVISABLES = ['punto_optimo', 'punto_ensilaje'];

async function _barrido() {
	const FsUser = require('../models/fsUserModel');
	const Predio = require('../models/predioModel');
	if (!db.lista()) return;
	const usuarios = await FsUser.find({ telegramChatId: { $ne: null } }).select('_id nombre telegramChatId').lean();
	if (!usuarios.length) return;
	const catalogo = await rotacion.catalogo();
	for (const u of usuarios) {
		const predios = await Predio.find({ owner: String(u._id), activo: true });
		for (const predio of predios) {
			let sucio = false;
			for (const p of predio.parcelas) {
				try {
					const e = await forraje.evaluar(p, { catalogo, lang: 'es' });
					const marca = p.avisoForraje || {};
					if (AVISABLES.includes(e.estado) && marca.estado !== e.estado) {
						const T = FORRAJE[langOk('es')];
						const okEnvio = await telegram.enviar(u.telegramChatId, T.aviso_tg(p.nombre, predio.nombre, p.especieActual));
						p.avisoForraje = { estado: e.estado, en: new Date() };
						sucio = true;
						console.log(cnf.tag + ' [info] alertas: aviso ' + e.estado + ' parcela ' + p.nombre + ' → chat ' + u.telegramChatId + (okEnvio ? '' : ' (envío falló)'));
					} else if (!AVISABLES.includes(e.estado) && marca.estado) {
						// Salió del punto: la marca se limpia para avisar en el próximo ciclo.
						p.avisoForraje = { estado: null, en: new Date() };
						sucio = true;
					}
				} catch (err) {
					console.log(cnf.tag + ' [warn] alertas ' + p.nombre + ': ' + err.message);
				}
			}
			if (sucio) await predio.save();
		}
	}
}

function iniciar() {
	if (!cnf.telegram || !cnf.telegram.token) return;
	// Espera a que mongo y el poller del bot asienten antes del primer barrido.
	setTimeout(() => _barrido().catch((e) => console.log(cnf.tag + ' [warn] alertas: ' + e.message)), 120 * 1000);
	setInterval(() => _barrido().catch((e) => console.log(cnf.tag + ' [warn] alertas: ' + e.message)), DIA_MS);
	console.log(cnf.tag + ' [info] alertas de forraje: barrido diario programado');
}

module.exports = { iniciar, _barrido };
