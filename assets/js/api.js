/* api.js — cliente HTTP de Field Shift.
 * Base: api.statetty.com en producción; ?api=<url> o localStorage fs_api
 * para apuntar a un backend standalone (fieldShift/backend). */
window.FS = window.FS || {};

(function () {
  var q = new URLSearchParams(location.search);
  var API = q.get('api')
    || localStorage.getItem('fs_api')
    || 'https://api.statetty.com/api/fieldShift';
  if (q.get('api')) localStorage.setItem('fs_api', q.get('api'));

  function token() { return localStorage.getItem('fs_token') || ''; }
  function setToken(t) { t ? localStorage.setItem('fs_token', t) : localStorage.removeItem('fs_token'); }

  async function req(metodo, ruta, cuerpo) {
    var opt = { method: metodo, headers: {} };
    if (cuerpo) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(cuerpo); }
    var t = token();
    if (t) opt.headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(API + ruta, opt);
    var data = null;
    try { data = await res.json(); } catch (e) { /* pdf u otro */ }
    return { status: res.status, data: data };
  }

  FS.api = {
    base: API,
    token: token,
    setToken: setToken,
    get: function (r) { return req('GET', r); },
    post: function (r, b) { return req('POST', r, b || {}); },
    put: function (r, b) { return req('PUT', r, b || {}); },
    del: function (r) { return req('DELETE', r); },
    informeUrl: function (predioId, parcelaId) {
      var q = 'lang=' + (FS.lang || 'en');
      return API + '/predios/' + predioId + '/informe.pdf?' + q + (parcelaId ? '&parcela=' + parcelaId : '');
    }
  };
})();
