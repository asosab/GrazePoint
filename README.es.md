# Field Shift

**PRIAS digital + recomendador de rotación + ventana de siembra
forrajera.**

App web abierta para decidir qué sembrar y cuándo, cruzando el suelo
medido del predio con observación de la Tierra de la NASA. Nacida en
el NASA Space Apps Challenge 2026 junto a la Hacienda Patiño
(Fundación Simón I. Patiño, Santa Cruz, Bolivia): suelos arenosos,
ganadería regenerativa y polifíticas forrajeras.

Sitio: [asosab.github.io/fieldShift/es](https://asosab.github.io/fieldShift/es/)
(Inglés: [asosab.github.io/fieldShift](https://asosab.github.io/fieldShift/))

> **[Read this README in English](README.md)**

## Cómo funciona

1. Te registras con correo y clave (código de 6 dígitos por mail).
2. Creas el predio y dibujas sus parcelas como polígonos sobre la
   imagen satelital, o las importas desde un archivo.
3. Registras la siembra actual, el historial, los análisis de suelo
   PRIAS (pH, materia orgánica, nitrógeno, textura) y los aforos.
4. El backend cruza eso con NASA POWER, NDVI MODIS, humedad SMAP y
   SoilGrids, y devuelve:
   - un top-3 de rotación (leguminosa tras gramínea, ajuste por pH,
     lluvia anual, tolerancia a arenosos, aporte de MO),
   - la ventana de siembra forrajera (meses con lluvia suficiente,
     estado actual del suelo y riesgos de germinación),
   - el estado forrajero por potrero (reloj de rebrote, tendencia
     NDVI, capacidad de carga),
   - un informe PDF listo para mandar por WhatsApp.

## Capas de análisis y paso de tiempo

El mapa combina capas raster abiertas directo desde el navegador, sin
API key: NASA GIBS (NDVI, temperatura superficial, humedad SMAP de
raíz, lluvia mensual MERRA-2, focos de calor, color real), SoilGrids
WMS (pH, arcilla, carbono) y capas de referencia de Esri. Un slider
de tiempo avanza o retrocede seis meses. El pasado muestra tiles
reales más la serie diaria de POWER; el futuro proyecta el mismo mes
del año anterior contra la climatología de POWER.

`gibsValores.js` convierte esas capas visuales en números: baja el
tile GIBS del punto, decodifica el píxel y lo cruza con el colormap
oficial de la NASA. NDVI y SMAP entran al análisis como valores reales
muestreados en una grilla dentro del polígono (`muestreo.js`), no en
un solo vértice.

## Estado forrajero

`forraje.js` estima cuándo cada potrero está listo para pastorear o
cortar. Un reloj de rebrote alimentado por días efectivos de POWER se
reinicia con cada uso o siembra; si no hay registro, una caída de
NDVI marca el último uso. Los aforos calibran una regresión local de
kgMS/ha según NDVI, y el hato cargado (`predio.hato`) se cruza con el
forraje estimado para dar los días de cobertura. Las alertas diarias
de Telegram avisan cuando un potrero entra en una condición, desde el
bot propio [@fieldshift_bot](https://t.me/fieldshift_bot).

## Importar parcelas desde archivo

`importar.js` convierte archivos de mapa en candidatos a parcela, todo
en el navegador: KML, KMZ, shapefile (en zip o suelto), GeoJSON, GPX,
CSV, WKT y GeoPDF. Las coordenadas fuera de rango se reproyectan con
proj4 (CRS declarado, o UTM como supuesto con aviso). También se
pueden pegar coordenadas UTM o soltar archivos directo sobre el mapa.

## Qué hay en este repo

| Carpeta | Contenido |
|---|---|
| `/` | Frontend Jekyll para GitHub Pages, mobile-first, mapa satelital. Inglés en la raíz, español bajo `es/` |
| `app/` | La aplicación: predios, parcelas sobre el satélite, análisis y PDF |
| `assets/` | JS/CSS vanilla sin build: `app.js`, `mapa.js`, `capas.js`, `tiempo.js`, `importar.js`, `i18n.js` |
| `backend/` | Servicio Express + MongoDB standalone (espejo de `servicios/fieldShift` de nodeLab, api.statetty.com) |
| `docs/` | Vault Obsidian del proyecto (plan maestro, decisiones, log de sesiones) |

## Desarrollo

Frontend: Jekyll estático, sin build. Las páginas usan Liquid, así que
necesitan `jekyll serve` o GitHub Pages; no se pueden abrir crudas.

Backend:

```bash
cd backend
cp .env.example .env      # Mongo + JWT + clave de aplicación de Gmail
npm install && npm start  # :8080
```

El frontend apunta por defecto a
`https://api.statetty.com/api/fieldShift`. Con
`?api=http://localhost:8080/api/fieldShift` (o `fs_api` en
localStorage) se usa un backend local.

## Datos

- NASA POWER (`power.larc.nasa.gov`): serie diaria y climatología.
- NASA GIBS WMTS: NDVI MODIS, temperatura superficial, SMAP, lluvia
  MERRA-2, focos de calor.
- SoilGrids WMS (ISRIC): pH, arcilla y carbono por punto vía
  `GetFeatureInfo`.
- Esri World Imagery: teselas satelitales del mapa.
- Catálogo de especies: polifíticas forrajeras validadas por la
  Hacienda Patiño y cultivos de servicio de referencia
  (`backend/services/catalogo.js`).

## Idiomas

La app corre en inglés por defecto y en español bajo `es/`. Todas las
cadenas visibles viven en `assets/js/i18n.js`; el backend manda los
correos y genera el PDF en el idioma pedido.

## Licencia

MIT, ver `LICENSE`.
