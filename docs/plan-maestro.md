---
type: plan
status: activo
created: 2026-11-14
tags: [field-shift, plan, patino, prias, rotacion, ventana]
---

# Plan maestro — Field Shift

## De qué va

Field Shift cubre los enfoques 1, 2 y 3 del [[top10-enfoques-patino]]
(vault NSAC, `docs/field-shift/`):

1. **Recomendador de rotación** — «qué sembrar después de X»: tres
   opciones rankeadas por aporte de nitrógeno, familia anterior, pH,
   lluvia anual y tolerancia a suelos arenosos.
2. **PRIAS digital** — ficha de parcela con serie climática + línea base
   edáfica (pH, MO, N, textura) + registro de mediciones, siembras y
   aforos. Digitaliza lo que la Hacienda hoy lleva en papel y Excel.
3. **Ventana de siembra forrajera** — cuándo sembrar pasturas y cultivos
   de servicio: meses con lluvia suficiente según la climatología NASA
   POWER, contrastados con la humedad actual del suelo.

## Lo que aprendimos de Sueleen Peña (entrevista 2026-11)

El [[respuestas-sueleen-pena|cuestionario]] ordena las prioridades:

- El dolor es **forrajero**: punto óptimo de cosecha de pasto, aforos
  lentos, reservas calculadas a ojo, germinación expuesta si la lluvia
  se corta. No siembran maíz (eso era Pairumani, que no manejan).
- **Humedad de suelo sin metodología** — «tanteo del técnico». Mostrar
  GWETROOT de POWER ya es un salto; su estación meteo propia (2 semanas
  de antigüedad) se integrará como fuente local más adelante.
- Registro en **papel y Excel** → la ficha de parcela es el producto.
- La decisión es **colegiada en recorrido** (técnico + operario +
  vaqueros): la app no decide por ellos, les da la ficha antes de salir.
- Canal real: **WhatsApp** → el informe PDF es la salida natural.
- Prometieron una muestra anonimizada de análisis de suelo para el
  lunes 16.
- Les sirve estimar la tendencia del suelo entre análisis de laboratorio
  (hoy lo hacen a mano, 1–2 veces al año).

## Arquitectura

```
Jekyll (GitHub Pages, asosab.github.io/fieldShift)
  └─ vanilla JS: mapa Esri World Imagery + dibujo de polígonos
        │
        ▼ Bearer JWT propio
Express /api/fieldShift  ──── en dos despliegues:
  ├─ nodeLab (api.statetty.com, producción) — servicios/fieldShift
  └─ backend/ standalone en este repo (código público espejo)
        │
        ▼
MongoDB `fieldShift` — local (dev) y Contabo VPS (prod)
        │
        └─ NASA POWER API (daily + climatology), pdfkit, nodemailer
```

Decisiones clave:

- **Auth propio** (no Buddy): el backend tiene que ser público en un
  solo repo con el frontend. Registro con verificación de correo,
  recuperación de clave — todo vía cuenta de Google con clave de
  aplicación (`FIELDSHIFT_SMTP_*`).
- **Tres niveles**: `registrado` (ve todo por ahora), `especial`
  (reservado), `admin` (asosab@gmail.com, lefehur@gmail.com — prescritos
  en `config.js`).
- **BD propia `fieldShift`** en ambos ambientes; el módulo no comparte
  la conexión `test` de nodeLab.
- **Mismo código en dos sitios**: `nodeLab/servicios/fieldShift/` es el
  deploy de producción; `fieldShift/backend/` es la copia pública que
  presenta el hackathon (un repo, front + back).

## Recursos disponibles

| Recurso | Estado |
|---|---|
| NASA POWER (clima+humedad) | verificado en vivo, CORS abierto |
| Catálogo de especies | 19 docs sembrados en ambas BD (polifíticas Patiño) |
| Datos de suelo reales | pendiente — muestra anonimizada el lunes 16 |
| Estación meteo de la Hacienda | existe desde hace 2 semanas, integración futura |
| SMAP/ECOSTRESS/HLS | fase 2 (requieren Earthdata o precarga) |
| MapBiomas/WorldCereal | fase 2 (historial satelital de parcela) |

## Camino con la Hacienda Patiño (primer usuario)

1. **Hoy (hackathon):** demo con un predio demo en coordenadas de la
   Hacienda (~Lomas de Arena), potrero con Brachiaria decumbens y un
   análisis de suelo plausible (pH 4.8, arenoso, MO baja). El
   recomendador ya sugiere sus propias polifíticas.
2. **Lunes 16:** cargar la muestra real de suelos; ajustar el catálogo
   con lo que ellos miden de verdad.
3. **Esta semana:** probar la app en el recorrido de campo con el
   técnico; el PDF va por WhatsApp al equipo.
4. **Después:** leer la estación meteo propia, NDVI histórico por
   parcela (para el «qué se sembró aquí antes») y el punto óptimo de
   cosecha forrajera — su dolor #1 declarado.

## Estrategia para el premio

Ver [[jurado-y-ganadores]]. Resumen: apuntar a **Local Impact** / **Best
Use of Data**; cada cifra nombra su dataset NASA; demo real con
coordenadas de la Hacienda; la historia es el «ojímetro del técnico» vs
el dato satelital; video ≤30 s en inglés; repo público desde el día 1.

## Pendientes

- Credenciales Gmail (app password) para correos reales — el dueño las
  pasa y van al `.env` (nunca al repo).
- Despliegue del backend standalone (el de nodeLab corre en la VPS).
- OG image v2 cuando entren capas geoespaciales más ricas.
- Pregunta 12 sin responder: quién usará primero la herramienta.
