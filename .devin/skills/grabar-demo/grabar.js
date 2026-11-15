// grabar.js — graba el recorrido completo de la app en video formato celular.
//
// Flujo: login → predio nuevo → parcela (importa --archivo o dibuja un
// polígono a toques) → cultivo actual + último cultivo → análisis → PDF.
// Todo por la UI real: mismos toques y esperas que un usuario.
//
// Uso mínimo:
//   node grabar.js --creds ../../.tmp/creds.json --archivo "D:/Download/PROP_ERICKA.kmz"
//
// Flags:
//   --url           app a grabar (def: https://asosab.github.io/GrazePoint/app/; usar .../es/app/ para ES)
//   --api           backend alterno → se pasa como ?api=
//   --archivo       kmz/kml/shp-zip/geojson/gpx/csv/wkt/pdf a importar; sin él dibuja un polígono
//   --predio        nombre del predio (def: 'Demo Farm')     --desc  descripción
//   --parcela       nombre para el prompt al dibujar (def: 'Plot 1')
//   --especie       cultivo actual (def: 'Soybean')          --siembra-fecha YYYY-MM-DD
//   --ultimo-especie / --ultimo-inicio YYYY-MM / --ultimo-fin / --ultimo-rend / --ultimo-unidad
//   --sin-cultivos  salta la ficha de cultivos
//   --no-pdf-view   no muestra el PDF en pantalla tras descargarlo
//   --creds         JSON {email, clave} — o --email + --clave
//   --device        descriptor Playwright (def: 'Pixel 7'); --width/--height lo sobrescriben
//   --out           carpeta de salida (def: <repo>/.tmp/videos/<timestamp>)
//   --salida        nombre base del video+pdf (def: grazepoint-demo-<timestamp>)
//   --ritmo         multiplicador de pausas (def: 1; 0.7 acelera, 1.4 respira más)
//   --timeout       espera máx del análisis en ms (def: 90000; NASA POWER demora)
//   --no-mp4        no convierte el .webm a .mp4 (requiere ffmpeg en PATH)
//   --headed        muestra el navegador (depuración)
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
    especie: 'Soybean', 'siembra-fecha': '',
    device: 'Pixel 7', ritmo: '1', timeout: '90000',
    out: path.join(REPO, '.tmp', 'videos', ts),
    salida: 'grazepoint-demo-' + ts
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k.startsWith('no-') || k === 'sin-cultivos' || k === 'headed') o[k] = true;
    else { o[k] = a[i + 1]; i++; }
  }
  return o;
}

const CFG = args();
const RITMO = parseFloat(CFG.ritmo) || 1;

function credenciales() {
  if (CFG.creds) return JSON.parse(fs.readFileSync(CFG.creds, 'utf8'));
  if (CFG.email && CFG.clave) return { email: CFG.email, clave: CFG.clave };
  throw new Error('faltan credenciales: pasá --creds ruta.json o --email/--clave');
}

function hayFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

(async () => {
  const creds = credenciales();
  fs.mkdirSync(CFG.out, { recursive: true });
  const pausa = (p, ms) => p.waitForTimeout(Math.round(ms * RITMO));

  const dev = devices[CFG.device] || devices['Pixel 7'];
  const size = {
    width: parseInt(CFG.width, 10) || dev.viewport.width,
    height: parseInt(CFG.height, 10) || dev.viewport.height
  };
  const browser = await chromium.launch({ headless: !CFG.headed });
  const context = await browser.newContext({
    ...dev, locale: 'en-US',
    viewport: size,
    recordVideo: { dir: CFG.out, size }
  });
  const page = await context.newPage();
  const tocar = (x, y) => (dev.hasTouch !== false ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

  const url = CFG.url + (CFG.api ? (CFG.url.includes('?') ? '&' : '?') + 'api=' + encodeURIComponent(CFG.api) : '');

  // ── 1. login ───────────────────────────────────────────
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#a-email', { timeout: 20000 });
  await pausa(page, 1500);
  await page.type('#a-email', creds.email, { delay: 70 });
  await page.type('#a-clave', creds.clave, { delay: 70 });
  await pausa(page, 700);
  await page.click('#a-entrar');
  await page.waitForSelector('#hoja.oculto', { state: 'attached', timeout: 20000 });
  await pausa(page, 2000);

  // ── 2. predio nuevo ────────────────────────────────────
  await page.click('#fab-predios');
  await page.waitForSelector('#p-nuevo');
  await pausa(page, 1000);
  await page.click('#p-nuevo');
  await page.waitForSelector('#np-nombre');
  await pausa(page, 800);
  await page.type('#np-nombre', CFG.predio, { delay: 80 });
  if (CFG.desc) await page.type('#np-desc', CFG.desc, { delay: 40 });
  await pausa(page, 800);
  await page.click('#np-ok');
  // tras crear el predio la app entra sola en modo dibujo
  await page.waitForSelector('#dibujo-barra:not(.oculto)', { timeout: 15000 });
  await pausa(page, 1500);

  // ── 3. parcela: importar archivo o dibujar ─────────────
  if (CFG.archivo) {
    await page.click('#dibujo-cerrar');
    await pausa(page, 800);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      page.click('#fab-importar')
    ]);
    await chooser.setFiles(CFG.archivo);
    await page.waitForSelector('#imp-ok', { timeout: 30000 });
    await pausa(page, 2500);
    await page.click('#imp-ok');
  } else {
    const vp = page.viewportSize();
    const cx = vp.width / 2, cy = vp.height / 2;
    page.on('dialog', d => d.accept(CFG.parcela));
    for (const [dx, dy] of [[-90, -60], [90, -70], [100, 80], [-80, 90]]) {
      await tocar(cx + dx, cy + dy);
      await pausa(page, 600);
    }
    await pausa(page, 800);
    await page.click('#dibujo-listo');
  }
  await page.waitForSelector('#hoja.oculto', { state: 'attached', timeout: 30000 });
  await pausa(page, 3500);

  // ── 4. tocar la parcela en el mapa → ficha ─────────────
  const pt = await page.evaluate(() => {
    const map = GP.mapa.leaflet();
    let poly = null;
    map.eachLayer(l => { if (!poly && l instanceof L.Polygon) poly = l; });
    if (!poly) return null;
    const c = map.latLngToContainerPoint(poly.getBounds().getCenter());
    return { x: c.x, y: c.y };
  });
  if (!pt) throw new Error('no se encontró el polígono de la parcela');
  await tocar(pt.x, pt.y);
  await page.waitForSelector('#pa-analisis', { timeout: 15000 });
  await pausa(page, 1500);

  // ── 5. cultivo actual + último cultivo ─────────────────
  if (!CFG['sin-cultivos']) {
    await page.type('#pa-especie', CFG.especie, { delay: 70 });
    if (CFG['siembra-fecha']) await page.fill('#pa-fecha', CFG['siembra-fecha']);
    await pausa(page, 500);
    await page.click('#pa-guardar');
    await pausa(page, 2500);

    if (CFG['ultimo-especie']) {
      await page.fill('#ca-especie', CFG['ultimo-especie']);
      if (CFG['ultimo-inicio']) await page.fill('#ca-inicio', CFG['ultimo-inicio']);
      if (CFG['ultimo-fin']) await page.fill('#ca-fin', CFG['ultimo-fin']);
      if (CFG['ultimo-rend']) await page.fill('#ca-rend', CFG['ultimo-rend']);
      if (CFG['ultimo-unidad']) await page.selectOption('#ca-unidad', CFG['ultimo-unidad']);
      await pausa(page, 800);
      await page.click('#ca-guardar');
      await pausa(page, 2500);
    }
  }

  // ── 6. análisis ────────────────────────────────────────
  await page.click('#pa-analisis');
  await page.waitForSelector('#an-pdf', { timeout: parseInt(CFG.timeout, 10) });
  await page.evaluate(() => { document.getElementById('hoja-cuerpo').scrollTop = 0; });
  await pausa(page, 2000);
  await page.evaluate(() => {
    const c = document.getElementById('hoja-cuerpo');
    let y = 0;
    const t = setInterval(() => { y += 40; c.scrollTop = y; if (y >= c.scrollHeight) clearInterval(t); }, 60);
  });
  await pausa(page, 4500);
  await page.evaluate(() => {
    const c = document.getElementById('hoja-cuerpo');
    c.scrollTop = c.scrollHeight;
  });
  await pausa(page, 1500);

  // ── 7. informe PDF: descargar y mostrarlo ──────────────
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('#an-pdf')
  ]);
  const pdf = path.join(CFG.out, await download.suggestedFilename());
  await download.saveAs(pdf);
  await pausa(page, 2000);

  if (!CFG['no-pdf-view']) {
    // Headless no tiene visor de PDF: se pintan las páginas con pdf.js
    // (la misma versión que la app carga por CDN) en un overlay full
    // screen y se recorre para la cámara.
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
    await pausa(page, 1200);
    await page.evaluate(() => {
      const c = document.getElementById('pdf-view');
      let y = 0;
      const t = setInterval(() => { y += 30; c.scrollTop = y; if (y + c.clientHeight >= c.scrollHeight) clearInterval(t); }, 60);
    });
    await pausa(page, 5500);
    await page.evaluate(() => { document.getElementById('pdf-view').scrollTop = 0; });
    await pausa(page, 2000);
    await page.evaluate(() => { const v = document.getElementById('pdf-view'); if (v) v.remove(); });
    await pausa(page, 800);
  }
  await page.evaluate(() => { document.getElementById('hoja-cuerpo').scrollTop = 0; });
  await pausa(page, 1500);

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
  console.log(JSON.stringify({ ok: true, webm, mp4, pdf, out: CFG.out }));
})().catch(async e => { console.error('ERROR:', e.message); process.exit(1); });
