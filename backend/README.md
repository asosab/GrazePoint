# fieldShift — backend

Servicio standalone del backend de Field Shift. Es el mismo código que el
módulo `servicios/fieldShift` de nodeLab (api.statetty.com), empaquetado
para correr en cualquier host.

## Arranque

```bash
cp .env.example .env   # completa credenciales
npm install
npm start              # :8080 por defecto
```

Salud: `GET /api/fieldShift/salud` → `{ ok, servicio, bd, hora }`.

## API

### Auth (público)

| Ruta | Uso |
|---|---|
| `POST /auth/registro` | `{email, clave≥8, nombre?}` → envía código de 6 dígitos |
| `POST /auth/verificar` | `{email, codigo}` → `{token, usuario}` |
| `POST /auth/login` | `{email, clave}` → `{token, usuario}` |
| `POST /auth/recuperar` | `{email}` → envía código de reset |
| `POST /auth/restablecer` | `{email, codigo, clave}` → `{token, usuario}` |
| `POST /auth/reenviar` | `{email}` → reenvía código de verificación |

### Con sesión (`Authorization: Bearer <token>`)

| Ruta | Uso |
|---|---|
| `GET /me` | usuario actual + rol (`registrado`/`especial`/`admin`) |
| `GET /catalogo` | catálogo de especies |
| `GET/POST /predios` · `GET/PUT/DELETE /predios/:id` | CRUD de predios |
| `POST/PUT/DELETE /predios/:id/parcelas[/:pid]` | parcelas con polígono GeoJSON |
| `POST /predios/:id/parcelas/:pid/{siembras,suelos,aforos}` | historial, PRIAS, forraje |
| `GET /predios/:id/analisis?parcela=` | clima NASA POWER + rotación top-3 + ventana de siembra |
| `GET /predios/:id/informe.pdf?parcela=` | informe PDF para el agricultor |
| `GET /admin/usuarios` · `PUT /admin/usuarios/:uid/rol` | solo admin |

Los administradores se prescriben por correo en `config.js`
(`roles.admins`). Hoy `registrado` y `especial` ven las mismas áreas.

## Base de datos

MongoDB propio llamado `fieldShift` (colecciones `fsusers`, `predios`,
`cultivos`). El seed de índices y catálogo corre desde el workspace de
desarrollo con `scripts/fieldshift/seed.js`; para sembrar aquí basta
insertar el catálogo de `services/catalogo.js` en la colección `cultivos`
(el recomendador también funciona con el catálogo embebido si la
colección está vacía).

## Correo

Nodemailer contra `smtp.gmail.com:465` con una **clave de aplicación** de
Google (no la clave normal de la cuenta). Sin credenciales configuradas,
los códigos se loguean en consola (modo dev).
