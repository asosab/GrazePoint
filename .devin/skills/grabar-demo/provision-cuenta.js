// provision-cuenta.js — deja lista una cuenta de pruebas contra el backend.
//
// Intenta en orden:
//   1) login con la clave dada → si entra, listo
//   2) login 403 (sin verificar) o registro 202 → código al Gmail,
//      leído por IMAP con la app password del .env → verificar
//   3) registro 409 (existe verificado, clave distinta) → recuperar →
//      código IMAP → restablecer con la clave dada
//
// Escribe un JSON {email, clave} que grabar.js consume con --creds.
//
// Uso:
//   node provision-cuenta.js --email a@b.com --clave 'Secret*1' \
//     [--nombre 'Nombre'] [--api https://api.statetty.com/api/grazepoint] \
//     [--env backend/.env] [--asunto 'GrazePoint'] [--out .tmp/creds.json]
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');

function args() {
  const o = {
    email: 'fieldshiftscz@gmail.com',
    clave: 'FieldShift*2026',
    nombre: 'GrazePoint Demo',
    api: 'https://api.statetty.com/api/grazepoint',
    env: path.join(REPO, 'backend', '.env'),
    asunto: 'GrazePoint',
    lang: 'en',
    out: path.join(REPO, '.tmp', 'creds.json')
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, '');
    if (a[i + 1] !== undefined) o[k] = a[i + 1];
  }
  return o;
}

const CFG = args();
const T0 = Date.now();
const espera = ms => new Promise(r => setTimeout(r, ms));

function leerEnv(ruta) {
  const o = {};
  fs.readFileSync(ruta, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].trim();
  });
  return o;
}

async function post(ruta, cuerpo) {
  const r = await fetch(CFG.api + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function leerCodigo(user, pass) {
  const { ImapFlow } = require('imapflow');
  const cliente = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false
  });
  await cliente.connect();
  const lock = await cliente.getMailboxLock('INBOX');
  let codigo = null;
  try {
    const uids = await cliente.search({ since: new Date(T0 - 60000), subject: CFG.asunto });
    if (!uids.length) return null;
    const msg = await cliente.fetchOne(uids[uids.length - 1], { source: true });
    const m = msg.source.toString('utf8').match(/\b(\d{6})\b/);
    if (m) codigo = m[1];
  } finally {
    lock.release();
    await cliente.logout();
  }
  return codigo;
}

async function esperarCodigo(user, pass) {
  for (let i = 0; i < 12; i++) {
    await espera(10000);
    try {
      const c = await leerCodigo(user, pass);
      if (c) return c;
      console.log('   intento ' + (i + 1) + ' → aún no llega el correo');
    } catch (err) {
      console.log('   intento ' + (i + 1) + ' → ' + err.message);
    }
  }
  throw new Error('nunca llegó el código al correo');
}

function guardarCreds() {
  fs.mkdirSync(path.dirname(CFG.out), { recursive: true });
  fs.writeFileSync(CFG.out, JSON.stringify({ email: CFG.email, clave: CFG.clave }, null, 2));
  console.log('OK — creds escritas en ' + CFG.out);
}

(async () => {
  const e = leerEnv(CFG.env);
  const user = e.GRAZEPOINT_SMTP_USER;
  const pass = (e.GRAZEPOINT_SMTP_PASS || '').replace(/\s+/g, '');

  console.log('1) login ' + CFG.email + ' …');
  let r = await post('/auth/login', { email: CFG.email, clave: CFG.clave, lang: CFG.lang });
  if (r.data && r.data.ok) { console.log('   entra directo'); return guardarCreds(); }
  console.log('   login →', r.status, r.data && r.data.error);

  if (r.status === 403 && r.data && r.data.requiereVerificacion) {
    console.log('2) existe sin verificar → leyendo código IMAP …');
    const codigo = await esperarCodigo(user, pass);
    r = await post('/auth/verificar', { email: CFG.email, codigo });
    if (r.data && r.data.ok) { console.log('   verificada'); return guardarCreds(); }
    throw new Error('verificar falló: ' + JSON.stringify(r.data));
  }

  console.log('2) registro …');
  r = await post('/auth/registro', { email: CFG.email, clave: CFG.clave, nombre: CFG.nombre, lang: CFG.lang, legal: true });
  console.log('   registro →', r.status, r.data && (r.data.error || 'ok'));

  if (r.status === 409) {
    console.log('   ya existe verificado → recuperar clave …');
    await post('/auth/recuperar', { email: CFG.email, lang: CFG.lang });
    const codigo = await esperarCodigo(user, pass);
    r = await post('/auth/restablecer', { email: CFG.email, codigo, clave: CFG.clave, lang: CFG.lang });
    if (r.data && r.data.ok) { console.log('   clave restablecida'); return guardarCreds(); }
    throw new Error('restablecer falló: ' + JSON.stringify(r.data));
  }

  if (r.status === 202 && r.data && r.data.requiereVerificacion) {
    console.log('3) verificando con código IMAP …');
    const codigo = await esperarCodigo(user, pass);
    r = await post('/auth/verificar', { email: CFG.email, codigo });
    if (r.data && r.data.ok) { console.log('   verificada'); return guardarCreds(); }
    throw new Error('verificar falló: ' + JSON.stringify(r.data));
  }

  throw new Error('registro inesperado: ' + r.status + ' ' + JSON.stringify(r.data));
})().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
