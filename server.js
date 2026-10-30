require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const DB = process.env.DB_NAME || 'inventario_ygo';
const PORT = Number(process.env.PORT) || 3000;
// En local escucha solo en 127.0.0.1. Dentro de Docker hay que poner HOST=0.0.0.0, si no el puerto publicado no llega a la app.
const HOST = process.env.HOST || '127.0.0.1';
const conn = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

// Campos que se pueden editar y campos que solo se guardan al crear la carta (vienen de la API)
const EDITABLE = ['name', 'set_code', 'rarity', 'language', 'quantity', 'card_condition', 'tags', 'notes'];
const LANGUAGES = ['EN', 'ES', 'FR', 'DE', 'IT', 'PT', 'JP', 'KR', 'CN'];
const FROM_API = ['ygo_id', 'type', 'race', 'attribute', 'level', 'atk', 'def_pts', 'image', 'description'];
const ALL = [...EDITABLE, ...FROM_API];
const INTS = ['ygo_id', 'level', 'atk', 'def_pts'];
const MAX = { name: 255, set_code: 100, rarity: 100, language: 5, card_condition: 50, tags: 500, notes: 5000,
              type: 100, race: 100, attribute: 50, image: 500, description: 5000 };

const bad = msg => Object.assign(new Error(msg), { status: 400 });

function clean(body, fields) {
  const out = {};
  for (const k of fields) {
    let v = body[k];
    if (v === undefined) continue;
    if (k === 'quantity') {
      v = parseInt(v, 10);
      if (!(v >= 1)) throw bad('La cantidad debe ser 1 o más.');
    } else if (INTS.includes(k)) {
      v = parseInt(v, 10);
      if (Number.isNaN(v)) v = null;
    } else {
      v = v == null ? null : String(v).trim().slice(0, MAX[k]);
      if (k === 'name' && !v) throw bad('El nombre es obligatorio.');
      if (k === 'language') {
        v = v ? v.toUpperCase() : null;
        if (v && !LANGUAGES.includes(v)) throw bad('Idioma no válido.');
      }
    }
    out[k] = v;
  }
  return out;
}

let pool;
async function init() {
  const root = await mysql.createConnection(conn);
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`);
  await root.end();
  pool = mysql.createPool({ ...conn, database: DB, connectionLimit: 5 });
  await pool.query(`CREATE TABLE IF NOT EXISTS cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ygo_id INT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100), race VARCHAR(100), attribute VARCHAR(50),
    level INT NULL, atk INT NULL, def_pts INT NULL,
    image VARCHAR(500), description TEXT,
    set_code VARCHAR(100), rarity VARCHAR(100), language VARCHAR(5) NULL,
    quantity INT NOT NULL DEFAULT 1,
    card_condition VARCHAR(50), tags VARCHAR(500), notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (name)
  ) CHARACTER SET utf8mb4`);
  // Bases creadas con una versión anterior: añade la columna de idioma si falta
  const [cols] = await pool.query('SHOW COLUMNS FROM cards LIKE ?', ['language']);
  if (!cols.length) await pool.query('ALTER TABLE cards ADD COLUMN language VARCHAR(5) NULL AFTER rarity');
}

const app = express();
const h = fn => (req, res, next) => fn(req, res).catch(next);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/cards', h(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM cards ORDER BY name, set_code');
  res.json(rows);
}));

app.post('/api/cards', h(async (req, res) => {
  const data = clean(req.body, [...EDITABLE, ...FROM_API]);
  if (!data.name) throw bad('El nombre es obligatorio.');
  const [r] = await pool.query('INSERT INTO cards SET ?', [data]);
  const [[row]] = await pool.query('SELECT * FROM cards WHERE id = ?', [r.insertId]);
  res.status(201).json(row);
}));

app.put('/api/cards/:id', h(async (req, res) => {
  const data = clean(req.body, EDITABLE);
  if (!Object.keys(data).length) throw bad('No hay cambios que guardar.');
  const [r] = await pool.query('UPDATE cards SET ? WHERE id = ?', [data, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'La carta no existe.' });
  const [[row]] = await pool.query('SELECT * FROM cards WHERE id = ?', [req.params.id]);
  res.json(row);
}));

app.delete('/api/cards/:id', h(async (req, res) => {
  await pool.query('DELETE FROM cards WHERE id = ?', [req.params.id]);
  res.sendStatus(204);
}));

// Exportar: ?format=json (copia completa), csv (Excel / Sheets) o ydk (lista de IDs para simuladores)
const csvCell = v => {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
app.get('/api/export', h(async (req, res) => {
  const format = ['csv', 'ydk'].includes(req.query.format) ? req.query.format : 'json';
  const [rows] = await pool.query('SELECT ?? FROM cards ORDER BY id', [ALL]);
  const day = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="inventario-ygo-${day}.${format}"`);
  if (format === 'csv') {
    // Separador «;» y BOM UTF-8: así Excel en español lo abre en columnas y con los acentos bien
    const lines = [ALL.join(';'), ...rows.map(r => ALL.map(k => csvCell(r[k])).join(';'))];
    res.set('Content-Type', 'text/csv; charset=utf-8').send('\uFEFF' + lines.join('\r\n') + '\r\n');
  } else if (format === 'ydk') {
    const main = [], extra = [];
    for (const r of rows) {
      if (!r.ygo_id) continue;                                     // las cartas añadidas a mano no tienen ID
      const target = /Fusion|Synchro|XYZ|Link/i.test(r.type || '') ? extra : main;
      for (let i = 0; i < r.quantity; i++) target.push(r.ygo_id);  // una línea por copia
    }
    res.set('Content-Type', 'text/plain; charset=utf-8')
       .send(['#created by Inventario YGO', '#main', ...main, '#extra', ...extra, '!side', ''].join('\n'));
  } else {
    res.json({ app: 'inventario-ygo', version: 1, exported_at: new Date().toISOString(), cards: rows });
  }
}));

// Importar: mode=add añade a lo existente, mode=replace borra todo antes (dentro de una transacción)
app.post('/api/import', h(async (req, res) => {
  const mode = req.query.mode === 'replace' ? 'replace' : 'add';
  const list = Array.isArray(req.body) ? req.body : req.body?.cards;
  if (!Array.isArray(list)) throw bad('El archivo no tiene el formato esperado.');
  const rows = [];
  let skipped = 0;
  for (const item of list) {
    try {
      const card = { ...item };
      if (!LANGUAGES.includes(String(card.language).toUpperCase())) delete card.language;
      const d = clean(card, ALL);
      if (!d.name) throw bad('sin nombre');
      rows.push(ALL.map(k => d[k] ?? (k === 'quantity' ? 1 : null)));
    } catch { skipped++; }
  }
  if (!rows.length) throw bad('El archivo no contiene cartas válidas.');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    if (mode === 'replace') await c.query('DELETE FROM cards');
    for (let i = 0; i < rows.length; i += 500) await c.query('INSERT INTO cards (??) VALUES ?', [ALL, rows.slice(i, i + 500)]);
    await c.commit();
  } catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
  res.json({ imported: rows.length, skipped, mode });
}));

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error del servidor.' });
});

init()
  .then(() => app.listen(PORT, HOST, () => console.log(`Inventario listo en http://${HOST}:${PORT}`)))
  .catch(e => { console.error('No se pudo conectar a MySQL:', e.message); process.exit(1); });