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
const appVersion = '0.2.2';

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

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','ou','em','no','na','nos','nas',
  'por','para','com','sem','sobre','entre','ao','aos','à','às','que','se','como','mais','menos','muito','muita',
  'muitos','muitas','seu','sua','seus','suas','este','esta','estes','estas','esse','essa','esses','essas','isso',
  'isso','ser','é','são','foi','foram','tem','têm','ter','uma','um','também','já','não','sim','qual','quais',
  'atualização','atualizações','tema','novas','novo','novos','nova','evidências','evidencia','lacunas','editoriais',
  'editorial','sobre','pesquisa','pesquisas'
]);

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function getDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

function tokens(text) {
  return [...new Set(
    String(text || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t))
  )];
}

function coverageScore(targetText, sourceSet) {
  const target = new Set(tokens(targetText));
  if (!target.size || !sourceSet.size) return null;
  let matches = 0;
  for (const token of target) if (sourceSet.has(token)) matches++;
  return Math.max(0, Math.min(1, matches / target.size));
}

function correspondenceScore(title, objective, sourceTitle, summary) {
  const source = new Set(tokens(`${sourceTitle} ${summary}`));
  if (!source.size) return 0.5;
  const topicCoverage = coverageScore(title, source);
  const objectiveCoverage = coverageScore(objective, source);
  if (topicCoverage == null) return objectiveCoverage == null ? 0.5 : objectiveCoverage;
  if (objectiveCoverage == null) return topicCoverage;
  // O tema identifica o núcleo da investigação; o objetivo funciona como refinamento.
  return Math.max(0, Math.min(1, 0.75 * topicCoverage + 0.25 * objectiveCoverage));
}

function classifySource(domain, url) {
  const d = String(domain || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (/\.gov(\.br)?$|\.gov\.|\.jus\.br$|\.leg\.br$|\.mp\.br$/.test(d)) return 'institutional';
  if (/\.edu(\.br)?$|\.ac\.uk$|\.edu$|\.ac\./.test(d)) return 'academic';
  if (/seer\.|scielo\.|pubmed\.|doi\.org$|researchgate\.net$|ciencialatina\.org$/.test(d)) return 'academic';
  if (/linkedin\.|instagram\.|facebook\.|youtube\.|tiktok\.|x\.com$|twitter\./.test(d)) return 'social';
  if (/amazon\.|mercadolivre\.|shopee\.|ebay\./.test(d)) return 'commercial';
  if (/reuters\.|apnews\.|bbc\.|nytimes\.|washingtonpost\.|estadao\.|folha\.|g1\.|oglobo\.|veja\.|exame\.|valor\.com\.|uol\.com\.|terra\.com\./.test(d)) return 'journalistic';
  if (/mittechreview\.|superinteressante\.|aventurasnahistoria\.|amenteemaravilhosa\.|substack\.|medium\./.test(d)) return 'editorial';
  if (/\.org(\.br)?$/.test(d)) return 'editorial';
  return 'web';
}

function qualityForType(type) {
  return ({
    academic: 0.95,
    institutional: 0.90,
    journalistic: 0.82,
    editorial: 0.70,
    web: 0.55,
    social: 0.42,
    commercial: 0.30
  })[type] ?? 0.55;
}

function authorityForDomain(domain, type) {
  const d = String(domain || '').toLowerCase();
  if (/\.gov(\.br)?$|\.jus\.br$|\.leg\.br$|\.mp\.br$/.test(d)) return 0.97;
  if (/\.edu(\.br)?$|\.ac\.uk$|\.edu$|seer\.|scielo\.|pubmed\./.test(d)) return 0.95;
  if (/doi\.org$/.test(d)) return 0.92;
  if (/researchgate\.net$/.test(d)) return 0.78;
  if (/reuters\.|apnews\.|bbc\.|nytimes\.|washingtonpost\.|estadao\.|folha\.|g1\.|oglobo\.|veja\.|exame\.|valor\.com\.|uol\.com\./.test(d)) return 0.90;
  if (type === 'editorial') return 0.72;
  if (type === 'social') return 0.30;
  if (type === 'commercial') return 0.25;
  return 0.50;
}

function recencyScore(publishedAt) {
  if (!publishedAt) return 0.50;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return 0.50;
  const days = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  if (days <= 30) return 1.00;
  if (days <= 90) return 0.90;
  if (days <= 365) return 0.75;
  if (days <= 1095) return 0.55;
  return 0.35;
}

function editorialRank({ relevance, quality, recency, authority, correspondence }) {
  // Ranking editorial refinado: relevância 30%, qualidade 25%,
  // autoridade 20%, recência 15%, correspondência 10%.
  const score =
    0.30 * relevance +
    0.25 * quality +
    0.20 * authority +
    0.15 * recency +
    0.10 * correspondence;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function confidenceForSource({ quality, authority, recency }) {
  const score = Number((0.50 * quality + 0.35 * authority + 0.15 * recency).toFixed(4));
  const level = score >= 0.80 ? 'high' : score >= 0.60 ? 'medium' : 'low';
  return { score, level };
}

function scoreSource({ title, objective, sourceTitle, summary, domain, url, relevance, publishedAt }) {
  const type = classifySource(domain, url);
  const quality = qualityForType(type);
  const authority = authorityForDomain(domain, type);
  const recency = recencyScore(publishedAt);
  const correspondence = correspondenceScore(title, objective, sourceTitle, summary);
  const rel = Number.isFinite(Number(relevance)) ? Math.max(0, Math.min(1, Number(relevance))) : 0.5;
  const rank = editorialRank({ relevance: rel, quality, recency, authority, correspondence });
  const confidence = confidenceForSource({ quality, authority, recency });
  return { type, quality, authority, recency, correspondence, rank, confidence };
}

async function scoreInvestigationSources(investigationId, title, objective) {
  const [sources] = await pool.query(
    `SELECT id, title, url, domain, published_at, summary, relevance_score
     FROM sources WHERE investigation_id = ?`,
    [investigationId]
  );

  for (const source of sources) {
    const scores = scoreSource({
      title,
      objective,
      sourceTitle: source.title,
      summary: source.summary,
      domain: source.domain,
      url: source.url,
      relevance: source.relevance_score,
      publishedAt: source.published_at
    });
    await pool.query(
      `UPDATE sources SET source_type = ?, quality_score = ?, authority_score = ? WHERE id = ?`,
      [scores.type, scores.quality, scores.authority, source.id]
    );
  }
}

async function getRankedSources(investigationId, title, objective) {
  const [sources] = await pool.query(
    `SELECT id, title, url, domain, source_type, published_at, summary,
            relevance_score, quality_score, authority_score, created_at
     FROM sources WHERE investigation_id = ?`,
    [investigationId]
  );

  return sources.map(source => {
    const quality = Number(source.quality_score ?? qualityForType(source.source_type));
    const authority = Number(source.authority_score ?? authorityForDomain(source.domain, source.source_type));
    const recency = recencyScore(source.published_at);
    const correspondence = correspondenceScore(title, objective, source.title, source.summary);
    const relevance = Number(source.relevance_score ?? 0.5);
    return {
      ...source,
      relevance_score: source.relevance_score == null ? null : Number(source.relevance_score),
      quality_score: quality,
      authority_score: authority,
      recency_score: recency,
      correspondence_score: correspondence,
      ranking_score: editorialRank({ relevance, quality, recency, authority, correspondence }),
      confidence_score: confidenceForSource({ quality, authority, recency }).score,
      confidence_level: confidenceForSource({ quality, authority, recency }).level
    };
  }).sort((a, b) => b.ranking_score - a.ranking_score || b.id - a.id).slice(0, 50);
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw_response: text.slice(0, 4000) }; }
  if (!response.ok) {
    const detail = data?.detail || data?.message || data?.error || `Tavily respondeu HTTP ${response.status}.`;
    const error = new Error(String(detail));
    error.code = 'SEARCH_PROVIDER';
    error.status = response.status;
    throw error;
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  return { results, diagnostics: { http_status: response.status, request_id: data?.request_id || null, response_time: data?.response_time || null } };
}

function buildSearchQueries(title, objective) {
  const cleanTitle = String(title || '').trim();
  const cleanObjective = String(objective || '').trim();
  const queries = [];
  if (cleanTitle) queries.push(cleanTitle);
  if (cleanTitle && cleanObjective) {
    const compactObjective = cleanObjective.replace(/[—–-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    if (compactObjective) queries.push(`${cleanTitle} ${compactObjective}`.slice(0, 400));
  }
  return [...new Set(queries)];
}

async function runResearchJob(jobId) {
  let investigationId = null;
  try {
    const [[job]] = await pool.query(
      `SELECT rj.id, rj.investigation_id, rj.status, i.title, i.objective
       FROM research_jobs rj INNER JOIN investigations i ON i.id = rj.investigation_id WHERE rj.id = ?`, [jobId]
    );
    if (!job || job.status !== 'queued') return;
    investigationId = job.investigation_id;
    await pool.query(`UPDATE research_jobs SET status='running', started_at=NOW(), error_message=NULL WHERE id=? AND status='queued'`, [jobId]);
    await pool.query(`UPDATE investigations SET status='researching', updated_at=NOW() WHERE id=?`, [investigationId]);

    const queries = buildSearchQueries(job.title, job.objective);
    if (!queries.length) throw Object.assign(new Error('Não foi possível montar uma consulta de pesquisa.'), { code: 'SEARCH_QUERY' });

    const attempts = [];
    let selected = null;
    for (const query of queries) {
      try {
        const response = await tavilySearch(query);
        attempts.push({ query, ...response.diagnostics, raw_results: response.results.length });
        if (response.results.length) { selected = { query, ...response }; break; }
      } catch (error) {
        attempts.push({ query, http_status: error.status || null, error_code: error.code || null, error: String(error.message || error).slice(0,2000) });
        throw error;
      }
    }
    if (!selected) {
      const error = new Error('A Tavily respondeu sem resultados para as consultas realizadas.');
      error.code = 'SEARCH_EMPTY';
      error.payload = JSON.stringify({ provider:'tavily', query:queries[0], queries_attempted:queries, attempts, raw_results:0, inserted:0, duplicates:0, max_results:maxResults, outcome:'empty_results' });
      throw error;
    }

    let inserted = 0, duplicates = 0, skipped = 0;
    for (const item of selected.results) {
      const url = normalizeUrl(item.url);
      const title = String(item.title || '').trim();
      if (!url || !title) { skipped++; continue; }
      const [existing] = await pool.query(`SELECT id FROM sources WHERE investigation_id=? AND url=? LIMIT 1`, [investigationId, url]);
      if (existing.length) { duplicates++; continue; }
      const publishedValue = item.published_date || item.published_at || item.date || null;
      let publishedAt = null;
      if (publishedValue) {
        const parsed = new Date(publishedValue);
        if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString().slice(0,19).replace('T',' ');
      }
      await pool.query(
        `INSERT INTO sources (investigation_id,title,url,domain,source_type,published_at,summary,relevance_score,quality_score,authority_score,raw_data,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [investigationId, title.slice(0,65535), url.slice(0,65535), getDomain(url), 'web', publishedAt,
         String(item.content || '').slice(0,10000) || null, Number.isFinite(Number(item.score)) ? Number(item.score) : null,
         null, null, JSON.stringify(item)]
      );
      inserted++;
    }

    await scoreInvestigationSources(investigationId, job.title, job.objective);
    const payload = JSON.stringify({ provider:'tavily', query:selected.query, queries_attempted:queries, attempts,
      raw_results:selected.results.length, inserted, duplicates, skipped, max_results:maxResults,
      request_id:selected.diagnostics.request_id, response_time:selected.diagnostics.response_time, outcome:'success' });
    await pool.query(`UPDATE research_jobs SET status='completed',finished_at=NOW(),payload=? WHERE id=?`, [payload, jobId]);
    await pool.query(`UPDATE investigations SET status='completed',updated_at=NOW() WHERE id=?`, [investigationId]);
  } catch (error) {
    console.error(`Research job ${jobId} failed:`, error);
    if (investigationId) await pool.query(`UPDATE investigations SET status='error',updated_at=NOW() WHERE id=?`, [investigationId]).catch(()=>{});
    const payload = error.payload || JSON.stringify({ provider:'tavily', outcome:'error', error_code:error.code||null, http_status:error.status||null });
    await pool.query(`UPDATE research_jobs SET status='failed',finished_at=NOW(),error_message=?,payload=? WHERE id=?`,
      [String(error.message||error).slice(0,10000), payload, jobId]).catch(()=>{});
  }
}

app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'radar-editorial',version:appVersion,framework:'express',node:process.version,database:'mysql',search_provider:'tavily',search_configured:Boolean(String(process.env.TAVILY_API_KEY||'').trim())}); }
  catch(error){ res.status(503).json({ok:false,service:'radar-editorial',database:'unavailable',error:error.message}); }
});

app.get('/api/investigations', async (_req,res) => {
  try { const [rows]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations ORDER BY id DESC LIMIT 50`); res.json(rows); }
  catch(error){ res.status(500).json({error:error.message}); }
});

app.post('/api/investigations', async (req,res) => {
  const title=String(req.body?.title||'').trim(), objective=String(req.body?.objective||'').trim();
  if(!title) return res.status(400).json({error:'Informe o tema da investigação.'});
  try { const [result]=await pool.query(`INSERT INTO investigations(title,objective,status,created_at,updated_at) VALUES(?,?, 'draft',NOW(),NOW())`,[title,objective||null]);
    const [rows]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[result.insertId]); res.status(201).json(rows[0]); }
  catch(error){ res.status(500).json({error:error.message}); }
});

app.get('/api/investigations/:id', async (req,res) => {
  try {
    const [[investigation]]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[req.params.id]);
    if(!investigation) return res.status(404).json({error:'Investigação não encontrada.'});
    await scoreInvestigationSources(investigation.id, investigation.title, investigation.objective);
    const [[counts]]=await pool.query(`SELECT (SELECT COUNT(*) FROM sources WHERE investigation_id=?) AS sources, 0 AS evidence, 0 AS gaps`,[req.params.id]);
    const [jobs]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE investigation_id=? ORDER BY id DESC LIMIT 1`,[req.params.id]);
    const sources=await getRankedSources(investigation.id,investigation.title,investigation.objective);
    res.json({...investigation,counts,latest_job:jobs[0]||null,sources,ranking:{relevance:0.30,quality:0.25,authority:0.20,recency:0.15,correspondence:0.10}});
  } catch(error){ res.status(500).json({error:error.message}); }
});

app.post('/api/investigations/:id/jobs', async (req,res) => {
  const investigationId=Number(req.params.id);
  if(!Number.isInteger(investigationId)||investigationId<1) return res.status(400).json({error:'ID de investigação inválido.'});
  try {
    if(!String(process.env.TAVILY_API_KEY||'').trim()) return res.status(503).json({error:'O motor Web ainda não está configurado: TAVILY_API_KEY ausente.'});
    const [[investigation]]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[investigationId]);
    if(!investigation) return res.status(404).json({error:'Investigação não encontrada.'});
    const [activeJobs]=await pool.query(`SELECT id,status FROM research_jobs WHERE investigation_id=? AND status IN('queued','running') ORDER BY id DESC LIMIT 1`,[investigationId]);
    if(activeJobs.length) return res.status(409).json({error:'Já existe uma pesquisa na fila ou em execução.'});
    const [result]=await pool.query(`INSERT INTO research_jobs(investigation_id,status,job_type,payload,created_at) VALUES(?,'queued','research',?,NOW())`,[investigationId,JSON.stringify({provider:'tavily',max_results:maxResults})]);
    const [[job]]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE id=?`,[result.insertId]);
    res.status(201).json({investigation:{...investigation,latest_job:job}}); void runResearchJob(result.insertId);
  } catch(error){ res.status(500).json({error:error.message}); }
});

const publicPath=path.join(__dirname,'public');
app.use(express.static(publicPath,{etag:false,maxAge:0,setHeaders:(res,filePath)=>{if(filePath.endsWith('.css')||filePath.endsWith('.js'))res.setHeader('Cache-Control','no-store');}}));
app.get(/^(?!\/api(?:\/|$)).*/,(_req,res)=>res.sendFile(path.join(publicPath,'index.html')));
app.listen(port,'0.0.0.0',()=>console.log(`Radar Editorial ${appVersion} running on port ${port}`));
