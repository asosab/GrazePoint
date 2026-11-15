// grabar-tour.js — recorrido completo de la app para el video demo,
// con marcas de escena para montar subtítulos después.
//
// A diferencia de grabar.js (flujo corto login→PDF), este cubre todo:
// landing → login → predio → importar parcela → ficha completa
// (siembra, campaña, suelo, aforo, corte) → segunda parcela → capas
// GIBS/SoilGrids → enfoque de parcela → paso de tiempo → sábana de
// potreros (hato + copiar) → análisis → PDF → vínculo Telegram.
//
// En cada escena escribe una marca {escena, t} (segundos desde que
// arranca el video) en --marcas (def: <out>/marcas.json). Con ese
// archivo, subtitulos.js genera el .ass/.srt y quema los textos.
//
// Uso:
//   node grabar-tour.js --creds ../../../.tmp/creds.json --archivo "D:/x.kmz"
//   node grabar-tour.js --url https://asosab.github.io/GrazePoint/es/app/ ...
//
// Flags (además de los de grabar.js: --api --predio --desc --parcela
// --creds --email --clave --device --width --height --out --salida
// --ritmo --timeout --no-mp4 --no-pdf-view --headed --archivo):
//   --marcas        ruta del JSON de marcas (def: <out>/marcas.json)
//   --no-landing    no muestra la portada antes de entrar a la app
//   --capas         ids a activar, separados por coma (def: ndvi,humedad)
//   --especie       siembra actual parcela 1 (def: 'Brachiaria brizantha')
//   --siembra-dias  días atrás de la siembra (def: 40)
//   --especie2      especie parcela 2, '' la salta (def: 'Sorgo forrajero')
//   --siembra2-dias días atrás parcela 2 (def: 55)
//   --ultimo-especie / --ultimo-inicio YYYY-MM / --ultimo-fin /
//   --ultimo-rend / --ultimo-unidad  (campaña anterior)
//   --suelo-ph --suelo-mo --suelo-n   (análisis de laboratorio)
//   --aforo         kg MS/ha (def: 1800)   --metodo  método de aforo
//   --corte-dias    días atrás del pastoreo/corte (def: 30)
//   --hato-cabezas --hato-peso        (def: 25 / 450)
//   --sin-*         para saltar escenas: campania, suelo, aforo, corte,
//                   parcela2, capas, tiempo, forraje, telegram, landing
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..', '..');

function args() {
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const o = {
    url: 'https://asosab.github.io/GrazePoint/app/',
    predio: 'Demo Farm', desc: '', parcela: 'Plot 1',
    especie: 'Brachiaria brizantha', 'siembra-dias': '40',
    especie2: 'Sorgo forrajero', 'siembra2-dias': '55',
    'ultimo-especie': 'Soya', 'ultimo-inicio': '', 'ultimo-fin': '',
    'ultimo-rend': '2800', 'ultimo-unidad': 'kg/ha',
    'suelo-ph': '5.8', 'suelo-mo': '2.4', 'suelo-n': '',
    aforo: '1800', metodo: '', 'corte-dias': '30',
    'hato-cabezas': '25', 'hato-peso': '450',
    capas: 'ndvi,humedad',
    device: 'Pixel 7', ritmo: '1', timeout: '150000',
    out: path.join(REPO, '.tmp', 'videos', ts),
    salida: 'grazepoint-tour-' + ts
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k.startsWith('no-') || k.startsWith('sin-') || k === 'headed' || k === 'debug') o[k] = true;
    else { o[k] = a[i + 1]; i++; }
  }
  return o;
}

const CFG = args();
const RITMO = parseFloat(CFG.ritmo) || 1;
const MARCAS = [];
let T0 = 0;
function marcar(id) { MARCAS.push({ escena: id, t: Math.round((Date.now() - T0) / 100) / 10 }); }

function credenciales() {
  if (CFG.creds) return JSON.parse(fs.readFileSync(CFG.creds, 'utf8'));
  if (CFG.email && CFG.clave) return { email: CFG.email, clave: CFG.clave };
  throw new Error('faltan credenciales: pasá --creds ruta.json o --email/--clave');
}

function hayFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

function ymd(diasAtras) {
  return new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
}

function ym(mesesAtras) {
  const d = new Date(Date.now() - mesesAtras * 30.4 * 86400000);
  return d.toISOString().slice(0, 7);
}

// Centro de cada polígono parcela en coordenadas de pantalla.
// La máscara de enfoque también es un L.Polygon (mundo con hueco) pero
// va con interactive:false — ese flag la excluye.
function puntosParcelas(page) {
  return page.evaluate(() => {
    const map = GP.mapa.leaflet();
    const pts = [];
    map.eachLayer(l => {
      if (l instanceof L.Polygon && l.options.interactive !== false) {
        const c = map.latLngToContainerPoint(l.getBounds().getCenter());
        pts.push({ x: c.x, y: c.y });
      }
    });
    return pts;
  });
}

// Toca la parcela i-ésima (0 = primera) hasta que abra su sábana.
// El centro de bounds puede caer fuera en polígonos cóncavos: si un
// punto no abre nada, prueba con los demás.
async function abrirParcela(page, tocar, i) {
  const pts = await puntosParcelas(page);
  if (!pts.length) throw new Error('no hay polígonos de parcela');
  const orden = [pts[i], ...pts.filter((_, j) => j !== i)].filter(Boolean);
  for (const pt of orden) {
    await tocar(pt.x, pt.y);
    try {
      await page.waitForSelector('#pa-analisis', { timeout: 4000 });
      return true;
    } catch (e) { /* probar el siguiente punto */ }
  }
  throw new Error('ninguna parcela abrió su sábana');
}

async function scrollHoja(page, pxPorTick, tickMs, durMs) {
  await page.evaluate(([px, t]) => {
    const c = document.getElementById('hoja-cuerpo');
    const id = setInterval(() => {
      c.scrollTop += px;
      if (c.scrollTop + c.clientHeight >= c.scrollHeight) clearInterval(id);
    }, t);
  }, [pxPorTick, tickMs]);
  await new Promise(r => setTimeout(r, durMs));
}

(async () => {
  const creds = credenciales();
  fs.mkdirSync(CFG.out, { recursive: true });
  const rutaMarcas = CFG.marcas || path.join(CFG.out, 'marcas.json');
  const pausa = (p, ms) => p.waitForTimeout(Math.round(ms * RITMO));
  const guardarMarcas = () => {
    try { fs.writeFileSync(rutaMarcas, JSON.stringify(MARCAS, null, 1)); } catch (e) {}
  };

  const dev = devices[CFG.device] || devices['Pixel 7'];
  const size = {
    width: parseInt(CFG.width, 10) || dev.viewport.width,
    height: parseInt(CFG.height, 10) || dev.viewport.height
  };
  const browser = await chromium.launch({ headless: !CFG.headed });
  const context = await browser.newContext({
    ...dev, locale: 'en-US',
    viewport: size,
    recordVideo: { dir: CFG.out, size },
    permissions: ['clipboard-read', 'clipboard-write'] // fo-copiar
  });
  T0 = Date.now();
  // El aviso de almacenamiento (#gp-consent) tapa los clics: aceptarlo antes.
  await context.addInitScript(() => { try { localStorage.setItem('gp_consent', '1'); } catch (e) {} });
  const page = await context.newPage();
  const tocar = (x, y) => (dev.hasTouch !== false ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  let dialogoTxt = CFG.parcela;
  page.on('dialog', d => d.accept(dialogoTxt));

  // --api http://localhost|127.x: Chrome bloquea público→loopback
  // (Private Network Access / mixed content). En vez de pelear flags,
  // se interceptan las requests al API y se responden desde Node: el
  // browser no sale a la red y CORS se satisface con headers propios.
  if (CFG.api) {
    const apiBase = CFG.api.replace(/\/$/, '');
    await context.route(apiBase + '/**', async route => {
      const req = route.request();
      try {
        const h = { ...req.headers() };
        delete h.host; delete h['content-length']; delete h.origin;
        const r = await fetch(req.url(), {
          method: req.method(), headers: h,
          body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer()
        });
        const headers = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        headers['access-control-allow-origin'] = '*';
        route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
      } catch (e) {
        route.fulfill({
          status: 502, headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ ok: false, error: 'proxy: ' + e.message })
        });
      }
    });
  }
  page.on('console', m => { if (m.type() !== 'log' || CFG.debug) console.log('[pg]', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pgerr]', e.message));

  const url = CFG.url + (CFG.api ? (CFG.url.includes('?') ? '&' : '?') + 'api=' + encodeURIComponent(CFG.api) : '');

  let pdf = null;
  try {
    // ── landing ──────────────────────────────────────────
    if (!CFG['no-landing'] && !CFG['sin-landing']) {
      const landing = CFG.url.replace(/(es\/)?app\/?$/, '$1');
      marcar('landing');
      await page.goto(landing, { waitUntil: 'domcontentloaded' });
      await pausa(page, 2500);
      await page.evaluate(() => {
        let y = 0;
        const t = setInterval(() => { y += 26; window.scrollTo(0, y); if (y >= document.body.scrollHeight - innerHeight) clearInterval(t); }, 70);
      });
      await pausa(page, 6500);
    }

    // ── login ────────────────────────────────────────────
    marcar('login');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#a-email', { timeout: 25000 });
    await pausa(page, 1500);
    await page.type('#a-email', creds.email, { delay: 65 });
    await page.type('#a-clave', creds.clave, { delay: 65 });
    await pausa(page, 700);
    await page.click('#a-entrar');
    await page.waitForSelector('#hoja.oculto', { state: 'attached', timeout: 25000 });
    await pausa(page, 2200);

    // ── predio nuevo ─────────────────────────────────────
    marcar('predio');
    await page.click('#fab-predios');
    await page.waitForSelector('#p-nuevo');
    await pausa(page, 1200);
    await page.click('#p-nuevo');
    await page.waitForSelector('#np-nombre');
    await pausa(page, 800);
    await page.type('#np-nombre', CFG.predio, { delay: 80 });
    if (CFG.desc) await page.type('#np-desc', CFG.desc, { delay: 40 });
    await pausa(page, 900);
    await page.click('#np-ok');
    await page.waitForSelector('#dibujo-barra:not(.oculto)', { timeout: 15000 });
    await pausa(page, 1500);
    await page.click('#dibujo-cerrar');
    await pausa(page, 800);

    // ── importar o dibujar parcela ───────────────────────
    marcar('importar');
    if (CFG.archivo) {
      await page.click('#fab-importar');
      await page.waitForSelector('#ii-archivo', { timeout: 10000 });
      await pausa(page, 1500);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        page.click('#ii-archivo')
      ]);
      await chooser.setFiles(CFG.archivo);
      await page.waitForSelector('#imp-ok', { timeout: 30000 });
      await pausa(page, 3000);
      await page.click('#imp-ok');
    } else {
      await page.click('#fab-dibujar');
      const vp = page.viewportSize();
      const cx = vp.width / 2, cy = vp.height / 2;
      for (const [dx, dy] of [[-90, -60], [90, -70], [100, 80], [-80, 90]]) {
        await tocar(cx + dx, cy + dy);
        await pausa(page, 600);
      }
      await pausa(page, 800);
      await page.click('#dibujo-listo');
    }
    await page.waitForSelector('#hoja.oculto', { state: 'attached', timeout: 40000 });
    await page.waitForFunction(() => {
      let n = 0;
      GP.mapa.leaflet().eachLayer(l => { if (l instanceof L.Polygon && l.options.interactive !== false) n++; });
      return n > 0;
    }, null, { timeout: 20000 });
    await pausa(page, 3000);

    // ── parcelas sobre el satélite → abrir ficha ─────────
    marcar('parcelas');
    await pausa(page, 2500);
    await abrirParcela(page, tocar, 0);
    await pausa(page, 1500);

    // ── siembra actual ───────────────────────────────────
    if (!CFG['sin-siembra']) {
      marcar('siembra');
      await page.type('#pa-especie', CFG.especie, { delay: 60 });
      await page.fill('#pa-fecha', ymd(+CFG['siembra-dias'] || 40));
      await pausa(page, 700);
      await page.click('#pa-guardar');
      await pausa(page, 2800);
    }

    // ── campaña anterior ─────────────────────────────────
    if (!CFG['sin-campania']) {
      marcar('campania');
      await scrollHoja(page, 55, 70, 2600);
      await page.fill('#ca-especie', CFG['ultimo-especie']);
      await page.fill('#ca-inicio', CFG['ultimo-inicio'] || ym(13));
      await page.fill('#ca-fin', CFG['ultimo-fin'] || ym(8));
      if (CFG['ultimo-rend']) await page.fill('#ca-rend', CFG['ultimo-rend']);
      if (CFG['ultimo-unidad']) await page.selectOption('#ca-unidad', CFG['ultimo-unidad']);
      await pausa(page, 800);
      await page.click('#ca-guardar');
      await pausa(page, 2800);
    }

    // ── suelo de laboratorio ─────────────────────────────
    if (!CFG['sin-suelo']) {
      marcar('suelo');
      await scrollHoja(page, 55, 70, 2200);
      if (CFG['suelo-ph']) await page.fill('#pa-ph', CFG['suelo-ph']);
      if (CFG['suelo-mo']) await page.fill('#pa-mo', CFG['suelo-mo']);
      if (CFG['suelo-n']) await page.fill('#pa-n', CFG['suelo-n']);
      await pausa(page, 600);
      await page.click('#pa-suelo');
      await pausa(page, 2800);
    }

    // ── aforo ────────────────────────────────────────────
    if (!CFG['sin-aforo']) {
      marcar('aforo');
      await scrollHoja(page, 45, 70, 1800);
      if (CFG.aforo) await page.fill('#pa-aforo', CFG.aforo);
      if (CFG.metodo) await page.fill('#pa-metodo', CFG.metodo);
      await pausa(page, 600);
      await page.click('#pa-aforo-ok');
      await pausa(page, 2600);
    }

    // ── corte / pastoreo ─────────────────────────────────
    if (!CFG['sin-corte']) {
      marcar('corte');
      await scrollHoja(page, 45, 70, 1600);
      await page.selectOption('#pa-tipo-corte', CFG['tipo-corte'] || 'pastoreo');
      await page.fill('#pa-fecha-corte', ymd(+CFG['corte-dias'] || 30));
      await pausa(page, 700);
      await page.click('#pa-corte-ok');
      await pausa(page, 2600);
    }

    // ── segunda parcela (otra especie) ───────────────────
    // Si el archivo trajo una sola, la segunda se dibuja a toques:
    // así el video cubre también el trazado manual.
    if (!CFG['sin-parcela2'] && CFG.especie2) {
      await page.click('#hoja-asa');
      await pausa(page, 900);
      marcar('parcela2');
      if ((await puntosParcelas(page)).length < 2) {
        dialogoTxt = CFG['parcela2-nombre'] || CFG.parcela + ' 2';
        await page.click('#fab-dibujar');
        await page.waitForSelector('#dibujo-barra:not(.oculto)', { timeout: 10000 });
        await pausa(page, 1200);
        // Zona segura: arriba-izquierda del centro. La columna de FABs
        // llega hasta ~mitad de pantalla a la derecha y la barra de
        // dibujo tapa los últimos ~80 px de abajo.
        const vp = page.viewportSize();
        const cx = vp.width / 2, cy = vp.height / 2;
        for (const [dx, dy] of [[-140, -190], [-40, -190], [-30, -90], [-140, -80]]) {
          await tocar(cx + dx, cy + dy);
          await pausa(page, 650);
        }
        await pausa(page, 900);
        await page.click('#dibujo-listo');
        await page.waitForFunction(() => {
          let n = 0;
          GP.mapa.leaflet().eachLayer(l => { if (l instanceof L.Polygon && l.options.interactive !== false) n++; });
          return n >= 2;
        }, null, { timeout: 25000 });
        await pausa(page, 1500);
        dialogoTxt = CFG.parcela;
      }
      await abrirParcela(page, tocar, 1);
      await pausa(page, 1200);
      await page.type('#pa-especie', CFG.especie2, { delay: 60 });
      await page.fill('#pa-fecha', ymd(+CFG['siembra2-dias'] || 55));
      await pausa(page, 700);
      await page.click('#pa-guardar');
      await pausa(page, 2800);
      await page.click('#hoja-asa');
      await pausa(page, 900);
    }

    // ── ficha completa: recorrer el registro ─────────────
    marcar('ficha');
    await abrirParcela(page, tocar, 0);
    await pausa(page, 1500);
    await scrollHoja(page, 40, 80, 6500);
    await page.click('#hoja-asa');
    await pausa(page, 1000);

    // ── capas de análisis ────────────────────────────────
    if (!CFG['sin-capas']) {
      marcar('capas');
      await page.click('#fab-capas');
      await page.waitForSelector('.capa-an', { timeout: 10000 });
      await pausa(page, 1500);
      for (const id of String(CFG.capas).split(',').map(s => s.trim()).filter(Boolean)) {
        const sel = '.capa-an[data-c="' + id + '"]';
        if (await page.$(sel)) {
          await page.click(sel);
          await pausa(page, 2200);
        }
      }
      await page.evaluate(() => {
        const s = document.querySelector('.capa-opa:not([disabled])');
        if (s) { s.value = '80'; s.dispatchEvent(new Event('input')); }
      });
      await pausa(page, 1200);
      await page.click('#hoja-asa');
      await pausa(page, 1500);

      // ── enfoque de parcela (máscara mundo-con-hueco) ───
      marcar('enfoque');
      await abrirParcela(page, tocar, 0);
      await pausa(page, 1200);
      await page.click('#hoja-asa');
      await pausa(page, 3200);
    }

    // ── paso de tiempo ───────────────────────────────────
    if (!CFG['sin-tiempo']) {
      marcar('tiempo');
      await page.click('#fab-tiempo');
      await page.waitForSelector('#tiempo-barra:not(.oculto)', { timeout: 10000 });
      await pausa(page, 2200);
      await page.click('#tiempo-prev');
      await pausa(page, 2400);
      await page.click('#tiempo-play');
      await pausa(page, 7000);
      if (await page.$('#tiempo-play')) {
        await page.evaluate(() => document.getElementById('tiempo-close').click());
      }
      await pausa(page, 1500);
    }

    // ── sábana de potreros / hato / compartir ────────────
    if (!CFG['sin-forraje']) {
      marcar('forraje');
      await page.click('#fab-predios');
      await page.waitForSelector('#p-forraje', { timeout: 10000 });
      await pausa(page, 1000);
      await page.click('#p-forraje');
      await page.waitForSelector('#fo-cabezas', { timeout: parseInt(CFG.timeout, 10) });
      await pausa(page, 2000);
      await scrollHoja(page, 40, 80, 3200);
      await page.evaluate(() => { document.getElementById('hoja-cuerpo').scrollTop = 0; });
      await pausa(page, 800);
      await page.fill('#fo-cabezas', CFG['hato-cabezas']);
      await page.fill('#fo-peso', CFG['hato-peso']);
      await pausa(page, 700);
      await page.click('#fo-hato');
      await page.waitForSelector('#fo-cabezas', { timeout: parseInt(CFG.timeout, 10) });
      await pausa(page, 2000);
      await scrollHoja(page, 40, 80, 3800);
      await page.evaluate(() => { document.getElementById('hoja-cuerpo').scrollTop = 0; });
      await pausa(page, 700);
      await page.click('#fo-copiar');
      await pausa(page, 2200);
      await page.click('#hoja-asa');
      await pausa(page, 1000);
    }

    // ── análisis ─────────────────────────────────────────
    marcar('analisis');
    await abrirParcela(page, tocar, 0);
    await pausa(page, 1200);
    await page.click('#pa-analisis');
    await page.waitForSelector('#an-pdf', { timeout: parseInt(CFG.timeout, 10) });
    await page.evaluate(() => { document.getElementById('hoja-cuerpo').scrollTop = 0; });
    await pausa(page, 2000);
    await scrollHoja(page, 40, 60, 5200);
    await page.evaluate(() => {
      const c = document.getElementById('hoja-cuerpo');
      c.scrollTop = c.scrollHeight;
    });
    await pausa(page, 1600);

    // ── informe PDF ──────────────────────────────────────
    marcar('pdf');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      page.click('#an-pdf')
    ]);
    pdf = path.join(CFG.out, await download.suggestedFilename());
    await download.saveAs(pdf);
    await pausa(page, 1800);

    if (!CFG['no-pdf-view']) {
      const b64 = fs.readFileSync(pdf).toString('base64');
      await page.evaluate(async (b64) => {
        const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        const doc = await pdfjsLib.getDocument({ data }).promise;
        const ov = document.createElement('div');
        ov.id = 'pdf-view';
        ov.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#14181a;' +
          'overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:14px;align-items:center';
        for (let n = 1; n <= doc.numPages; n++) {
          const pg = await doc.getPage(n);
          const w = Math.min(window.innerWidth - 28, 700);
          const vp = pg.getViewport({ scale: w * 2 / pg.getViewport({ scale: 1 }).width });
          const cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          cv.style.cssText = 'width:' + w + 'px;background:#fff;border-radius:6px;flex:none';
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          ov.appendChild(cv);
        }
        document.body.appendChild(ov);
      }, b64);
      await pausa(page, 1400);
      await page.evaluate(() => {
        const c = document.getElementById('pdf-view');
        let y = 0;
        const t = setInterval(() => { y += 30; c.scrollTop = y; if (y + c.clientHeight >= c.scrollHeight) clearInterval(t); }, 60);
      });
      await pausa(page, 6000);
      await page.evaluate(() => { const v = document.getElementById('pdf-view'); if (v) v.remove(); });
      await pausa(page, 900);
    }
    await page.click('#hoja-asa');
    await pausa(page, 1000);

    // ── Telegram ─────────────────────────────────────────
    if (!CFG['sin-telegram']) {
      marcar('telegram');
      await page.click('#btn-cuenta');
      await page.waitForSelector('#c-tg, #c-tg-off', { timeout: 15000 });
      await pausa(page, 1500);
      if (await page.$('#c-tg')) {
        await page.click('#c-tg');
        await page.waitForSelector('#c-tg-zona p', { timeout: 15000 });
        await pausa(page, 4500);
      } else {
        await pausa(page, 2500);
      }
      await page.click('#hoja-asa');
      await pausa(page, 1200);
    }

    // ── cierre: mapa con todas las parcelas ──────────────
    marcar('cierre');
    await page.evaluate(() => {
      const map = GP.mapa.leaflet();
      const polys = [];
      map.eachLayer(l => { if (l instanceof L.Polygon && l.options.interactive !== false) polys.push(l); });
      if (polys.length) {
        let b = polys[0].getBounds();
        polys.forEach(p => b.extend(p.getBounds()));
        map.fitBounds(b, { padding: [50, 50] });
      }
    });
    await pausa(page, 5000);
  } finally {
    guardarMarcas();
  }

  const videoTmp = await page.video().path();
  await context.close();
  await browser.close();

  const webm = path.join(CFG.out, CFG.salida + '.webm');
  fs.renameSync(videoTmp, webm);
  let mp4 = null;
  if (!CFG['no-mp4'] && hayFfmpeg()) {
    mp4 = path.join(CFG.out, CFG.salida + '.mp4');
    execFileSync('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
  }
  guardarMarcas();
  console.log(JSON.stringify({ ok: true, webm, mp4, marcas: rutaMarcas, out: CFG.out }));
})().catch(async e => { console.error('ERROR:', e.message); process.exit(1); });
