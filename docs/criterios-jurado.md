---
type: evaluacion
status: activo
created: 2026-11-17
tags: [reto, graze-point, space-apps, jurado, criterios]
---

# Scorecard: criterios del jurado vs GrazePoint

Evaluación propia contra los cinco criterios oficiales
(Impact, Creativity, Validity, Relevance, Presentation) y los sub-
criterios de los Global Awards que nos interesan: Local Impact, Best
Use of Data, Most Inspirational. Puntaje estimado 1–5 por criterio.
Documento de trabajo para [[submission-page]] y la defensa; no es el
formulario oficial.

## Impact — 5/5

**Qué mide el jurado:** ¿resuelve un problema grande? ¿ayuda a muchos?

- El pastoreo mal temporizado pierde pasto y fuerza compra de
  suplemento: decisión diaria en cada potrero de cada hacienda
  ganadera del mundo tropical.
- Caso ancla: Hacienda Patiño, Santa Cruz, producción real.
- Escalable: cualquier predio bajo los satélites; app abierta,
  navegador, sin instalación.
- Diferencial: convierte el "ojo del técnico" en número accesible —
  democratiza una decisión que hoy exige años de experiencia.

**Debilidad residual:** el impacto declarado depende de que la
validación con Patiño ocurra; hoy es un diseño validado con entrevista,
no con uso prolongado.

## Creativity — 4/5

**Qué mide:** ¿novedoso o mejora real de algo existente?

- Reloj de rebrote por días efectivos (agua × temperatura) cruzado con
  NDVI de área y cortes registrados del propio usuario.
- Balance forrajero del hato: oferta estimada vs demanda → cobertura
  y fecha de déficit. Concepto que las apps comerciales de pastoreo
  no tienen.
- Grilla de muestreo al paso nativo de cada capa (no un punto).
- Importación tolerante: KML/KMZ/SHP/GeoJSON/GPX/CSV/GeoPDF/UTM
  pegado.

**Por qué no 5:** las piezas son combinaciones inteligentes de datos
públicos, no un algoritmo inventado; la novedad real es la decisión,
no el método. Suficiente para ser memorable, no para ganar
Galactic Impact (que pide ciencia más disruptiva).

## Validity — 4/5

**Qué mide:** ¿científicamente válido? ¿funcionaría en el mundo real?

- Datasets con nombre, versión y fecha de tile declarados junto al
  número (POWER diario/climatología, MERRA-2 mensual, MODIS NDVI
  8d vía GIBS, SMAP L4, SoilGrids/ISRIC).
- Metodología documentada en el PDF y en la página `/data/`.
- Umbrales por especie en catálogo abierto (rebrote min/max/pasado,
  GDD de ensilaje) — editable y auditable.
- Calibración aforo↔NDVI por regresión local declarada.
- Honestidad: desacuerdos reloj-vs-NDVI se marcan "revisar", no se
  ocultan; el balance forrajero se declara estimado.

**Por qué no 5:** el modelo de rebrote/ev30 es una heurística
agronómica razonable, no validada contra mediciones de campo propias;
los ganadores 2024 validaron con datos de campo reales.

## Relevance — 5/5

**Qué mide:** ¿responde al reto, completo, factible, usable?

- El reto pide adaptar granjas con datos NASA: GrazePoint cruza 5+
  datasets NASA/ISRIC/ESRI en cada análisis.
- Completo: predio → parcelas → siembras/cortes/aforos → capas →
  forraje → análisis → PDF → alertas → WhatsApp/Telegram.
- Factible y usable: demo corriendo en producción con datos reales
  de Patiño; registro → primer análisis en minutos.
- Bilingüe EN/ES, legal (terms/privacy/data), código abierto.

**Sin debilidades relevantes** — es el criterio donde más margen hay.

## Presentation — 3.5/5

**Qué mide:** ¿cuentan bien la historia?

Lo que ya está:

- Video pitch de 30 s con subtítulos, contra producción, marca nueva.
- Tour completo de ~4 min grabable con script.
- Página del submission redactada con la disciplina pedida.
- Posts del diario contando el proceso con honestidad (bugs
  incluidos).
- Historia de Sueleen y el ojímetro del técnico, verificable.

Lo que resta (honesto):

- Marca visual todavía "temporal": logo/favicon recién puestos,
  OG generada de captura de landing (no diseñada).
- Sin voz en el pitch (subtítulos) — no es requisito, pero los
  finalistas suelen tener narración.
- Página de proyecto del submission depende de lo que el jurado
  encuentre en el formulario; el sitio y el repo son la prueba.

## Sub-premios apuntados

### Local Impact — perfil 4.5/5

Aliado real verificable (Fundación Patiño), problema anclado a un
lugar concreto, escala global obvia, historia de persona. Es el
camino más corto a un Global Award para un proyecto boliviano: el
techo histórico es top-25, Local Impact es donde el jurado local ya
confía en proyectos con ancla real (QUEÑARIS ganó así en 2025).

### Best Use of Data — perfil 4/5

Cada número visible nombra dataset + versión; metodología en `/data/`
y en el PDF. Cierra vs Waterwise (2024): ellos ganaron este premio
con EO puro; nosotros sumamos verdad de campo. Riesgo: "mejor uso"
premia también la elegancia del dato; nuestra grilla es robusta pero
menos vistosa.

### Most Inspirational — perfil 3.5/5

Sueleen y el ojímetro son historia buena, pero el equipo es uno
autor + Leo agrónomo. Space Quest Maidens ganó con una causa de
equipo más amplia. Alcanzable si la defensa personaliza el pitch en
ella; no es el perfil natural del equipo.

### Best Use of Technology / Galactic Impact — perfil 2.5/5

No es nuestro terreno: sin hardware, sin algoritmo novel, sin arte.
No competir ahí; mencionar EO correctamente para no quedar fuera
del radar científico.

## Prioridad antes del cierre

1. Que la defensa y el submission hablen desde **Sueleen y el
   ojímetro** — es el diferenciador que ninguna app tiene.
2. Verificar que la casilla de datasets en el form nombre
   POWER/MODIS/SMAP/SoilGrids igual que en la UI.
3. Dejar el demo de producción listo para que el jurado lo abra con
   datos (Hacienda Patiño ya sembrada).
