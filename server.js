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
const maxResults = Math.min(Math.max(Number(process.env.SEARCH_MAX_RESULTS || 15), 1), 20);

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

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function getDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function tavilySearch(query) {
  const apiKey = String(process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('TAVILY_API_KEY não configurada.');
    error.code = 'SEARCH_CONFIG';
    throw error;
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      topic: 'general',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      country: 'brazil'
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail || data?.message || `Tavily respondeu HTTP ${response.status}.`;
    const error = new Error(detail);
    error.code = 'SEARCH_PROVIDER';
    error.status = response.status;
    throw error;
  }

  return data;
}

async function runResearchJob(jobId) {
  let investigationId = null;
  try {
    const [[job]] = await pool.query(
      `SELECT rj.id, rj.investigation_id, rj.status, i.title, i.objective
       FROM research_jobs rj
       INNER JOIN investigations i ON i.id = rj.investigation_id
       WHERE rj.id = ?`,
      [jobId]
    );

    if (!job) return;
    investigationId = job.investigation_id;

    if (job.status !== 'queued') return;

    await pool.query(
      `UPDATE research_jobs
       SET status = 'running', started_at = NOW(), error_message = NULL
       WHERE id = ? AND status = 'queued'`,
      [jobId]
    );
    await pool.query(
      `UPDATE investigations SET status = 'researching', updated_at = NOW() WHERE id = ?`,
      [investigationId]
    );

    const query = [job.title, job.objective].filter(Boolean).join(' — ').slice(0, 400);
    const result = await tavilySearch(query);
    const results = Array.isArray(result.results) ? result.results : [];

    let inserted = 0;
    let duplicates = 0;

    for (const item of results) {
      const url = normalizeUrl(item.url);
      const title = String(item.title || '').trim();
      if (!url || !title) continue;

      const [existing] = await pool.query(
        `SELECT id FROM sources WHERE investigation_id = ? AND url = ? LIMIT 1`,
        [investigationId, url]
      );

      if (existing.length) {
        duplicates += 1;
        continue;
      }

      const publishedValue = item.published_date || item.published_at || item.date || null;
      let publishedAt = null;
      if (publishedValue) {
        const parsed = new Date(publishedValue);
        if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString().slice(0, 19).replace('T', ' ');
      }

      await pool.query(
        `INSERT INTO sources
         (investigation_id, title, url, domain, source_type, published_at, summary,
          relevance_score, quality_score, authority_score, raw_data, created_at)
         VALUES (?, ?, ?, ?, 'web', ?, ?, ?, NULL, NULL, ?, NOW())`,
        [
          investigationId,
          title.slice(0, 65535),
          url.slice(0, 65535),
          getDomain(url),
          publishedAt,
          String(item.content || '').slice(0, 10000) || null,
          Number.isFinite(Number(item.score)) ? Number(item.score) : null,
          JSON.stringify(item)
        ]
      );
      inserted += 1;
    }

    const payload = JSON.stringify({
      provider: 'tavily',
      query,
      raw_results: results.length,
      inserted,
      duplicates,
      max_results: maxResults
    });

    await pool.query(
      `UPDATE research_jobs
       SET status = 'completed', finished_at = NOW(), payload = ?
       WHERE id = ?`,
      [payload, jobId]
    );
    await pool.query(
      `UPDATE investigations SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [investigationId]
    );
  } catch (error) {
    console.error(`Research job ${jobId} failed:`, error);
    if (investigationId) {
      await pool.query(
        `UPDATE investigations SET status = 'error', updated_at = NOW() WHERE id = ?`,
        [investigationId]
      ).catch(() => {});
    }
    await pool.query(
      `UPDATE research_jobs
       SET status = 'failed', finished_at = NOW(), error_message = ?
       WHERE id = ?`,
      [String(error.message || error).slice(0, 10000), jobId]
    ).catch(() => {});
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      service: 'radar-editorial',
      version: '0.2.0',
      framework: 'express',
      node: process.version,
      database: 'mysql',
      search_provider: 'tavily',
      search_configured: Boolean(String(process.env.TAVILY_API_KEY || '').trim())
    });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'radar-editorial', database: 'unavailable', error: error.message });
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
  if (!title) return res.status(400).json({ error: 'Informe o tema da investigação.' });

  try {
    const [result] = await pool.query(
      `INSERT INTO investigations (title, objective, status, created_at, updated_at)
       VALUES (?, ?, 'draft', NOW(), NOW())`,
      [title, objective || null]
    );
    const [rows] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at FROM investigations WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/investigations/:id', async (req, res) => {
  try {
    const [[investigation]] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at FROM investigations WHERE id = ?`,
      [req.params.id]
    );
    if (!investigation) return res.status(404).json({ error: 'Investigação não encontrada.' });

    const [[counts]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM sources WHERE investigation_id = ?) AS sources,
        0 AS evidence,
        0 AS gaps`,
      [req.params.id]
    );

    const [jobs] = await pool.query(
      `SELECT id, status, job_type, payload, created_at, started_at, finished_at, error_message
       FROM research_jobs WHERE investigation_id = ? ORDER BY id DESC LIMIT 1`,
      [req.params.id]
    );

    const [sources] = await pool.query(
      `SELECT id, title, url, domain, source_type, published_at, summary, relevance_score, created_at
       FROM sources WHERE investigation_id = ? ORDER BY relevance_score DESC, id DESC LIMIT 50`,
      [req.params.id]
    );

    res.json({ ...investigation, counts, latest_job: jobs[0] || null, sources });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investigations/:id/jobs', async (req, res) => {
  const investigationId = Number(req.params.id);
  if (!Number.isInteger(investigationId) || investigationId < 1) {
    return res.status(400).json({ error: 'ID de investigação inválido.' });
  }

  try {
    if (!String(process.env.TAVILY_API_KEY || '').trim()) {
      return res.status(503).json({ error: 'O motor Web ainda não está configurado: TAVILY_API_KEY ausente.' });
    }

    const [[investigation]] = await pool.query(
      `SELECT id, title, objective, status, created_at, updated_at FROM investigations WHERE id = ?`,
      [investigationId]
    );
    if (!investigation) return res.status(404).json({ error: 'Investigação não encontrada.' });

    const [activeJobs] = await pool.query(
      `SELECT id, status FROM research_jobs
       WHERE investigation_id = ? AND status IN ('queued', 'running') ORDER BY id DESC LIMIT 1`,
      [investigationId]
    );
    if (activeJobs.length) {
      return res.status(409).json({ error: 'Já existe uma pesquisa na fila ou em execução.' });
    }

    const [result] = await pool.query(
      `INSERT INTO research_jobs (investigation_id, status, job_type, payload, created_at)
       VALUES (?, 'queued', 'research', ?, NOW())`,
      [investigationId, JSON.stringify({ provider: 'tavily', max_results: maxResults })]
    );

    const [[job]] = await pool.query(
      `SELECT id, status, job_type, payload, created_at, started_at, finished_at, error_message
       FROM research_jobs WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      investigation: { ...investigation, latest_job: job }
    });

    void runResearchJob(result.insertId);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Radar Editorial 0.2.0 running on port ${port}`);
});
