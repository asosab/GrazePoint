# grabar-demo — video de la app en formato celular

Graba la app en producción (o contra un backend alterno) con Playwright
`recordVideo` y un descriptor de teléfono. El resultado es un `.webm` y,
si hay ffmpeg en PATH, un `.mp4` listo para compartir.

Dos scripts:

- `grabar.js` — flujo corto: login → predio → parcela → cultivos →
  análisis → PDF.
- `grabar-tour.js` — **recorrido completo** (todas las funciones de la
  app) con marcas de escena para subtitular después con `subtitulos.js`.

## Preparación (una vez)

```bash
cd .devin/skills/grabar-demo
npm install
npx playwright install chromium
```

## Cuenta de pruebas

`provision-cuenta.js` deja la cuenta funcionando en el backend que se
indique: intenta login; si no entra, registra y verifica leyendo el
código de 6 dígitos del Gmail con la app password de `backend/.env`
(IMAP `imap.gmail.com:993`); si la cuenta ya existía con otra clave,
pasa por el flujo recuperar → restablecer.

```bash
node provision-cuenta.js --email fieldshiftscz@gmail.com --clave 'FieldShift*2026'
# escribe <repo>/.tmp/creds.json  (gitignored)
```

Opciones: `--nombre`, `--api`, `--env` (otro .env con credenciales
SMTP), `--asunto` (filtro IMAP, def. `Field Shift`), `--out`, `--lang`.

## Tour completo con subtítulos (grabar-tour.js)

```bash
# inglés (raíz) y español (/es/): se graba una pasada por idioma
node grabar-tour.js --creds ../../../.tmp/creds.json --archivo ../../../.tmp/test.kmz
node grabar-tour.js --url https://asosab.github.io/fieldShift/es/app/ \
  --creds ../../../.tmp/creds.json --archivo ../../../.tmp/test.kmz \
  --predio "Estancia Demo"
```

Cada corrida deja en `--out` el `.webm`, el `.mp4` crudo, el PDF del
informe y `marcas.json` — una marca `{escena, t}` por escena, en
segundos desde el inicio del video.

### Escenas del tour (orden de dirección)

`landing` (portada, skipeable) → `login` → `predio` → `importar`
(archivo o dibujo) → `parcelas` → `siembra` → `campania` → `suelo`
→ `aforo` → `corte` → `parcela2` (segunda parcela con otra especie)
→ `ficha` (scroll del registro ya lleno) → `capas` (NDVI + humedad
SMAP + opacidad) → `enfoque` (máscara mundo-con-hueco) → `tiempo`
(stepper con play: pasado → proyección) → `forraje` (sábana de
potreros + hato + copiar resumen) → `analisis` → `pdf` → `telegram`
(código de vínculo, sin vincular de verdad) → `cierre`.

Datos por defecto (cambiables por flag): siembra `Brachiaria
brizantha` hace 40 d, campaña anterior `Soya` (~13→8 meses atrás,
2800 kg/ha), suelo pH 5.8 / MO 2.4, aforo 1800 kg MS/ha, corte
`pastoreo` hace 30 d, hato 25 cabezas × 450 kg. El catálogo matchea
nombres parciales, así que la especie se escribe corta.

### Flags propios del tour

- `--marcas` ruta del JSON de marcas (def: `<out>/marcas.json`).
- `--no-landing` salta la portada.
- `--capas "ndvi,humedad"` ids de la registry a activar.
- `--especie`, `--siembra-dias`, `--especie2`, `--siembra2-dias`.
- `--ultimo-especie`, `--ultimo-inicio YYYY-MM`, `--ultimo-fin`,
  `--ultimo-rend`, `--ultimo-unidad`.
- `--suelo-ph`, `--suelo-mo`, `--suelo-n`; `--aforo`, `--metodo`;
  `--corte-dias`, `--tipo-corte`; `--hato-cabezas`, `--hato-peso`.
- `--sin-landing|campania|suelo|aforo|corte|parcela2|capas|tiempo|forraje|telegram`
  para cortar escenas; las marcas solo se emiten para lo que corre.
- Todos los flags de `grabar.js` valen igual (`--api`, `--device`,
  `--width/--height`, `--ritmo`, `--timeout`, `--no-mp4`,
  `--no-pdf-view`, `--headed`).

## Subtítulos (subtitulos.js)

`guion.json` (junto a los scripts) guarda la dirección: escenas en
orden + textos `en`/`es` ya pasados por humanamente + bloque `estilo`
(lead, gap, minDur, charsPorSeg, margenTopPct). **Si se toca el texto,
hay que repasarlo por los skills humanamente correspondientes.**

```bash
node subtitulos.js --marcas <out>/marcas.json --video <out>/tour.mp4 --lang en
node subtitulos.js --marcas <out>/marcas.json --video <out>/tour.mp4 --lang es \
  --out <out>/tour-es-subs.mp4 --escala 2
```

- Genera `<video>-<lang>.ass` + `.srt` y quema el `.mp4`
  (`<video>-<lang>-subs.mp4`). `--sin-quemar` solo escribe los archivos.
- Estilo: texto arriba-centro sobre caja semioscura (la sábana ocupa
  abajo), fundido 250 ms, fuente `Segoe UI`, margen superior ~10 %.
- Ritmo pausado: cada línea dura `max(minDur, caracteres/13)`; las que
  no entran en su escena corren hacia la siguiente, nunca se pisan.
- `--escala 2` sube la resolución antes de quemar (mejor nitidez del
  texto; el PlayRes del .ass usa las dimensiones finales).
- `--offset` desplaza todos los subtítulos si quedan corridos.
- ffmpeg corre con `cwd` = dir del video y el `.ass` por basename: las
  rutas Windows con `:` rompen el filtro `ass=` si van absolutas.

## Grabar (flujo corto, grabar.js)

```bash
node grabar.js --creds ../../../.tmp/creds.json --archivo "D:/Download/PROP_ERICKA.kmz"
```

Sin `--archivo` dibuja un polígono de cuatro toques alrededor del centro
y responde el `prompt()` del nombre. Flags útiles:

- `--url https://asosab.github.io/fieldShift/es/app/` para grabar en
  español; los selectores son ids y sirven igual en ambos idiomas.
- `--api http://localhost:8080/api/fieldShift` para apuntar al backend
  standalone local (va como `?api=`).
- `--predio`, `--desc`, `--parcela` para los textos que se tipean.
- `--especie` + `--siembra-fecha YYYY-MM-DD` (cultivo actual);
  `--ultimo-especie`, `--ultimo-inicio YYYY-MM`, `--ultimo-fin`,
  `--ultimo-rend`, `--ultimo-unidad` (campaña anterior). `--sin-cultivos`
  salta esa sección.
- `--device 'iPhone 14'` u otro descriptor de Playwright;
  `--width`/`--height` para un tamaño a medida.
- `--ritmo 0.7` acelera las pausas; `1.4` las estira.
- `--timeout 120000` si el análisis (NASA POWER) viene lento. En el tour
  el mismo flag cubre también la sábana de forraje (muestreo de tiles
  por parcela: puede demorar más que el análisis).
- Tras descargar el informe lo muestra en pantalla: pinta cada página
  con pdf.js en un overlay a pantalla completa y lo recorre para la
  cámara (`--no-pdf-view` lo apaga). El visor nativo no existe en
  headless; el worker cross-origin de pdf.js cae a fake worker, que
  alcanza para los informes de pocas páginas.
- `--out`, `--salida`, `--no-mp4`, `--headed` (ver el navegador).

Al terminar imprime un JSON con las rutas del video, el PDF y (en el
tour) las marcas.

## Trampas ya resueltas (si tocás los scripts)

- Esperar `#hoja.oculto` con `state: 'attached'`: el estado de éxito es
  la sábana *oculta*, así que pedir visibilidad da timeout siempre.
- El alta de predio entra sola en modo dibujo; para importar hay que
  cerrarlo con `#dibujo-cerrar` antes de tocar `#fab-importar`.
- `#fab-importar` abre `hojaImportarInicio`: el file chooser sale del
  botón `#ii-archivo`, que hace `inp.click()` sobre `#imp-archivo`.
  Capturar el evento `filechooser`, no el clic.
- La parcela se toca por coordenadas: centro de
  `poly.getBounds()` → `map.latLngToContainerPoint` → `touchscreen.tap`.
  En el tour, `puntosParcelas()` devuelve el centro de **cada** polígono
  (los Rectángulos quedan fuera: la máscara de enfoque es un polygon
  con hueco y hay que excluirla con `!(l instanceof L.Rectangle)` —
  aunque la máscara es un Polygon con anillos, no un Rectangle: el
  filtro real es que no haya otra cosa pintada; si aparece ruido,
  filtrar por `_capa`/clase).
- El `prompt()` del nombre al dibujar y el `confirm()` de borrado se
  responden con `page.on('dialog')`.
- Tras cada guardado (`pa-guardar`, `ca-guardar`, `pa-suelo`,
  `pa-aforo-ok`, `pa-corte-ok`) la sábana **no se re-renderiza**: queda
  el HTML viejo con los mismos ids. Se puede seguir tipeando sin
  reabrir; para mostrar el registro actualizado hay que cerrar la
  sábana (`#hoja-asa`) y volver a tocar la parcela.
- La sábana de forraje tarda en cargar (muestreo de tiles): esperar
  `#fo-cabezas` con el timeout largo, no un tiempo fijo.
- `#fo-wa` abre `wa.me` en una pestaña nueva → genera un segundo video
  en el contexto. No se toca; se usa `#fo-copiar` (muestra el toast).
- `#c-tg` muestra el código de vínculo en `#c-tg-zona`; no completar el
  vínculo real contra el bot.
- Los subtítulos van **arriba** (Alignment 8): la sábana inferior tapa
  el tercio de abajo durante buena parte del video.
