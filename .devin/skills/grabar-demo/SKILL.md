---
name: grabar-demo
description: Graba un video de la app fieldShift en formato celular recorriendo la UI real — login, predio nuevo, parcela (importa un archivo o dibuja a toques), cultivos, análisis y PDF. Incluye provision-cuenta.js para crear o recuperar la cuenta de pruebas leyendo el código del Gmail por IMAP. Usar cuando pidan grabar un video, hacer una demo o mostrar el flujo completo de la app.
argument-hint: "[--archivo ruta.kmz] [--predio nombre] [--url https://…/es/app/]"
allowed-tools:
  - exec
  - read
  - write
  - edit
---

# grabar-demo — video de la app en formato celular

Graba la app en producción (o contra un backend alterno) con Playwright
`recordVideo` y un descriptor de teléfono. El resultado es un `.webm` y,
si hay ffmpeg en PATH, un `.mp4` listo para compartir.

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

## Grabar

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
- `--timeout 120000` si el análisis (NASA POWER) viene lento.
- Tras descargar el informe lo muestra en pantalla: pinta cada página
  con pdf.js en un overlay a pantalla completa y lo recorre para la
  cámara (`--no-pdf-view` lo apaga). El visor nativo no existe en
  headless; el worker cross-origin de pdf.js cae a fake worker, que
  alcanza para los informes de pocas páginas.
- `--out`, `--salida`, `--no-mp4`, `--headed` (ver el navegador).

Al terminar imprime un JSON con las rutas del video y del PDF.

## Trampas ya resueltas (si tocás el script)

- Esperar `#hoja.oculto` con `state: 'attached'`: el estado de éxito es
  la sábana *oculta*, así que pedir visibilidad da timeout siempre.
- El alta de predio entra sola en modo dibujo; para importar hay que
  cerrarlo con `#dibujo-cerrar` antes de abrir el file chooser.
- El input `#imp-archivo` se abre con `inp.click()`: capturar el evento
  `filechooser`, no el clic.
- La parcela se toca por coordenadas: centro de
  `poly.getBounds()` → `map.latLngToContainerPoint` → `touchscreen.tap`.
- El `prompt()` del nombre al dibujar se responde con `page.on('dialog')`.
