/* importar.js — lee archivos de mapa y devuelve parcelas candidatas.
 * Formatos: GeoJSON, KML, KMZ, Shapefile (.zip o .shp/.dbf/.prj sueltos),
 * GPX, CSV (columnas lat/lon o wkt), WKT y GeoPDF (vectores + plano
 * georreferenciado sobre el mapa cuando hay /VP).
 * Todo se normaliza a { nombre, geometry: Polygon lon/lat WGS84 }.
 * Las librerías pesadas (jszip, shp.js, pdf.js, proj4) se cargan por CDN
 * solo cuando el archivo lo pide. */
window.FS = window.FS || {};

(function () {
  var LIBS = {
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    shp: 'https://cdn.jsdelivr.net/npm/shpjs@6.1.0/dist/shp.min.js',
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdflib: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    proj4: 'https://cdn.jsdelivr.net/npm/proj4@2.11.0/dist/proj4.js'
  };
  var _cargando = {};

  function lib(nombre) {
    if (_cargando[nombre]) return _cargando[nombre];
    _cargando[nombre] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIBS[nombre];
      s.onload = resolve;
      s.onerror = function () { reject(new Error('no_lib_' + nombre)); };
      document.head.appendChild(s);
    });
    return _cargando[nombre];
  }

  // ── utilidades geométricas ──────────────────────────────
  function cerrarAnillo(pts) {
    var p = pts.slice();
    if (p.length < 3) return null;
    var a = p[0], b = p[p.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) p.push([a[0], a[1]]);
    return p;
  }

  // Shoelace con signo: <0 antihorario en el plano lon/lat.
  function areaAnillo(anillo) {
    var s = 0;
    for (var i = 0; i < anillo.length - 1; i++) {
      s += (anillo[i + 1][0] - anillo[i][0]) * (anillo[i + 1][1] + anillo[i][1]);
    }
    return s / 2;
  }

  // GeoJSON y el índice 2dsphere de Mongo piden exterior antihorario
  // y huecos horarios.
  function orientar(coords) {
    if (!coords || !coords.length) return coords;
    if (areaAnillo(coords[0]) > 0) coords[0] = coords[0].slice().reverse();
    for (var i = 1; i < coords.length; i++) {
      if (areaAnillo(coords[i]) < 0) coords[i] = coords[i].slice().reverse();
    }
    return coords;
  }

  function areaHa(geometry) {
    var anillo = geometry.coordinates[0];
    var lat = 0, i;
    for (i = 0; i < anillo.length; i++) lat += anillo[i][1];
    lat = lat / anillo.length * Math.PI / 180;
    var mx = 111320 * Math.cos(lat), my = 110540;
    var s = 0;
    for (i = 0; i < anillo.length - 1; i++) {
      s += anillo[i][0] * mx * anillo[i + 1][1] * my - anillo[i + 1][0] * mx * anillo[i][1] * my;
    }
    return Math.abs(s) / 2 / 10000;
  }

  function cascoConvexo(pts) {
    var u = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (u.length < 3) return null;
    function cruz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var h = [], i;
    for (i = 0; i < u.length; i++) {
      while (h.length >= 2 && cruz(h[h.length - 2], h[h.length - 1], u[i]) <= 0) h.pop();
      h.push(u[i]);
    }
    var inf = h.length + 1;
    for (i = u.length - 2; i >= 0; i--) {
      while (h.length >= inf && cruz(h[h.length - 2], h[h.length - 1], u[i]) <= 0) h.pop();
      h.push(u[i]);
    }
    h.pop();
    return h;
  }

  function enRango(geom) {
    var anillo = geom.coordinates[0];
    for (var i = 0; i < anillo.length; i++) {
      if (Math.abs(anillo[i][0]) > 180 || Math.abs(anillo[i][1]) > 90) return false;
    }
    return true;
  }

  // ── reproyección (proj4, solo si hace falta) ────────────
  var _defsListos = false;
  function _registrarDefs() {
    if (_defsListos || typeof proj4 === 'undefined') return;
    for (var z = 1; z <= 60; z++) {
      var zz = (z < 10 ? '0' : '') + z;
      proj4.defs('EPSG:326' + zz, '+proj=utm +zone=' + z + ' +datum=WGS84 +units=m +no_defs');
      proj4.defs('EPSG:327' + zz, '+proj=utm +zone=' + z + ' +south +datum=WGS84 +units=m +no_defs');
      if (z >= 11 && z <= 25) {
        // SIRGAS2000 (~WGS84) y PSAD56, las familias usuales en Sudamérica.
        // PSAD56 → WGS84 con el set oficial para Bolivia (EPSG:1217).
        proj4.defs('EPSG:319' + (60 + z), '+proj=utm +zone=' + z + ' +south +ellps=GRS80 +units=m +no_defs');
        proj4.defs('EPSG:319' + (54 + z), '+proj=utm +zone=' + z + ' +ellps=GRS80 +units=m +no_defs');
        proj4.defs('EPSG:292' + zz, '+proj=utm +zone=' + z + ' +south +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs');
        proj4.defs('EPSG:291' + zz, '+proj=utm +zone=' + z + ' +ellps=intl +towgs84=-288,175,-376,0,0,0,0 +units=m +no_defs');
      }
    }
    _defsListos = true;
  }

  function _epsgDeCrs(crs) {
    if (!crs) return null;
    var s = String((crs.properties && (crs.properties.name || crs.properties.href)) || crs.name || crs);
    var m = s.match(/EPSG[:/]+(\d{4,5})/i);
    return m ? 'EPSG:' + m[1] : null;
  }

  function _reproyectarGeom(geom, epsg) {
    var t = proj4(epsg, 'EPSG:4326');
    geom.coordinates = geom.coordinates.map(function (anillo) {
      return anillo.map(function (c) { var p = t.forward(c); return [p[0], p[1]]; });
    });
    return geom;
  }

  // Corrige geometrías que no salen en lon/lat: usa el crs declarado
  // o asume UTM 20S WGS84 (lo común en Bolivia). Devuelve aviso o null.
  async function _arreglarProyeccion(cands, crs) {
    var sucios = cands.filter(function (c) { return !enRango(c.geometry); });
    if (!sucios.length) return null;
    await lib('proj4');
    _registrarDefs();
    var epsg = _epsgDeCrs(crs);
    var crudo = (crs && crs.properties && crs.properties.name) || '';
    var asumido = false;
    if (epsg && !proj4.defs[epsg]) epsg = null;
    if (!epsg && crudo.length > 20) {
      // crs como WKT/proj4 crudo: proj4 lo entiende directo.
      try { proj4(crudo); epsg = crudo; } catch (e) { epsg = null; }
    }
    if (!epsg) { epsg = 'EPSG:32720'; asumido = true; }
    sucios.forEach(function (c) {
      try { _reproyectarGeom(c.geometry, epsg); } catch (e) { c.mal = true; }
    });
    return asumido ? FS.t('imp_crs_asumido') : null;
  }

  // ── GeoJSON ─────────────────────────────────────────────
  function _nombreProps(props, i) {
    if (props) {
      var n = props.name || props.nombre || props.NAME || props.Nombre || props.NOMBRE || props.id;
      if (n != null && String(n).trim()) return String(n).trim().slice(0, 120);
    }
    return null;
  }

  function _deGeometria(g, nombre, out) {
    if (!g) return;
    var i;
    if (g.type === 'Polygon') {
      out.push({ nombre: nombre, geometry: { type: 'Polygon', coordinates: g.coordinates } });
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach(function (poly, k) {
        out.push({ nombre: nombre + (g.coordinates.length > 1 ? ' (' + (k + 1) + ')' : ''), geometry: { type: 'Polygon', coordinates: poly } });
      });
    } else if (g.type === 'LineString') {
      var anillo = cerrarAnillo(g.coordinates);
      if (anillo) out.push({ nombre: nombre, geometry: { type: 'Polygon', coordinates: [anillo] } });
    } else if (g.type === 'MultiLineString') {
      g.coordinates.forEach(function (lin, k) {
        var a = cerrarAnillo(lin);
        if (a) out.push({ nombre: nombre + (g.coordinates.length > 1 ? ' (' + (k + 1) + ')' : ''), geometry: { type: 'Polygon', coordinates: [a] } });
      });
    } else if (g.type === 'MultiPoint' || g.type === 'Point') {
      var pts = g.type === 'Point' ? [g.coordinates] : g.coordinates;
      var hull = cascoConvexo(pts);
      if (hull) out.push({ nombre: nombre, geometry: { type: 'Polygon', coordinates: [cerrarAnillo(hull)] }, dePuntos: true });
    }
  }

  function deGeoJSON(obj) {
    var out = [], i;
    var crs = obj && obj.crs;
    function feat(f, k) {
      var nombre = _nombreProps(f.properties, k) || FS.t('parcela_n', { n: out.length + 1 });
      _deGeometria(f.geometry, nombre, out);
    }
    if (obj.type === 'FeatureCollection') (obj.features || []).forEach(feat);
    else if (obj.type === 'Feature') feat(obj, 0);
    else if (obj && obj.type) _deGeometria(obj, FS.t('parcela_generico'), out);
    else if (Array.isArray(obj)) obj.forEach(feat); // shp.combine devuelve array de features
    cands_crs = cands_crs || crs;
    return out;
  }

  // ── KML ─────────────────────────────────────────────────
  function _coordsKML(el) {
    var txt = (el.textContent || '').trim();
    return txt.split(/\s+/).map(function (p) {
      var v = p.split(',');
      return [parseFloat(v[0]), parseFloat(v[1])];
    }).filter(function (c) { return isFinite(c[0]) && isFinite(c[1]); });
  }

  function _hijos(el, tag) {
    return Array.prototype.slice.call(el.getElementsByTagNameNS('*', tag).length
      ? el.getElementsByTagNameNS('*', tag) : el.getElementsByTagName(tag));
  }

  function _polygonKML(poly) {
    var anillos = [];
    var outer = _hijos(poly, 'outerBoundaryIs')[0];
    if (!outer) return null;
    var ext = _hijos(outer, 'coordinates')[0];
    if (!ext) return null;
    anillos.push(cerrarAnillo(_coordsKML(ext)));
    _hijos(poly, 'innerBoundaryIs').forEach(function (inner) {
      var c = _hijos(inner, 'coordinates')[0];
      if (c) { var a = cerrarAnillo(_coordsKML(c)); if (a) anillos.push(a); }
    });
    return anillos[0] ? anillos : null;
  }

  function deKML(texto) {
    var doc = new DOMParser().parseFromString(texto, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('kml_malo');
    var out = [];
    var placemarks = _hijos(doc, 'Placemark');
    placemarks.forEach(function (pm) {
      var nEl = _hijos(pm, 'name')[0];
      var nombre = nEl && nEl.textContent.trim() ? nEl.textContent.trim().slice(0, 120) : null;
      var parte = 0;
      function nom() {
        parte++;
        var base = nombre || FS.t('parcela_n', { n: out.length + 1 });
        return parte > 1 ? base + ' (' + parte + ')' : base;
      }
      _hijos(pm, 'Polygon').forEach(function (poly) {
        var anillos = _polygonKML(poly);
        if (anillos) out.push({ nombre: nom(), geometry: { type: 'Polygon', coordinates: anillos } });
      });
      _hijos(pm, 'LineString').forEach(function (lin) {
        var c = _hijos(lin, 'coordinates')[0];
        var anillo = c && cerrarAnillo(_coordsKML(c));
        if (anillo) out.push({ nombre: nom(), geometry: { type: 'Polygon', coordinates: [anillo] } });
      });
      // Placemark con puros puntos → casco.
      var pts = _hijos(pm, 'Point').map(function (p) {
        var c = _hijos(p, 'coordinates')[0];
        return c ? _coordsKML(c)[0] : null;
      }).filter(Boolean);
      if (pts.length >= 3) {
        var hull = cascoConvexo(pts);
        if (hull) out.push({ nombre: nom(), geometry: { type: 'Polygon', coordinates: [cerrarAnillo(hull)] }, dePuntos: true });
      }
    });
    return out;
  }

  // ── GPX ─────────────────────────────────────────────────
  function deGPX(texto) {
    var doc = new DOMParser().parseFromString(texto, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('gpx_malo');
    var out = [];
    function nombreDe(el, def) {
      var n = _hijos(el, 'name')[0];
      return n && n.textContent.trim() ? n.textContent.trim().slice(0, 120) : def;
    }
    _hijos(doc, 'trk').forEach(function (trk, i) {
      var pts = [];
      _hijos(trk, 'trkpt').forEach(function (p) {
        pts.push([parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))]);
      });
      var anillo = cerrarAnillo(pts);
      if (anillo) out.push({ nombre: nombreDe(trk, FS.t('parcela_n', { n: i + 1 })), geometry: { type: 'Polygon', coordinates: [anillo] } });
    });
    _hijos(doc, 'rte').forEach(function (rte) {
      var pts = _hijos(rte, 'rtept').map(function (p) {
        return [parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))];
      });
      var anillo = cerrarAnillo(pts);
      if (anillo) out.push({ nombre: nombreDe(rte, FS.t('parcela_n', { n: out.length + 1 })), geometry: { type: 'Polygon', coordinates: [anillo] } });
    });
    var wpts = _hijos(doc, 'wpt').map(function (p) {
      return [parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))];
    }).filter(function (c) { return isFinite(c[0]) && isFinite(c[1]); });
    if (wpts.length >= 3) {
      var hull = cascoConvexo(wpts);
      if (hull) out.push({ nombre: FS.t('imp_waypoints', { n: wpts.length }), geometry: { type: 'Polygon', coordinates: [cerrarAnillo(hull)] }, dePuntos: true });
    }
    return out;
  }

  // ── CSV / WKT ───────────────────────────────────────────
  function deCSV(texto) {
    var lineas = texto.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lineas.length) return [];
    var sep = lineas[0].indexOf(';') >= 0 ? ';' : (lineas[0].indexOf('\t') >= 0 ? '\t' : ',');
    var cab = lineas[0].split(sep).map(function (h) { return h.trim().toLowerCase().replace(/^"|"$/g, ''); });
    var iLat = -1, iLon = -1, iNom = -1, iWkt = -1;
    cab.forEach(function (h, i) {
      if (/^(lat|latitude|latitud|y)$/.test(h)) iLat = i;
      if (/^(lon|lng|long|longitud|longitude|x)$/.test(h)) iLon = i;
      if (/^(name|nombre|id|punto|point|parcela)$/.test(h)) iNom = i;
      if (/wkt|geom/.test(h)) iWkt = i;
    });
    if (iWkt >= 0) {
      var out = [];
      lineas.slice(1).forEach(function (l, i) {
        var cols = l.split(sep);
        try {
          var gs = deWKT(cols[iWkt].replace(/^"|"$/g, ''));
          gs.forEach(function (g) { out.push({ nombre: iNom >= 0 ? cols[iNom] : g.nombre, geometry: g.geometry }); });
        } catch (e) { /* fila mala */ }
      });
      return out;
    }
    if (iLat < 0 || iLon < 0) throw new Error('csv_malo');
    var grupos = {}, orden = [];
    lineas.slice(1).forEach(function (l) {
      var cols = l.split(sep);
      var lon = parseFloat(cols[iLon]), lat = parseFloat(cols[iLat]);
      if (!isFinite(lon) || !isFinite(lat)) return;
      var g = iNom >= 0 ? (cols[iNom] || '?').trim() : '';
      if (!grupos[g]) { grupos[g] = []; orden.push(g); }
      grupos[g].push([lon, lat]);
    });
    return orden.map(function (g, i) {
      var pts = grupos[g];
      var anillo = cerrarAnillo(pts);
      if (!anillo) return null;
      return { nombre: g || FS.t('parcela_n', { n: i + 1 }), geometry: { type: 'Polygon', coordinates: [anillo] } };
    }).filter(Boolean);
  }

  // WKT: POINT | LINESTRING | POLYGON | MULTIPOLYGON (anidado simple).
  function deWKT(texto) {
    var out = [];
    var re = /(MULTIPOLYGON|POLYGON|LINESTRING|POINT)\s*(?:Z|M|ZM)?\s*\((.+)\)\s*$/i;
    var m = texto.trim().match(re);
    if (!m) throw new Error('wkt_malo');
    var tipo = m[1].toUpperCase(), cuerpo = m[2];
    function nums(s) {
      return s.split(',').map(function (p) {
        var v = p.trim().split(/\s+/);
        return [parseFloat(v[0]), parseFloat(v[1])];
      }).filter(function (c) { return isFinite(c[0]) && isFinite(c[1]); });
    }
    function anillosDe(s) {
      // "(x y, x y), (x y, x y)" → lista de anillos.
      var anillos = [], prof = 0, ini = -1;
      for (var i = 0; i < s.length; i++) {
        if (s[i] === '(') { if (!prof) ini = i + 1; prof++; }
        else if (s[i] === ')') { prof--; if (!prof && ini >= 0) { anillos.push(cerrarAnillo(nums(s.slice(ini, i)))); ini = -1; } }
      }
      if (!anillos.length) { var a = cerrarAnillo(nums(s)); if (a) anillos.push(a); }
      return anillos.filter(Boolean);
    }
    if (tipo === 'POLYGON') {
      out.push({ geometry: { type: 'Polygon', coordinates: anillosDe(cuerpo) } });
    } else if (tipo === 'MULTIPOLYGON') {
      var prof = 0, ini = -1;
      for (var i = 0; i < cuerpo.length; i++) {
        if (cuerpo[i] === '(') { if (!prof) ini = i + 1; prof++; }
        else if (cuerpo[i] === ')') { prof--; if (!prof && ini >= 0) { out.push({ geometry: { type: 'Polygon', coordinates: anillosDe(cuerpo.slice(ini, i)) } }); ini = -1; } }
      }
    } else if (tipo === 'LINESTRING') {
      var a = cerrarAnillo(nums(cuerpo));
      if (a) out.push({ geometry: { type: 'Polygon', coordinates: [a] } });
    }
    return out;
  }

  // ── Shapefile ───────────────────────────────────────────
  async function _shpSuelto(grupo) {
    await lib('shp');
    var shpF = grupo['shp'], dbfF = grupo['dbf'], prjF = grupo['prj'];
    if (!shpF) return null;
    var prj = prjF ? await prjF.text() : undefined;
    var geoms = shp.parseShp(await shpF.arrayBuffer(), prj);
    if (!geoms || !geoms.length) return [];
    var datos = dbfF ? shp.parseDbf(await dbfF.arrayBuffer()) : [];
    return deGeoJSON(shp.combine([geoms, datos]));
  }

  async function _zipOShape(buf) {
    await lib('shp');
    try {
      return deGeoJSON(await shp(buf)); // zip con .shp/.dbf/.prj adentro
    } catch (e) {
      // no era shapefile: probar como KMZ o zip con geojson
      await lib('jszip');
      var zip = await JSZip.loadAsync(buf);
      var kmlFile = null, gjFile = null;
      zip.forEach(function (ruta, f) {
        if (/\.kml$/i.test(ruta) && !kmlFile) kmlFile = f;
        if (/\.(geojson|json)$/i.test(ruta) && !gjFile) gjFile = f;
      });
      if (kmlFile) return deKML(await kmlFile.async('text'));
      if (gjFile) return deGeoJSON(JSON.parse(await gjFile.async('text')));
      throw new Error('zip_malo');
    }
  }

  // ── GeoPDF ──────────────────────────────────────────────
  // Saca la georreferencia /VP → /Measure de la página y arma la
  // función punto-de-página → [lon,lat]. Devuelve null si no hay.
  function _medidaPdf(d) {
    var g = d.gpts;
    if (!d.bbox || !g || g.length < 8) return null;
    var gpts = [[g[1], g[0]], [g[3], g[2]], [g[5], g[4]], [g[7], g[6]]]; // [lon,lat] × ll,lr,ur,ul
    var x0 = +d.bbox[0], y0 = +d.bbox[1], x1 = +d.bbox[2], y1 = +d.bbox[3];
    function aGeo(px, py) {
      var u = (px - x0) / (x1 - x0), v = (py - y0) / (y1 - y0);
      var lo = gpts[0][0] * (1 - u) + gpts[1][0] * u;
      var la = gpts[0][1] * (1 - u) + gpts[1][1] * u;
      var lo2 = gpts[3][0] * (1 - u) + gpts[2][0] * u;
      var la2 = gpts[3][1] * (1 - u) + gpts[2][1] * u;
      return [lo * (1 - v) + lo2 * v, la * (1 - v) + la2 * v];
    }
    return { bbox: [x0, y0, x1, y1], aGeo: aGeo };
  }

  // Camino rápido: /VP en texto plano dentro del PDF (sin descomprimir).
  function _geoDePdfCrudo(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    var zona = null;
    var m = s.match(/\/VP\s+(\d+)\s+(\d+)\s+R/);
    if (m) {
      var mo = s.match(new RegExp(m[1] + '\\s+' + m[2] + '\\s+obj([\\s\\S]{0,4000})'));
      if (mo) zona = mo[1];
    }
    if (!zona) {
      var mv = s.match(/\/VP\s*(\[[\s\S]{0,6000}?\/Measure[\s\S]{0,3000}?>>)/);
      if (mv) zona = mv[1];
    }
    if (!zona) return null;
    var bmatch = zona.match(/\/BBox\s*\[([^\]]+)\]/);
    var gmatch = zona.match(/\/GPTS\s*\[([^\]]+)\]/);
    if (!bmatch || !gmatch) return null;
    function arr(t) { return t.trim().split(/\s+/).map(Number).filter(isFinite); }
    return _medidaPdf({ bbox: arr(bmatch[1]), gpts: arr(gmatch[1]) });
  }

  // Fallback con pdf-lib: resuelve refs y objetos comprimidos (ObjStm).
  async function _geoDePdfLibro(buf) {
    await lib('pdflib');
    var pdfDoc = await PDFLib.PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true });
    var node = pdfDoc.getPages()[0].node;
    function numArr(a) {
      return Array.prototype.map.call(a.asArray(), function (o) {
        return Number(o.asNumber ? o.asNumber() : o.valueOf());
      }).filter(isFinite);
    }
    var vp = node.lookup(PDFLib.PDFName.of('VP'));
    for (var i = 0; vp && vp.size && i < vp.size(); i++) {
      var v = vp.lookup(i);
      var bbox = v.lookup(PDFLib.PDFName.of('BBox'));
      var mea = v.lookup(PDFLib.PDFName.of('Measure'));
      var gpts = mea && mea.lookup(PDFLib.PDFName.of('GPTS'));
      if (bbox && gpts) return _medidaPdf({ bbox: numArr(bbox), gpts: numArr(gpts) });
    }
    return null;
  }

  async function _geoDePdf(buf) {
    return _geoDePdfCrudo(buf) || await _geoDePdfLibro(buf);
  }

  // Multiplicación de matrices [a b c d e f] estilo PDF.
  function _mul(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  async function dePDF(buf, nombreBase) {
    await lib('pdf');
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdf.replace('pdf.min.js', 'pdf.worker.min.js');
    // Ojo: getDocument transfiere el buffer al worker y lo deja vacío;
    // por eso pdf.js recibe una copia y el original queda para el /VP.
    var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    var page = await doc.getPage(1);
    var geo = null;
    try { geo = await _geoDePdf(buf); } catch (e) { /* sin VP */ }
    var res = { cands: [], plano: null, georref: !!geo };

    // Plano: página renderizada puesta como imagen sobre el mapa.
    if (geo) {
      var canvas = document.createElement('canvas');
      var escala = Math.min(2.5, 2400 / page.getViewport({ scale: 1 }).width);
      var viewport = page.getViewport({ scale: escala });
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      var lats = [], lons = [];
      [[geo.bbox[0], geo.bbox[1]], [geo.bbox[2], geo.bbox[3]]].forEach(function (p) {
        var ll = geo.aGeo(p[0], p[1]);
        lons.push(ll[0]); lats.push(ll[1]);
      });
      res.plano = {
        dataUrl: canvas.toDataURL('image/png'),
        bounds: [[Math.min.apply(null, lats), Math.min.apply(null, lons)], [Math.max.apply(null, lats), Math.max.apply(null, lons)]]
      };
    }

    // Vectores: recorro la lista de operadores traduciendo CTM.
    if (geo && pdfjsLib.OPS) {
      try {
        var OPS = pdfjsLib.OPS;
        var ops = await page.getOperatorList();
        var ctm = [1, 0, 0, 1, 0, 0], pila = [], vistos = {};
        function tx(x, y) { return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]; }
        function dentro(b, p) {
          var dx = (b[2] - b[0]) * .05, dy = (b[3] - b[1]) * .05;
          return p[0] >= b[0] - dx && p[0] <= b[2] + dx && p[1] >= b[1] - dy && p[1] <= b[3] + dy;
        }
        for (var i = 0; i < ops.fnArray.length; i++) {
          var f = ops.fnArray[i], a = ops.argsArray[i];
          if (f === OPS.save) pila.push(ctm.slice());
          else if (f === OPS.restore) ctm = pila.pop() || ctm;
          else if (f === OPS.transform) ctm = _mul(ctm, a);
          else if (f === OPS.constructPath && a && a[0] && a[1]) {
            var sub = [], anillos = [], j = 0;
            a[0].forEach(function (op) {
              if (op === OPS.moveTo) {
                if (sub.length >= 3) anillos.push(sub);
                sub = [tx(a[1][j], a[1][j + 1])]; j += 2;
              } else if (op === OPS.lineTo) { sub.push(tx(a[1][j], a[1][j + 1])); j += 2; }
              else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
                // curvas: me quedo con el punto final, el trazo se aproxima
                var n = op === OPS.curveTo ? 6 : 4;
                for (var k = 2; k < n; k += 2) sub.push(tx(a[1][j + k], a[1][j + k + 1]));
                j += n;
              } else if (op === OPS.rectangle) {
                var rx = a[1][j], ry = a[1][j + 1], rw = a[1][j + 2], rh = a[1][j + 3]; j += 4;
                sub.push(tx(rx, ry), tx(rx + rw, ry), tx(rx + rw, ry + rh), tx(rx, ry + rh));
              } else if (op === OPS.closePath) {
                if (sub.length >= 3) { anillos.push(sub); sub = []; }
              } else { j += 2; }
            });
            if (sub.length >= 3) anillos.push(sub);
            anillos.forEach(function (anillo) {
              if (!anillo.every(function (p) { return dentro(geo.bbox, p); })) return;
              var ll = anillo.map(function (p) { return geo.aGeo(p[0], p[1]); });
              var clave = ll.map(function (c) { return c[0].toFixed(5) + ',' + c[1].toFixed(5); }).join('|');
              if (vistos[clave]) return;
              vistos[clave] = 1;
              var ring = cerrarAnillo(ll);
              if (ring && Math.abs(areaAnillo(ring)) > 1e-10) {
                res.cands.push({ nombre: '', geometry: { type: 'Polygon', coordinates: [ring] } });
              }
            });
          }
        }
      } catch (e) { /* sin vectores legibles: queda el plano */ }
    }
    res.cands.forEach(function (c, i) { c.nombre = nombreBase + ' ' + (i + 1); });
    return res;
  }

  // ── entrada principal ───────────────────────────────────
  var cands_crs = null;

  async function leerArchivos(fileList) {
    var cands = [], notas = [], plano = null;
    var shpGrupo = {};
    var files = Array.prototype.slice.call(fileList);
    cands_crs = null;

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var ext = (f.name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
      var base = f.name.replace(/\.[^.]+$/, '');
      try {
        if (ext === 'kml') {
          cands = cands.concat(deKML(await f.text()));
        } else if (ext === 'geojson' || ext === 'json') {
          cands = cands.concat(deGeoJSON(JSON.parse(await f.text())));
        } else if (ext === 'gpx') {
          cands = cands.concat(deGPX(await f.text()));
        } else if (ext === 'csv') {
          cands = cands.concat(deCSV(await f.text()));
        } else if (ext === 'wkt' || ext === 'txt') {
          var txt = await f.text();
          try { deWKT(txt).forEach(function (g, k) { cands.push({ nombre: base + (k ? ' ' + k : ''), geometry: g.geometry }); }); }
          catch (e) { cands = cands.concat(deCSV(txt)); }
        } else if (ext === 'kmz') {
          cands = cands.concat(await _zipOShape(await f.arrayBuffer()));
        } else if (ext === 'zip') {
          cands = cands.concat(await _zipOShape(await f.arrayBuffer()));
        } else if (['shp', 'dbf', 'prj', 'shx', 'cpg', 'sbn', 'sbx'].indexOf(ext) >= 0) {
          shpGrupo[ext] = f;
        } else if (ext === 'pdf') {
          var r = await dePDF(await f.arrayBuffer(), base);
          cands = cands.concat(r.cands);
          if (r.plano) plano = r.plano;
          if (!r.georref) notas.push(FS.t('imp_sin_georef'));
        } else {
          notas.push(FS.t('imp_no_entendi', { f: f.name }));
        }
      } catch (e) {
        notas.push(FS.t('imp_no_entendi', { f: f.name }));
      }
    }

    if (shpGrupo['shp']) {
      try { cands = cands.concat(await _shpSuelto(shpGrupo)); }
      catch (e) { notas.push(FS.t('imp_no_entendi', { f: shpGrupo['shp'].name })); }
    }

    // Proyección + saneamiento.
    var avisoCrs = await _arreglarProyeccion(cands, cands_crs);
    if (avisoCrs) notas.push(avisoCrs);
    cands = cands.filter(function (c) {
      if (c.mal || !enRango(c.geometry)) return false;
      c.geometry.coordinates = orientar(c.geometry.coordinates);
      return c.geometry.coordinates[0] && c.geometry.coordinates[0].length >= 4;
    });
    // Nombre por defecto donde falte.
    cands.forEach(function (c, i) {
      if (!c.nombre) c.nombre = FS.t('parcela_n', { n: i + 1 });
      c.ha = Math.round(areaHa(c.geometry) * 10) / 10;
    });
    var dePuntos = cands.filter(function (c) { return c.dePuntos; }).length;
    if (dePuntos) notas.push(FS.t('imp_de_puntos', { n: dePuntos }));
    return { cands: cands, notas: notas, plano: plano };
  }

  FS.importar = { leerArchivos: leerArchivos };
})();
