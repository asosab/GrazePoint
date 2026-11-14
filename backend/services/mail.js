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

function enviarVerificacion(para, codigo, nombre) {
	const saludo = nombre ? 'Hola ' + nombre + ',' : 'Hola,';
	return enviar({
		para,
		asunto: 'Tu código de Field Shift: ' + codigo,
		texto: saludo + '\n\nTu código de verificación es ' + codigo + '. Vale por 30 minutos.\n\nSi no pediste registrarte en Field Shift, ignora este correo.\n\n— Equipo Field Shift',
		html: '<p>' + saludo + '</p><p>Tu código de verificación es <b style="font-size:1.4em;letter-spacing:2px">' + codigo + '</b>. Vale por 30 minutos.</p><p>Si no pediste registrarte en Field Shift, ignora este correo.</p><p>— Equipo Field Shift</p>'
	});
}

function enviarReset(para, codigo, nombre) {
	const saludo = nombre ? 'Hola ' + nombre + ',' : 'Hola,';
	return enviar({
		para,
		asunto: 'Restablecer tu clave de Field Shift',
		texto: saludo + '\n\nPediste restablecer tu clave. Tu código es ' + codigo + '. Vale por 30 minutos.\n\nSi no fuiste tú, ignora este correo: tu clave sigue igual.\n\n— Equipo Field Shift',
		html: '<p>' + saludo + '</p><p>Pediste restablecer tu clave. Tu código es <b style="font-size:1.4em;letter-spacing:2px">' + codigo + '</b>. Vale por 30 minutos.</p><p>Si no fuiste tú, ignora este correo: tu clave sigue igual.</p><p>— Equipo Field Shift</p>'
	});
}

module.exports = { enviar, enviarVerificacion, enviarReset };
