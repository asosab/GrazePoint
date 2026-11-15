// servicios/grazepoint/config.js — configuración del servicio GrazePoint.
//
// PRIAS digital + recomendador de rotación + ventana de siembra forrajera.
// Autenticación propia: registro con email + clave, verificación por
// código de 6 dígitos enviado por Gmail SMTP (clave de aplicación), JWT
// propio. Los usuarios viven en gpUser, dentro de la BD del proyecto.

module.exports = {
	name: 'GrazePoint',
	about: 'PRIAS digital: predios, parcelas, suelo, rotación y ventana de siembra forrajera.',
	tag: '[GrazePoint]',
	maxBodyBytes: 1048576,

	// BD propia del proyecto (misma estructura en local y producción).
	// Local dev: mongodb://127.0.0.1:27017/grazepoint
	// Producción (Contabo): mongodb://<usr>:<pwd>@161.97.176.137:27017/grazepoint?authSource=admin
	dbName: 'grazepoint',
	mongoUri: process.env.GRAZEPOINT_MONGO_URI || 'mongodb://127.0.0.1:27017/grazepoint',

	// ------------------------------------------------------------------
	// Niveles de usuario (regla del proyecto):
	//   'registrado' → acceso a todas las áreas (etapa actual)
	//   'especial'   → reservado para funciones extendidas a futuro
	//   'admin'      → gestión de usuarios y lectura global
	// Los admins se prescriben aquí por correo; el rol se resuelve al
	// autenticar y se cachea en gpUser.rol.
	// ------------------------------------------------------------------
	roles: {
		admins: [
			'asosab@gmail.com',
			'lefehur@gmail.com'
		],
		especiales: []
	},

	// Versión vigente de términos + privacidad. Se guarda en gpUser junto
	// con la fecha de aceptación (prueba de consentimiento). Subir el
	// número cuando cambie el texto legal del sitio (/terms, /privacy).
	legalVersion: '2026-11-15',

	// Orígenes permitidos para CORS (Bearer, sin cookies). El frontend
	// productivo vive en GitHub Pages; localhost para desarrollo.
	corsOrigins: String(
		process.env.GRAZEPOINT_CORS_ORIGINS ||
		'https://asosab.github.io,http://localhost:4000,http://127.0.0.1:4000'
	).split(',').map((o) => o.trim()).filter(Boolean),

	// NASA POWER API (sin auth, CORS abierto; se proxifica para cachear y
	// no depender del navegador).
	power: {
		base: 'https://power.larc.nasa.gov/api',
		dailyParams: 'PRECTOTCORR,T2M,T2M_MIN,T2M_MAX,GWETTOP,GWETROOT,GWETPROF,WS2M',
		climaParams: 'PRECTOTCORR,T2M,GWETROOT',
		timeoutMs: 15000
	},

	// Bot de Telegram propio (@grazepoint_bot): avisos de campo y
	// vínculo de cuenta web ↔ chat. Sin token el poller no arranca.
	telegram: {
		token: process.env.GRAZEPOINT_TG_TOKEN || '',
		botUser: process.env.GRAZEPOINT_TG_BOT || 'grazepoint_bot',
		adminId: Number(process.env.GRAZEPOINT_TG_ADMIN || 0)
	}
};
