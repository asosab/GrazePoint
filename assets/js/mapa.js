/* mapa.js — mapa satelital (Esri World Imagery) + dibujo de polígonos.
 * Dibujo táctil: cada toque agrega un vértice; "listo" cierra el anillo.
 * Devuelve GeoJSON {type:'Polygon', coordinates:[[[lon,lat],...]]}. */
window.FS = window.FS || {};

(function () {
  var mapa = null;
  var capaParcelas = null;
  var capaImportados = null;
  var capaPlano = null;
  var capaPos = null;    // punto azul + círculo de precisión del GPS
  var watchId = null;
  var dibujo = null; // {puntos:[], polyline, vertices[], alCerrar}
  var parcelaSeleccionada = null;

  function iniciar(elId) {
    mapa = L.map(elId, { zoomControl: false, attributionControl: false, worldCopyJump: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics'
    }).addTo(mapa);
    capaParcelas = L.layerGroup().addTo(mapa);
    capaImportados = L.layerGroup().addTo(mapa);
    mapa.setView([-17.72, -63.10], 13); // Lomas de Arena, Santa Cruz

    mapa.on('click', function (e) {
      if (dibujo) _agregarVertice(e.latlng);
    });
    _posicionSiPermitida();
    return mapa;
  }

  function _estilo(parcela) {
    return { color: '#e8b64c', weight: 2, fillColor: '#8fa68e', fillOpacity: .25 };
  }

  function pintarParcelas(parcelas, alTocar) {
    capaParcelas.clearLayers();
    (parcelas || []).forEach(function (p) {
      if (!p.geometry || !p.geometry.coordinates) return;
      var latlngs = p.geometry.coordinates[0].map(function (c) { return [c[1], c[0]]; });
      var poly = L.polygon(latlngs, _estilo(p));
      poly.bindTooltip(p.nombre || (FS.t ? FS.t('parcela_generico') : 'plot'), { sticky: true });
      if (alTocar) poly.on('click', function (e) { if (!dibujo) { L.DomEvent.stop(e); alTocar(p, poly); } });
      poly.addTo(capaParcelas);
      p._capa = poly;
    });
  }

  function encuadrarParcelas(parcelas) {
    var bounds = null;
    (parcelas || []).forEach(function (p) {
      if (p._capa) bounds = bounds ? bounds.extend(p._capa.getBounds()) : p._capa.getBounds();
    });
    if (bounds) mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }

  function seleccionar(parcela) {
    if (parcelaSeleccionada && parcelaSeleccionada._capa) parcelaSeleccionada._capa.setStyle(_estilo(parcelaSeleccionada));
    parcelaSeleccionada = parcela;
    if (parcela && parcela._capa) {
      parcela._capa.setStyle({ color: '#e8b64c', weight: 3, fillColor: '#e8b64c', fillOpacity: .3 });
      mapa.fitBounds(parcela._capa.getBounds(), { padding: [40, 40], maxZoom: 17 });
    }
  }

  // ── Dibujo de polígono ──────────────────────────────────
  function empezarDibujo(alCerrar) {
    cancelarDibujo();
    dibujo = { puntos: [], vertices: [], alCerrar: alCerrar, polyline: null };
  }

  function _agregarVertice(latlng) {
    dibujo.puntos.push([latlng.lng, latlng.lat]);
    var m = L.circleMarker(latlng, { radius: 6, color: '#e8b64c', fillColor: '#e8b64c', fillOpacity: 1 }).addTo(mapa);
    dibujo.vertices.push(m);
    if (dibujo.polyline) mapa.removeLayer(dibujo.polyline);
    var lls = dibujo.puntos.map(function (c) { return [c[1], c[0]]; });
    dibujo.polyline = L.polyline(dibujo.puntos.length > 2 ? lls.concat([lls[0]]) : lls, { color: '#e8b64c', weight: 2, dashArray: '6 6' }).addTo(mapa);
  }

  function deshacerVertice() {
    if (!dibujo || !dibujo.puntos.length) return;
    dibujo.puntos.pop();
    mapa.removeLayer(dibujo.vertices.pop());
    if (dibujo.polyline) { mapa.removeLayer(dibujo.polyline); dibujo.polyline = null; }
    var lls = dibujo.puntos.map(function (c) { return [c[1], c[0]]; });
    if (lls.length) dibujo.polyline = L.polyline(lls, { color: '#e8b64c', weight: 2, dashArray: '6 6' }).addTo(mapa);
  }

  function cerrarDibujo() {
    if (!dibujo) return null;
    if (dibujo.puntos.length < 3) return null;
    var coords = dibujo.puntos.slice();
    var a = coords[0], b = coords[coords.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) coords.push([a[0], a[1]]);
    var geo = { type: 'Polygon', coordinates: [coords] };
    var cb = dibujo.alCerrar;
    _limpiarDibujo();
    if (cb) cb(geo);
    return geo;
  }

  function _limpiarDibujo() {
    if (!dibujo) return;
    dibujo.vertices.forEach(function (m) { mapa.removeLayer(m); });
    if (dibujo.polyline) mapa.removeLayer(dibujo.polyline);
    dibujo = null;
  }

  function cancelarDibujo() { _limpiarDibujo(); }
  function dibujando() { return !!dibujo; }
  function vertices() { return dibujo ? dibujo.puntos.length : 0; }

  // ── Importados: candidatos y plano georreferenciado ─────
  function pintarCandidatos(cands) {
    capaImportados.clearLayers();
    (cands || []).forEach(function (c) {
      if (!c.geometry || !c.geometry.coordinates) return;
      var latlngs = c.geometry.coordinates[0].map(function (p) { return [p[1], p[0]]; });
      var poly = L.polygon(latlngs, { color: '#4cb8e8', weight: 2, dashArray: '6 4', fillColor: '#4cb8e8', fillOpacity: .18 });
      poly.bindTooltip(c.nombre || 'candidato', { sticky: true });
      poly.addTo(capaImportados);
      c._capa = poly;
    });
  }

  function encuadrarCandidatos() {
    var b = capaImportados.getBounds();
    if (b.isValid()) mapa.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
  }

  function limpiarCandidatos() { capaImportados.clearLayers(); }

  function ponerPlano(dataUrl, bounds) {
    quitarPlano();
    capaPlano = L.imageOverlay(dataUrl, bounds, { opacity: .72 }).addTo(mapa);
  }

  function quitarPlano() {
    if (capaPlano) { mapa.removeLayer(capaPlano); capaPlano = null; }
  }

  function hayPlano() { return !!capaPlano; }

  // ── Ubicación del usuario (GPS) ─────────────────────────
  // Punto azul estilo Google Maps + círculo de precisión.
  // Si el permiso ya estaba otorgado se pinta solo al abrir.
  function _pintarPos(pos) {
    if (!mapa) return;
    var ll = [pos.coords.latitude, pos.coords.longitude];
    if (!capaPos) capaPos = L.layerGroup().addTo(mapa);
    capaPos.clearLayers();
    if (pos.coords.accuracy) {
      L.circle(ll, {
        radius: pos.coords.accuracy, color: '#4cb8e8', weight: 1,
        opacity: .5, fillColor: '#4cb8e8', fillOpacity: .12
      }).addTo(capaPos);
    }
    L.circleMarker(ll, {
      radius: 7, color: '#ffffff', weight: 2.5,
      fillColor: '#2f9be8', fillOpacity: 1
    }).addTo(capaPos);
  }

  function _vigilarPos() {
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(_pintarPos, function () {},
      { enableHighAccuracy: true, maximumAge: 10000 });
  }

  function _posicionSiPermitida() {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return;
    try {
      navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
        if (r.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(function (pos) {
          _pintarPos(pos);
          mapa.setView([pos.coords.latitude, pos.coords.longitude], 14);
        }, function () {}, { timeout: 8000 });
        _vigilarPos();
      }).catch(function () {});
    } catch (e) { /* navegador sin permissions.query para geolocation */ }
  }

  function centrarEnUsuario() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
      _pintarPos(pos);
      mapa.setView([pos.coords.latitude, pos.coords.longitude], 16);
      _vigilarPos();
    }, function () {}, { enableHighAccuracy: true, timeout: 8000 });
  }

  FS.mapa = {
    iniciar: iniciar,
    pintarParcelas: pintarParcelas,
    encuadrarParcelas: encuadrarParcelas,
    seleccionar: seleccionar,
    empezarDibujo: empezarDibujo,
    deshacerVertice: deshacerVertice,
    cerrarDibujo: cerrarDibujo,
    cancelarDibujo: cancelarDibujo,
    dibujando: dibujando,
    vertices: vertices,
    pintarCandidatos: pintarCandidatos,
    encuadrarCandidatos: encuadrarCandidatos,
    limpiarCandidatos: limpiarCandidatos,
    ponerPlano: ponerPlano,
    quitarPlano: quitarPlano,
    hayPlano: hayPlano,
    centrarEnUsuario: centrarEnUsuario,
    leaflet: function () { return mapa; }
  };
})();
