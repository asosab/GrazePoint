---
type: plan
status: activo
created: 2026-11-15
tags: [graze-point, plan, patino, sueleen, forraje]
---

# Plan — necesidades de la entrevista Sueleen Peña

Ordenado por dolor × costo, contra [[respuestas-sueleen-pena]].
Extiende [[plan-maestro]] (el punto óptimo de cosecha ya está hecho).

## Estado por necesidad

| Necesidad (entrevista) | Estado |
|---|---|
| Punto óptimo de cosecha de pasto | hecho (reloj + alertas + ev30) |
| Aforos morosos | hecho parcial (calibración aforo↔NDVI) |
| Humedad «a tanteo» | hecho parcial (SMAP, GWETROOT, estrés, saturado) |
| Reserva de forraje «a ojo» | **P1 — hecho 2026-11-15** (balance) |
| Canal WhatsApp | **P2 — hecho** (botón wa.me) |
| Tendencia del suelo entre análisis (Q16) | **P3 — hecho** (delta en ficha) |
| Germinación expuesta a lluvia tardía (Q6) | **P4 — hecho** (alerta) |
| Registro papel/Excel | **P5 — importar historial CSV** |
| Estación meteo propia | **P6 — bloqueada, agendada** |
| Quién usa primero (Q12 sin respuesta) | agendada |

## P1 — Balance forrajero del predio (oferta vs demanda)

«Cuánto forraje debemos prever para reservar» hoy es un cálculo manual
con aforos de ciertos lugares. Ya tenemos la oferta
(`forrajeTotalKgMS`, `ev30`); falta la demanda.

- Modelo: `predio.hato { cabezas, pesoKg }` (450 kg por defecto si falta).
- `forraje.balance(predio, forrajeTotalKgMS)`: consumo del hato
  (cabezas × peso/450 × 10 kg MS/día), días de cobertura con
  aprovechamiento 50 % y fecha estimada de déficit.
- `GET /predios/:id/forraje` devuelve `balance`; `/resumen` del bot
  agrega la línea de cobertura.
- Frontend: campos de hato en la ficha del predio y línea de cobertura
  en la sábana «Estado de potreros» (con invitación a cargar el hato
  si falta). i18n ES/EN.

## P2 — Compartir el resumen por WhatsApp

«WhatsApp es lo que más se usa». Sin Business API, lo barato y honesto:

- Botón en la sábana de potreros que arma el mismo texto del
  `/resumen` del bot y abre `wa.me/?text=…` — el técnico lo pega en
  el grupo del recorrido.

## P3 — Tendencia del suelo entre análisis

Respondieron «Sí» a estimar tendencia entre análisis (1–2 por año).
`parcela.suelos[]` ya guarda el historial; falta la lectura:

- Comparación último vs anterior análisis por parámetro (pH, MO, N):
  delta + texto «mejorando / empeorando / estable» según umbrales.
- Vista en la ficha de parcela y línea en el informe PDF.
- Al llegar la muestra anonimizada del lunes 16, ajustar campos a su
  formato de laboratorio real.

## P4 — Alerta de riesgo de germinación post-siembra

«Quedamos expuestos a la posible pérdida de germinación» (Q6).

- Parcela con `fechaSiembraActual` reciente (< ~21 días): acumular
  lluvia POWER desde la siembra y mirar GWETROOT; si cae bajo el
  `lluviaMin`/umbral de la especie del catálogo → nuevo tipo de
  alerta `germinacion` en `alertas.js` (dedo ya es por tipo).
- Umbral por especie: nuevo campo `germinacionMm` en el catálogo
  (sembrar valores razonables para las polifíticas).

## P5 — Importar historial desde Excel/CSV

El registro hoy está en papel y Excel; sin historial el reloj de
rebrote adivina t0 por satélite.

- En la ficha de parcela: pegar CSV con filas `fecha,tipo,notas` →
  `POST .../cortes` por fila; mismo molde para aforos
  (`fecha,kgMSHa,metodo`) y análisis de suelo.
- Formato libre y tolerante (dd/mm/aaaa, punto y coma), con vista
  previa antes de cargar.

## P6 — Estación meteorológica propia — bloqueada

Instalada hace 2 semanas. Integrar sus lecturas reales (lluvia sobre
todo) mejoraría el reloj y la confianza del técnico, pero no se puede
diseñar sin saber el formato. Ver agenda.

## Agenda — a conversar con Sueleen / el técnico

1. **Estación meteo:** ¿marca y modelo? ¿exporta CSV por USB o tiene
   app/nube? ¿Qué mide (lluvia, temp, humedad, viento)? → destraba P6.
2. **Pregunta 12 sin responder:** ¿quién abriría la app primero —
   técnico de campo, encargado de ganadería, ella? Define dónde poner
   el esfuerzo de UX (móvil simple vs sábana completa).
3. **Muestra de suelos** (prometida para el lunes 16): pedir además el
   PDF/hoja del laboratorio tal cual la reciben → define los campos de
   P3.
4. **Hato:** ¿cuántas cabezas maneja el lote del predio demo y peso
   promedio? ¿Separa por categoría (ordeño/engorde)? → calibra P1.
5. **Aforos actuales:** ¿método (marco de 1 m², altura de corte) y con
   qué frecuencia? → define si la captura de aforos necesita un modo
   rápido en campo.
6. **Excel actual:** ¿qué columnas lleva su registro de pastoreo y
   aforos hoy? → define el molde de P5.
