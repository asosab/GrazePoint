---
type: comparativa
status: activo
created: 2026-11-17
tags: [reto, graze-point, space-apps, ganadores, estrategia]
---

# Ganadores anteriores vs GrazePoint

Comparativa proyecto por proyecto contra ganadores y top recientes del
Space Apps, cruzada con lo que GrazePoint sí y no hace. Complementa
[[jurado-y-ganadores]] (pipeline y rasgos comunes) y alimenta
[[submission-page]]. Fuentes de la descripción de cada proyecto en la
misma nota de investigación.

## Ganadores globales

### Waterwise — 2024, Best Use of Data

Gestión hídrica para agricultores con datos EO. Mismo reto agrícola
gemelo del nuestro.

| Aspecto | Waterwise | GrazePoint |
|---|---|---|
| Decisión | Riego/eficiencia hídrica | Momento de pastoreo/corte por potrero |
| Dato de campo | No (EO puro) | Sí: PRIAS medido, aforos, cortes, hato |
| Resolución | Punto o zona genérica | Grilla dentro del polígono al paso nativo del píxel |
| Salida | App/dashboard | WhatsApp + Telegram + PDF técnico |
| Historia | Agricultores genéricos | Hacienda Patiño con entrevista real |

**Dónde ganamos:** verdad de campo + decisión accionable + canal
WhatsApp. **Dónde pierden ellos:** no tienen aforo ni suelo medido,
así que su recomendación no puede cruzarse con producción real.

### NVS-knot — 2024, Galactic Impact

Condiciones de siembra con humedad de suelo y evapotranspiración.

| Aspecto | NVS-knot | GrazePoint |
|---|---|---|
| Uso de NASA | SMAP/evapotranspiración | POWER + MODIS NDVI + SMAP L4 + SoilGrids |
| Escala temporal | Momento de siembra | Siembra + ciclo de pastoreo completo |
| Output | Índice/condición | Ranking de potreros + balance del hato |

**Dónde ganamos:** cerramos el ciclo con el hato (días de cobertura,
fecha de déficit) que ellos no tocan.

### QUEÑARIS — 2025, Local Impact

Fenología de floración en Arequipa, Perú. Ganó Local Impact: historia
local fuerte + dataset NASA claro.

| Aspecto | QUEÑARIS | GrazePoint |
|---|---|---|
| Ancla local | Cultivo local real | Hacienda Patiño, entrevista publicada |
| Datasets | EO + fenología | 4+ datasets nombrados junto a cada número |
| Producto | Monitoreo | Decisión + informe + alertas |

**Dónde ganamos:** igualamos la historia local y sumamos app de
producción completa con canal de entrega real. **Riesgo compartido:**
si el jurado premia "más simple y noble", ellos son más livianos.

### Zumorroda-X — 2025, Art & Technology

Enfoque artístico-tecnológico del reto agrícola en El Cairo. Gana por
narrativa visual, no por herramienta usable.

**Lección para nosotros:** si vamos por Art & Technology, el landing
y el video ya tienen el material; pero nuestra jugada real es Local
Impact / Best Use of Data / Most Inspirational.

### ASTROGENESIS — 2023, Best Mission Concept

Concepto de misión (no app). Demuestra que un problema bien planteado
con rigor científico puede ganar sin producto terminado — nosotros
tenemos producto terminado, ventaja directa en Validity y Relevance.

### Space Quest Maidens — 2023, Most Inspirational

Equipo de chicas en Campinas contando una historia de equidad y
ciencia. Gana por la persona y la causa, no por el software.

**Lección para nosotros:** Sueleen y el ojímetro del técnico son
nuestra versión de "persona concreta". Si el pitch se centra en ella,
Most Inspirational es alcanzable.

## Regionales y top bolivianos

- **CodeDinamina SCZ 2024 (Local Winner):** proyecto local ganador de
  sede — no global. Muestra el techo típico del jurado local: ideas
  buenas, presentación débil.
- **RoboScope UMSS 2014 / Sensor Your Swarm UMSA 2015:** top-25 global.
  Robótica e insectos como sensores — hardware, fuera de nuestro
  alcance, pero prueba que Bolivia llega lejos con hardware real.
- **CloudCatchers / WIRA Cbba 2025:** Global Nominees recientes.
  Dato honesto: nadie de Bolivia ha ganado global todavía; el techo
  histórico es top-25.

## Dónde quedamos parados

**Ventajas estructurales sobre los ganadores analizados:**

1. **Suelo medido + EO** — el PRIAS de laboratorio del predio manda;
   SoilGrids solo rellena. Ningún ganador reciente cruza ambas.
2. **Grilla de muestreo por área** — mediana de píxeles dentro del
   polígono, no un punto.
3. **Reloj de rebrote** — días efectivos (agua × temperatura diaria de
   POWER) contra umbrales por especie, no un calendario fijo.
4. **Balance forrajero del hato** — oferta estimada × demanda → días
   de cobertura y fecha de déficit. Nadie llega a la economía.
5. **Canal WhatsApp + Telegram + PDF** — el resultado sale donde el
   productor vive, no en un dashboard que hay que ir a mirar.
6. **Historia verificable** — Hacienda Patiño, entrevista real,
   coordenadas reales.

**Debilidades honestas (lo que los ganadores hacen mejor):**

1. **Marca/packaging** — ellos llegan con identidad pulida; nosotros
   renombramos a último momento (logo/favicon son temporales).
2. **Equipo multidisciplinario** — la regla pide ≤6 con arte/datos/
   storytelling; somos esencialmente uno más Leo agrónomo.
3. **Peso de la evidencia visual** — QUEÑARIS y Zumorroda-X tienen
   infografías de impacto más vistosas que nuestras capturas de app.
4. **Madurez del modelo** — Waterwise y NVS-knot validaron con datos
   de campo propios; nuestro balance forrajero es estimado y lo
   declaramos como tal.
