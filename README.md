# Field Shift

**PRIAS digital + recomendador de rotación + ventana de siembra forrajera.**
App web abierta para decidir qué sembrar y cuándo, cruzando el suelo
medido de tu predio con observación de la Tierra de la NASA (POWER:
lluvia, temperatura y humedad de suelo).

Pensado con la Hacienda Patiño (Fundación Simón I. Patiño, Santa Cruz,
Bolivia): suelos arenosos, ganadería regenerativa, polifíticas.
Nacido en el NASA Space Apps Challenge 2026.

## Qué hay en este repo

| Carpeta | Contenido |
|---|---|
| `/` (raíz) | Frontend Jekyll (GitHub Pages), mobile-first, mapa satelital de fondo |
| `app/` | La aplicación: predios, parcelas dibujadas sobre el satélite, análisis y PDF |
| `backend/` | Servicio standalone Express+MongoDB (mismo código que `servicios/fieldShift` de nodeLab) |
| `docs/` | Vault Obsidian del proyecto (plan maestro, decisiones, notas) |
| `assets/` | CSS/JS vanilla sin build: `api.js`, `auth.js`, `mapa.js`, `app.js` |

## Cómo funciona

1. Te registras con correo + clave (verificación por código, Gmail SMTP).
2. Creas tu **predio** y dibujas sus **parcelas/potreros** como polígonos
   sobre la imagen satelital.
3. Registras la siembra actual, el historial, los análisis de suelo
   (PRIAS: pH, MO, N, textura) y los aforos.
4. El backend cruza eso con NASA POWER y devuelve:
   - **top-3 de rotación** (leguminosa tras gramínea, pH, lluvia anual,
     tolerancia a arenosos, levantar MO),
   - **ventana de siembra forrajera** (meses con lluvia suficiente +
     estado actual del suelo + riesgos de germinación),
   - **informe PDF** listo para mandar por WhatsApp.

## Niveles de usuario

- `registrado` — hoy accede a todas las áreas.
- `especial` — reservado para funciones extendidas.
- `admin` — prescritos en `backend/config.js` (`roles.admins`).

## Desarrollo

Frontend: Jekyll estático, sin build — abrir `index.html` o servir con
`jekyll serve` / GitHub Pages.

Backend:

```bash
cd backend
cp .env.example .env   # Mongo + JWT + Gmail app password
npm install && npm start
```

El frontend apunta por defecto a `https://api.statetty.com/api/fieldShift`;
con `?api=http://localhost:8080/api/fieldShift` se usa un backend local.

## Datos

- **NASA POWER** (`power.larc.nasa.gov`) — serie diaria y climatología.
- **Esri World Imagery** — teselas satelitales del mapa.
- **Catálogo de especies** — polifíticas validadas por la Hacienda Patiño
  y cultivos de servicio de referencia (`backend/services/catalogo.js`).

## Licencia

MIT — ver `LICENSE`.
