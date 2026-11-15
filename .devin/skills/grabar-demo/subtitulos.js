// subtitulos.js — monta los subtítulos del tour sobre el video grabado.
//
// Lee guion.json (textos por escena, en/es) + marcas.json (tiempos que
// grabar-tour.js anotó en cada escena) y produce:
//   - un .ass con estilo subtítulo (arriba-centro, caja semioscura)
//   - un .srt al lado, por si hace falta fuera del video
//   - el .mp4 con los textos quemados (ffmpeg + libass)
//
// Ritmo: cada texto dura max(minDur, caracteres / charsPorSeg) — habla
// pausada. El primero de cada escena arranca un poco antes de la marca;
// los que no alcanzan su escena corren hacia la siguiente, nunca se pisan.
//
// Uso:
//   node subtitulos.js --marcas marcas.json --video tour.mp4 --lang en
//   node subtitulos.js --marcas marcas.json --video tour.webm --lang es \
//     --out tour-es.mp4 --escala 2
//   --sin-quemar  solo escribe el .ass/.srt (no llama ffmpeg)
//   --offset 0.4  desplaza todos los subtítulos en segundos
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function args() {
  const o = { lang: 'en', escala: '1', offset: '0', guion: path.join(__dirname, 'guion.json') };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k === 'sin-quemar') o[k] = true;
    else { o[k] = a[i + 1]; i++; }
  }
  return o;
}

const CFG = args();

function probe(video) {
  const j = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_entries', 'format=duration:stream=width,height', video
  ]).toString());
  const s = j.streams[0];
  return { w: s.width, h: s.height, dur: parseFloat(j.format.duration) };
}

function tc(t) { // segundos → h:mm:ss.cc
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60), c = Math.round((t % 1) * 100);
  const p = n => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

// Parte el texto en líneas de ≤ maxC caracteres sin cortar palabras.
function envolver(txt, maxC) {
  const palabras = txt.split(' ');
  const lineas = [];
  let cur = '';
  for (const w of palabras) {
    if (cur && (cur + ' ' + w).length > maxC) { lineas.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lineas.push(cur);
  return lineas.join('\\N');
}

(function main() {
  if (!CFG.marcas || !CFG.video) {
    console.error('faltan --marcas <marcas.json> y --video <archivo>');
    process.exit(1);
  }
  const guion = JSON.parse(fs.readFileSync(CFG.guion, 'utf8'));
  const marcas = JSON.parse(fs.readFileSync(CFG.marcas, 'utf8'));
  const est = Object.assign(
    { lead: 0.35, gap: 0.3, minDur: 3.8, charsPorSeg: 13, margenTopPct: 10 },
    guion.estilo || {});
  const offset = parseFloat(CFG.offset) || 0;
  const escala = Math.max(1, parseFloat(CFG.escala) || 1);
  const { w, h, dur } = probe(CFG.video);
  const W = Math.round(w * escala / 2) * 2, H = Math.round(h * escala / 2) * 2;

  // textos por escena en orden de marcas (una marca por escena)
  const porId = {};
  guion.escenas.forEach(e => { porId[e.id] = e; });
  const subs = [];
  let prevEnd = 0;
  for (const m of marcas) {
    const esc = porId[m.escena];
    if (!esc) continue;
    const lineas = esc[CFG.lang] || esc.en || [];
    let inicio = Math.max(0, m.t - est.lead, prevEnd + 0.15) + offset;
    for (const texto of lineas) {
      const durSub = Math.max(est.minDur, texto.length / est.charsPorSeg);
      if (inicio < dur - 0.4) subs.push({ ini: inicio, fin: inicio + durSub, texto });
      prevEnd = inicio + durSub;
      inicio = prevEnd + 0.15;
    }
  }
  subs.forEach(s => { s.fin = Math.min(s.fin, dur + 1); });

  // ── .ass ────────────────────────────────────────────────
  const fsSize = Math.max(18, Math.round(H * 0.024));
  const margenV = Math.round(H * est.margenTopPct / 100);
  const maxC = Math.max(24, Math.floor((W - 40) / (fsSize * 0.52)));
  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
    'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, ' +
    'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,Segoe UI,${fsSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,` +
    `0,0,0,0,100,100,0,0,3,8,0,8,16,16,${margenV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...subs.map(s =>
      `Dialogue: 0,${tc(s.ini)},${tc(s.fin)},Sub,,0,0,0,,{\\fad(250,250)}${envolver(s.texto, maxC)}`)
  ].join('\r\n') + '\r\n';

  const base = path.join(
    path.dirname(CFG.video),
    path.basename(CFG.video).replace(/\.\w+$/, '') + '-' + CFG.lang);
  const rutaAss = CFG.ass || base + '.ass';
  fs.writeFileSync(rutaAss, ass);

  const rutaSrt = CFG.srt || base + '.srt';
  const tcSrt = t => {
    const p = n => String(n).padStart(2, '0');
    t = Math.max(0, t);
    return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:` +
      `${p(Math.floor(t % 60))},${String(Math.round((t % 1) * 1000)).padStart(3, '0')}`;
  };
  fs.writeFileSync(rutaSrt, subs.map((s, i) =>
    `${i + 1}\n${tcSrt(s.ini)} --> ${tcSrt(s.fin)}\n${s.texto}\n`).join('\n'));

  let mp4 = null;
  if (!CFG['sin-quemar']) {
    mp4 = path.resolve(CFG.out || base + '-subs.mp4');
    // El filtro ass= se rompe con rutas con ':' — copia al lado del video
    // y pasá solo el basename (ffmpeg corre con cwd = dir del video).
    const assLocal = path.join(path.dirname(CFG.video), path.basename(rutaAss));
    if (path.resolve(rutaAss) !== path.resolve(assLocal)) fs.copyFileSync(rutaAss, assLocal);
    const filtros = (escala > 1 ? `scale=${W}:${H}:flags=lanczos,` : '') +
      `ass='${path.basename(assLocal)}'`;
    execFileSync('ffmpeg', [
      '-y', '-i', path.basename(CFG.video), '-vf', filtros,
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', mp4
    ], { cwd: path.dirname(CFG.video), stdio: 'ignore' });
  }

  console.log(JSON.stringify({ ok: true, ass: rutaAss, srt: rutaSrt, mp4, subs: subs.length }));
})();
