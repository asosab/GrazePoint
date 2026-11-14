/* app.js — orquestación de la vista: mapa satelital + sábana inferior.
 * Flujo: entrar → crear predio → dibujar parcela → análisis → PDF. */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var hoja = el('hoja'), cuerpo = el('hoja-cuerpo');
  var predios = [], predioActual = null, parcelaActual = null;
  var modoDibujo = null; // {uso:'nueva'|'editar'}

  // ── utilidades ──────────────────────────────────────────
  function toast(msg, ms) {
    var t = el('toast');
    t.textContent = msg; t.classList.remove('oculto');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.add('oculto'); }, ms || 2800);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mostrarHoja(html) { cuerpo.innerHTML = html; hoja.classList.remove('oculto'); }
  function ocultarHoja() { hoja.classList.add('oculto'); }
  function valor(id) { var n = document.getElementById(id); return n ? n.value.trim() : ''; }
  function num(id) { var v = valor(id); return v === '' ? null : Number(v); }

  el('hoja-asa').addEventListener('click', ocultarHoja);

  // ── auth UI ─────────────────────────────────────────────
  var emailPendiente = null;

  function hojaEntrar(modo) {
    modo = modo || 'login';
    if (modo === 'login') {
      mostrarHoja(
        '<h2>Entrar</h2>' +
        '<label class="campo"><span>Correo</span><input id="a-email" type="email" autocomplete="email" inputmode="email"></label>' +
        '<label class="campo"><span>Clave</span><input id="a-clave" type="password" autocomplete="current-password"></label>' +
        '<button class="boton" id="a-entrar">Entrar</button>' +
        '<button class="enlace" id="a-olvide">Olvidé mi clave</button>' +
        '<button class="enlace" id="a-registro">Crear cuenta nueva</button>'
      );
      el('a-entrar').onclick = async function () {
        var r = await FS.auth.login(valor('a-email'), valor('a-clave'));
        if (!r.data) return toast('Sin conexión');
        if (r.data.ok) { ocultarHoja(); toast('Hola de nuevo'); return; }
        if (r.data.requiereVerificacion) { emailPendiente = valor('a-email'); return hojaCodigo('verificar'); }
        toast(traducirError(r.data.error));
      };
      el('a-olvide').onclick = function () { hojaRecuperar(); };
      el('a-registro').onclick = function () { hojaEntrar('registro'); };
    } else {
      mostrarHoja(
        '<h2>Crear cuenta</h2>' +
        '<label class="campo"><span>Nombre</span><input id="a-nombre" type="text" autocomplete="name"></label>' +
        '<label class="campo"><span>Correo</span><input id="a-email" type="email" autocomplete="email" inputmode="email"></label>' +
        '<label class="campo"><span>Clave (mínimo 8)</span><input id="a-clave" type="password" autocomplete="new-password"></label>' +
        '<button class="boton" id="a-crear">Registrarme</button>' +
        '<button class="enlace" id="a-login">Ya tengo cuenta</button>'
      );
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
      '<h2>' + (tipo === 'reset' ? 'Restablecer clave' : 'Verifica tu correo') + '</h2>' +
      '<p class="aviso">Te mandamos un código de 6 dígitos a <b>' + esc(emailPendiente) + '</b>. Revisa también spam.</p>' +
      '<label class="campo"><span>Código</span><input id="a-codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="letter-spacing:6px;text-align:center;font-size:1.3rem"></label>' +
      (tipo === 'reset' ? '<label class="campo"><span>Clave nueva (mínimo 8)</span><input id="a-clave2" type="password" autocomplete="new-password"></label>' : '') +
      '<button class="boton" id="a-ok">Continuar</button>' +
      '<button class="enlace" id="a-reenviar">Reenviar código</button>'
    );
    el('a-ok').onclick = async function () {
      var ok;
      if (tipo === 'reset') ok = await FS.auth.restablecer(emailPendiente, valor('a-codigo'), valor('a-clave2'));
      else ok = await FS.auth.verificar(emailPendiente, valor('a-codigo'));
      if (ok) { ocultarHoja(); toast('Listo, ya estás dentro'); }
      else toast('Código incorrecto o vencido');
    };
    el('a-reenviar').onclick = async function () {
      if (tipo === 'reset') await FS.auth.recuperar(emailPendiente);
      else await FS.auth.reenviar(emailPendiente);
      toast('Código reenviado');
    };
  }

  function hojaRecuperar() {
    mostrarHoja(
      '<h2>Recuperar clave</h2>' +
      '<label class="campo"><span>Correo</span><input id="a-email" type="email" inputmode="email"></label>' +
      '<button class="boton" id="a-mandar">Mandarme un código</button>' +
      '<button class="enlace" id="a-login">Volver</button>'
    );
    el('a-mandar').onclick = async function () {
      emailPendiente = valor('a-email');
      await FS.auth.recuperar(emailPendiente);
      hojaCodigo('reset');
    };
    el('a-login').onclick = function () { hojaEntrar('login'); };
  }

  function traducirError(e) {
    return {
      credenciales_invalidas: 'Correo o clave incorrectos',
      email_ya_registrado: 'Ese correo ya tiene cuenta: entra directo',
      clave_minima_8: 'La clave necesita al menos 8 caracteres',
      email_invalido: 'Revisa el correo',
      bloqueado_temporal: 'Demasiados intentos: espera unos minutos',
      espera_unos_segundos: 'Espera unos segundos antes de reenviar'
    }[e] || 'Algo falló: ' + (e || 'sin conexión');
  }

  // ── cuenta ──────────────────────────────────────────────
  function hojaCuenta() {
    var u = FS.auth.get();
    mostrarHoja(
      '<h2>' + esc(u.nombre || u.email) + '</h2>' +
      '<p class="aviso"><span class="chip">' + esc(u.rol) + '</span> ' + esc(u.email) + '</p>' +
      '<button class="boton secundario" id="c-salir">Cerrar sesión</button>'
    );
    el('c-salir').onclick = function () { FS.auth.salir(); ocultarHoja(); toast('Sesión cerrada'); };
  }

  el('btn-cuenta').onclick = function () {
    FS.auth.get() ? hojaCuenta() : hojaEntrar('login');
  };

  FS.auth.alCambiar(function (u) {
    el('btn-cuenta').textContent = u ? (u.nombre || u.email).split(' ')[0] : 'Entrar';
    if (u) cargarPredios();
    else { predios = []; predioActual = null; FS.mapa.pintarParcelas([]); ocultarHoja(); }
  });

  // ── predios ─────────────────────────────────────────────
  async function cargarPredios() {
    var r = await FS.api.get('/predios');
    predios = (r.data && r.data.ok) ? r.data.data : [];
    if (!predioActual && predios.length) seleccionarPredio(predios[0]._id);
    if (predioActual) {
      var sigue = predios.find(function (p) { return p._id === predioActual._id; });
      if (!sigue) predioActual = null;
    }
    if (predioActual) refrescarParcelas();
  }

  function hojaPredios() {
    var html = '<h2>Mis predios</h2>';
    predios.forEach(function (p) {
      html += '<button class="item-lista" data-p="' + p._id + '"><span class="titulo">' + esc(p.nombre) +
        '<span class="detalle">' + (p.parcelas || []).length + ' parcela(s)</span></span>' +
        (predioActual && p._id === predioActual._id ? '<span class="chip">activo</span>' : '') + '</button>';
    });
    html += '<button class="boton" id="p-nuevo">+ Registrar predio</button>';
    if (!predios.length) html += '<p class="aviso">Todavía no tienes predios. Registra el primero y dibuja sus parcelas sobre el mapa.</p>';
    mostrarHoja(html);
    document.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () { seleccionarPredio(b.dataset.p); ocultarHoja(); };
    });
    el('p-nuevo').onclick = hojaNuevoPredio;
  }

  function hojaNuevoPredio() {
    mostrarHoja(
      '<h2>Nuevo predio</h2>' +
      '<label class="campo"><span>Nombre</span><input id="np-nombre" placeholder="Ej. La Esperanza"></label>' +
      '<label class="campo"><span>Descripción (opcional)</span><textarea id="np-desc" rows="2"></textarea></label>' +
      '<button class="boton" id="np-ok">Crear predio</button>' +
      '<button class="enlace" id="np-ubicar">Usar mi ubicación para centrar el mapa</button>'
    );
    el('np-ubicar').onclick = function () { FS.mapa.centrarEnUsuario(); toast('Centrando en tu GPS…'); };
    el('np-ok').onclick = async function () {
      if (!valor('np-nombre')) return toast('Ponle un nombre');
      var r = await FS.api.post('/predios', { nombre: valor('np-nombre'), descripcion: valor('np-desc') || null });
      if (r.data && r.data.ok) {
        predioActual = r.data.data;
        await cargarPredios();
        ocultarHoja();
        toast('Predio creado. Ahora dibuja tu primera parcela.');
        empezarDibujoParcela();
      } else toast('No se pudo crear');
    };
  }

  async function seleccionarPredio(id) {
    var r = await FS.api.get('/predios/' + id);
    if (!(r.data && r.data.ok)) return toast('No pude cargar el predio');
    predioActual = r.data.data;
    parcelaActual = null;
    refrescarParcelas();
    FS.mapa.encuadrarParcelas(predioActual.parcelas);
    el('fab-dibujar').classList.remove('oculto');
    if (!predioActual.parcelas.length) toast('Sin parcelas aún: toca ✎ para dibujar la primera');
  }

  function refrescarParcelas() {
    if (!predioActual) return FS.mapa.pintarParcelas([]);
    FS.mapa.pintarParcelas(predioActual.parcelas, function (p) {
      parcelaActual = p;
      FS.mapa.seleccionar(p);
      hojaParcela();
    });
  }

  // ── dibujo de parcela ───────────────────────────────────
  function empezarDibujoParcela() {
    if (!predioActual) return toast('Primero elige o crea un predio');
    modoDibujo = { uso: 'nueva' };
    FS.mapa.empezarDibujo(async function (geo) {
      var nombre = prompt('Nombre de la parcela o potrero', 'Parcela ' + ((predioActual.parcelas.length || 0) + 1));
      if (!nombre) { toast('Dibujo descartado'); return; }
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas', {
        nombre: nombre, tipo: 'potrero', geometry: geo
      });
      if (r.data && r.data.ok) { toast('Parcela guardada'); seleccionarPredio(predioActual._id); }
      else toast('No se pudo guardar');
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
    if (FS.mapa.vertices() < 3) return toast('Marca al menos 3 vértices');
    FS.mapa.cerrarDibujo();
    terminarDibujoUI();
  };

  // ── ficha de parcela ────────────────────────────────────
  function hojaParcela() {
    var p = parcelaActual;
    var html = '<h2>' + esc(p.nombre) + '</h2>' +
      '<p class="aviso"><span class="chip">' + esc(p.tipo) + '</span>' + (p.especieActual ? ' siembra actual: <b>' + esc(p.especieActual) + '</b>' : ' sin siembra registrada') + '</p>' +
      '<button class="boton" id="pa-analisis">Analizar (rotación + ventana)</button>' +
      '<button class="boton secundario" id="pa-pdf">Informe PDF</button>' +
      '<h3>Siembra actual</h3>' +
      '<label class="campo"><span>Especie</span><input id="pa-especie" value="' + esc(p.especieActual || '') + '" placeholder="Ej. Brachiaria decumbens"></label>' +
      '<label class="campo"><span>Fecha de siembra</span><input id="pa-fecha" type="date"></label>' +
      '<button class="boton secundario" id="pa-guardar">Guardar siembra</button>' +
      '<h3>Suelo (PRIAS)</h3>' +
      '<div class="fila">' +
      '<label class="campo"><span>pH</span><input id="pa-ph" inputmode="decimal" type="number" step="0.1"></label>' +
      '<label class="campo"><span>MO %</span><input id="pa-mo" inputmode="decimal" type="number" step="0.1"></label>' +
      '</div><div class="fila">' +
      '<label class="campo"><span>N %</span><input id="pa-n" inputmode="decimal" type="number" step="0.01"></label>' +
      '<label class="campo"><span>Textura</span><input id="pa-tex" placeholder="arenosa…"></label>' +
      '</div>' +
      '<button class="boton secundario" id="pa-suelo">Guardar análisis</button>' +
      '<h3>Aforo</h3>' +
      '<div class="fila">' +
      '<label class="campo"><span>kg MS/ha</span><input id="pa-aforo" inputmode="decimal" type="number"></label>' +
      '<label class="campo"><span>Método</span><input id="pa-metodo" placeholder="cuadrante…"></label>' +
      '</div>' +
      '<button class="boton secundario" id="pa-aforo-ok">Guardar aforo</button>' +
      _htmlHistorial(p) +
      '<h3>Peligro</h3>' +
      '<button class="boton peligro" id="pa-borrar">Eliminar parcela</button>';
    mostrarHoja(html);

    el('pa-guardar').onclick = async function () {
      var r = await FS.api.put('/predios/' + predioActual._id + '/parcelas/' + p._id, {
        especieActual: valor('pa-especie') || null,
        fechaSiembraActual: valor('pa-fecha') || null
      });
      if (r.data && r.data.ok) { toast('Siembra guardada'); seleccionarPredio(predioActual._id); }
    };
    el('pa-suelo').onclick = async function () {
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/suelos', {
        fecha: new Date().toISOString(), ph: num('pa-ph'), materiaOrganica: num('pa-mo'),
        nitrogeno: num('pa-n'), textura: valor('pa-tex') || null, fuente: 'laboratorio'
      });
      if (r.data && r.data.ok) { toast('Análisis guardado'); seleccionarPredio(predioActual._id); }
    };
    el('pa-aforo-ok').onclick = async function () {
      var r = await FS.api.post('/predios/' + predioActual._id + '/parcelas/' + p._id + '/aforos', {
        fecha: new Date().toISOString(), kgMSHa: num('pa-aforo'), metodo: valor('pa-metodo') || null
      });
      if (r.data && r.data.ok) { toast('Aforo guardado'); seleccionarPredio(predioActual._id); }
    };
    el('pa-analisis').onclick = function () { hojaAnalisis(p); };
    el('pa-pdf').onclick = function () { descargarPdf(p._id); };
    el('pa-borrar').onclick = async function () {
      if (!confirm('¿Eliminar la parcela "' + p.nombre + '"?')) return;
      await FS.api.del('/predios/' + predioActual._id + '/parcelas/' + p._id);
      parcelaActual = null; ocultarHoja(); seleccionarPredio(predioActual._id);
    };
  }

  function _htmlHistorial(p) {
    var s = '';
    if (p.suelos && p.suelos.length) {
      s += '<h3>Análisis de suelo registrados</h3>';
      p.suelos.slice().reverse().forEach(function (x) {
        s += '<p class="aviso">• ' + new Date(x.fecha).toLocaleDateString('es-BO') + ': pH ' + (x.ph || '—') + ', MO ' + (x.materiaOrganica || '—') + '%, ' + esc(x.textura || '') + '</p>';
      });
    }
    if (p.historial && p.historial.length) {
      s += '<h3>Historial</h3>';
      p.historial.slice().reverse().forEach(function (x) {
        s += '<p class="aviso">• ' + esc(x.especie) + ' (' + (x.inicio ? new Date(x.inicio).toLocaleDateString('es-BO') : '—') + ' → ' + (x.fin ? new Date(x.fin).toLocaleDateString('es-BO') : 'vigente') + ')</p>';
      });
    }
    return s;
  }

  // ── análisis ────────────────────────────────────────────
  async function hojaAnalisis(p) {
    mostrarHoja('<h2>Analizando ' + esc(p.nombre) + '…</h2><p class="aviso">Consultando NASA POWER y cruzando con tu suelo.</p>');
    var r = await FS.api.get('/predios/' + predioActual._id + '/analisis?parcela=' + p._id);
    if (!(r.data && r.data.ok)) return mostrarHoja('<h2>Sin análisis</h2><p class="aviso">' + esc((r.data && r.data.error) || 'sin conexión') + '</p>');
    var d = r.data.data;
    var html = '<h2>' + esc(p.nombre) + ' — análisis</h2>';
    if (d.clima) {
      html += '<p class="aviso">Lluvia anual media: <b>' + d.clima.lluviaAnualMedia + ' mm</b> · último mes: <b>' + d.clima.lluviaUltimoMes + ' mm</b>' +
        (d.clima.anomaliaLluvia != null ? ' (' + (d.clima.anomaliaLluvia > 0 ? '+' : '') + d.clima.anomaliaLluvia + '% vs media)' : '') +
        (d.clima.humedadSueloReciente != null ? ' · humedad raíz: <b>' + d.clima.humedadSueloReciente + '</b>' : '') + '</p>';
    }
    if (d.rotacion && d.rotacion.recomendaciones) {
      html += '<h3>Qué sembrar después de ' + esc(p.especieActual || 'esto') + '</h3>';
      d.rotacion.recomendaciones.forEach(function (c, i) {
        html += '<div class="reco"><span class="puntaje">' + c.puntaje + '</span><h4>' + (i + 1) + '. ' + esc(c.especie) + '</h4>' +
          '<span class="chip">' + esc(c.grupo) + '</span> <span class="chip">' + (c.fijaN ? 'fija N' : 'no fija N') + '</span>' +
          '<ul>' + c.razones.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul>' +
          (c.notas ? '<p class="aviso">' + esc(c.notas) + '</p>' : '') + '</div>';
      });
    }
    if (d.ventana && d.ventana.ok) {
      var v = { favorable_ahora: 'Favorable para sembrar ahora', ventana_pero_seco: 'En ventana, pero viene seco', esperar: 'Mejor esperar' }[d.ventana.veredicto] || d.ventana.veredicto;
      html += '<h3>Ventana de siembra forrajera</h3><div class="veredicto ' + d.ventana.veredicto + '">' + v + '</div>';
      d.ventana.ventanas.forEach(function (w) {
        html += '<p class="aviso">• Ventana: <b>' + w.desde + ' a ' + w.hasta + '</b> (' + w.lluviaMinMes + '–' + w.lluviaMaxMes + ' mm/mes)</p>';
      });
      d.ventana.riesgos.forEach(function (x) { html += '<p class="aviso">⚠ ' + esc(x) + '</p>'; });
    }
    html += '<p class="aviso">Fuente: ' + esc((d.fuentes || []).join(', ')) + '</p>';
    html += '<button class="boton" id="an-pdf">Descargar informe PDF</button>';
    mostrarHoja(html);
    el('an-pdf').onclick = function () { descargarPdf(p._id); };
  }

  // ── PDF ─────────────────────────────────────────────────
  async function descargarPdf(parcelaId) {
    toast('Generando informe…');
    try {
      var res = await fetch(FS.api.informeUrl(predioActual._id, parcelaId), { headers: { Authorization: 'Bearer ' + FS.api.token() } });
      if (!res.ok) return toast('No se pudo generar');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'fieldshift-' + predioActual.nombre.replace(/\W+/g, '-').toLowerCase() + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { toast('No se pudo generar'); }
  }

  // ── arranque ────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    FS.mapa.iniciar('mapa');
    await FS.auth.listo;
    if (FS.auth.get()) cargarPredios();
    else hojaEntrar('login');
  });
})();
