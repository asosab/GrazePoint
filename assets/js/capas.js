/* capas.js — Analyse-Ebenen über dem Terrain.
 * Quellen: NASA GIBS (zeitfähige Raster), SoilGrids-WMS (ISRIC),
 * Esri-Referenz-Overlay. Alles ohne API-Key, direkt vom Browser.
 * FS.capas.liste() liefert den Stand für die Ebenen-Sábana;
 * FS.capas.setPaso(fecha) schiebt die zeitfähigen Layer im Stepper. */
window.FS = window.FS || {};

(function () {
  var aktive = {};   // id -> L.Layer
  var opa = {};      // id -> opazität 0..1
  var basis = 'sat'; // 'sat' | 'osm'
  var basisLayer = null;
  var fechaPaso = null; // 'YYYY-MM-DD' für zeitfähige Layer

  // ── Registry ────────────────────────────────────────────
  // res: 'tag' (freie Tageswahl), 'monat' (YYYY-MM-01), 'fix' (fest)
  var REG = [
    { id: 'ndvi',      grupo: 'gibs',  res: 'tag',   retraso: 4,   layer: 'MODIS_Terra_NDVI_8Day',                       tms: 'GoogleMapsCompatible_Level9',  zoom: 9,  t: 'capa_ndvi' },
    { id: 'lst',       grupo: 'gibs',  res: 'tag',   retraso: 3,   layer: 'MODIS_Terra_L3_Land_Surface_Temp_Daily_Day',  tms: 'GoogleMapsCompatible_Level7',  zoom: 7,  t: 'capa_lst' },
    { id: 'humedad',   grupo: 'gibs',  res: 'tag',   retraso: 5,   layer: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',    tms: 'GoogleMapsCompatible_Level6',  zoom: 6,  t: 'capa_humedad' },
    { id: 'lluvia',    grupo: 'gibs',  res: 'monat', retraso: 80,  layer: 'MERRA2_Precipitation_Bias_Corrected_Monthly', tms: 'GoogleMapsCompatible_Level6',  zoom: 6,  t: 'capa_lluvia' },
    { id: 'fuego',     grupo: 'gibs',  res: 'tag',   retraso: 1,   layer: 'MODIS_Terra_Thermal_Anomalies_All',           tms: 'GoogleMapsCompatible_Level7',  zoom: 7,  t: 'capa_fuego' },
    { id: 'verdadera', grupo: 'gibs',  res: 'tag',   retraso: 2,   layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',  tms: 'GoogleMapsCompatible_Level9',  zoom: 9,  t: 'capa_verdadera' },
    { id: 'cobertura', grupo: 'gibs',  res: 'fix',   fix: '2024-01-01', layer: 'MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual', tms: 'GoogleMapsCompatible_Level8', zoom: 8, t: 'capa_cobertura' },
    { id: 'ph',        grupo: 'wms',   map: '/map/phh2o.map', layers: 'phh2o_0-5cm_mean', t: 'capa_ph' },
    { id: 'arcilla',   grupo: 'wms',   map: '/map/clay.map',  layers: 'clay_0-5cm_mean',  t: 'capa_arcilla' },
    { id: 'soc',       grupo: 'wms',   map: '/map/soc.map',   layers: 'soc_0-5cm_mean',   t: 'capa_soc' },
    { id: 'etiquetas', grupo: 'xyz',   url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', t: 'capa_etiquetas' }
  ];

  var GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
  var WMS  = 'https://maps.isric.org/mapserv';

  var BASES = {
    sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, attr: 'Esri, Maxar, Earthstar Geographics' },
    osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attr: '© OpenStreetMap' }
  };

  function _map() { return FS.mapa && FS.mapa.leaflet ? FS.mapa.leaflet() : null; }
  function _reg(id) { return REG.find(function (r) { return r.id === id; }); }

  // ── Layer bauen ─────────────────────────────────────────
  function _bauen(r, op) {
    if (r.grupo === 'gibs') {
      var t = _fechaFuer(r);
      return L.tileLayer(GIBS + r.layer + '/default/' + t + '/' + r.tms + '/{z}/{y}/{x}.png',
        { maxZoom: 19, maxNativeZoom: r.zoom, opacity: op, zIndex: 210 });
    }
    if (r.grupo === 'wms') {
      return L.tileLayer.wms(WMS + '?map=' + encodeURIComponent(r.map), {
        layers: r.layers, format: 'image/png', transparent: true,
        opacity: op, zIndex: 210, version: '1.1.1'
      });
    }
    return L.tileLayer(r.url, { maxZoom: 19, opacity: op, zIndex: 220 });
  }

  // Auf das zuletzt veröffentlichte Datum kappen: NASA braucht pro
  // Produkt Tage bis Monate Nachlauf, sonst kommt nur ein Fehler-Tile.
  function _fechaFuer(r) {
    if (r.res === 'fix') return r.fix;
    var cap = new Date(Date.now() - (r.retraso || 0) * 86400000);
    var f = fechaPaso ? new Date(fechaPaso + 'T00:00:00Z') : cap;
    if (f > cap) f = cap;
    if (r.res === 'monat') return f.toISOString().slice(0, 8) + '01';
    return f.toISOString().slice(0, 10);
  }

  // ── Öffentlich ──────────────────────────────────────────
  function umschalten(id, an) {
    var r = _reg(id), m = _map();
    if (!r || !m) return;
    if (an && !aktive[id]) {
      aktive[id] = _bauen(r, opa[id] != null ? opa[id] : .6);
      aktive[id].addTo(m);
    } else if (!an && aktive[id]) {
      m.removeLayer(aktive[id]);
      delete aktive[id];
    }
    _speichern();
  }

  function setOpa(id, v) {
    opa[id] = Math.max(0, Math.min(1, v));
    if (aktive[id] && aktive[id].setOpacity) aktive[id].setOpacity(opa[id]);
    _speichern();
  }

  function setBasis(b) {
    if (!BASES[b] || b === basis) return;
    basis = b;
    var m = _map();
    if (!m) return;
    var nb = BASES[b];
    var nl = L.tileLayer(nb.url, { maxZoom: nb.maxZoom, zIndex: 1 });
    nl.addTo(m);
    if (basisLayer) m.removeLayer(basisLayer);
    basisLayer = nl;
    nl.bringToBack();
    _speichern();
  }

  // Zeit-Punkt für alle zeitfähigen Layer setzen (Stepper).
  // fecha: 'YYYY-MM-DD' | null (null = heute-Nachlauf)
  function setPaso(fecha) {
    fechaPaso = fecha;
    REG.forEach(function (r) {
      var l = aktive[r.id];
      if (!l || r.grupo !== 'gibs' || r.res === 'fix') return;
      l.setUrl(GIBS + r.layer + '/default/' + _fechaFuer(r) + '/' + r.tms + '/{z}/{y}/{x}.png');
    });
  }

  function istAktiv(id) { return !!aktive[id]; }
  function opaDe(id) { return opa[id] != null ? opa[id] : .6; }

  function liste() {
    return REG.map(function (r) {
      return { id: r.id, t: r.t, aktiv: istAktiv(r.id), opa: opaDe(r.id), temporal: r.grupo === 'gibs' && r.res !== 'fix' };
    });
  }

  // ── Persistenz ──────────────────────────────────────────
  function _speichern() {
    try {
      localStorage.setItem('fs_capas', JSON.stringify({ basis: basis, opa: opa, an: Object.keys(aktive) }));
    } catch (e) {}
  }

  function restaurieren() {
    var m = _map();
    if (!m) return;
    try {
      var s = JSON.parse(localStorage.getItem('fs_capas') || 'null');
      if (!s) return;
      if (s.opa) opa = s.opa;
      if (s.basis && BASES[s.basis]) setBasis(s.basis);
      (s.an || []).forEach(function (id) { if (_reg(id)) umschalten(id, true); });
    } catch (e) {}
  }

  // Für den Basis-Wechsel: mapa.js kennt seinen Esri-Layer nicht,
  // darum fängt setBasis den alten Layer über den Tile-Container.
  function _ersteBasisLayer() { return basisLayer; }
  function registriereBasis(l) { basisLayer = l; }

  FS.capas = {
    liste: liste,
    umschalten: umschalten,
    setOpa: setOpa,
    setBasis: setBasis,
    setPaso: setPaso,
    istAktiv: istAktiv,
    opaDe: opaDe,
    restaurieren: restaurieren,
    registriereBasis: registriereBasis,
    basisAktuell: function () { return basis; }
  };
})();
