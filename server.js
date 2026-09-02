import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4'
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      service: 'radar-editorial',
      framework: 'express',
      node: process.version,
      database: 'mysql'
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'radar-editorial',
      database: 'unavailable',
      error: error.message
    });
  }
});

app.get('/api/investigations', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at
       FROM investigations
       ORDER BY id DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investigations', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const objective = String(req.body?.objective || '').trim();

  if (!title) {
    return res.status(400).json({ error: 'Informe o tema da investigação.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO investigations
       (title, objective, status, created_at, updated_at)
       VALUES (?, ?, 'draft', NOW(), NOW())`,
      [title, objective || null]
    );

    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at
       FROM investigations
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investigations/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at
       FROM investigations
       WHERE id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Investigação não encontrada.' });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend estático: não depende de Vite/React nem de etapa de build.
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Radar Editorial running on port ${port}`);
});
