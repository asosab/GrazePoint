/* api.js — cliente HTTP de GrazePoint.
 * Base: api.statetty.com en producción; ?api=<url> o localStorage gp_api
 * para apuntar a un backend standalone (GrazePoint/backend). */
window.GP = window.GP || {};

(function () {
  var q = new URLSearchParams(location.search);
  var API = q.get('api')
    || localStorage.getItem('gp_api')
    || 'https://api.statetty.com/api/grazepoint';
  if (q.get('api')) localStorage.setItem('gp_api', q.get('api'));
  console.info('[api] base:', API);

  function token() { return localStorage.getItem('gp_token') || ''; }
  function setToken(t) { t ? localStorage.setItem('gp_token', t) : localStorage.removeItem('gp_token'); }

  // ── indicador de espera ─────────────────────────────────
  // Píldora flotante con spinner; la crea api.js bajo demanda
  // (sirve igual para /app/ y /es/app/). `msg` nombra el proceso.
  var pendientes = 0;

  function _nodoEspera() {
    var n = document.getElementById('espera');
    if (!n && document.body) {
      n = document.createElement('div');
      n.id = 'espera';
      n.className = 'espera oculto';
      n.innerHTML = '<span class="spin"></span><span class="txt"></span>';
      document.body.appendChild(n);
    }
    return n;
  }

  function esperar(msg) {
    pendientes++;
    var n = _nodoEspera();
    if (!n) return;
    n.querySelector('.txt').textContent = msg || (GP.t ? GP.t('esp_generico') : '…');
    n.classList.remove('oculto');
  }

  function listo() {
    pendientes = Math.max(0, pendientes - 1);
    var n = _nodoEspera();
    if (!pendientes && n) n.classList.add('oculto');
  }

  async function req(metodo, ruta, cuerpo, msg) {
    var opt = { method: metodo, headers: {} };
    if (cuerpo) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(cuerpo); }
    var t = token();
    if (t) opt.headers['Authorization'] = 'Bearer ' + t;
    esperar(msg);
    var res, data = null;
    try {
      res = await fetch(API + ruta, opt);
      try { data = await res.json(); } catch (e) { /* pdf u otro */ }
    } catch (e) {
      console.error('[api]', metodo, ruta, '→ falla de red/CORS:', e && e.message, e);
      listo();
      return { status: 0, data: null };
    }
    var malo = res.status >= 400 || (data && data.ok === false);
    console[malo ? 'warn' : 'log']('[api]', metodo, ruta, '→', res.status, data);
    // el body ayuda a reproducir el fallo; en /auth/ lleva clave y no se loguea
    if (malo && cuerpo && ruta.indexOf('/auth/') !== 0) console.warn('[api] body enviado:', cuerpo);
    listo();
    return { status: res.status, data: data };
  }

  GP.api = {
    base: API,
    token: token,
    setToken: setToken,
    esperar: esperar,
    listo: listo,
    get: function (r, m) { return req('GET', r, null, m); },
    post: function (r, b, m) { return req('POST', r, b || {}, m); },
    put: function (r, b, m) { return req('PUT', r, b || {}, m); },
    del: function (r, m) { return req('DELETE', r, null, m); },
    informeUrl: function (predioId, parcelaId) {
      var q = 'lang=' + (GP.lang || 'en');
      return API + '/predios/' + predioId + '/informe.pdf?' + q + (parcelaId ? '&parcela=' + parcelaId : '');
    }
  };
})();
