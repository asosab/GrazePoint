// servicios/fieldShift/config.js — configuración del servicio Field Shift.
//
// PRIAS digital + recomendador de rotación + ventana de siembra forrajera.
// Autenticación propia: registro con email + clave, verificación por
// código de 6 dígitos enviado por Gmail SMTP (clave de aplicación), JWT
// propio. Los usuarios viven en fsUser, dentro de la BD del proyecto.

module.exports = {
	name: 'FieldShift',
	about: 'PRIAS digital: predios, parcelas, suelo, rotación y ventana de siembra forrajera.',
	tag: '[FieldShift]',
	maxBodyBytes: 1048576,

	// BD propia del proyecto (misma estructura en local y producción).
	// Local dev: mongodb://127.0.0.1:27017/fieldShift
	// Producción (Contabo): mongodb://<usr>:<pwd>@161.97.176.137:27017/fieldShift?authSource=admin
	dbName: 'fieldShift',
	mongoUri: process.env.FIELDSHIFT_MONGO_URI || 'mongodb://127.0.0.1:27017/fieldShift',

	// ------------------------------------------------------------------
	// Niveles de usuario (regla del proyecto):
	//   'registrado' → acceso a todas las áreas (etapa actual)
	//   'especial'   → reservado para funciones extendidas a futuro
	//   'admin'      → gestión de usuarios y lectura global
	// Los admins se prescriben aquí por correo; el rol se resuelve al
	// autenticar y se cachea en fsUser.rol.
	// ------------------------------------------------------------------
	roles: {
		admins: [
			'asosab@gmail.com',
			'lefehur@gmail.com'
		],
		especiales: []
	},

	// Orígenes permitidos para CORS (Bearer, sin cookies). El frontend
	// productivo vive en GitHub Pages; localhost para desarrollo.
	corsOrigins: String(
		process.env.FIELDSHIFT_CORS_ORIGINS ||
		'https://asosab.github.io,http://localhost:4000,http://127.0.0.1:4000'
	).split(',').map((o) => o.trim()).filter(Boolean),

	// NASA POWER API (sin auth, CORS abierto; se proxifica para cachear y
	// no depender del navegador).
	power: {
		base: 'https://power.larc.nasa.gov/api',
		dailyParams: 'PRECTOTCORR,T2M,T2M_MIN,T2M_MAX,GWETTOP,GWETROOT,GWETPROF,WS2M',
		climaParams: 'PRECTOTCORR,T2M,GWETROOT',
		timeoutMs: 15000
	}
};
