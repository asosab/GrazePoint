// servicios/fieldShift/middleware/auth.js — autenticación propia.
//
// JWT propio (FIELDSHIFT_JWT_SECRET), payload { sub: fsUser._id }.
// authenticate resuelve el usuario fresco desde la BD de fieldShift y
// recalcula el rol por si el correo entró a config.roles después del
// registro. soloAdmin exige rol 'admin'.

const jwt = require('jsonwebtoken');
const cnf = require('../config');
const FsUser = require('../models/fsUserModel');
const { rolParaEmail } = require('../models/fsUserModel');

const JWT_SECRET = process.env.FIELDSHIFT_JWT_SECRET || 'fieldshift_dev_secret_CAMBIAR';
const JWT_EXPIRES = process.env.FIELDSHIFT_JWT_EXPIRES || '30d';

function firmarToken(fsUserId) {
	return jwt.sign({ sub: String(fsUserId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function _extractBearer(req) {
	const h = req.headers.authorization || '';
	const parts = h.split(' ');
	if (parts[0] && parts[0].toLowerCase() === 'bearer' && parts[1]) return parts[1];
	return null;
}

async function authenticate(req, res, next) {
	const bearer = _extractBearer(req);
	if (!bearer) return res.status(401).json({ ok: false, error: 'No autenticado' });

	let payload;
	try {
		payload = jwt.verify(bearer, JWT_SECRET);
	} catch (e) {
		return res.status(401).json({ ok: false, error: 'token_invalido' });
	}
	const uid = payload && payload.sub;
	if (!uid) return res.status(401).json({ ok: false, error: 'token_sin_sub' });

	try {
		const user = await FsUser.findOne({ _id: uid, activo: true });
		if (!user) return res.status(401).json({ ok: false, error: 'usuario_inexistente' });
		const rol = rolParaEmail(user.email);
		if (rol !== user.rol) { user.rol = rol; user.save().catch(() => {}); }
		req.fsUser = user;
		next();
	} catch (err) {
		console.log(cnf.tag + ' [error] authenticate: ' + (err && err.message ? err.message : err));
		return res.status(503).json({ ok: false, error: 'servicio_no_disponible' });
	}
}

function soloAdmin(req, res, next) {
	if (!req.fsUser || req.fsUser.rol !== 'admin') {
		return res.status(403).json({ ok: false, error: 'solo_admin' });
	}
	next();
}

module.exports = { authenticate, soloAdmin, firmarToken, _extractBearer };
