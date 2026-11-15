/* app.js — orquestación de la vista: mapa satelital + sábana inferior.
 * Flujo: entrar → crear predio → dibujar parcela → análisis → PDF.
 * Las cadenas visibles salen de FS.t (assets/js/i18n.js). */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var t = FS.t;
  var hoja = el('hoja'), cuerpo = el('hoja-cuerpo');
  var predios = [], predioActual = null, parcelaActual = null;
  var modoDibujo = null; // {uso:'nueva'|'editar'}

  // ── utilidades ──────────────────────────────────────────
  function toast(msg, ms) {
    var t2 = el('toast');
    t2.textContent = msg; t2.classList.remove('oculto');
    clearTimeout(t2._t); t2._t = setTimeout(function () { t2.classList.add('oculto'); }, ms || 2800);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mostrarHoja(html) { cuerpo.innerHTML = html; hoja.classList.remove('oculto'); }
  function ocultarHoja() { hoja.classList.add('oculto'); }
  function valor(id) { var n = document.getElementById(id); return n ? n.value.trim() : ''; }
  function num(id) { var v = valor(id); return v === '' ? null : Number(v); }
  function mes(id) { var v = valor(id); return v ? v + '-02' : null; }
  function marcados(clase) {
    var out = [];
    document.querySelectorAll('.' + clase + ':checked').forEach(function (c) { out.push(c.value); });
    return out;
  }
  function traducirError(e) {
    var k = 'err_' + e;
    var v = t(k);
    return v !== k ? v : t('err_fallo', { e: e || t('sin_conexion') });
  }
  function tipoNombre(tipo) {
    var v = t('tipo_' + tipo);
    return v !== 'tipo_' + tipo ? v : (tipo || '');
  }
  function grupoNombre(g) {
    var k = 'grupo_' + String(g || '').replace(/-/g, '_');
    var v = t(k);
    return v !== k ? v : (g || '');
  }
  function fecha(d) { return new Date(d).toLocaleDateString(FS.dateLocale); }

  el('hoja-asa').addEventListener('click', ocultarHoja);

  // ── ojo de clave ────────────────────────────────────────
  var OJO_ABIERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OJO_TACHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function campoClave(id, txt, ac) {
    return '<div class="campo"><label for="' + id + '">' + txt + '</label>' +
      '<div class="clave-wrap"><input id="' + id + '" type="password" autocomplete="' + ac + '">' +
      '<button type="button" class="ojo" data-ojo="' + id + '" aria-label="' + t('ver_clave') + '" title="' + t('ver_clave') + '">' + OJO_ABIERTO + '</button>' +
      '</div></div>';
  }

  function atarOjos() {
    document.querySelectorAll('[data-ojo]').forEach(function (b) {
      b.onclick = function () {
        var inp = el(b.dataset.ojo);
        if (!inp) return;
        var ver = inp.type === 'password';
        inp.type = ver ? 'text' : 'password';
        b.innerHTML = ver ? OJO_TACHADO : OJO_ABIERTO;
        var txt = t(ver ? 'ocultar_clave' : 'ver_clave');
        b.setAttribute('aria-label', txt);
        b.title = txt;
        inp.focus();
      };
    });
  }

  // ── auth UI ─────────────────────────────────────────────
  var emailPendiente = null;

  function hojaEntrar(modo) {
    modo = modo || 'login';
    if (modo === 'login') {
      mostrarHoja(
        '<h2>' + t('entrar') + '</h2>' +
        '<label class="campo"><span>' + t('correo') + '</span><input id="a-email" type="email" autocomplete="email" inputmode="email"></label>' +
        campoClave('a-clave', t('clave'), 'current-password') +
        '<button class="boton" id="a-entrar">' + t('entrar') + '</button>' +
        '<button class="enlace" id="a-olvide">' + t('olvide') + '</button>' +
        '<button class="enlace" id="a-registro">' + t('crear_cta') + '</button>'
      );
      atarOjos();
      el('a-entrar').onclick = async function () {
        var r = await FS.auth.login(valor('a-email'), valor('a-clave'));
        if (!r.data) return toast(t('sin_conexion'));
        if (r.data.ok) { ocultarHoja(); toast(t('hola')); return; }
        if (r.data.requiereVerificacion) { emailPendiente = valor('a-email'); return hojaCodigo('verificar'); }
        toast(traducirError(r.data.error));
      };
      el('a-olvide').onclick = function () { hojaRecuperar(); };
      el('a-registro').onclick = function () { hojaEntrar('registro'); };
    } else {
      mostrarHoja(
        '<h2>' + t('crear_cta_h') + '</h2>' +
        '<label class="campo"><span>' + t('nombre') + '</span><input id="a-nombre" type="text" autocomplete="name"></label>' +
        '<label class="campo"><span>' + t('correo') + '</span><input id="a-email" type="email" autocomplete="email" inputmode="email"></label>' +
        campoClave('a-clave', t('clave_min'), 'new-password') +
        '<button class="boton" id="a-crear">' + t('registrarme') + '</button>' +
        '<button class="enlace" id="a-login">' + t('ya_cuenta') + '</button>'
      );
      atarOjos();
      el('a-crear').onclick = async function () {
        var r = await FS.auth.registro(valor('a-email'), valor('a-clave'), valor('a-nombre'));
        if (r.data && r.data.ok) { emailPendiente = valor('a-email'); hojaCodigo('verificar'); }
        else toast(traducirError(r.data && r.data.error));
      };
      el('a-login').onclick = function () { hojaEntrar('login'); };
    }
  }

  function hojaCodigo(tipo, claveNueva) {
    mostrarHoja(
      '<h2>' + (tipo === 'reset' ? t('reset_h') : t('verifica_h')) + '</h2>' +
      '<p class="aviso">' + t('codigo_aviso', { e: esc(emailPendiente) }) + '</p>' +
      '<label class="campo"><span>' + t('codigo') + '</span><input id="a-codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="letter-spacing:6px;text-align:center;font-size:1.3rem"></label>' +
      (tipo === 'reset' ? campoClave('a-clave2', t('clave_nueva_min'), 'new-password') : '') +
      '<button class="boton" id="a-ok">' + t('continuar') + '</button>' +
      '<button class="enlace" id="a-reenviar">' + t('reenviar') + '</button>'
    );
    atarOjos();
    el('a-ok').onclick = async function () {
      var ok;
      if (tipo === 'reset') ok = await FS.auth.restablecer(emailPendiente, valor('a-codigo'), valor('a-clave2'));
      else ok = await FS.auth.verificar(emailPendiente, valor('a-codigo'));
      if (ok) { ocultarHoja(); toast(t('listo_dentro')); }
      else toast(t('codigo_malo'));
    };
    el('a-reenviar').onclick = async function () {
      if (tipo === 'reset') await FS.auth.recuperar(emailPendiente);
      else await FS.auth.reenviar(emailPendiente);
      toast(t('codigo_reenviado'));
    };
  }

  function hojaRecuperar() {
    mostrarHoja(
      '<h2>' + t('recuperar_h') + '</h2>' +
      '<label class="campo"><span>' + t('correo') + '</span><input id="a-email" type="email" inputmode="email"></label>' +
      '<button class="boton" id="a-mandar">' + t('mandar_codigo') + '</button>' +
      '<button class="enlace" id="a-login">' + t('volver') + '</button>'
    );
    el('a-mandar').onclick = async function () {
      emailPendiente = valor('a-email');
      await FS.auth.recuperar(emailPendiente);
      hojaCodigo('reset');
    };
    el('a-login').onclick = function () { hojaEntrar('login'); };
  }

  // ── cuenta ──────────────────────────────────────────────
  async function hojaCuenta() {
    var r = await FS.api.get('/me', t('esp_sesion'));
    var u = (r.data && r.data.ok) ? r.data.usuario : FS.auth.get();
    var tg = u.telegram || {};
    mostrarHoja(
      '<h2>' + esc(u.nombre || u.email) + '</h2>' +
      '<p class="aviso"><span class="chip">' + esc(u.rol) + '</span> ' + esc(u.email) + '</p>' +
      (tg.vinculado
        ? '<p class="aviso">✈ ' + esc(t('tg_vinculado', { u: tg.username ? '@' + tg.username : '·' })) +
          ' <button class="enlace" id="c-tg-off">' + t('tg_desvincular') + '</button></p>'
        : '<button class="boton secundario" id="c-tg">' + t('tg_vincular') + '</button>') +
      '<div id="c-tg-zona"></div>' +
      '<button class="boton secundario" id="c-salir">' + t('cerrar_sesion') + '</button>'
    );
    el('c-salir').onclick = function () { FS.auth.salir(); ocultarHoja(); toast(t('sesion_cerrada')); };
    if (el('c-tg')) el('c-tg').onclick = async function () {
      var rc = await FS.api.post('/me/telegram/codigo', {}, t('esp_tg'));
      if (!(rc.data && rc.data.ok)) return toast(traducirError(rc.data && rc.data.error));
      el('c-tg-zona').innerHTML =
        '<p class="aviso">' + t('tg_instruccion', { m: rc.data.expiraMin }) + '</p>' +
        '<p class="aviso"><b>' + esc(rc.data.codigo) + '</b> · <a href="' + esc(rc.data.url) + '" target="_blank" rel="noopener">' + t('tg_abrir') + '</a>' +
        ' · <button class="enlace" id="c-tg-check">' + t('tg_check') + '</button></p>';
      el('c-tg-check').onclick = hojaCuenta;
    };
    if (el('c-tg-off')) el('c-tg-off').onclick = async function () {
      var rd = await FS.api.del('/me/telegram', t('esp_tg'));
      if (rd.data && rd.data.ok) { toast(t('tg_off_ok')); hojaCuenta(); }
      else toast(traducirError(rd.data && rd.data.error));
    };
  }

  el('btn-cuenta').onclick = function () {
    FS.auth.get() ? hojaCuenta() : hojaEntrar('login');
  };

  FS.auth.alCambiar(function (u) {
    el('btn-cuenta').textContent = u ? (u.nombre || u.email).split(' ')[0] : t('entrar');
    if (u) cargarPredios();
    else { predios = []; predioActual = null; FS.mapa.pintarParcelas([]); FS.mapa.enfocar(null); ocultarHoja(); }
  });

  // ── predios ─────────────────────────────────────────────
  async function cargarPredios() {
    var r = await FS.api.get('/predios', t('esp_predios'));
    predios = (r.data && r.data.ok) ? r.data.data : [];
    if (!predioActual && predios.length) seleccionarPredio(predios[0]._id);
    if (predioActual) {
      var sigue = predios.find(function (p) { return p._id === predioActual._id; });
      if (!sigue) predioActual = null;
    }
    if (predioActual) refrescarParcelas();
  }

  function hojaPredios() {
    var html = '<h2>' + t('mis_predios') + '</h2>';
    predios.forEach(function (p) {
      html += '<button class="item-lista" data-p="' + p._id + '"><span class="titulo">' + esc(p.nombre) +
        '<span class="detalle">' + t('parcelas_n', { n: (p.parcelas || []).length }) + '</span></span>' +
        (predioActual && p._id === predioActual._id ? '<span class="chip">' + t('activo') + '</span>' : '') + '</button>';
    });
    html += '<button class="boton" id="p-nuevo">' + t('registrar_predio') + '</button>';
    if (predioActual) html += '<button class="boton secundario" id="p-forraje">' + t('ver_potreros') + '</button>';
    if (!predios.length) html += '<p class="aviso">' + t('sin_predios') + '</p>';
    mostrarHoja(html);
    document.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () { seleccionarPredio(b.dataset.p); ocultarHoja(); };
    });
    el('p-nuevo').onclick = hojaNuevoPredio;
    if (el('p-forraje')) el('p-forraje').onclick = hojaForraje;
  }

  // ── estado de potreros: por dónde rotar el lote ─────────
  async function hojaForraje() {
    mostrarHoja('<h2>' + t('potreros_h') + '</h2><p class="aviso">' + t('consultando') + '</p>');
    var r = await FS.api.get('/predios/' + predioActual._id + '/forraje?lang=' + FS.lang, t('esp_analisis'));
    if (!(r.data && r.data.ok)) return mostrarHoja('<h2>' + t('potreros_h') + '</h2><p class="aviso">' + t('no_cargar') + '</p>');
    var d = r.data.data;
    var cls = { punto_optimo: 'favorable_ahora', punto_ensilaje: 'favorable_ahora', rebrote: 'esperar', creciendo: 'esperar', pasado: 'ventana_pero_seco', pasado_ensilaje: 'ventana_pero_seco' };
    var html = '<h2>' + t('potreros_h') + '</h2><p class="aviso">' + t('potreros_aviso') + '</p>';
    if (d.forrajeTotalKgMS) html += '<p class="aviso">' + t('forraje_total', { v: d.forrajeTotalKgMS }) + '</p>';
    if (d.balance) html += '<p class="aviso">' + t('balance_line', { d: d.balance.diasCobertura, c: d.balance.cabezas, f: d.balance.fechaDeficit }) + '</p>';
    var hato = (predioActual && predioActual.hato) || {};
    html += '<div class="hato"><span>' + t('hato_lbl') + '</span>' +
      '<input id="fo-cabezas" type="number" min="0" inputmode="numeric" placeholder="' + t('hato_cabezas') + '" value="' + (hato.cabezas != null ? hato.cabezas : '') + '">' +
      '<input id="fo-peso" type="number" min="0" inputmode="numeric" placeholder="' + t('hato_peso') + '" value="' + (hato.pesoKg != null ? hato.pesoKg : '') + '">' +
      '<button class="enlace" id="fo-hato">' + t('guardar') + '</button></div>';
    (d.potreros || []).forEach(function (e) {
      var det = [];
      if (e.diasEfectivos != null) det.push(t('forraje_efec', { d: e.diasEfectivos }));
      if (e.kgMSHaEst != null) det.push(t('forraje_kgms', { v: e.kgMSHaEst }) + (e.areaHa ? ' (~' + Math.round(e.kgMSHaEst * e.areaHa) + ' kg MS · ' + e.areaHa + ' ha)' : ''));
      if (e.ev30 != null) det.push(t('forraje_ev30', { n: e.ev30 }));
      if (e.t0Fuente === 'ndvi') det.push(t('forraje_ndvi_t0'));
      if (e.estresHidrico) det.push('⚠ ' + t('forraje_seco'));
      if (e.smap != null && e.smap >= 0.5) det.push('⚠ ' + t('forraje_anegado'));
      if (e.ndviAnt != null && e.ndvi != null && e.ndviAnt - e.ndvi >= 0.1) det.push('⚠ ' + t('forraje_ndvi_cae'));
      if (e.riesgoGerminacion) det.push('⚠ ' + t('forraje_germina', { mm: e.lluviaDesdeSembra }));
      html += '<div class="reco"><h4>' + esc(e.parcela.nombre) + (e.parcela.especie ? ' <span class="chip">' + esc(e.parcela.especie) + '</span>' : '') + '</h4>' +
        '<div class="veredicto ' + (cls[e.estado] || 'esperar') + '">' + esc(e.texto) + '</div>' +
        (det.length ? '<p class="aviso">' + det.join(' · ') + '</p>' : '') + '</div>';
    });
    html += '<button class="boton secundario" id="fo-copiar">' + t('copiar_resumen') + '</button>';
    html += '<button class="boton secundario" id="fo-wa">' + t('compartir_wa') + '</button>';
    mostrarHoja(html);
    var txt = predioActual.nombre + '\n' + (d.potreros || []).map(function (e) {
      return '• ' + e.parcela.nombre + ' — ' + e.texto;
    }).join('\n') + (d.forrajeTotalKgMS ? '\n' + t('forraje_total', { v: d.forrajeTotalKgMS }) : '') +
      (d.balance ? '\n' + t('balance_line', { d: d.balance.diasCobertura, c: d.balance.cabezas, f: d.balance.fechaDeficit }) : '');
    el('fo-copiar').onclick = async function () {
      try { await navigator.clipboard.writeText(txt); toast(t('copiado')); }
      catch (err) { toast(t('no_guardar')); }
    };
    el('fo-wa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); };
    el('fo-hato').onclick = async function () {
      var r = await FS.api.put('/predios/' + predioActual._id, {
        hato: { cabezas: valor('fo-cabezas') ? Number(valor('fo-cabezas')) : null, pesoKg: valor('fo-peso') ? Number(valor('fo-peso')) : null }
      }, t('esp_guardando'));
      if (r.data && r.data.ok) { predioActual.hato = r.data.data.hato; toast(t('guardado_ok')); hojaForraje(); }
      else toast(t('no_guardar'));
    };
  }

  function hojaNuevoPredio() {
    mostrarHoja(
      '<h2>' + t('nuevo_predio') + '</h2>' +
      '<label class="campo"><span>' + t('nombre') + '</span><input id="np-nombre" placeholder="' + t('ph_nombre') + '"></label>' +
      '<label class="campo"><span>' + t('desc_opcional') + '</span><textarea id="np-desc" rows="2"></textarea></label>' +
      '<button class="boton" id="np-ok">' + t('crear_predio') + '</button>' +
      '<button class="enlace" id="np-ubicar">' + t('usar_ubicacion') + '</button>'
    );
    el('np-ubicar').onclick = function () { FS.mapa.centrarEnUsuario(); toast(t('centrando')); };
    el('np-ok').onclick = async function () {
      if (!valor('np-nombre')) return toast(t('ponle_nombre'));
      var r = await FS.api.post('/predios', { nombre: valor('np-nombre'), descripcion: valor('np-desc') || null }, t('esp_creando'));
      if (r.data && r.data.ok) {
        predioActual = r.data.data;
        await cargarPredios();
        el('fab-dibujar').classList.remove('oculto');
        el('fab-importar').classList.remove('oculto');
        ocultarHoja();
        toast(t('predio_creado'));
        empezarDibujoParcela();
      } else toast(t('no_crear'));
    };
  }

  async function seleccionarPredio(id) {
    var r = await FS.api.get('/predios/' + id, t('esp_abriendo'));
    if (!(r.data && r.data.ok)) return toast(t('no_cargar_predio'));
    predioActual = r.data.data;
    parcelaActual = null;
    FS.mapa.enfocar(null);
    refrescarParcelas();
    FS.mapa.encuadrarParcelas(predioActual.parcelas);
    el('fab-dibujar').classList.remove('oculto');
    el('fab-importar').classList.remove('oculto');
    if (!predioActual.parcelas.length) toast(t('sin_parcelas'));
  }

  function refrescarParcelas() {
    if (!predioActual) return FS.mapa.pintarParcelas([]);
    FS.mapa.pintarParcelas(predioActual.parcelas, function (p) {
      parcelaActual = p;
      FS.mapa.seleccionar(p);
      actualizarEnfoque();
      hojaParcela();
    });
  }

  // La máscara de enfoque solo tiene sentido cuando hay una parcela
  // elegida y al menos una capa de análisis prendida.
  function actualizarEnfoque() {
    var hayCapas = FS.capas.liste().some(function (x) { return x.aktiv; });
    FS.mapa.enfocar(hayCapas ? parcelaActual : null);
  }

  // ── dibujo de parcela ───────────────────────────────────
  function empezarDibujoParcela() {
    if (!predioActual) return toast(t('elige_predio'));
    modoDibujo = { uso: 'nueva' };
    FS.mapa.empezarDibujo(async function (geo) {
      var nombre = prompt(t('prompt_parcela'), t('parcela_n', { n: (predioActual.parcelas.length || 0) + 1 }));
      if (!nombre) { toast(t('dibujo_descartado')); return; }
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas', {
        nombre: nombre, tipo: 'potrero', geometry: geo
      }, t('esp_parcela'));
      if (r.data && r.data.ok) { toast(t('parcela_guardada')); seleccionarPredio(predioActual._id); }
      else toast(t('no_guardar'));
    });
    el('dibujo-barra').classList.remove('oculto');
  }

  function terminarDibujoUI() {
    el('dibujo-barra').classList.add('oculto');
    modoDibujo = null;
  }

  el('fab-dibujar').onclick = empezarDibujoParcela;
  el('fab-predios').onclick = function () {
    FS.auth.get() ? hojaPredios() : hojaEntrar('login');
  };
  el('dibujo-deshacer').onclick = function () { FS.mapa.deshacerVertice(); };
  el('dibujo-cerrar').onclick = function () { FS.mapa.cancelarDibujo(); terminarDibujoUI(); };
  el('dibujo-listo').onclick = function () {
    if (FS.mapa.vertices() < 3) return toast(t('min_vertices'));
    FS.mapa.cerrarDibujo();
    terminarDibujoUI();
  };

  // ── importar parcelas desde archivo ─────────────────────
  var importados = [];

  function hojaImportar(res) {
    importados = res.cands;
    FS.mapa.pintarCandidatos(importados);
    if (importados.length) FS.mapa.encuadrarCandidatos();
    else if (res.plano) FS.mapa.leaflet().fitBounds(res.plano.bounds, { padding: [30, 30], maxZoom: 17 });

    var html = '<h2>' + t('imp_h') + '</h2>' +
      '<p class="aviso">' + t('imp_formatos') + '</p>';
    res.notas.forEach(function (n) { html += '<p class="aviso">• ' + esc(n) + '</p>'; });
    if (!importados.length && !res.plano) html += '<p class="aviso">' + t('imp_sin_parcelas') + '</p>';
    if (res.plano) {
      html += '<label class="check"><input type="checkbox" id="imp-plano"' + (importados.length ? '' : ' checked') + '>' + t('imp_plano_chk') + '</label>';
    }
    importados.forEach(function (c, i) {
      html += '<label class="item-lista imp-item" data-i="' + i + '"><input type="checkbox" class="imp-chk" data-i="' + i + '" checked>' +
        '<span class="titulo">' + esc(c.nombre) + '<span class="detalle">' + c.ha + ' ha · ' + (c.geometry.coordinates[0].length - 1) + ' ' + t('imp_vertices') + '</span></span></label>';
    });
    if (importados.length) html += '<button class="boton" id="imp-ok"></button>';
    html += '<button class="enlace" id="imp-cancel">' + t('volver') + '</button>';
    mostrarHoja(html);

    function refrescarBoton() {
      var n = document.querySelectorAll('.imp-chk:checked').length;
      el('imp-ok').textContent = t('imp_importar', { n: n });
    }
    if (res.plano) {
      var aplicarPlano = function () {
        if (el('imp-plano').checked) { FS.mapa.ponerPlano(res.plano.dataUrl, res.plano.bounds); el('capa-quitar').classList.remove('oculto'); }
        else { FS.mapa.quitarPlano(); el('capa-quitar').classList.add('oculto'); }
      };
      el('imp-plano').onchange = aplicarPlano;
      aplicarPlano();
    }
    document.querySelectorAll('.imp-item').forEach(function (row) {
      row.addEventListener('click', function () {
        var c = importados[+row.dataset.i];
        if (c && c._capa) FS.mapa.leaflet().fitBounds(c._capa.getBounds(), { padding: [40, 40], maxZoom: 17 });
      });
    });
    document.querySelectorAll('.imp-chk').forEach(function (c) { c.onchange = refrescarBoton; });
    if (el('imp-ok')) {
      refrescarBoton();
      el('imp-ok').onclick = async function () {
        var sel = [];
        document.querySelectorAll('.imp-chk:checked').forEach(function (c) { sel.push(importados[+c.dataset.i]); });
        if (!sel.length) return toast(t('imp_marcar_alguna'));
        var okN = 0, malN = 0;
        for (var i = 0; i < sel.length; i++) {
          var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas', {
            nombre: sel[i].nombre, tipo: 'parcela', geometry: sel[i].geometry
          }, t('esp_importando', { i: i + 1, n: sel.length }));
          if (r.data && r.data.ok) okN++;
          else { malN++; console.warn('[importar] alta falló:', sel[i].nombre, '→', r.status, r.data); }
        }
        FS.mapa.limpiarCandidatos();
        importados = [];
        ocultarHoja();
        toast(malN ? t('imp_parcial', { ok: okN, mal: malN }) : t('imp_ok', { n: okN }));
        seleccionarPredio(predioActual._id);
      };
    }
    el('imp-cancel').onclick = function () {
      FS.mapa.limpiarCandidatos();
      importados = [];
      ocultarHoja();
    };
  }

  async function leerImport(files) {
    if (!files || !files.length) return;
    toast(t('imp_leyendo'));
    var res;
    try {
      res = await FS.importar.leerArchivos(files);
      console.log('[importar]', res.cands.length, 'candidato(s) · notas:', res.notas);
    } catch (err) {
      console.error('[importar] leerArchivos lanzó', err);
      return toast(t('imp_no_entendi', { f: files[0].name }));
    }
    hojaImportar(res);
  }

  // Sábana inicial de importación: archivo, suelto sobre el mapa o
  // coordenadas UTM pegadas a mano.
  function hojaImportarInicio() {
    mostrarHoja(
      '<h2>' + t('imp_h') + '</h2>' +
      '<button class="boton" id="ii-archivo">' + t('imp_subir') + '</button>' +
      '<p class="aviso">' + t('imp_formatos') + ' ' + t('imp_soltar') + '</p>' +
      '<details class="detalles"><summary>' + t('utm_h') + '</summary>' +
      '<label class="campo"><span>' + t('nombre') + '</span><input id="utm-nombre" placeholder="' + esc(t('parcela_n', { n: (predioActual.parcelas.length || 0) + 1 })) + '"></label>' +
      '<label class="campo"><span>' + t('utm_zona') + '</span><select id="utm-zona">' +
      '<option value="19">19 S</option><option value="20" selected>20 S</option><option value="21">21 S</option></select></label>' +
      '<label class="campo"><span>' + t('utm_coords') + '</span><textarea id="utm-coords" rows="4" spellcheck="false" placeholder="801907.56, 8005241.49"></textarea></label>' +
      '<p class="aviso">' + t('utm_aviso') + '</p>' +
      '<button class="boton secundario" id="utm-ok">' + t('utm_crear') + '</button>' +
      '</details>' +
      '<button class="enlace" id="ii-volver">' + t('volver') + '</button>'
    );
    el('ii-archivo').onclick = function () {
      var inp = el('imp-archivo');
      inp.value = '';
      inp.click();
    };
    el('ii-volver').onclick = ocultarHoja;
    el('utm-ok').onclick = async function () {
      var pares = valor('utm-coords').split('\n')
        .map(function (s) { return s.split(/[,;\s]+/).map(Number); })
        .filter(function (a) { return a.length >= 2 && a.every(isFinite); });
      if (pares.length < 3) return toast(t('utm_pocos'));
      try {
        var zona = +valor('utm-zona');
        var anillo = [];
        for (var i = 0; i < pares.length; i++) anillo.push(await FS.importar.utmPunto(pares[i][0], pares[i][1], zona));
        var c = FS.importar.candidato(valor('utm-nombre') || t('parcela_n', { n: (predioActual.parcelas.length || 0) + 1 }), anillo);
        ocultarHoja();
        hojaImportar({ cands: [c], notas: [], plano: null });
      } catch (err) {
        console.warn('[importar] utm falló', err);
        toast(t('utm_malos'));
      }
    };
  }

  el('fab-importar').onclick = function () {
    if (!predioActual) return toast(t('elige_predio'));
    FS.mapa.cancelarDibujo();
    terminarDibujoUI();
    hojaImportarInicio();
  };

  el('imp-archivo').onchange = function (e) {
    // FileList es vivo: copiarlo antes de limpiar el input, si no
    // value='' lo vacía y leerImport no recibe nada.
    var fs = Array.prototype.slice.call(e.target.files);
    e.target.value = '';
    leerImport(fs);
  };

  // Soltar archivos de mapa directo sobre el mapa.
  var mapaEl = el('mapa');
  ['dragenter', 'dragover'].forEach(function (ev) {
    mapaEl.addEventListener(ev, function (e) { e.preventDefault(); mapaEl.classList.add('soltando'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    mapaEl.addEventListener(ev, function (e) { e.preventDefault(); mapaEl.classList.remove('soltando'); });
  });
  mapaEl.addEventListener('drop', function (e) {
    if (!predioActual) return toast(t('elige_predio'));
    var fs = e.dataTransfer && e.dataTransfer.files;
    if (fs && fs.length) leerImport(fs);
  });

  el('capa-quitar').onclick = function () {
    FS.mapa.quitarPlano();
    el('capa-quitar').classList.add('oculto');
  };

  // ── ficha de parcela ────────────────────────────────────
  function hojaParcela() {
    var p = parcelaActual;
    var html = '<h2>' + esc(p.nombre) + '</h2>' +
      '<p class="aviso"><span class="chip">' + esc(tipoNombre(p.tipo)) + '</span>' + (p.especieActual ? t('siembra_actual_txt') + '<b>' + esc(p.especieActual) + '</b>' : t('sin_siembra')) + '</p>' +
      '<button class="boton" id="pa-analisis">' + t('analizar') + '</button>' +
      '<button class="boton secundario" id="pa-pdf">' + t('informe_pdf') + '</button>' +
      '<h3>' + t('siembra_actual_h') + '</h3>' +
      '<label class="campo"><span>' + t('especie') + '</span><input id="pa-especie" value="' + esc(p.especieActual || '') + '" placeholder="' + t('ph_especie') + '"></label>' +
      '<label class="campo"><span>' + t('fecha_siembra') + '</span><input id="pa-fecha" type="date"></label>' +
      '<button class="boton secundario" id="pa-guardar">' + t('guardar_siembra') + '</button>' +
      '<details class="detalles"><summary>' + t('terreno_h') + '</summary>' +
      '<div class="fila">' +
      '<label class="campo"><span>' + t('riego') + '</span><select id="te-riego">' +
      '<option value="">—</option><option value="no">' + t('sin_riego') + '</option><option value="gravedad">' + t('gravedad') + '</option><option value="aspersion">' + t('aspersion') + '</option><option value="goteo">' + t('goteo') + '</option><option value="otro">' + t('otro') + '</option></select></label>' +
      '<label class="campo"><span>' + t('fuente_agua') + '</span><select id="te-agua">' +
      '<option value="">—</option><option value="pozo">' + t('pozo') + '</option><option value="rio">' + t('rio') + '</option><option value="represa">' + t('represa') + '</option><option value="red">' + t('red') + '</option><option value="otra">' + t('otra') + '</option></select></label>' +
      '</div><div class="fila">' +
      '<label class="campo"><span>' + t('pendiente') + '</span><select id="te-pend">' +
      '<option value="">—</option><option value="plano">' + t('plano') + '</option><option value="ondulado">' + t('ondulado') + '</option><option value="quebrado">' + t('quebrado') + '</option></select></label>' +
      '<label class="campo"><span>' + t('drenaje') + '</span><select id="te-dren">' +
      '<option value="">—</option><option value="bueno">' + t('bueno') + '</option><option value="regular">' + t('regular') + '</option><option value="encharca">' + t('encharca') + '</option></select></label>' +
      '</div>' +
      '<label class="campo"><span>' + t('anios_lote') + '</span><input id="te-anios" type="number" min="0" inputmode="numeric"></label>' +
      '<p class="aviso">' + t('problemas_lote') + '</p>' +
      '<div class="checks">' +
      '<label class="check"><input type="checkbox" class="te-prob" value="compactacion">' + t('compacta') + '</label>' +
      '<label class="check"><input type="checkbox" class="te-prob" value="salinidad">' + t('salino') + '</label>' +
      '<label class="check"><input type="checkbox" class="te-prob" value="pedregoso">' + t('pedregoso') + '</label>' +
      '<label class="check"><input type="checkbox" class="te-prob" value="erosion">' + t('erosion') + '</label>' +
      '<label class="check"><input type="checkbox" class="te-prob" value="malezas">' + t('maleza') + '</label>' +
      '<label class="check"><input type="checkbox" class="te-prob" value="otro">' + t('otro') + '</label>' +
      '</div>' +
      '<button class="boton secundario" id="te-guardar">' + t('guardar_terreno') + '</button>' +
      '</details>' +
      '<h3>' + t('campania_h') + '</h3>' +
      '<p class="aviso">' + t('campania_aviso') + '</p>' +
      '<label class="campo"><span>' + t('que_sembro') + '</span><input id="ca-especie" placeholder="' + t('ph_soya') + '"></label>' +
      '<div class="fila">' +
      '<label class="campo"><span>' + t('mes_siembra') + '</span><input id="ca-inicio" type="month"></label>' +
      '<label class="campo"><span>' + t('mes_cosecha') + '</span><input id="ca-fin" type="month"></label>' +
      '</div><div class="fila">' +
      '<label class="campo"><span>' + t('rendimiento') + '</span><input id="ca-rend" type="number" step="0.1" inputmode="decimal"></label>' +
      '<label class="campo"><span>' + t('unidad') + '</span><select id="ca-unidad"><option value="">—</option><option>kg/ha</option><option>qq/ha</option><option>t/ha</option><option>kg MS/ha</option></select></label>' +
      '</div>' +
      '<details class="detalles"><summary>' + t('mas_campania') + '</summary>' +
      '<label class="campo"><span>' + t('campania_libre') + '</span><input id="ca-campania" placeholder="' + t('ph_campania') + '"></label>' +
      '<label class="campo"><span>' + t('variedad') + '</span><input id="ca-variedad"></label>' +
      '<label class="campo"><span>' + t('hectareas') + '</span><input id="ca-ha" type="number" step="0.1" inputmode="decimal"></label>' +
      '<label class="campo"><span>' + t('preparacion') + '</span><select id="ca-prep">' +
      '<option value="">—</option><option value="siembra-directa">' + t('siembra_directa') + '</option><option value="labranza-convencional">' + t('lab_convencional') + '</option><option value="labranza-minima">' + t('lab_minima') + '</option><option value="otra">' + t('otra') + '</option><option value="no-sabe">' + t('no_sabe') + '</option></select></label>' +
      '<label class="campo"><span>' + t('fertilizantes') + '</span><input id="ca-fert" placeholder="' + t('ph_fert') + '"></label>' +
      '<label class="campo"><span>' + t('aplico') + '</span><select id="ca-aplic">' +
      '<option value="">—</option><option value="si">' + t('si') + '</option><option value="no">' + t('no') + '</option><option value="no-recuerda">' + t('no_recuerda') + '</option></select></label>' +
      '<p class="aviso">' + t('problemas_cultivo') + '</p>' +
      '<div class="checks">' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="sequia">' + t('sequia') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="exceso-lluvia">' + t('exceso_lluvia') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="malezas">' + t('malezas') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="plagas">' + t('plagas') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="enfermedades">' + t('enfermedades') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="deficiencias">' + t('deficiencias') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="otro">' + t('otro') + '</label>' +
      '<label class="check"><input type="checkbox" class="ca-prob" value="ninguno" id="ca-ninguno">' + t('sin_problemas') + '</label>' +
      '</div>' +
      '<label class="campo"><span>' + t('notas') + '</span><input id="ca-notas"></label>' +
      '</details>' +
      '<button class="boton secundario" id="ca-guardar">' + t('guardar_campania') + '</button>' +
      '<h3>' + t('suelo_h') + '</h3>' +
      '<div class="fila">' +
      '<label class="campo"><span>pH</span><input id="pa-ph" inputmode="decimal" type="number" step="0.1"></label>' +
      '<label class="campo"><span>' + t('mo') + '</span><input id="pa-mo" inputmode="decimal" type="number" step="0.1"></label>' +
      '</div><div class="fila">' +
      '<label class="campo"><span>N %</span><input id="pa-n" inputmode="decimal" type="number" step="0.01"></label>' +
      '<label class="campo"><span>' + t('textura') + '</span><input id="pa-tex" placeholder="' + t('ph_textura') + '"></label>' +
      '</div>' +
      '<button class="boton secundario" id="pa-suelo">' + t('guardar_analisis') + '</button>' +
      '<h3>' + t('aforo_h') + '</h3>' +
      '<div class="fila">' +
      '<label class="campo"><span>' + t('kgms') + '</span><input id="pa-aforo" inputmode="decimal" type="number"></label>' +
      '<label class="campo"><span>' + t('metodo') + '</span><input id="pa-metodo" placeholder="' + t('ph_metodo') + '"></label>' +
      '</div>' +
      '<button class="boton secundario" id="pa-aforo-ok">' + t('guardar_aforo') + '</button>' +
      '<h3>' + t('corte_h') + '</h3>' +
      '<p class="aviso">' + t('corte_aviso') + '</p>' +
      '<div class="fila">' +
      '<label class="campo"><span>' + t('tipo') + '</span><select id="pa-tipo-corte">' +
      '<option value="pastoreo">' + t('ct_pastoreo') + '</option><option value="corte">' + t('ct_corte') + '</option>' +
      '<option value="ensilaje">' + t('ct_ensilaje') + '</option><option value="desbroce">' + t('ct_desbroce') + '</option></select></label>' +
      '<label class="campo"><span>' + t('fecha') + '</span><input id="pa-fecha-corte" type="date"></label>' +
      '</div>' +
      '<button class="boton secundario" id="pa-corte-ok">' + t('guardar_corte') + '</button>' +
      _htmlHistorial(p) +
      '<h3>' + t('peligro_h') + '</h3>' +
      '<button class="boton peligro" id="pa-borrar">' + t('eliminar_parcela') + '</button>';
    mostrarHoja(html);

    el('pa-guardar').onclick = async function () {
      var r = await FS.api.put('/predios/' + predioActual._id + '/parcelas/' + p._id, {
        especieActual: valor('pa-especie') || null,
        fechaSiembraActual: valor('pa-fecha') || null
      }, t('esp_siembra'));
      if (r.data && r.data.ok) { toast(t('siembra_guardada')); seleccionarPredio(predioActual._id); }
    };
    el('te-riego').value = p.riego || '';
    el('te-agua').value = p.fuenteAgua || '';
    el('te-pend').value = p.pendiente || '';
    el('te-dren').value = p.drenaje || '';
    el('te-anios').value = p.aniosUso != null ? p.aniosUso : '';
    (p.problemasLote || []).forEach(function (v) {
      var c = document.querySelector('.te-prob[value="' + v + '"]');
      if (c) c.checked = true;
    });
    el('te-guardar').onclick = async function () {
      var r = await FS.api.put('/predios/' + predioActual._id + '/parcelas/' + p._id, {
        riego: valor('te-riego') || null,
        fuenteAgua: valor('te-agua') || null,
        pendiente: valor('te-pend') || null,
        drenaje: valor('te-dren') || null,
        aniosUso: num('te-anios'),
        problemasLote: marcados('te-prob')
      }, t('esp_terreno'));
      if (r.data && r.data.ok) { toast(t('terreno_guardado')); seleccionarPredio(predioActual._id); }
    };
    el('ca-ninguno').onchange = function () {
      if (this.checked) document.querySelectorAll('.ca-prob').forEach(function (c) { if (c.value !== 'ninguno') c.checked = false; });
    };
    document.querySelectorAll('.ca-prob').forEach(function (c) {
      if (c.value === 'ninguno') return;
      c.onchange = function () { if (this.checked) el('ca-ninguno').checked = false; };
    });
    el('ca-guardar').onclick = async function () {
      if (!valor('ca-especie')) return toast(t('campania_especie'));
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/siembras', {
        especie: valor('ca-especie'),
        variedad: valor('ca-variedad') || null,
        campania: valor('ca-campania') || null,
        superficieHa: num('ca-ha'),
        inicio: mes('ca-inicio'),
        fin: mes('ca-fin'),
        preparacion: valor('ca-prep') || null,
        fertilizantes: valor('ca-fert') || null,
        aplicaciones: valor('ca-aplic') || null,
        problemas: marcados('ca-prob'),
        rendimiento: num('ca-rend'),
        rendimientoUnidad: valor('ca-unidad') || null,
        notas: valor('ca-notas') || null
      }, t('esp_campania'));
      if (r.data && r.data.ok) { toast(t('campania_guardada')); seleccionarPredio(predioActual._id); }
    };
    el('pa-suelo').onclick = async function () {
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/suelos', {
        fecha: new Date().toISOString(), ph: num('pa-ph'), materiaOrganica: num('pa-mo'),
        nitrogeno: num('pa-n'), textura: valor('pa-tex') || null, fuente: 'laboratorio'
      }, t('esp_suelo'));
      if (r.data && r.data.ok) { toast(t('analisis_guardado')); seleccionarPredio(predioActual._id); }
    };
    el('pa-aforo-ok').onclick = async function () {
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/aforos', {
        fecha: new Date().toISOString(), kgMSHa: num('pa-aforo'), metodo: valor('pa-metodo') || null
      }, t('esp_aforo'));
      if (r.data && r.data.ok) { toast(t('aforo_guardado')); seleccionarPredio(predioActual._id); }
    };
    el('pa-corte-ok').onclick = async function () {
      var f = valor('pa-fecha-corte');
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/cortes', {
        fecha: f ? new Date(f + 'T12:00:00').toISOString() : new Date().toISOString(),
        tipo: valor('pa-tipo-corte') || 'pastoreo'
      }, t('esp_corte'));
      if (r.data && r.data.ok) { toast(t('corte_guardado')); seleccionarPredio(predioActual._id); }
    };
    el('pa-analisis').onclick = function () { hojaAnalisis(p); };
    el('pa-pdf').onclick = function () { descargarPdf(p._id); };
    el('pa-borrar').onclick = async function () {
      if (!confirm(t('confirma_borrar', { n: p.nombre }))) return;
      await FS.api.del('/predios/' + predioActual._id + '/parcelas/' + p._id, t('esp_borrando'));
      parcelaActual = null; ocultarHoja(); seleccionarPredio(predioActual._id);
    };
  }

  function _tendenciaSuelo(p) {
    if (!p.suelos || p.suelos.length < 2) return '';
    var s = p.suelos.slice().sort(function (a, b) { return Date.parse(b.fecha) - Date.parse(a.fecha); });
    var a = s[0], b = s[1];
    var partes = [];
    [['ph', 'pH'], ['materiaOrganica', 'MO %'], ['nitrogeno', 'N %']].forEach(function (par) {
      if (a[par[0]] != null && b[par[0]] != null) {
        var dif = Math.round((a[par[0]] - b[par[0]]) * 100) / 100;
        partes.push(par[1] + ' ' + b[par[0]] + ' → ' + a[par[0]] + (dif > 0 ? ' (+' : ' (') + dif + ')');
      }
    });
    return partes.length ? '<p class="aviso">' + t('suelo_tend', { f: fecha(b.fecha) }) + ' ' + partes.join(' · ') + '</p>' : '';
  }

  function _htmlHistorial(p) {
    var s = '';
    if (p.suelos && p.suelos.length) {
      s += '<h3>' + t('suelos_h') + '</h3>' + _tendenciaSuelo(p);
      p.suelos.slice().reverse().forEach(function (x) {
        s += '<p class="aviso">• ' + fecha(x.fecha) + ': pH ' + (x.ph || '—') + ', ' + t('mo').replace(' %', '') + ' ' + (x.materiaOrganica || '—') + '%, ' + esc(x.textura || '') + '</p>';
      });
    }
    if (p.cortes && p.cortes.length) {
      s += '<h3>' + t('usos_h') + '</h3>';
      p.cortes.slice().reverse().slice(0, 6).forEach(function (x) {
        s += '<p class="aviso">• ' + fecha(x.fecha) + ': ' + esc(t('ct_' + (x.tipo || 'pastoreo'))) + (x.notas ? ' · ' + esc(x.notas) : '') + '</p>';
      });
    }
    if (p.historial && p.historial.length) {
      s += '<h3>' + t('historial_h') + '</h3>';
      p.historial.slice().reverse().forEach(function (x) {
        s += '<p class="aviso">• ' + esc(x.especie) + (x.campania ? ' · ' + esc(x.campania) : '') +
          ' (' + (x.inicio ? fecha(x.inicio) : '—') + ' → ' + (x.fin ? fecha(x.fin) : t('vigente')) + ')' +
          (x.rendimiento ? ' · ' + x.rendimiento + ' ' + esc(x.rendimientoUnidad || '') : '') + '</p>';
      });
    }
    return s;
  }

  // ── análisis ────────────────────────────────────────────
  async function hojaAnalisis(p) {
    mostrarHoja('<h2>' + t('analizando', { n: esc(p.nombre) }) + '</h2><p class="aviso">' + t('consultando') + '</p>');
    var r = await FS.api.get('/predios/' + predioActual._id + '/analisis?parcela=' + p._id + '&lang=' + FS.lang, t('esp_analisis'));
    if (!(r.data && r.data.ok)) return mostrarHoja('<h2>' + t('sin_analisis') + '</h2><p class="aviso">' + esc(traducirError(r.data && r.data.error)) + '</p>');
    var d = r.data.data;
    var html = '<h2>' + esc(t('analisis_de', { n: p.nombre })) + '</h2>';
    if (d.clima) {
      html += '<p class="aviso">' + t('lluvia_anual') + '<b>' + d.clima.lluviaAnualMedia + ' mm</b> ·' + t('ultimo_mes') + '<b>' + d.clima.lluviaUltimoMes + ' mm</b>' +
        (d.clima.anomaliaLluvia != null ? ' (' + (d.clima.anomaliaLluvia > 0 ? '+' : '') + d.clima.anomaliaLluvia + '%' + t('vs_media') + ')' : '') +
        (d.clima.humedadSueloReciente != null ? t('humedad_raiz') + '<b>' + d.clima.humedadSueloReciente + '</b>' : '') + '</p>';
    }
    if (d.sueloWeb) {
      var sw = d.sueloWeb;
      var tex = t('tex_' + (sw.textura || ''));
      html += '<p class="aviso">' + t('suelo_est', {
        tex: tex !== 'tex_' + sw.textura ? tex : esc(sw.textura || '—'),
        ph: sw.ph != null ? sw.ph : '—', a: sw.arena != null ? sw.arena : '—', c: sw.arcilla != null ? sw.arcilla : '—',
        cic: sw.cec != null ? sw.cec : '—'
      }) + '</p>';
    }
    if (d.terreno && (d.terreno.ndvi != null || d.terreno.smap != null)) {
      var tr = d.terreno;
      var dif = tr.ndvi != null && tr.ndviAnt != null ? t('ndvi_dif', { v: ((tr.ndvi - tr.ndviAnt) >= 0 ? '+' : '') + (Math.round((tr.ndvi - tr.ndviAnt) * 100) / 100) }) : '';
      html += '<p class="aviso">' + t('terreno_txt', {
        ndvi: tr.ndvi != null ? tr.ndvi.toFixed(2) : '—', dif: dif,
        smap: tr.smap != null ? tr.smap.toFixed(2) : '—'
      }) + '</p>';
      if (tr.muestras > 1 && tr.ndviMin != null) {
        html += '<p class="aviso">' + t('terreno_rango', { a: tr.ndviMin.toFixed(2), b: tr.ndviMax.toFixed(2), n: tr.muestras }) + '</p>';
      }
      // Calidad del dato: la ficha más vieja marca el atraso real.
      var edadNdvi = tr.ndviFecha ? Math.round((Date.now() - Date.parse(tr.ndviFecha)) / 86400000) : null;
      var edadSmap = tr.smapFecha ? Math.round((Date.now() - Date.parse(tr.smapFecha)) / 86400000) : null;
      if (edadNdvi != null && edadNdvi > 20) html += '<p class="aviso">⚠ ' + esc(t('cal_ndvi_viejo', { d: edadNdvi })) + '</p>';
      if (edadSmap != null && edadSmap > 10) html += '<p class="aviso">⚠ ' + esc(t('cal_smap_viejo', { d: edadSmap })) + '</p>';
    }
    if (d.tiempo && (d.tiempo.mesesSecos != null || d.tiempo.pctVsAnio != null)) {
      var tm = d.tiempo, partes = [];
      if (tm.mesesSecos != null) partes.push(t('tiempo_secos', { s: tm.mesesSecos }));
      if (tm.pctVsAnio != null) partes.push(t('tiempo_lluvia', { pct: (tm.pctVsAnio > 0 ? '+' : '') + tm.pctVsAnio }));
      html += '<p class="aviso">' + t('tiempo_txt', { p: partes.join(' · ') }) + '</p>';
    }
    if (d.forraje && d.forraje.estado && d.forraje.estado !== 'sin_especie' && d.forraje.estado !== 'sin_dato') {
      var fo = d.forraje;
      var cls = fo.estado === 'punto_optimo' || fo.estado === 'punto_ensilaje' ? 'favorable_ahora'
        : fo.estado === 'pasado' || fo.estado === 'pasado_ensilaje' || fo.desacuerdo ? 'ventana_pero_seco' : 'esperar';
      html += '<h3>' + t('forraje_h') + '</h3><div class="veredicto ' + cls + '">' + esc(fo.texto) + '</div>';
      var det = [];
      if (fo.diasEfectivos != null) det.push(t('forraje_efec', { d: fo.diasEfectivos }));
      if (fo.kgMSHaEst != null) det.push(t('forraje_kgms', { v: fo.kgMSHaEst }) + (fo.areaHa ? ' (~' + Math.round(fo.kgMSHaEst * fo.areaHa) + ' kg MS)' : ''));
      if (fo.t0Fuente === 'ndvi') det.push(t('forraje_ndvi_t0'));
      if (det.length) html += '<p class="aviso">' + det.join(' · ') + '</p>';
    }
    if (d.rotacion && d.rotacion.recomendaciones) {
      html += '<h3>' + esc(t('que_sembrar', { n: p.especieActual || t('esto') })) + '</h3>';
      d.rotacion.recomendaciones.forEach(function (c, i) {
        html += '<div class="reco"><span class="puntaje">' + c.puntaje + '</span><h4>' + (i + 1) + '. ' + esc(c.especie) + '</h4>' +
          '<span class="chip">' + esc(grupoNombre(c.grupo)) + '</span> <span class="chip">' + (c.fijaN ? t('fija_n') : t('no_fija_n')) + '</span>' +
          '<ul>' + c.razones.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul>' +
          (c.notas ? '<p class="aviso">' + esc(c.notas) + '</p>' : '') + '</div>';
      });
    }
    if (d.ventana && d.ventana.ok) {
      var v = { favorable_ahora: t('veredicto_favorable'), ventana_pero_seco: t('veredicto_seco'), esperar: t('veredicto_esperar') }[d.ventana.veredicto] || d.ventana.veredicto;
      html += '<h3>' + t('ventana_h') + '</h3><div class="veredicto ' + d.ventana.veredicto + '">' + v + '</div>';
      d.ventana.ventanas.forEach(function (w) {
        html += '<p class="aviso">• ' + t('ventana_item', { a: w.desde, b: w.hasta, min: w.lluviaMinMes, max: w.lluviaMaxMes }) + '</p>';
      });
      d.ventana.riesgos.forEach(function (x) { html += '<p class="aviso">⚠ ' + esc(x) + '</p>'; });
    }
    html += '<p class="aviso">' + esc(t('fuente', { f: (d.fuentes || []).join(', ') })) + '</p>';
    html += '<button class="boton" id="an-pdf">' + t('descargar_pdf') + '</button>';
    mostrarHoja(html);
    el('an-pdf').onclick = function () { descargarPdf(p._id); };
  }

  // ── PDF ─────────────────────────────────────────────────
  async function descargarPdf(parcelaId) {
    FS.api.esperar(t('generando_pdf'));
    try {
      var res = await fetch(FS.api.informeUrl(predioActual._id, parcelaId), { headers: { Authorization: 'Bearer ' + FS.api.token() } });
      if (!res.ok) { toast(t('no_pdf')); return; }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'fieldshift-' + predioActual.nombre.replace(/\W+/g, '-').toLowerCase() + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { toast(t('no_pdf')); }
    finally { FS.api.listo(); }
  }

  // ── capas: herramienta de capas de análisis ─────────────
  function hojaCapas() {
    var html = '<h2>' + t('capas_h') + '</h2>' +
      '<p class="aviso">' + t('capas_aviso') + '</p>' +
      '<h3>' + t('capas_base') + '</h3>' +
      '<div class="checks">' +
      '<label class="check"><input type="radio" name="capa-base" value="sat"' + (FS.capas.basisAktuell() === 'sat' ? ' checked' : '') + '>' + t('capa_base_sat') + '</label>' +
      '<label class="check"><input type="radio" name="capa-base" value="osm"' + (FS.capas.basisAktuell() === 'osm' ? ' checked' : '') + '>' + t('capa_base_osm') + '</label>' +
      '</div>' +
      '<h3>' + t('capas_analisis') + '</h3>';
    FS.capas.liste().forEach(function (c) {
      html += '<div class="capa-row">' +
        '<label class="check capa-chk"><input type="checkbox" class="capa-an" data-c="' + c.id + '"' + (c.aktiv ? ' checked' : '') + '>' + esc(t(c.t)) + '</label>' +
        (c.temporal ? '<span class="chip chip-tiempo">◷</span>' : '') +
        '<input type="range" class="capa-opa" data-c="' + c.id + '" min="10" max="100" value="' + Math.round(c.opa * 100) + '"' + (c.aktiv ? '' : ' disabled') + '>' +
        '</div>';
    });
    html += '<p class="aviso">' + t('capas_fuentes') + '</p>';
    mostrarHoja(html);
    document.querySelectorAll('.capa-an').forEach(function (c) {
      c.onchange = function () {
        FS.capas.umschalten(c.dataset.c, c.checked);
        var op = document.querySelector('.capa-opa[data-c="' + c.dataset.c + '"]');
        if (op) op.disabled = !c.checked;
        el('fab-capas').classList.toggle('activo', FS.capas.liste().some(function (x) { return x.aktiv; }));
        actualizarEnfoque();
      };
    });
    document.querySelectorAll('.capa-opa').forEach(function (s) {
      s.oninput = function () { FS.capas.setOpa(s.dataset.c, s.value / 100); };
    });
    document.querySelectorAll('[name="capa-base"]').forEach(function (b) {
      b.onchange = function () { FS.capas.setBasis(b.value); };
    });
  }

  el('fab-capas').onclick = hojaCapas;

  // ── tiempo: paso de tiempo (−6 … +6 Monate) ─────────────
  var tiempoTimer = null;

  function _tiempoUI(info) {
    el('tiempo-slider').value = info.paso + 6;
    var mesNombre = info.mes.toLocaleDateString(FS.dateLocale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    el('tiempo-label').innerHTML = esc(mesNombre) + (info.proyeccion ? ' <span class="tiempo-proy">' + esc(t('tiempo_proy')) + '</span>' : '');
    var v = info.valores || {};
    var s = [];
    if (v.lluvia != null) s.push(t('tiempo_lluvia') + ' ' + v.lluvia + ' mm');
    if (v.temp != null) s.push(t('tiempo_temp') + ' ' + v.temp + ' °C');
    if (v.humedad != null) s.push(t('tiempo_humedad') + ' ' + v.humedad + ' %');
    el('tiempo-stats').textContent = s.join('  ·  ');
  }

  async function _tiempoPaso(p) { _tiempoUI(await FS.tiempo.setPaso(p)); }

  function pararTiempo() {
    if (tiempoTimer) { clearInterval(tiempoTimer); tiempoTimer = null; el('tiempo-play').textContent = '▶'; }
  }

  function abrirTiempo() {
    el('tiempo-barra').classList.remove('oculto');
    el('fab-tiempo').classList.add('activo');
    _tiempoPaso(FS.tiempo.pasoAktuell());
  }

  function cerrarTiempo() {
    pararTiempo();
    el('tiempo-barra').classList.add('oculto');
    el('fab-tiempo').classList.remove('activo');
    FS.capas.setPaso(null); // de vuelta a "actual"
  }

  el('fab-tiempo').onclick = function () {
    el('tiempo-barra').classList.contains('oculto') ? abrirTiempo() : cerrarTiempo();
  };
  el('tiempo-prev').onclick = function () { _tiempoPaso(FS.tiempo.pasoAktuell() - 1); };
  el('tiempo-next').onclick = function () { _tiempoPaso(FS.tiempo.pasoAktuell() + 1); };
  el('tiempo-close').onclick = cerrarTiempo;
  el('tiempo-play').onclick = function () {
    if (tiempoTimer) return pararTiempo();
    el('tiempo-play').textContent = '⏸';
    tiempoTimer = setInterval(function () {
      var p = FS.tiempo.pasoAktuell() + 1;
      if (p > 6) return pararTiempo();
      _tiempoPaso(p);
    }, 1600);
  };
  el('tiempo-slider').oninput = function () { _tiempoPaso(+el('tiempo-slider').value - 6); };

  // ── arranque ────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    FS.mapa.iniciar('mapa');
    FS.capas.restaurieren();
    el('fab-capas').classList.toggle('activo', FS.capas.liste().some(function (x) { return x.aktiv; }));
    await FS.auth.listo;
    if (FS.auth.get()) cargarPredios();
    else hojaEntrar('login');
  });
})();
