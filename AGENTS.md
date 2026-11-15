# AGENTS.md — GrazePoint

App web abierta para decidir qué sembrar y cuándo, cruzando el suelo
medido del predio con observación de la Tierra de la NASA (POWER).
Nacida en el NASA Space Apps Challenge 2026. Sitio Jekyll en GitHub
Pages: **https://asosab.github.io/GrazePoint/**

## Stack

- Frontend: Jekyll sin build, JS vanilla (`assets/js/*.js`), Leaflet por
  CDN (Esri World Imagery). Sin Gemfile ni CI.
- Backend: `backend/` Express + MongoDB standalone, espejo del módulo
  `servicios/grazepoint` de nodeLab (api.statetty.com). **Todo cambio al
  backend hay que espejarlo en nodeLab.**
- El análisis cruza NASA POWER con el suelo de la parcela: primero el
  PRIAS medido a mano (pH, MO, textura) y, si falta, **SoilGrids**
  vía `services/sueloWeb.js` — el WMS de ISRIC con
  `GetFeatureInfo`/`text/html` devuelve el valor crudo por punto
  (la REST v2.0 de rest.isric.org está caída y da nulls).
- `services/gibsValores.js` convierte las capas visuales en números:
  baja el tile GIBS del punto, decodifica el píxel y lo cruza con el
  colormap oficial (`/colormaps/v1.3/<nombre>.xml`, rgb→rango de valor).
  Así entran NDVI MODIS y humedad SMAP al análisis como valores reales.
- `services/tiempo.js` agrega la serie POWER diaria (400 d) por mes y
  la compara: últimos 6 meses vs el mismo período del año anterior y
  vs la climatología (meses bajo el 75 % de su media → tendencia seca).
- `rotacion.recomendar` suma señales nuevas al puntaje: temporada seca
  (±por lluviaMin), NDVI bajo/cayendo (+cultivos de servicio y fijadoras),
  N bajo (+fijaN), CIC baja (−alta extracción), suelo denso (+raíz
  gruesa). La respuesta de `/analisis` trae `terreno` (ndvi, ndviAnt,
  smap + fechas de tile) y `tiempo` (meses, pctVsAnio, mesesSecos).
- Bot propio **@grazepoint_bot** (`services/telegram.js`, poller
  `getUpdates` propio sin webhook): vínculo cuenta web ↔ chat con
  código `GP-XXXXXX` de un solo uso (10 min, hasheado). Flujo:
  `POST /me/telegram/codigo` → deep-link `t.me/grazepoint_bot?start=`
  → `/start` o `/vincular <código>` en el chat → `GET /me` trae
  `telegram.vinculado`. `DELETE /me/telegram` desvincula.
  `/resumen` (`/summary`) devuelve el estado forrajero de todos los
  potreros del usuario como texto plano + cobertura del hato si hay
  `predio.hato` cargado. Env:
  `GRAZEPOINT_TG_TOKEN`, `GRAZEPOINT_TG_BOT`, `GRAZEPOINT_TG_ADMIN`
  (chat id del admin: comandos de control como `/estado`). Sin token
  el poller no arranca y el resto del servicio funciona igual.
- El frontend apunta a `https://api.statetty.com/api/grazepoint`; con
  `?api=<url>` o `gp_api` en localStorage usa otro backend.

## Importar parcelas desde archivo

`assets/js/importar.js` (`GP.importar.leerArchivos(files)`) convierte
archivos de mapa en candidatos `{nombre, geometry: Polygon WGS84}` sin
tocar el backend: el alta sigue siendo `POST /predios/:id/parcelas` por
cada polígono marcado.

- Formatos: KML, KMZ, SHP (en `.zip` o suelto `.shp/.dbf/.prj`),
  GeoJSON, GPX (tracks/rutas; waypoints → casco convexo), CSV
  (columnas lat/lon o `wkt`), WKT y GeoPDF.
- GeoPDF: busca `/VP` → `/Measure` (regex sobre bytes crudos; pdf-lib
  como fallback para ObjStm comprimidos). Con georreferencia renderiza
  la página como `L.imageOverlay` («plano») y extrae anillos vectoriales
  del `getOperatorList` siguiendo el CTM. Sin georreferencia avisa.
- Proyecciones: coordenadas fuera de rango se reproyectan con proj4
  (crs declarado del GeoJSON; si falta, asume UTM 20S WGS84 y avisa).
  Anillos se cierran y orientan (exterior antihorario, huecos horarios).
- Libs por CDN bajo demanda (no se cargan hasta que hace falta):
  jszip, shp.js, pdfjs-dist, pdf-lib, proj4.
- UI: `fab-importar` (⤓) abre `hojaImportarInicio` en `app.js`:
  subir archivo (`#imp-archivo`), **soltar archivos directo sobre el
  mapa** (drop en `#mapa`, clase `.soltando`) o **pegar coordenadas
  UTM** (Este/Norte por línea, zona 19–21 S →
  `GP.importar.utmPunto` + `GP.importar.candidato`). Los candidatos
  se pintan punteados en `mapa.js` (`pintarCandidatos`) y se importan
  desde la sábana (`hojaImportar`). El plano se quita con
  `#capa-quitar`.

## Capas de análisis + paso de tiempo

`assets/js/capas.js` (`GP.capas`) gestiona capas raster sobre el mapa —
todo directo desde el navegador, sin backend ni API key:

- **NASA GIBS** (`gibs.earthdata.nasa.gov/wmts/epsg3857/best/`): NDVI
  8d 250m, LST diaria 1km, SMAP L4 raíz, MERRA-2 lluvia mensual, focos
  de calor, color real, uso de suelo IGBP (fecha fija).
- **SoilGrids WMS** (`maps.isric.org`): pH, arcilla y carbono 0–5 cm.
- **Esri referencia**: nombres de lugar y límites.
- Base: satélite Esri u OSM (`mapa.js` registra su capa base vía
  `GP.capas.registriereBasis`).
- La sábana de capas abre con `fab-capas` (⧉): checkbox + slider de
  opacidad por capa — se combinan libremente. Selección y base quedan
  en `localStorage gp_capas`.
- `res: 'tag'|'monat'|'fix'` + `retraso` (días) en la registry: la
  fecha del tile se kapa en `hoy − retraso`, así no se piden tiles que
  NASA aún no publica (p. ej. MERRA-2 mensual, lag ~80 d).

`assets/js/tiempo.js` (`GP.tiempo`) es el paso de tiempo: 13 pasos
(−6 … 0 … +6 meses); `fab-tiempo` (◷) abre `#tiempo-barra` con slider,
flechas, play y pills de lluvia/temp/humedad.

- Pasado: tiles del 15 del mes (día) u 01 (mensual) + NASA POWER daily
  agregado a meses (220 días, fetch directo — CORS abierto).
- Futuro («proyección»): mismo mes del año anterior como tile + POWER
  climatology como números — los ciclos previos.
- Solo las capas `temporal` (GIBS no-fix) siguen la fecha; el resto no
  se toca. Al cerrar, `GP.capas.setPaso(null)` vuelve a «actual».
- **Enfoque de parcela** (`GP.mapa.enfocar`): con al menos una capa
  de análisis activa y una parcela seleccionada, `app.js`
  (`actualizarEnfoque`) pinta una máscara mundo-con-hueco que oscurece
  lo que queda fuera del polígono — refuerza que el análisis es del
  área, no del mapa entero.

## Estado forrajero (punto óptimo de pastoreo / corte / ensilaje)

`backend/services/forraje.js` estima cuándo un potrero está listo para
entrar el lote o cortarse, en tres estados (`rebrote` / `punto_optimo` /
`pasado`; para ensilar: `creciendo` / `punto_ensilaje` / `pasado_ensilaje`):

- **Reloj de rebrote**: el último uso del potrero (`parcela.cortes` —
  pastoreo/corte/ensilaje/desbroce, `POST .../cortes`) o la siembra
  reinicia la cuenta. Se suman **días efectivos** de la serie diaria
  POWER: cada día vale `fAgua × fTemp` (GWETROOT vs. umbral 0.30,
  T2M vs. base 10 °C / óptimo 28 °C), comparado contra `rebrote
  {min,max,pasado}` de la especie en el catálogo.
- **Sin registro**: `gibsValores.serieNdvi` (muestras cada 8 días,
  ~3 meses) detecta caídas >0.10 → `t0Fuente:'ndvi'` marcado como
  «estimado por satélite».
- **Desacuerdo**: reloj en punto pero NDVI <0.25 → `desacuerdo:'revisar'`
  (estrés o fecha mal anotada).
- **Calibración aforo↔NDVI** (`kgMSHaEst`): regresión local
  kg MS/ha ≈ a+b·NDVI con los últimos aforos + NDVI de sus fechas;
  alimenta `forrajeTotalKgMS` del predio. Con aforo+área sale
  `ev30`: capacidad de carga orientativa (cabezas de ~450 kg por
  30 días, aprovechamiento 50 %, consumo 10 kg MS/día).
- **Balance forrajero** (`forraje.balance`): con `predio.hato
  {cabezas,pesoKg}` (PUT `/predios/:id`) la oferta (`forrajeTotal`)
  se cruza con la demanda del hato → `diasCobertura` y `fechaDeficit`
  en `/forraje` y `/resumen`. En la sábana de potreros va la línea de
  cobertura + fila editable del hato + botón **compartir por
  WhatsApp** (`wa.me` con el resumen en texto).
- **Germinación** (`riesgoGerminacion`): siembra <21 días con <15 mm
  acumulados POWER y GWETROOT medio <0.30 desde la siembra → bandera
  y alerta `germinacion`.
- **Análisis por área, no por punto** (`services/muestreo.js`):
  grilla de puntos dentro del polígono al paso del píxel nativo de
  cada capa (NDVI ~300 m en z9, SMAP ~2.4 km en z6, tope 40) →
  `gibsValores.valorZona`/`valorBuscandoZona` devuelven
  `{media,min,max,n}` (mediana de píxeles). `puntoDentro` da un punto
  interior garantizado (centroide si cae dentro) para POWER/suelo:
  ya no se usa el primer vértice del anillo. `forraje.evaluar`
  además trae `ndviAnt` (misma época año anterior), `smap`,
  `estresHidrico` (≥15 de 21 días con GWETROOT <0.21) y `ev30`.
- **Ensilaje**: especies con `gddEnsilaje` (sorgo 1250, maíz 1400) usan
  grados-día base 10 °C desde `fechaSiembraActual` al grano pastoso.
- Endpoints: `GET /predios/:id/forraje` (ranking: punto óptimo primero,
  luego forraje estimado, sábana «Estado de potreros») y `forraje`
  dentro de `/analisis`. El PDF corre `forraje.evaluar` en modo
  completo por parcela (NDVI de área, SMAP, `ev30`, serie NDVI): los
  tiles GIBS se cachean por xyz así que la grilla de una parcela no
  dispara fichas extra.

## Informe PDF (`/predios/:id/informe.pdf`)

`services/informe.js` arma un diagnóstico técnico completo, no un
resumen: ficha del predio con hectáreas calculadas por polígono,
diagnóstico por potrero (mapa vectorial de las parcelas coloreadas
por prioridad + tabla `nombre | ha | especie | NDVI | vs año | estado
| prioridad | acción` ordenada por prioridad de intervención), tabla
de clases de cobertura NDVI (ha y % por clase, mediana de los píxeles
muestreados), balance forrajero del hato, contexto de temporada
(lluvia anual, anomalía, últimos 6 meses vs año anterior, meses
secos) y una ficha por parcela con tres bloques —qué muestran los
datos / qué significa / qué hacer— más suelo completo (PRIAS o
SoilGrids con arena/arcilla/limo, CIC, densidad), sparkline de NDVI
con cortes detectados marcados, barra del reloj de rebrote,
historial de siembras/aforos/cortes, rotación sugerida con razones y
la ventana de siembra con las barras de lluvia mensual vs umbral.
Cierra con metodología y fuentes (fechas de tile NDVI/SMAP, n de
píxeles). Todo el texto visible vive en `INFORME`/`FORRAJE` de
`services/i18n.js` (en/es); PDFKit corre Helvetica WinAnsi: nada de
glifos fuera de Latin-1 (`→`, `≥` rompen, usar `->`, `>=`).
- **Alertas Telegram** (`services/alertas.js`): barrido diario; avisa
  al ENTRAR a una condición, no mientras siga. Tipos: `punto`
  (óptimo/ensilar), `revisar` (desacuerdo reloj-vs-NDVI), `estres`
  (estrés hídrico sostenido), `ndvi_cae` (peor que el año pasado
  −0.10), `saturado` (SMAP ≥0.50, anegamiento) y `germinacion`
  (siembra reciente sin agua). Dedo por tipo:
  `parcela.avisos {tipo: fecha}` (migra el viejo `avisoForraje`),
  se limpia solo al salir de la condición.

## Internacionalización (EN por defecto + ES)

Mismo esquema que NSAC: **el inglés es el idioma por defecto** y vive en
la raíz; el español vive bajo `es/`.

- `_config.yml`: `langs: [en, es]` + defaults por scope (`es/` → `lang: es`).
- Cadenas de layout: `_data/i18n.yml` (`default_desc`, `og_locale`, etc.).
- Suiche: `_includes/langswitch.html` en la landing y en `barra-top` de
  la app. Memoria: `assets/js/lang.js` guarda `gp-lang` en localStorage
  y redirige vía `link[hreflang]` si el idioma guardado difiere.
- Layout emite `hreflang` en/es/x-default y `og:locale` + alternate.
- Cadenas de la app: `assets/js/i18n.js`, diccionario por
  `document.documentElement.lang` con `GP.t(clave, {vars})`. Nada de
  texto visible hardcodeado en `app.js`/`mapa.js`: siempre por `t()`.
- Backend: `services/i18n.js` con los diccionarios (meses, razones,
  riesgos, PDF, correos). El frontend manda `lang` en el body de
  registro/login/recuperar/reenviar y como `?lang=` en `/analisis` e
  `/informe.pdf`. El backend cae a `en` con cualquier valor distinto de
  `es`.
- Regla permanente: **todo texto visible nuevo existe en los dos
  idiomas en el mismo cambio** (páginas, cadenas de UI, correos, PDF,
  notas del catálogo — `notas`/`notas_en`).

## Legales

- Páginas `/terms`, `/privacy` y `/data` (EN raíz, ES en `es/`) con
  el layout `default` y clase `legal`. Vigencia 2026-11-15.
- Sin cookies: la app usa localStorage (`gp_token`, `gp-lang`,
  `gp_capas`, `gp_api`, `gp_consent`). El aviso de almacenamiento
  (`_includes/consent.html`) se muestra una vez en todas las páginas.
- El registro exige checkbox «leí y acepto» y el backend valida
  `legal:true` → `legal_requerido`; gpUser guarda `legalAceptadoEn` +
  `legalVersion` (vigente en `config.legalVersion`: subirla cuando
  cambie el texto legal).
- `DELETE /me` borra la cuenta con todos sus predios (botón en la
  ficha de cuenta). Cualquier página legal nueva va en los dos
  idiomas en el mismo cambio.

## Textos: filtro humanamente obligatorio

Toda prosa visible (sitio, UI, correos, PDF, mensajes) pasa por el
skill `humanamente` (vendored en `.devin/skills/humanamente`) antes
de entregarse: en castellano con `humanamente`, en inglés con
`humanamente-en` (misma rúbrica; **cero em dashes** en inglés).

## Skills del proyecto (`.devin/skills/`)

- `grabar-demo`: graba video de la app en formato celular con la UI
  real — login, predio, parcela (importa archivo o dibuja), cultivos,
  análisis y PDF. `provision-cuenta.js` asegura la cuenta de pruebas
  (registro/recuperar + código leído del Gmail por IMAP). Ver su
  SKILL.md para los flags.
- `humanamente`, `humanamente-en`: filtro de prosa (arriba).

## Orden de archivos

- Sitio: `index.html`, `app/`, `es/`, `_layouts/`, `_includes/`,
  `_data/`, `assets/`, `_config.yml`, `sitemap.xml`, `robots.txt`.
- Backend: `backend/` (no se publica; está en `exclude`).
- Conocimiento del proyecto: `docs/` (vault Obsidian, `docs/index.md`
  es el MOC, `docs/log/` el registro por sesión).
- Temporales y pruebas: `.tmp/` (gitignored). Nada suelto en la raíz.

## Git

- Flujo permanente: al terminar un cambio **siempre commit y push a
  `main`** sin preguntar (Pages publica desde `main`).

## Pruebas

- Sin Jekyll local: las páginas usan Liquid y no se pueden abrir crudas.
  Verificar en caliente en GitHub Pages o con un Jekyll disponible.
- JS: `node --check` sobre cada archivo. Backend: correr
  `backend/` con `npm start` (`:8080`) y probar la API con
  `?api=http://localhost:8080/api/grazepoint`.
- El log de sesión va en `docs/log/YYYY-MM-DD.md`.
