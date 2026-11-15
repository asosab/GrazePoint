/* auth.js — registro, verificación por código, login y recuperación.
 * Guarda el JWT en localStorage (fs_token) y el usuario en FS.usuario. */
window.FS = window.FS || {};

(function () {
  var usuario = null;
  var oyentes = [];

  function emitir() { oyentes.forEach(function (f) { try { f(usuario); } catch (e) {} }); }
  function alCambiar(fn) { oyentes.push(fn); }
  function get() { return usuario; }

  async function cargarSesion() {
    if (!FS.api.token()) { usuario = null; emitir(); return; }
    var r = await FS.api.get('/me', FS.t('esp_sesion'));
    usuario = (r.data && r.data.ok) ? r.data.usuario : null;
    if (!usuario && r.status === 401) FS.api.setToken(null);
    emitir();
  }

  function _guardar(r) {
    if (r.data && r.data.ok && r.data.token) {
      FS.api.setToken(r.data.token);
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

    registro: function (email, clave, nombre) { return FS.api.post('/auth/registro', { email: email, clave: clave, nombre: nombre, lang: FS.lang }, FS.t('esp_registro')); },
    verificar: async function (email, codigo) { return _guardar(await FS.api.post('/auth/verificar', { email: email, codigo: codigo }, FS.t('esp_verificando'))); },
    reenviar: function (email) { return FS.api.post('/auth/reenviar', { email: email, lang: FS.lang }, FS.t('esp_reenviando')); },
    login: async function (email, clave) {
      var r = await FS.api.post('/auth/login', { email: email, clave: clave, lang: FS.lang }, FS.t('esp_entrando'));
      _guardar(r);
      return r;
    },
    recuperar: function (email) { return FS.api.post('/auth/recuperar', { email: email, lang: FS.lang }, FS.t('esp_recuperando')); },
    restablecer: async function (email, codigo, clave) { return _guardar(await FS.api.post('/auth/restablecer', { email: email, codigo: codigo, clave: clave }, FS.t('esp_restaurando'))); },

    salir: function () { FS.api.setToken(null); usuario = null; emitir(); }
  };

  auth.listo = cargarSesion();
  FS.auth = auth;
})();
