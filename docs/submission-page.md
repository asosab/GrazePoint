---
type: submission
status: borrador
created: 2026-11-15
tags: [reto, graze-point, space-apps, submission]
---

# Página de proyecto del submission — GrazePoint

Texto listo para pegar en la página del proyecto en spaceappschallenge.org.
Todo en inglés (requisito del judging global). Las etiquetas entre paréntesis
indican el campo del formulario; el campo exacto puede variar.

## Project name

GrazePoint

## Tagline / high-level summary

GrazePoint tells a rancher when each paddock reaches its best grazing
point and what to plant next, by crossing the farm's own soil records
with NASA Earth observation.

## The problem

At Hacienda Patino, a 3,000-hectare ranch in Santa Cruz, Bolivia, the
decision of when a paddock is ready for the herd still comes down to
the field technician's trained eye. Forage reserves are estimated with
occasional manual sampling and kept on paper and Excel. Planting dates
ride on generic weather forecasts, and soil moisture has no measurement
method at all. Entering a paddock too early or too late, or sowing into
a closing rain window, means lost forage, failed germination and pasture
that degrades instead of recovering. Thousands of ranches across the
South American lowlands work the same way.

## What GrazePoint does

GrazePoint is an open-source web app that runs in the browser.
The rancher draws or imports paddock polygons on a satellite map,
keeps the planting, cutting and soil test record there, and the app
answers the three questions that today rely on guesswork:

- **When to graze.** Every paddock keeps a re-growth clock: effective
  days computed as f(soil moisture) x f(temperature) over the NASA POWER
  daily series, checked against the species' own re-growth window from
  a catalog of 19 forage species used at the ranch. When no grazing
  event was logged, MODIS NDVI detects the cut on its own.
- **How much forage is left.** NDVI across the whole paddock area is
  calibrated against the ranch's own forage samplings; crossed with the
  herd on record it returns days of coverage and a projected deficit
  date.
- **What and when to plant.** Three rotation options ranked from the
  measured soil, the previous crop and the seasonal trend, plus the
  months where climatology gives enough rain to establish pasture,
  checked against the current root-zone moisture.

Alerts reach the producer where he already is: a Telegram bot pings
when a paddock hits its point, and the analysis exports a technical
PDF report built to be forwarded on WhatsApp, the ranch's working
channel. The app is fully bilingual English/Spanish.

## NASA data used

Every number on screen names its source:

- **NASA POWER** (daily series and multi-year climatology): rain,
  2 m air temperature and root-zone soil wetness at the farm's
  coordinates. It drives the re-growth clock, the planting window,
  the drought trend and the germination risk flag.
- **MODIS NDVI 8-day** (via NASA GIBS tile decoding against the
  official colormaps): vegetation vigor measured across the whole
  paddock area at native pixel resolution, compared with the same
  period last year, and used to estimate standing forage and detect
  unlogged grazing events.
- **SMAP L4 root-zone soil moisture** (via GIBS): feeds effective
  days, waterlogging warnings and sustained drought stress.
- **MERRA-2** monthly precipitation renders as a time-step map layer.
- **SoilGrids (ISRIC)**, the partner soil dataset, fills in texture,
  pH and cation exchange when the farm has no lab test.

The satellite is never trusted blindly: when the clock says the
paddock is ready but NDVI disagrees, the app flags it for the
technician to check in the field.

## Why it is real

GrazePoint was built with Fundacion Patino, on their ranch, from a
documented interview with its director. The species catalog, the
forage sampling workflow, the paper-and-Excel record and the WhatsApp
channel are theirs. The app is live, open source, and the demo runs
with no install.

## What comes next

- Feed the ranch's own weather station (installed two weeks before
  the hackathon) into the POWER series for local calibration.
- Grow the aforo-to-NDVI calibration as real samplings accumulate.
- Add MapBiomas / ESA WorldCereal land-cover context for regional
  expansion, and species catalogs for other regions.
- Keep it open source so any ranch can fork it.

## Links

- Demo: https://asosab.github.io/GrazePoint/
- Repo: https://github.com/asosab/GrazePoint
- Video: (pegar el link del video de 30 s cuando exista)

## Notas de uso (no pegar)

- La página acepta imágenes: la captura `og-cover.png` (1200x630)
  sirve como imagen principal.
- La casilla de uso de IA va en el formulario del equipo, no en esta
  página. Verificarla antes del submit.
- La muestra de suelo de Patiño llega el lunes; si entra antes del
  submit, mencionarla en "Why it is real".
