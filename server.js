import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    res.json({ status: 'ok', database: 'ok', version: '0.1.0' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable', message: error.message });
  }
});

app.get('/api/investigations', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at
       FROM investigations ORDER BY id DESC LIMIT 50`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investigations', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const objective = String(req.body?.objective || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const [result] = await pool.query(
      `INSERT INTO investigations (title, objective, status, created_at, updated_at)
       VALUES (?, ?, 'draft', NOW(), NOW())`,
      [title, objective || null]
    );
    const [rows] = await pool.query('SELECT * FROM investigations WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investigations/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM investigations WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Radar Editorial running on port ${port}`);
});
