// backend/index.js — servidor standalone del servicio Field Shift.
//
// Espejo del módulo nodeLab/servicios/fieldShift (mismo código), empaquetado
// para correr solo en cualquier host con Node >= 18 y MongoDB alcanzable.
//
//   cp .env.example .env   # completa credenciales
//   npm install
//   npm start              # escucha en :8080 (PORT)
//
// La API queda en /api/fieldShift (idéntica a la de api.statetty.com).

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/fieldShift', require('./routes/fieldShift'));

app.get('/', (req, res) => res.json({ ok: true, servicio: 'FieldShift', api: '/api/fieldShift' }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('[FieldShift] escuchando en :' + port));
