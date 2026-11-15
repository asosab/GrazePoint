# GrazePoint

**Digital PRIAS + rotation advisor + forage planting window.**

An open web app for deciding what to plant and when, crossing the
measured soil of a farm with NASA Earth observation. Born at the NASA
Space Apps Challenge 2026, built with Hacienda Patiño (Fundación
Simón I. Patiño, Santa Cruz, Bolivia): sandy soils, regenerative
ranching and forage multispecies mixes.

Live site: [asosab.github.io/GrazePoint](https://asosab.github.io/GrazePoint/)
(Español: [/es/](https://asosab.github.io/GrazePoint/es/))

> **[Leer este README en español](README.es.md)**

## How it works

1. Sign up with email and password (6-digit code sent by mail).
2. Create a farm and draw its plots as polygons on the satellite
   image, or import them from a file.
3. Record the current planting, crop history, PRIAS soil tests
   (pH, organic matter, nitrogen, texture) and forage estimates.
4. The backend crosses that with NASA POWER, MODIS NDVI, SMAP soil
   moisture and SoilGrids, and returns:
   - a top-3 rotation pick (legume after grass, pH fit, annual rain,
     sandy-soil tolerance, organic-matter boost),
   - the forage planting window (months with enough rain, current
     soil state and germination risks),
   - pasture status per plot (regrowth clock, NDVI trend, carrying
     capacity),
   - a PDF report ready to forward on WhatsApp.

## Analysis layers and time travel

The map combines open raster layers straight from the browser, no API
key: NASA GIBS (NDVI, land surface temperature, SMAP root-zone
moisture, MERRA-2 monthly rain, active fires, true color), SoilGrids
WMS (pH, clay, carbon) and Esri reference layers. A time slider steps
six months back or forward. The past shows real tiles plus POWER
daily data; the future projects the same month of last year against
POWER climatology.

`gibsValores.js` turns those visual layers into numbers: it downloads
the GIBS tile under each point, decodes the pixel and maps it through
NASA's official colormap. NDVI and SMAP enter the analysis as real
values sampled on a grid inside the whole polygon (`muestreo.js`), not
at a single vertex.

## Forage status

`forraje.js` estimates when each paddock is ready to graze or cut. A
regrowth clock fed by POWER effective days restarts at every grazing
or planting; when nothing was recorded, an NDVI fall flags the last
use instead. Forage measurements calibrate a local kgDM/ha-per-NDVI
regression, and the herd you stock (`predio.hato`) is balanced against
the estimated standing forage to give days of coverage. Daily Telegram
alerts fire when a plot enters a condition, through the project's own
bot, [@grazepoint_bot](https://t.me/grazepoint_bot).

## Import plots from files

`importar.js` converts map files into candidate polygons, entirely in
the browser: KML, KMZ, shapefile (zipped or loose), GeoJSON, GPX, CSV,
WKT and GeoPDF. Out-of-range coordinates are reprojected with proj4
(declared CRS, or UTM as a fallback with a warning). You can also
paste UTM coordinates or drop files straight onto the map.

## What's in this repo

| Folder | Contents |
|---|---|
| `/` | Jekyll frontend for GitHub Pages, mobile-first, satellite basemap. English at the root, Spanish under `es/` |
| `app/` | The app: farms, plots on the satellite image, analysis and PDF |
| `assets/` | Vanilla JS/CSS, no build: `app.js`, `mapa.js`, `capas.js`, `tiempo.js`, `importar.js`, `i18n.js` |
| `backend/` | Standalone Express + MongoDB service (mirror of `servicios/grazepoint` in nodeLab, api.statetty.com) |
| `docs/` | Project Obsidian vault (master plan, decisions, session log) |

## Development

Frontend: static Jekyll, no build step. The pages use Liquid, so they
need `jekyll serve` or GitHub Pages; they cannot be opened raw.

Backend:

```bash
cd backend
cp .env.example .env      # Mongo + JWT + Gmail app password
npm install && npm start  # :8080
```

The frontend points to `https://api.statetty.com/api/grazepoint` by
default. Use `?api=http://localhost:8080/api/grazepoint` (or `gp_api`
in localStorage) to hit a local backend.

## Data sources

- NASA POWER (`power.larc.nasa.gov`): daily series and climatology.
- NASA GIBS WMTS: MODIS NDVI, land surface temperature, SMAP, MERRA-2
  rain, active fires.
- SoilGrids WMS (ISRIC): pH, clay and carbon per point via
  `GetFeatureInfo`.
- Esri World Imagery: satellite basemap tiles.
- Species catalog: forage multispecies mixes validated by Hacienda
  Patiño plus reference service crops
  (`backend/services/catalogo.js`).

## Languages

The app runs in English by default and Spanish under `es/`. Every
visible string lives in `assets/js/i18n.js`; the backend sends mail
and generates the PDF in the requested language.

## License

MIT, see `LICENSE`.
