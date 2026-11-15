/* auth.js — registro, verificación por código, login y recuperación.
 * Guarda el JWT en localStorage (gp_token) y el usuario en GP.usuario. */
window.GP = window.GP || {};

(function () {
  var usuario = null;
  var oyentes = [];

  function emitir() { oyentes.forEach(function (f) { try { f(usuario); } catch (e) {} }); }
  function alCambiar(fn) { oyentes.push(fn); }
  function get() { return usuario; }

  async function cargarSesion() {
    if (!GP.api.token()) { usuario = null; emitir(); return; }
    var r = await GP.api.get('/me', GP.t('esp_sesion'));
    usuario = (r.data && r.data.ok) ? r.data.usuario : null;
    if (!usuario && r.status === 401) GP.api.setToken(null);
    emitir();
  }

  function _guardar(r) {
    if (r.data && r.data.ok && r.data.token) {
      GP.api.setToken(r.data.token);
      usuario = r.data.usuario;
      emitir();
      return true;
    }
    return false;
  }

  var auth = {
    get: get,
    alCambiar: alCambiar,
    listo: null,

    registro: function (email, clave, nombre) { return GP.api.post('/auth/registro', { email: email, clave: clave, nombre: nombre, lang: GP.lang, legal: true }, GP.t('esp_registro')); },
    verificar: async function (email, codigo) { return _guardar(await GP.api.post('/auth/verificar', { email: email, codigo: codigo }, GP.t('esp_verificando'))); },
    reenviar: function (email) { return GP.api.post('/auth/reenviar', { email: email, lang: GP.lang }, GP.t('esp_reenviando')); },
    login: async function (email, clave) {
      var r = await GP.api.post('/auth/login', { email: email, clave: clave, lang: GP.lang }, GP.t('esp_entrando'));
      _guardar(r);
      return r;
    },
    demo: async function () {
      var r = await GP.api.post('/auth/demo', { lang: GP.lang }, GP.t('esp_demo'));
      _guardar(r);
      return r;
    },
    recuperar: function (email) { return GP.api.post('/auth/recuperar', { email: email, lang: GP.lang }, GP.t('esp_recuperando')); },
    restablecer: async function (email, codigo, clave) { return _guardar(await GP.api.post('/auth/restablecer', { email: email, codigo: codigo, clave: clave }, GP.t('esp_restaurando'))); },

    salir: function () { GP.api.setToken(null); usuario = null; emitir(); }
  };

  auth.listo = cargarSesion();
  GP.auth = auth;
})();
