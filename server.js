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

    const investigation = rows[0];
    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM sources WHERE investigation_id = ?) AS sources,
         (SELECT COUNT(*) FROM topics WHERE investigation_id = ?) AS evidence,
         0 AS gaps`,
      [req.params.id, req.params.id]
    );

    const [jobs] = await pool.query(
      `SELECT id, status, job_type, created_at, started_at, finished_at, error_message
       FROM research_jobs
       WHERE investigation_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.params.id]
    );

    res.json({ ...investigation, counts, latest_job: jobs[0] || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investigations/:id/jobs', async (req, res) => {
  const investigationId = Number(req.params.id);
  if (!Number.isInteger(investigationId) || investigationId < 1) {
    return res.status(400).json({ error: 'ID de investigação inválido.' });
  }

  const jobType = String(req.body?.job_type || 'research').trim() || 'research';

  try {
    const [investigations] = await pool.query(
      'SELECT id FROM investigations WHERE id = ?',
      [investigationId]
    );
    if (!investigations.length) {
      return res.status(404).json({ error: 'Investigação não encontrada.' });
    }

    const [activeJobs] = await pool.query(
      `SELECT id, status FROM research_jobs
       WHERE investigation_id = ? AND status IN ('queued', 'running')
       ORDER BY id DESC LIMIT 1`,
      [investigationId]
    );

    if (activeJobs.length) {
      return res.status(409).json({ error: 'Já existe uma pesquisa na fila ou em execução.' });
    }

    const [result] = await pool.query(
      `INSERT INTO research_jobs
       (investigation_id, status, job_type, payload, created_at)
       VALUES (?, 'queued', ?, ?, NOW())`,
      [investigationId, jobType, JSON.stringify({ source: 'web-mvp' })]
    );

    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at
       FROM investigations WHERE id = ?`,
      [investigationId]
    );
    const [jobs] = await pool.query(
      `SELECT id, status, job_type, created_at, started_at, finished_at, error_message
       FROM research_jobs WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      investigation: { ...rows[0], counts: { sources: 0, evidence: 0, gaps: 0 }, latest_job: jobs[0] }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend estático: não depende de Vite/React nem de etapa de build.
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Radar Editorial running on port ${port}`);
});
