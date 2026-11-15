/* tiempo.js — Zeit-Stepper über dem Terrain.
 * 13 Schritte: −6 … 0 … +6 Monate (0 = aktueller Monat).
 * Vergangenheit: echte GIBS-Tiles + POWER-Monatswerte.
 * Zukunft ("Proyección"): gleicher Monat des Vorjahres als Tile +
 * POWER-Klimatologie als Zahlen — die "Zyklen" der Vorjahre.
 * POWER liefert CORS offen: Abruf direkt, Cache pro Koordinate. */
window.GP = window.GP || {};

(function () {
  var paso = 0;              // -6..+6
  var alCambiar = null;      // callback(info)
  var cacheClima = {};       // coordKey -> {daily, clima}
  var POWER = 'https://power.larc.nasa.gov/api';
  var PARAMS = 'PRECTOTCORR,T2M,GWETROOT';

  // ── Datum für den Schritt ───────────────────────────────
  // Vergangenheit: 15. des Zielmonats (Tag-Layer) / 01. (Monats-Layer)
  // Zukunft: gleicher Monat, Vorjahr (letzter Zyklus)
  function _mesDe(offset) {
    var n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1));
  }

  function datumFuer(offset) {
    var off = offset > 0 ? offset - 12 : offset; // Zukunft → Vorjahr
    var m = _mesDe(off);
    var hoy = new Date();
    // Tag-Layer: 15. des Monats, bei laufendem Monat auf heute-Nachlauf begrenzt
    var dia = (offset === 0) ? new Date(Date.now() - 4 * 86400000).getUTCDate() : 15;
    return m.toISOString().slice(0, 8) + String(dia).padStart(2, '0');
  }

  // ── POWER: Serie + Klimatologie ─────────────────────────
  function _coordKey() {
    var m = GP.mapa && GP.mapa.leaflet ? GP.mapa.leaflet() : null;
    if (!m) return null;
    var c = m.getCenter();
    return c.lat.toFixed(2) + ',' + c.lng.toFixed(2);
  }

  async function _cargarSerie() {
    var key = _coordKey();
    if (!key) return null;
    if (cacheClima[key]) return cacheClima[key];
    var c = key.split(',');
    var out = { daily: null, clima: null };
    try {
      var r1 = await fetch(POWER + '/temporal/daily/point?parameters=' + PARAMS +
        '&community=AG&longitude=' + c[1] + '&latitude=' + c[0] +
        '&start=' + _ymd(Date.now() - 220 * 86400000) + '&end=' + _ymd(Date.now()) +
        '&format=JSON&time-standard=UTC');
      var j1 = await r1.json();
      out.daily = j1 && j1.properties ? j1.properties.parameter : null;
    } catch (e) {}
    try {
      var r2 = await fetch(POWER + '/temporal/climatology/point?parameters=' + PARAMS +
        '&community=AG&longitude=' + c[1] + '&latitude=' + c[0] + '&format=JSON');
      var j2 = await r2.json();
      out.clima = j2 && j2.properties ? j2.properties.parameter : null;
    } catch (e) {}
    cacheClima[key] = out;
    return out;
  }

  function _ymd(ts) {
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
  }

  // Monatswerte: Vergangenheit aus daily aggregiert, Zukunft = Klimatologie
  function _valores(offset, serie) {
    var mes = _mesDe(offset);
    var mIdx = mes.getUTCMonth();
    var v = { lluvia: null, temp: null, humedad: null, proyeccion: offset > 0 };
    if (!serie) return v;
    if (offset > 0) {
      var cm = serie.clima || {};
      var diasMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mIdx];
      var k = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][mIdx];
      if (cm.PRECTOTCORR && cm.PRECTOTCORR[k] != null) v.lluvia = Math.round(cm.PRECTOTCORR[k] * diasMes);
      if (cm.T2M && cm.T2M[k] != null) v.temp = Math.round(cm.T2M[k] * 10) / 10;
      if (cm.GWETROOT && cm.GWETROOT[k] != null) v.humedad = Math.round(cm.GWETROOT[k] * 100);
    } else {
      var d = serie.daily || {};
      var prefix = mes.toISOString().slice(0, 7).replace('-', '');
      var pre = d.PRECTOTCORR || {}, t2 = d.T2M || {}, gw = d.GWETROOT || {};
      var sum = 0, ts = 0, tn = 0, gs = 0, gn = 0;
      Object.keys(pre).forEach(function (f) {
        if (f.slice(0, 6) !== prefix || pre[f] <= -900) return;
        sum += pre[f];
        if (t2[f] != null && t2[f] > -900) { ts += t2[f]; tn++; }
        if (gw[f] != null && gw[f] > -900) { gs += gw[f]; gn++; }
      });
      v.lluvia = Math.round(sum);
      if (tn) v.temp = Math.round(ts / tn * 10) / 10;
      if (gn) v.humedad = Math.round(gs / gn * 100);
    }
    return v;
  }

  // ── Schritt setzen ──────────────────────────────────────
  async function setPaso(p) {
    paso = Math.max(-6, Math.min(6, p));
    var fecha = datumFuer(paso);
    if (GP.capas && GP.capas.setPaso) GP.capas.setPaso(fecha);
    var serie = await _cargarSerie();
    var info = {
      paso: paso,
      fecha: fecha,
      mes: _mesDe(paso),
      proyeccion: paso > 0,
      valores: _valores(paso, serie)
    };
    if (alCambiar) alCambiar(info);
    return info;
  }

  function pasoAktuell() { return paso; }
  function onCambiar(cb) { alCambiar = cb; }

  GP.tiempo = {
    setPaso: setPaso,
    pasoAktuell: pasoAktuell,
    onCambiar: onCambiar,
    datumFuer: datumFuer
  };
})();
