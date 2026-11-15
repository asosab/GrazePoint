---
type: estrategia
status: listo
created: 2026-11-15
tags: [graze-point, space-apps, defensa, pitch, jurado]
---

# Estrategia de defensa — 3 minutos

Contexto: jurado local Santa Cruz, criterios oficiales
([[jurado-y-ganadores]]: Impact, Creativity, Validity, Relevance,
Presentation). Apuntamos a **Local Impact** y **Best Use of Data**.
3 min ≈ 380–420 palabras habladas en castellano. Regla: la demo viva
es el argumento, no la ilustración.

## Asignación del tiempo (180 s)

| Tramo | Seg | Qué |
|---|---|---|
| Hook | 0–15 | Sueleen + Hacienda Patiño + «ojímetro» |
| Problema | 15–35 | Punto de pastoreo a ojo = kilos de carne |
| Demo viva | 35–110 | App en prod, botón demo, potreros, análisis, PDF→WA |
| Datos NASA | 110–140 | POWER + MODIS/GIBS + SMAP + SoilGrids, nombrados |
| Impacto | 140–165 | Usuario real ya, escala global, open source |
| Cierre | 165–180 | Bolivia nunca ganó + invitación a probar |

## Guion (español, ~400 palabras)

**0:00 — Hook (15 s)**
«A veinte minutos de aquí, en la Hacienda Patiño, decidir cuándo entra
el lote a cada potrero depende del ojo del técnico. Sesenta hectáreas,
papel y Excel. Soy Alejandro, del equipo elay puej, y en doce horas le
dimos a ese ojo un satélite.»

**0:15 — Problema (20 s)**
«Entrar muy temprano quema el rebrote; muy tarde, el pasto se pasa y
baja la proteína. Esa decisión vale kilos de carne por hectárea, y hoy
se toma a ojo, en recorrido, con planillas.»

**0:35 — Demo viva (75 s) — EL NÚCLEO**
Abrir la app en el teléfono/pantalla, ya logueado vía botón demo:

1. «Esto es GrazePoint corriendo ahora, en producción.» (predio demo
   Lomas de Arena sobre satélite Esri)
2. Estado de potreros: «cada potrero tiene un reloj de rebrote que no
   cuenta días: cuenta días efectivos, agua por temperatura, calculados
   de la serie diaria de NASA POWER».
3. Tocar un potrero → análisis: «el satélite mide el pasto píxel por
   píxel dentro del polígono — NDVI de MODIS, humedad de raíz de SMAP —
   y cruza eso con su suelo, su especie y sus cortes».
4. Balance forrajero: «con el hato cargado dice cuántos días de pasto
   quedan antes del déficit».
5. PDF → «y la decisión sale por el canal que ya usan: un informe que
   viaja por WhatsApp. Alertas por Telegram cuando un potrero llega a
   su punto».

**1:50 — Datos, nombrados (30 s)**
«Todo lo que vieron cruza cuatro fuentes: NASA POWER — clima diario y
climatología; MODIS por NASA GIBS — decodificamos el píxel contra el
colormap oficial, es un número, no una foto; SMAP L4 — humedad de raíz;
y SoilGrids de ISRIC cuando el predio no tiene análisis de laboratorio.
Cada cifra del informe lleva la fecha del tile que la produjo.»

**2:20 — Impacto (25 s)**
«La Hacienda Patiño no es un caso hipotético: es nuestra primera
usuaria, entrevistada ayer, y esta semana la app sale al recorrido de
campo. El mismo modelo sirve en cualquier potrero del planeta — POWER
y GIBS no conocen fronteras. El código es abierto: github.com/asosab/
GrazePoint.»

**2:45 — Cierre (15 s)**
«Bolivia nunca ganó un Global Award en Space Apps. Que el primero sea
por enseñarle a un satélite a ver el pasto como lo ve un técnico.
Pueden probarla ahora: el botón de demo entra sin cuenta, sin clave.»

## Plan B (si el wifi traiciona)

- Video `grazepoint-pitch-30s-es.mp4` (en D:\proyectos\GrazePoint-videos,
  también subido a YouTube): mismo arco en 30 s, subtitulado.
- Capturas: og-cover + PDF de muestra descargado antes de subir.
- Si falla todo, el guion solo (los datos están memorizados).

## Antes de subir (checklist 13:30)

- [ ] Sesión demo abierta y predio cargado (entrar 5 min antes, no en
      el escenario: `/auth/demo` es rápido pero la red no perdona).
- [ ] Brillo alto, modo avión off, notificaciones silenciadas.
- [ ] Video descargado en el teléfono (offline).
- [ ] 3 ensayos cronometrados, cortar en 2:50.

## Preguntas probables y respuesta de una línea

- **Frescura del dato:** NDVI MODIS cada 8 días a 250 m, POWER diario
  con 2–3 días de rezago; el informe firma la fecha de cada tile.
- **Validación:** entrevista real ayer (Sueleen Peña); los aforos del
  predio calibran kg MS/ha contra NDVI con regresión local.
- **Modelo de negocio:** open source; el modelo está por definir, la
  prioridad es que lo use la Hacienda esta semana.
- **Escala:** cero hardware; todo satelital y global desde el día uno.
- **Diferencia vs. apps agro existentes:** el PRIAS del predio + el hato
  + salida por WhatsApp, pensada para el técnico en recorrido, no para
  el escritorio.
