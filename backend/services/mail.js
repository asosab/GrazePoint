// servicios/fieldShift/services/mail.js — correos al usuario vía Gmail.
//
// Cuenta de Google con clave de aplicación (SMTP gmail). Las credenciales
// viven SOLO en el .env, nunca en el repo público:
//   FIELDSHIFT_SMTP_HOST (default smtp.gmail.com)
//   FIELDSHIFT_SMTP_PORT (default 465)
//   FIELDSHIFT_SMTP_USER (cuenta gmail)
//   FIELDSHIFT_SMTP_PASS (clave de aplicación de 16 letras)
//   FIELDSHIFT_MAIL_FROM (default "Field Shift <user>")
// Sin credenciales el servicio no revienta: loguea el código en consola
// (modo dev) y devuelve false.

const nodemailer = require('nodemailer');
const cnf = require('../config');
const { MAIL, langOk } = require('./i18n');

let transporter = null;

function _transport() {
	if (transporter) return transporter;
	const user = process.env.FIELDSHIFT_SMTP_USER;
	const pass = process.env.FIELDSHIFT_SMTP_PASS;
	if (!user || !pass) return null;
	transporter = nodemailer.createTransport({
		host: process.env.FIELDSHIFT_SMTP_HOST || 'smtp.gmail.com',
		port: Number(process.env.FIELDSHIFT_SMTP_PORT || 465),
		secure: Number(process.env.FIELDSHIFT_SMTP_PORT || 465) === 465,
		auth: { user, pass }
	});
	return transporter;
}

function _from() {
	return process.env.FIELDSHIFT_MAIL_FROM || ('Field Shift <' + (process.env.FIELDSHIFT_SMTP_USER || 'noreply@fieldshift.app') + '>');
}

async function enviar({ para, asunto, texto, html }) {
	const t = _transport();
	if (!t) {
		console.log(cnf.tag + ' [warn] mail.enviar: sin credenciales SMTP, correo NO enviado a ' + para + ' | asunto=' + asunto);
		if (texto) console.log(cnf.tag + ' [info] mail.enviar (dev): ' + texto.split('\n').join(' · '));
		return false;
	}
	try {
		await t.sendMail({ from: _from(), to: para, subject: asunto, text: texto, html });
		console.log(cnf.tag + ' [info] mail.enviar: enviado a ' + para + ' | ' + asunto);
		return true;
	} catch (err) {
		console.log(cnf.tag + ' [error] mail.enviar: ' + (err && err.message ? err.message : err));
		return false;
	}
}

function enviarVerificacion(para, codigo, nombre, lang) {
	const m = MAIL[langOk(lang)];
	const saludo = m.saludo(nombre);
	return enviar({
		para,
		asunto: m.verif_asunto(codigo),
		texto: saludo + '\n\n' + m.verif_texto(codigo) + '\n\n' + m.firma,
		html: '<p>' + saludo + '</p>' + m.verif_html(codigo) + '<p>' + m.firma + '</p>'
	});
}

function enviarReset(para, codigo, nombre, lang) {
	const m = MAIL[langOk(lang)];
	const saludo = m.saludo(nombre);
	return enviar({
		para,
		asunto: m.reset_asunto,
		texto: saludo + '\n\n' + m.reset_texto(codigo) + '\n\n' + m.firma,
		html: '<p>' + saludo + '</p>' + m.reset_html(codigo) + '<p>' + m.firma + '</p>'
	});
}

module.exports = { enviar, enviarVerificacion, enviarReset };
