---
type: guion
status: completo
created: 2026-11-15
tags: [reto, graze-point, space-apps, video, pitch]
---

# Guion del video de pitch — 30 s

Arco: persona concreta → problema → app en acción → datasets NASA
nombrados → salida al canal real → cierre. Estructura seguida del
patrón de los ganadores ([[jurado-y-ganadores]], punto "video ≤30 s").

El material sale de `grabar-tour.js` (skill `grabar-demo`) grabado
contra el backend local: la página publicada ya muestra la marca
GrazePoint. Los segmentos se cortan con ffmpeg a partir de
`marcas.json` y se queman subtítulos `.ass` (arriba-centro, caja
semioscura — mismo estilo que `subtitulos.js`).

## Beats y subtítulos

| # | Escena (tour)   | Seg. | EN | ES |
|---|-----------------|------|----|----|
| 1 | landing         | 3.0  | Hacienda Patiño, Santa Cruz, Bolivia. | Hacienda Patiño, Santa Cruz, Bolivia. |
| 2 | enfoque         | 3.5  | When the herd enters each paddock / is decided by eye. | Cuándo entra el lote a cada potrero / se decide a ojo. |
| 3 | forraje         | 6.0  | GrazePoint gives each paddock / its grazing point. | GrazePoint le da a cada potrero / su punto justo. |
| 4 | capas           | 5.5  | MODIS NDVI, SMAP L4 and NASA POWER, / measured on your land. | NDVI de MODIS, SMAP L4 y NASA POWER, / medidos en tu predio. |
| 5 | analisis        | 4.5  | Crossed with your soil, your herd, / your cuts. | Cruzados con tu suelo, tu hato, / tus cortes. |
| 6 | pdf             | 4.0  | A report for WhatsApp. / Alerts on Telegram. | Un informe para WhatsApp. / Alertas por Telegram. |
| 7 | cierre          | 3.5  | GrazePoint. / Free and open source. | GrazePoint. / Gratis y de código abierto. |

Total ≈ 30 s. Sin audio: el tour se graba mudo; los subtítulos
llevan la historia (sirve igual para YouTube/social con mute).

## Reglas del corte

- Cortar desde el `.mp4` crudo (sin subtítulos del tour) — el tour
  subtitulado pondría texto duplicado.
- En `forraje` y `analisis` saltar la espera de carga: tomar los
  segundos centrales de la escena, no su marca de inicio.
- La marca vieja no puede aparecer en ningún frame: regrabar el tour
  si la fuente es anterior al rename (caso del material de 2026-11-14).
- Sin em dash en los textos EN (humanamente-en).

## Salida

- `.tmp/videos/pitch/grazepoint-pitch-30s-en.mp4`
- `.tmp/videos/pitch/grazepoint-pitch-30s-es.mp4`
- 412×838 vertical (formato celular del skill), H.264, ~30 s, sin audio.
