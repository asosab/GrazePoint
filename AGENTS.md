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
skill `humanamente` (copia en `D:\proyectos\NSAC\.devin\skills\`) antes
de entregarse: en castellano con `humanamente`, en inglés con
`humanamente-en` (misma rúbrica; **cero em dashes** en inglés).

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
