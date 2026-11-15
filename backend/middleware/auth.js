// servicios/grazepoint/middleware/auth.js — autenticación propia.
//
// JWT propio (GRAZEPOINT_JWT_SECRET), payload { sub: gpUser._id }.
// authenticate resuelve el usuario fresco desde la BD de GrazePoint y
// recalcula el rol por si el correo entró a config.roles después del
// registro. soloAdmin exige rol 'admin'.

const jwt = require('jsonwebtoken');
const cnf = require('../config');
const GpUser = require('../models/gpUserModel');
const { rolParaEmail } = require('../models/gpUserModel');

const JWT_SECRET = process.env.GRAZEPOINT_JWT_SECRET || 'grazepoint_dev_secret_CAMBIAR';
const JWT_EXPIRES = process.env.GRAZEPOINT_JWT_EXPIRES || '30d';

function firmarToken(gpUserId) {
	return jwt.sign({ sub: String(gpUserId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
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
		const user = await GpUser.findOne({ _id: uid, activo: true });
		if (!user) return res.status(401).json({ ok: false, error: 'usuario_inexistente' });
		const rol = rolParaEmail(user.email);
		if (rol !== user.rol) { user.rol = rol; user.save().catch(() => {}); }
		req.gpUser = user;
		next();
	} catch (err) {
		console.log(cnf.tag + ' [error] authenticate: ' + (err && err.message ? err.message : err));
		return res.status(503).json({ ok: false, error: 'servicio_no_disponible' });
	}
}

function soloAdmin(req, res, next) {
	if (!req.gpUser || req.gpUser.rol !== 'admin') {
		return res.status(403).json({ ok: false, error: 'solo_admin' });
	}
	next();
}

module.exports = { authenticate, soloAdmin, firmarToken, _extractBearer };
