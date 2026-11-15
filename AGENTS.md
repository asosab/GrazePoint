# AGENTS.md — fieldShift

App web abierta para decidir qué sembrar y cuándo, cruzando el suelo
medido del predio con observación de la Tierra de la NASA (POWER).
Nacida en el NASA Space Apps Challenge 2026. Sitio Jekyll en GitHub
Pages: **https://asosab.github.io/fieldShift/**

## Stack

- Frontend: Jekyll sin build, JS vanilla (`assets/js/*.js`), Leaflet por
  CDN (Esri World Imagery). Sin Gemfile ni CI.
- Backend: `backend/` Express + MongoDB standalone, espejo del módulo
  `servicios/fieldShift` de nodeLab (api.statetty.com). **Todo cambio al
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
- El frontend apunta a `https://api.statetty.com/api/fieldShift`; con
  `?api=<url>` o `fs_api` en localStorage usa otro backend.

## Importar parcelas desde archivo

`assets/js/importar.js` (`FS.importar.leerArchivos(files)`) convierte
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
- UI: `fab-importar` (⤓) + input `#imp-archivo` en `app/` y `es/app/`;
  los candidatos se pintan punteados en `mapa.js` (`pintarCandidatos`)
  y se importan desde la sábana (`hojaImportar` en `app.js`). El plano
  se quita con `#capa-quitar`.

## Capas de análisis + paso de tiempo

`assets/js/capas.js` (`FS.capas`) gestiona capas raster sobre el mapa —
todo directo desde el navegador, sin backend ni API key:

- **NASA GIBS** (`gibs.earthdata.nasa.gov/wmts/epsg3857/best/`): NDVI
  8d 250m, LST diaria 1km, SMAP L4 raíz, MERRA-2 lluvia mensual, focos
  de calor, color real, uso de suelo IGBP (fecha fija).
- **SoilGrids WMS** (`maps.isric.org`): pH, arcilla y carbono 0–5 cm.
- **Esri referencia**: nombres de lugar y límites.
- Base: satélite Esri u OSM (`mapa.js` registra su capa base vía
  `FS.capas.registriereBasis`).
- La sábana de capas abre con `fab-capas` (⧉): checkbox + slider de
  opacidad por capa — se combinan libremente. Selección y base quedan
  en `localStorage fs_capas`.
- `res: 'tag'|'monat'|'fix'` + `retraso` (días) en la registry: la
  fecha del tile se kapa en `hoy − retraso`, así no se piden tiles que
  NASA aún no publica (p. ej. MERRA-2 mensual, lag ~80 d).

`assets/js/tiempo.js` (`FS.tiempo`) es el paso de tiempo: 13 pasos
(−6 … 0 … +6 meses); `fab-tiempo` (◷) abre `#tiempo-barra` con slider,
flechas, play y pills de lluvia/temp/humedad.

- Pasado: tiles del 15 del mes (día) u 01 (mensual) + NASA POWER daily
  agregado a meses (220 días, fetch directo — CORS abierto).
- Futuro («proyección»): mismo mes del año anterior como tile + POWER
  climatology como números — los ciclos previos.
- Solo las capas `temporal` (GIBS no-fix) siguen la fecha; el resto no
  se toca. Al cerrar, `FS.capas.setPaso(null)` vuelve a «actual».

## Internacionalización (EN por defecto + ES)

Mismo esquema que NSAC: **el inglés es el idioma por defecto** y vive en
la raíz; el español vive bajo `es/`.

- `_config.yml`: `langs: [en, es]` + defaults por scope (`es/` → `lang: es`).
- Cadenas de layout: `_data/i18n.yml` (`default_desc`, `og_locale`, etc.).
- Suiche: `_includes/langswitch.html` en la landing y en `barra-top` de
  la app. Memoria: `assets/js/lang.js` guarda `fs-lang` en localStorage
  y redirige vía `link[hreflang]` si el idioma guardado difiere.
- Layout emite `hreflang` en/es/x-default y `og:locale` + alternate.
- Cadenas de la app: `assets/js/i18n.js`, diccionario por
  `document.documentElement.lang` con `FS.t(clave, {vars})`. Nada de
  texto visible hardcodeado en `app.js`/`mapa.js`: siempre por `t()`.
- Backend: `services/i18n.js` con los diccionarios (meses, razones,
  riesgos, PDF, correos). El frontend manda `lang` en el body de
  registro/login/recuperar/reenviar y como `?lang=` en `/analisis` e
  `/informe.pdf`. El backend cae a `en` con cualquier valor distinto de
  `es`.
- Regla permanente: **todo texto visible nuevo existe en los dos
  idiomas en el mismo cambio** (páginas, cadenas de UI, correos, PDF,
  notas del catálogo — `notas`/`notas_en`).

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
  `?api=http://localhost:8080/api/fieldShift`.
- El log de sesión va en `docs/log/YYYY-MM-DD.md`.
