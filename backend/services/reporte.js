// servicios/grazepoint/services/reporte.js — envíos de reportes web a Telegram.

const cnf = require('../config');
const telegram = require('./telegram');
const { langOk } = require('./i18n');

const TITULO = {
	es: 'Nuevo reporte de GrazePoint',
	en: 'New GrazePoint report'
};
const SIN_COMENTARIO = {
	es: 'Sin comentario escrito.',
	en: 'No comment written.'
};

function escapar(s) {
	return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mensaje(usuario, comentario, url, idioma) {
	const L = langOk(idioma);
	const c = String(comentario || '').trim().slice(0, 4000);
	const u = usuario || {};
	const nombre = String(u.nombre || '').trim();
	const email = String(u.email || '').trim();
	const usuarioTexto = escapar([nombre, email].filter(Boolean).join(' · '));
	const urlTexto = url ? escapar(String(url).slice(0, 1000)) : '';
	const detalle = c || (L === 'es' ? SIN_COMENTARIO.es : SIN_COMENTARIO.en);
	return [
		'<b>' + TITULO[L] + '</b>',
		'User: ' + (usuarioTexto || '—'),
		'Date: ' + new Date().toISOString(),
		'Page: ' + (urlTexto || '—'),
		'',
		detalle.split('\n').map((linea) => linea ? escapar(linea) : ' ').join('\n')
	].join('\n');
}

async function enviar(usuario, comentario, url, captura, idioma) {
	if (!cnf.telegram.token || !cnf.telegram.adminId) {
		return { ok: false, error: 'telegram_no_configurado' };
	}
	const texto = mensaje(usuario, comentario, url, idioma);
	const chatId = cnf.telegram.adminId;
	const r = await telegram.enviarReporte(chatId, texto, captura || null);
	if (!r || r.ok !== true) {
		console.log(cnf.tag + ' [warn] reporte.enviar: Telegram no aceptó el reporte');
		return { ok: false, error: 'telegram_no_disponible' };
	}
	return { ok: true };
}

module.exports = { enviar, mensaje };
