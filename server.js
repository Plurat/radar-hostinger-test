import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const maxResults = Math.min(Math.max(Number(process.env.SEARCH_MAX_RESULTS || 15), 1), 20);
const appVersion = '0.5.1';
const openAiModel = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map();
const signupAttempts = new Map();
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') }; }
function verifyPassword(password,salt,expected){ try { const actual=crypto.scryptSync(String(password),String(salt),64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(String(expected),'hex')); } catch { return false; } }
function hashToken(token){ return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
function isAdmin(user){ return user?.role==='admin'; }
function publicUser(u){ return {id:Number(u.id),email:u.email,name:u.name||'',role:u.role,status:u.status,investigations_limit:Number(u.investigations_limit),research_limit:Number(u.research_limit),analysis_limit:Number(u.analysis_limit),sources_per_research:Number(u.sources_per_research),created_at:u.created_at,last_login_at:u.last_login_at}; }
function monthStart(){ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
async function ensureAuthSchema(){
 await pool.query(`CREATE TABLE IF NOT EXISTS users (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,email VARCHAR(255) NOT NULL,name VARCHAR(255) NULL,password_hash VARCHAR(255) NOT NULL,password_salt VARCHAR(128) NOT NULL,role VARCHAR(32) NOT NULL DEFAULT 'user',status VARCHAR(32) NOT NULL DEFAULT 'active',investigations_limit INT NOT NULL DEFAULT 10,research_limit INT NOT NULL DEFAULT 30,analysis_limit INT NOT NULL DEFAULT 20,sources_per_research INT NOT NULL DEFAULT 15,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,last_login_at DATETIME NULL,PRIMARY KEY(id),UNIQUE KEY uq_users_email(email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
 await pool.query(`CREATE TABLE IF NOT EXISTS sessions (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,token_hash CHAR(64) NOT NULL,expires_at DATETIME NOT NULL,created_at DATETIME NOT NULL,last_seen_at DATETIME NULL,PRIMARY KEY(id),UNIQUE KEY uq_sessions_token(token_hash),KEY idx_sessions_user(user_id),CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
 const [[c]]=await pool.query(`SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='investigations' AND column_name='user_id'`); if(!Number(c.n)) await pool.query(`ALTER TABLE investigations ADD COLUMN user_id BIGINT UNSIGNED NULL, ADD KEY idx_investigations_user(user_id)`);
 const email=normalizeEmail(process.env.ADMIN_EMAIL), password=String(process.env.ADMIN_PASSWORD||''); if(email && password){ const [[u]]=await pool.query(`SELECT id FROM users WHERE email=? LIMIT 1`,[email]); if(!u){const {salt,hash}=hashPassword(password);await pool.query(`INSERT INTO users(email,name,password_hash,password_salt,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,updated_at) VALUES(?,?,?,?, 'admin','active',-1,-1,-1,20,NOW(),NOW())`,[email,'Administrador',hash,salt]);}}
 const [[admin]]=await pool.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`); if(admin) await pool.query(`UPDATE investigations SET user_id=? WHERE user_id IS NULL`,[admin.id]); await pool.query(`DELETE FROM sessions WHERE expires_at<NOW()`).catch(()=>{});
}
async function currentUser(req){ const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('radar_session=')); if(!raw)return null; const token=decodeURIComponent(raw.slice(14)); const [[u]]=await pool.query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW() LIMIT 1`,[hashToken(token)]); if(!u||u.status!=='active')return null; await pool.query(`UPDATE sessions SET last_seen_at=NOW() WHERE token_hash=?`,[hashToken(token)]).catch(()=>{}); return u; }
async function requireAuth(req,res,next){ try{req.user=await currentUser(req); if(!req.user)return res.status(401).json({error:'Sessão não autenticada.'}); next();}catch{res.status(500).json({error:'Não foi possível validar a sessão.'});} }
function requireAdmin(req,res,next){ if(!req.user)return res.status(401).json({error:'Sessão não autenticada.'}); if(!isAdmin(req.user))return res.status(403).json({error:'Acesso restrito ao administrador.'}); next(); }
async function usageForUser(id){ const start=monthStart(); const [[a]]=await pool.query(`SELECT COUNT(*) n FROM investigations WHERE user_id=? AND created_at>=?`,[id,start]); const [[r]]=await pool.query(`SELECT COUNT(*) n FROM research_jobs j JOIN investigations i ON i.id=j.investigation_id WHERE i.user_id=? AND j.job_type='research' AND j.created_at>=?`,[id,start]); const [[x]]=await pool.query(`SELECT COUNT(*) n FROM research_jobs j JOIN investigations i ON i.id=j.investigation_id WHERE i.user_id=? AND j.job_type='analysis' AND j.created_at>=?`,[id,start]); const [[ai]]=await pool.query(`SELECT COUNT(*) requests,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(estimated_cost),0) estimated_cost FROM ai_usage au JOIN investigations i ON i.id=au.investigation_id WHERE i.user_id=? AND au.created_at>=?`,[id,start]); return {investigations:Number(a.n),research:Number(r.n),analysis:Number(x.n),ai_requests:Number(ai.requests||0),input_tokens:Number(ai.input_tokens||0),output_tokens:Number(ai.output_tokens||0),estimated_cost:Number(ai.estimated_cost||0)}; }
function setSession(res,token){res.setHeader('Set-Cookie',`radar_session=${encodeURIComponent(token)}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV==='production'?'; Secure':''}`);}


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

function publishedDateFromRaw(rawData) {
  if (!rawData) return null;
  try {
    const item = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    const value = item?.published_date || item?.published_at || item?.date || null;
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0,19).replace('T',' ');
  } catch (_) { return null; }
}

function recencyInfo(publishedAt) {
  if (!publishedAt) return { score: null, label: 'não identificada', year: null };
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return { score: null, label: 'não identificada', year: null };
  const days = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  let score;
  if (days <= 30) score = 1.00;
  else if (days <= 90) score = 0.90;
  else if (days <= 365) score = 0.75;
  else if (days <= 1095) score = 0.55;
  else score = 0.35;
  return { score, label: date.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }), year: date.getUTCFullYear() };
}

function weightedAvailable(parts) {
  const available = parts.filter(item => item.value != null && Number.isFinite(Number(item.value)) && Number(item.weight) > 0);
  if (!available.length) return null;
  const weightTotal = available.reduce((sum, item) => sum + Number(item.weight), 0);
  return available.reduce((sum, item) => sum + (Number(item.weight) / weightTotal) * Number(item.value), 0);
}

function editorialRank({ relevance, quality, recency, authority, correspondence }) {
  // Pesos-base: relevância 30%, qualidade 25%, autoridade 20%, recência 15%, correspondência 10%.
  // Quando um critério não possui dado confiável, seu peso é redistribuído proporcionalmente
  // entre os critérios disponíveis. Assim o Radar não inventa uma pontuação de recência.
  const score = weightedAvailable([
    { value: relevance, weight: 0.30 },
    { value: quality, weight: 0.25 },
    { value: authority, weight: 0.20 },
    { value: recency, weight: 0.15 },
    { value: correspondence, weight: 0.10 }
  ]);
  return score == null ? 0 : Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function confidenceForSource({ quality, authority, recency }) {
  // Pesos-base: qualidade 50%, autoridade 35%, recência 15%.
  // Sem recência confiável, os pesos disponíveis são normalizados.
  const score = weightedAvailable([
    { value: quality, weight: 0.50 },
    { value: authority, weight: 0.35 },
    { value: recency, weight: 0.15 }
  ]) ?? 0;
  const rounded = Number(score.toFixed(4));
  const level = rounded >= 0.80 ? 'high' : rounded >= 0.60 ? 'medium' : 'low';
  return { score: rounded, level };
}


function normalizedText(text) {
  return tokens(text).sort().join(' ');
}

function jaccardSimilarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection++;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

function sourceSimilarity(a, b) {
  const titleScore = jaccardSimilarity(a.title, b.title);
  const contentScore = jaccardSimilarity(`${a.title} ${a.summary || ''}`, `${b.title} ${b.summary || ''}`);
  return 0.60 * titleScore + 0.40 * contentScore;
}

async function analyzeSourceRelations(investigationId) {
  const [sources] = await pool.query(
    `SELECT id, title, url, domain, summary FROM sources WHERE investigation_id = ? ORDER BY id ASC`,
    [investigationId]
  );

  let duplicatePairs = 0;
  let relatedPairs = 0;
  const duplicateIds = new Set();
  const groups = [];

  // Rebuild relations for this investigation so the result remains deterministic.
  if (sources.length > 1) {
    const ids = sources.map(s => s.id);
    const placeholders = ids.map(() => '?').join(',');
    await pool.query(
      `DELETE sr FROM source_relations sr
       INNER JOIN sources s ON s.id = sr.source_id
       WHERE s.investigation_id = ? AND sr.relation_type IN ('duplicate','related')`,
      [investigationId]
    );

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i];
        const b = sources[j];
        const urlA = normalizeUrl(a.url);
        const urlB = normalizeUrl(b.url);
        const sameUrl = urlA && urlB && urlA === urlB;
        const similarity = sameUrl ? 1 : sourceSimilarity(a, b);
        let relationType = null;
        if (sameUrl || similarity >= 0.90) relationType = 'duplicate';
        else if (similarity >= 0.62) relationType = 'related';
        if (!relationType) continue;

        await pool.query(
          `INSERT IGNORE INTO source_relations (source_id, related_source_id, relation_type, score) VALUES (?,?,?,?)`,
          [a.id, b.id, relationType, Number(similarity.toFixed(4))]
        );
        if (relationType === 'duplicate') {
          duplicatePairs++;
          duplicateIds.add(b.id);
        } else {
          relatedPairs++;
        }
      }
    }
  }

  // Build connected groups of related/duplicate sources for display.
  const [relations] = await pool.query(
    `SELECT sr.source_id, sr.related_source_id, sr.relation_type, sr.score
     FROM source_relations sr
     INNER JOIN sources s ON s.id = sr.source_id
     WHERE s.investigation_id = ? AND sr.relation_type IN ('duplicate','related')`,
    [investigationId]
  );
  const parent = new Map(sources.map(s => [s.id, s.id]));
  function find(x) {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== x) { const n = parent.get(x); parent.set(x, r); x = n; }
    return r;
  }
  function union(a,b) { const ra=find(a), rb=find(b); if (ra!==rb) parent.set(rb,ra); }
  for (const r of relations) union(r.source_id, r.related_source_id);
  const groupMap = new Map();
  for (const src of sources) { const root=find(src.id); if(!groupMap.has(root)) groupMap.set(root,[]); groupMap.get(root).push(src.id); }
  let groupNumber = 0;
  for (const members of groupMap.values()) if (members.length > 1) groups.push({ id: ++groupNumber, source_ids: members });

  return { duplicate_pairs: duplicatePairs, duplicate_sources: duplicateIds.size, related_pairs: relatedPairs, groups };
}

function scoreSource({ title, objective, sourceTitle, summary, domain, url, relevance, publishedAt }) {
  const type = classifySource(domain, url);
  const quality = qualityForType(type);
  const authority = authorityForDomain(domain, type);
  const recency = recencyInfo(publishedAt);
  const correspondence = correspondenceScore(title, objective, sourceTitle, summary);
  const rel = Number.isFinite(Number(relevance)) ? Math.max(0, Math.min(1, Number(relevance))) : 0.5;
  const rank = editorialRank({ relevance: rel, quality, recency: recency.score, authority, correspondence });
  const confidence = confidenceForSource({ quality, authority, recency: recency.score });
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
    `SELECT id, title, url, domain, source_type, published_at, raw_data, summary,
            relevance_score, quality_score, authority_score, created_at
     FROM sources WHERE investigation_id = ?`,
    [investigationId]
  );
  const [relations] = await pool.query(
    `SELECT source_id, related_source_id, relation_type, score
     FROM source_relations sr
     INNER JOIN sources s ON s.id = sr.source_id
     WHERE s.investigation_id = ? AND relation_type IN ('duplicate','related')`,
    [investigationId]
  );
  const relationBySource = new Map();
  for (const r of relations) {
    if (!relationBySource.has(r.source_id)) relationBySource.set(r.source_id, []);
    relationBySource.get(r.source_id).push({ id: r.related_source_id, type: r.relation_type, score: Number(r.score || 0) });
  }
  return sources.map(source => {
    const quality = Number(source.quality_score ?? qualityForType(source.source_type));
    const authority = Number(source.authority_score ?? authorityForDomain(source.domain, source.source_type));
    const effectivePublishedAt = source.published_at || publishedDateFromRaw(source.raw_data);
    const recency = recencyInfo(effectivePublishedAt);
    const correspondence = correspondenceScore(title, objective, source.title, source.summary);
    const relevance = Number(source.relevance_score ?? 0.5);
    const confidence = confidenceForSource({ quality, authority, recency: recency.score });
    return {
      ...source,
      published_at: effectivePublishedAt,
      relevance_score: source.relevance_score == null ? null : Number(source.relevance_score),
      quality_score: quality,
      authority_score: authority,
      recency_score: recency.score,
      recency_label: recency.label,
      recency_year: recency.year,
      correspondence_score: correspondence,
      ranking_score: editorialRank({ relevance, quality, recency: recency.score, authority, correspondence }),
      confidence_score: confidence.score,
      confidence_level: confidence.level,
      relations: relationBySource.get(source.id) || []
    };
  }).sort((a, b) => b.ranking_score - a.ranking_score || b.id - a.id).slice(0, 50);
}

async function tavilySearch(query, resultLimit=maxResults) {
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
      max_results: Math.min(maxResults, Math.max(1, Number(resultLimit || maxResults))),
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


async function ensureAnalysisSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS source_analyses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      investigation_id BIGINT UNSIGNED NOT NULL,
      source_id BIGINT UNSIGNED NOT NULL,
      model VARCHAR(128) NULL,
      analysis JSON NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_source_analysis (investigation_id, source_id),
      KEY idx_source_analyses_investigation (investigation_id),
      CONSTRAINT fk_sa_investigation FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
      CONSTRAINT fk_sa_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

async function openAiAnalyzeSources(investigation, sources) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('A análise por IA ainda não está configurada: OPENAI_API_KEY ausente.');
    error.code = 'AI_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const sourceInput = sources.map(source => ({
    source_id: Number(source.id),
    title: String(source.title || '').slice(0, 2000),
    domain: String(source.domain || ''),
    source_type: String(source.source_type || ''),
    published_at: source.published_at || null,
    summary: String(source.summary || '').slice(0, 5000),
    url: String(source.url || '').slice(0, 2000)
  }));

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source_id: { type: 'integer' },
            editorial_summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'array', items: { type: 'string' } },
            gaps: { type: 'array', items: { type: 'string' } },
            editorial_relevance: { type: 'string' }
          },
          required: ['source_id','editorial_summary','key_points','evidence','gaps','editorial_relevance']
        }
      }
    },
    required: ['sources']
  };

  const body = {
    model: openAiModel,
    input: [
      {
        role: 'system',
        content: [{
          type: 'input_text',
          text: `Você é o analista editorial do Radar Editorial. Analise as fontes fornecidas para a investigação.\n\nREGRAS: use somente as informações presentes nos metadados e resumos fornecidos; não invente resultados, números, autores ou conclusões. Se o material for insuficiente para afirmar algo, diga isso explicitamente. Diferencie evidência de opinião, descrição ou alegação. Em "gaps", registre limitações ou lacunas que possam ser identificadas com segurança a partir do material disponível, sem transformar ausência de informação em uma afirmação factual. Em "editorial_relevance", explique de forma curta como a fonte pode ser útil para a investigação. Responda em português do Brasil.`
        }]
      },
      {
        role: 'user',
        content: [{
          type: 'input_text',
          text: JSON.stringify({
            investigation: { title: investigation.title, objective: investigation.objective || '' },
            sources: sourceInput
          })
        }]
      }
    ],
    text: { format: { type: 'json_schema', name: 'radar_source_analysis', strict: true, schema } }
  };

  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const responseText = await response.text();
  let data = null;
  try { data = JSON.parse(responseText); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data?.error?.message || `OpenAI respondeu com HTTP ${response.status}.`);
    error.status = response.status;
    error.code = data?.error?.code || 'OPENAI_HTTP_ERROR';
    throw error;
  }
  const text = extractResponseText(data);
  if (!text) {
    const error = new Error('A IA respondeu sem conteúdo de análise.');
    error.code = 'AI_EMPTY';
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) {
    const error = new Error('A resposta da IA não pôde ser interpretada como JSON.');
    error.code = 'AI_INVALID_JSON';
    throw error;
  }
  return {
    parsed,
    diagnostics: {
      model: openAiModel,
      response_time_ms: Date.now() - started,
      request_id: data?.id || null,
      input_tokens: data?.usage?.input_tokens ?? data?.usage?.prompt_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? data?.usage?.completion_tokens ?? null
    }
  };
}

async function runAnalysisJob(jobId) {
  let investigationId = null;
  try {
    const [[job]] = await pool.query(
      `SELECT rj.id, rj.investigation_id, rj.status, i.title, i.objective
       FROM research_jobs rj INNER JOIN investigations i ON i.id = rj.investigation_id WHERE rj.id = ?`, [jobId]
    );
    if (!job || job.status !== 'queued') return;
    investigationId = job.investigation_id;
    await pool.query(`UPDATE research_jobs SET status='running', started_at=NOW(), error_message=NULL WHERE id=? AND status='queued'`, [jobId]);

    const [sources] = await pool.query(
      `SELECT id,title,url,domain,source_type,published_at,summary FROM sources WHERE investigation_id=? ORDER BY id ASC`,
      [investigationId]
    );
    if (!sources.length) {
      const error = new Error('Não há fontes armazenadas para analisar. Execute uma pesquisa Web primeiro.');
      error.code = 'NO_SOURCES';
      throw error;
    }

    const result = await openAiAnalyzeSources(job, sources);
    const returned = Array.isArray(result.parsed?.sources) ? result.parsed.sources : [];
    const byId = new Map(sources.map(s => [Number(s.id), s]));
    let saved = 0;
    let evidenceCount = 0;
    let gapCount = 0;

    for (const item of returned) {
      const source = byId.get(Number(item.source_id));
      if (!source) continue;
      const analysis = {
        editorial_summary: String(item.editorial_summary || '').trim(),
        key_points: Array.isArray(item.key_points) ? item.key_points.map(x => String(x).trim()).filter(Boolean).slice(0,8) : [],
        evidence: Array.isArray(item.evidence) ? item.evidence.map(x => String(x).trim()).filter(Boolean).slice(0,8) : [],
        gaps: Array.isArray(item.gaps) ? item.gaps.map(x => String(x).trim()).filter(Boolean).slice(0,8) : [],
        editorial_relevance: String(item.editorial_relevance || '').trim()
      };
      evidenceCount += analysis.evidence.length;
      gapCount += analysis.gaps.length;
      await pool.query(
        `INSERT INTO source_analyses (investigation_id,source_id,model,analysis,created_at,updated_at)
         VALUES (?,?,?,?,NOW(),NOW())
         ON DUPLICATE KEY UPDATE model=VALUES(model), analysis=VALUES(analysis), updated_at=NOW()`,
        [investigationId, source.id, openAiModel, JSON.stringify(analysis)]
      );
      saved++;
    }

    if (!saved) throw Object.assign(new Error('A IA não retornou análises válidas para as fontes.'), { code: 'AI_NO_SOURCE_ANALYSIS' });
    const inputTokens = Number(result.diagnostics.input_tokens || 0);
    const outputTokens = Number(result.diagnostics.output_tokens || 0);
    const estimatedCost = (inputTokens * 0.20 / 1000000) + (outputTokens * 1.20 / 1000000);
    await pool.query(`INSERT INTO ai_usage(investigation_id,provider,model,input_tokens,output_tokens,estimated_cost,created_at) VALUES(?,?,?,?,?,?,NOW())`, [investigationId,'openai',openAiModel,inputTokens || null,outputTokens || null,Number(estimatedCost.toFixed(6))]);
    const payload = JSON.stringify({ provider:'openai', model:openAiModel, sources_received:sources.length, sources_analyzed:saved,
      evidence:evidenceCount, gaps:gapCount, response_time_ms:result.diagnostics.response_time_ms,
      request_id:result.diagnostics.request_id, input_tokens:result.diagnostics.input_tokens, output_tokens:result.diagnostics.output_tokens, estimated_cost:Number(estimatedCost.toFixed(6)), outcome:'success' });
    await pool.query(`UPDATE research_jobs SET status='completed',finished_at=NOW(),payload=? WHERE id=?`, [payload, jobId]);
    await pool.query(`UPDATE investigations SET updated_at=NOW() WHERE id=?`, [investigationId]);
  } catch (error) {
    console.error(`Analysis job ${jobId} failed:`, error);
    const payload = JSON.stringify({ provider:'openai', model:openAiModel, outcome:'error', error_code:error.code||null, http_status:error.status||null });
    await pool.query(`UPDATE research_jobs SET status='failed',finished_at=NOW(),error_message=?,payload=? WHERE id=?`,
      [String(error.message||error).slice(0,10000), payload, jobId]).catch(()=>{});
  }
}

async function runResearchJob(jobId) {
  let investigationId = null;
  try {
    const [[job]] = await pool.query(
      `SELECT rj.id, rj.investigation_id, rj.status, rj.payload, i.title, i.objective
       FROM research_jobs rj INNER JOIN investigations i ON i.id = rj.investigation_id WHERE rj.id = ?`, [jobId]
    );
    if (!job || job.status !== 'queued') return;
    investigationId = job.investigation_id;
    await pool.query(`UPDATE research_jobs SET status='running', started_at=NOW(), error_message=NULL WHERE id=? AND status='queued'`, [jobId]);
    await pool.query(`UPDATE investigations SET status='researching', updated_at=NOW() WHERE id=?`, [investigationId]);

    const queries = buildSearchQueries(job.title, job.objective);
    if (!queries.length) throw Object.assign(new Error('Não foi possível montar uma consulta de pesquisa.'), { code: 'SEARCH_QUERY' });

    const jobPayload = (() => { try { return job.payload ? JSON.parse(job.payload) : {}; } catch { return {}; } })();
    const resultLimit = Math.min(maxResults, Math.max(1, Number(jobPayload.max_results || maxResults)));
    const attempts = [];
    let selected = null;
    for (const query of queries) {
      try {
        const response = await tavilySearch(query, resultLimit);
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
      error.payload = JSON.stringify({ provider:'tavily', query:queries[0], queries_attempted:queries, attempts, raw_results:0, inserted:0, duplicates:0, max_results:resultLimit, outcome:'empty_results' });
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


app.post('/api/auth/login', async (req,res)=>{ const email=normalizeEmail(req.body?.email),password=String(req.body?.password||''),key=`${req.ip}:${email}`,now=Date.now(); let a=loginAttempts.get(key)||{n:0,until:now+60000}; if(now>a.until)a={n:0,until:now+60000}; if(a.n>=5)return res.status(429).json({error:'Muitas tentativas. Aguarde um minuto.'}); const [[u]]=await pool.query(`SELECT * FROM users WHERE email=? LIMIT 1`,[email]); if(u&&u.status==='pending')return res.status(403).json({error:'Seu cadastro está aguardando aprovação do administrador.'}); if(u&&u.status==='inactive')return res.status(403).json({error:'Seu acesso está desativado. Entre em contato com o administrador.'}); if(!u||!verifyPassword(password,u.password_salt,u.password_hash)){a.n++;loginAttempts.set(key,a);return res.status(401).json({error:'E-mail ou senha inválidos.'});} loginAttempts.delete(key);const token=crypto.randomBytes(32).toString('hex');await pool.query(`INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 7 DAY),NOW(),NOW())`,[u.id,hashToken(token)]);await pool.query(`UPDATE users SET last_login_at=NOW() WHERE id=?`,[u.id]);setSession(res,token);res.json({user:publicUser(u)});});
app.post('/api/auth/signup', async (req,res)=>{ const email=normalizeEmail(req.body?.email),name=String(req.body?.name||'').trim(),password=String(req.body?.password||''),confirm=String(req.body?.confirm_password||''); const key=`${req.ip}:${email}`,now=Date.now(); let a=signupAttempts.get(key)||{n:0,until:now+3600000}; if(now>a.until)a={n:0,until:now+3600000}; if(a.n>=5)return res.status(429).json({error:'Muitas solicitações de cadastro. Tente novamente mais tarde.'}); if(!email.includes('@'))return res.status(400).json({error:'Informe um e-mail válido.'}); if(name.length<2)return res.status(400).json({error:'Informe seu nome.'}); if(password.length<8)return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'}); if(password!==confirm)return res.status(400).json({error:'As senhas não coincidem.'}); const [[existing]]=await pool.query(`SELECT id,status FROM users WHERE email=? LIMIT 1`,[email]); if(existing)return res.status(409).json({error:existing.status==='pending'?'Já existe um cadastro pendente para este e-mail.':'Já existe uma conta com este e-mail.'}); const {salt,hash}=hashPassword(password); try{await pool.query(`INSERT INTO users(email,name,password_hash,password_salt,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,updated_at) VALUES(?,?,?,?, 'user','pending',10,30,20,15,NOW(),NOW())`,[email,name,hash,salt]);signupAttempts.delete(key);res.status(201).json({ok:true,message:'Cadastro enviado. Aguarde a aprovação do administrador.'});}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Já existe uma conta com este e-mail.'});res.status(500).json({error:'Não foi possível concluir o cadastro.'});}});
app.post('/api/auth/logout',async(req,res)=>{const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('radar_session='));if(raw)await pool.query(`DELETE FROM sessions WHERE token_hash=?`,[hashToken(decodeURIComponent(raw.slice(14)))]).catch(()=>{});res.setHeader('Set-Cookie','radar_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');res.json({ok:true});});
app.get('/api/auth/me',requireAuth,async(req,res)=>res.json({user:publicUser(req.user),usage:await usageForUser(req.user.id)}));
app.get('/api/admin/users',requireAuth,requireAdmin,async(_req,res)=>{const [rows]=await pool.query(`SELECT id,email,name,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,last_login_at FROM users ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, id`);const out=[];for(const u of rows)out.push({...publicUser(u),usage:await usageForUser(u.id)});res.json(out);});
app.post('/api/admin/users',requireAuth,requireAdmin,async(req,res)=>{const email=normalizeEmail(req.body?.email),name=String(req.body?.name||'').trim(),password=String(req.body?.password||'');if(!email.includes('@'))return res.status(400).json({error:'Informe um e-mail válido.'});if(password.length<8)return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'});const lim=['investigations_limit','research_limit','analysis_limit','sources_per_research'].map(k=>Number(req.body?.[k]??(k==='investigations_limit'?10:k==='research_limit'?30:k==='analysis_limit'?20:15)));if(lim.some(v=>!Number.isInteger(v)||v<1||v>1000))return res.status(400).json({error:'Limites inválidos.'});const {salt,hash}=hashPassword(password);try{const [r]=await pool.query(`INSERT INTO users(email,name,password_hash,password_salt,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,[email,name||null,hash,salt,req.body?.role==='admin'?'admin':'user',req.body?.status==='inactive'?'inactive':'active',...lim]);const [[u]]=await pool.query(`SELECT id,email,name,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,last_login_at FROM users WHERE id=?`,[r.insertId]);res.status(201).json(publicUser(u));}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Já existe um usuário com este e-mail.'});res.status(500).json({error:e.message});}});
app.put('/api/admin/users/:id',requireAuth,requireAdmin,async(req,res)=>{const id=Number(req.params.id);const [[u]]=await pool.query(`SELECT * FROM users WHERE id=?`,[id]);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});const vals=['investigations_limit','research_limit','analysis_limit','sources_per_research'].map(k=>Number(req.body?.[k]??u[k]));if(vals.some(v=>!Number.isInteger(v)||v<-1||v>1000))return res.status(400).json({error:'Limites inválidos. Use -1 para ilimitado.'});const role=req.body?.role??u.role,status=req.body?.status??u.status;if(!['admin','user'].includes(role))return res.status(400).json({error:'Perfil inválido.'});if(!['pending','active','inactive'].includes(status))return res.status(400).json({error:'Status inválido.'});if(id===Number(req.user.id)&&(role!=='admin'||status!=='active'))return res.status(400).json({error:'Você não pode remover o próprio acesso administrativo.'});await pool.query(`UPDATE users SET name=?,role=?,status=?,investigations_limit=?,research_limit=?,analysis_limit=?,sources_per_research=?,updated_at=NOW() WHERE id=?`,[String(req.body?.name??u.name??'').trim()||null,role,status,...vals,id]);if(status!=='active')await pool.query(`DELETE FROM sessions WHERE user_id=?`,[id]);const [[x]]=await pool.query(`SELECT id,email,name,role,status,investigations_limit,research_limit,analysis_limit,sources_per_research,created_at,last_login_at FROM users WHERE id=?`,[id]);res.json(publicUser(x));});
app.post('/api/admin/users/:id/reset-password',requireAuth,requireAdmin,async(req,res)=>{const id=Number(req.params.id),password=String(req.body?.password||'');if(password.length<8)return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'});const {salt,hash}=hashPassword(password);const [r]=await pool.query(`UPDATE users SET password_hash=?,password_salt=?,updated_at=NOW() WHERE id=?`,[hash,salt,id]);if(!r.affectedRows)return res.status(404).json({error:'Usuário não encontrado.'});await pool.query(`DELETE FROM sessions WHERE user_id=?`,[id]);res.json({ok:true});});
app.get('/api/admin/usage',requireAuth,requireAdmin,async(_req,res)=>{const start=monthStart();const [[t]]=await pool.query(`SELECT COUNT(*) requests,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(estimated_cost),0) estimated_cost FROM ai_usage WHERE created_at>=?`,[start]);const [byUser]=await pool.query(`SELECT u.id,u.name,u.email,COUNT(au.id) requests,COALESCE(SUM(au.input_tokens),0) input_tokens,COALESCE(SUM(au.output_tokens),0) output_tokens,COALESCE(SUM(au.estimated_cost),0) estimated_cost FROM users u LEFT JOIN investigations i ON i.user_id=u.id LEFT JOIN ai_usage au ON au.investigation_id=i.id AND au.created_at>=? GROUP BY u.id,u.name,u.email ORDER BY estimated_cost DESC,u.id`,[start]);res.json({totals:t,by_user:byUser});});
app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'radar-editorial',version:appVersion,framework:'express',node:process.version,database:'mysql',search_provider:'tavily',search_configured:Boolean(String(process.env.TAVILY_API_KEY||'').trim())}); }
  catch(error){ res.status(503).json({ok:false,service:'radar-editorial',database:'unavailable',error:error.message}); }
});

app.get('/api/investigations', requireAuth, async (req,res) => { try { const [rows]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations ${isAdmin(req.user)?'':'WHERE user_id=?'} ORDER BY id DESC LIMIT 50`,isAdmin(req.user)?[]:[req.user.id]); res.json(rows); } catch(e){res.status(500).json({error:e.message});} });

app.post('/api/investigations', requireAuth, async (req,res) => { const title=String(req.body?.title||'').trim(),objective=String(req.body?.objective||'').trim(); if(!title)return res.status(400).json({error:'Informe o tema da investigação.'}); try { const u=await usageForUser(req.user.id); if(!isAdmin(req.user)&&u.investigations>=Number(req.user.investigations_limit))return res.status(429).json({error:`Limite mensal de investigações atingido (${req.user.investigations_limit}).`}); const [r]=await pool.query(`INSERT INTO investigations(user_id,title,objective,status,created_at,updated_at) VALUES(?,?,?,'draft',NOW(),NOW())`,[req.user.id,title,objective||null]); const [[row]]=await pool.query(`SELECT id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[r.insertId]);res.status(201).json(row);}catch(e){res.status(500).json({error:e.message});} });

app.get('/api/investigations/:id', requireAuth, async (req,res) => {
  try {
    const [[investigation]]=await pool.query(`SELECT id,user_id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[req.params.id]);
    if(!investigation) return res.status(404).json({error:'Investigação não encontrada.'});
    if(!isAdmin(req.user) && Number(investigation.user_id)!==Number(req.user.id)) return res.status(403).json({error:'Você não tem acesso a esta investigação.'});
    await scoreInvestigationSources(investigation.id, investigation.title, investigation.objective);
    const relationsSummary = await analyzeSourceRelations(investigation.id);
    const [[counts]]=await pool.query(`SELECT (SELECT COUNT(*) FROM sources WHERE investigation_id=?) AS sources,
      (SELECT COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(sa.analysis,'$.evidence'))),0) FROM source_analyses sa WHERE sa.investigation_id=?) AS evidence,
      (SELECT COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(sa.analysis,'$.gaps'))),0) FROM source_analyses sa WHERE sa.investigation_id=?) AS gaps`,[req.params.id,req.params.id,req.params.id]);
    const [researchJobs]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE investigation_id=? AND job_type='research' ORDER BY id DESC LIMIT 1`,[req.params.id]);
    const [analysisJobs]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE investigation_id=? AND job_type='analysis' ORDER BY id DESC LIMIT 1`,[req.params.id]);
    const [analysisRows]=await pool.query(`SELECT source_id,model,analysis,updated_at FROM source_analyses WHERE investigation_id=?`,[req.params.id]);
    const analyses = Object.fromEntries(analysisRows.map(row => [String(row.source_id), typeof row.analysis === 'string' ? JSON.parse(row.analysis) : row.analysis]));
    const sources=await getRankedSources(investigation.id,investigation.title,investigation.objective);
    const analysisSummary={sources_analyzed:analysisRows.length,evidence:Number(counts.evidence||0),gaps:Number(counts.gaps||0),model:analysisRows[0]?.model||openAiModel};
    res.json({...investigation,counts,latest_job:researchJobs[0]||null,latest_analysis_job:analysisJobs[0]||null,sources,analyses,analysis_summary:analysisSummary,relations:relationsSummary,ranking:{relevance:0.30,quality:0.25,authority:0.20,recency:0.15,correspondence:0.10}});
  } catch(error){ res.status(500).json({error:error.message}); }
});

app.post('/api/investigations/:id/jobs', requireAuth, async (req,res) => {
  const investigationId=Number(req.params.id);
  if(!Number.isInteger(investigationId)||investigationId<1) return res.status(400).json({error:'ID de investigação inválido.'});
  try {
    if(!String(process.env.TAVILY_API_KEY||'').trim()) return res.status(503).json({error:'O motor Web ainda não está configurado: TAVILY_API_KEY ausente.'});
    const [[investigation]]=await pool.query(`SELECT id,user_id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[investigationId]);
    if(!investigation) return res.status(404).json({error:'Investigação não encontrada.'});
    if(!isAdmin(req.user) && Number(investigation.user_id)!==Number(req.user.id)) return res.status(403).json({error:'Você não tem acesso a esta investigação.'});
    const usage=await usageForUser(req.user.id); if(!isAdmin(req.user) && usage.research>=Number(req.user.research_limit)) return res.status(429).json({error:`Limite mensal de pesquisas Web atingido (${req.user.research_limit}).`});
    const [activeJobs]=await pool.query(`SELECT id,status FROM research_jobs WHERE investigation_id=? AND status IN('queued','running') ORDER BY id DESC LIMIT 1`,[investigationId]);
    if(activeJobs.length) return res.status(409).json({error:'Já existe uma pesquisa na fila ou em execução.'});
    const [result]=await pool.query(`INSERT INTO research_jobs(investigation_id,status,job_type,payload,created_at) VALUES(?,'queued','research',?,NOW())`,[investigationId,JSON.stringify({provider:'tavily',max_results:Math.min(maxResults,Math.max(1,Number(req.user.sources_per_research||maxResults)))})]);
    const [[job]]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE id=?`,[result.insertId]);
    res.status(201).json({investigation:{...investigation,latest_job:job}}); void runResearchJob(result.insertId);
  } catch(error){ res.status(500).json({error:error.message}); }
});


app.post('/api/investigations/:id/analyses', requireAuth, async (req,res) => {
  const investigationId=Number(req.params.id);
  if(!Number.isInteger(investigationId)||investigationId<1) return res.status(400).json({error:'ID de investigação inválido.'});
  try {
    if(!String(process.env.OPENAI_API_KEY||'').trim()) return res.status(503).json({error:'A análise por IA ainda não está configurada: OPENAI_API_KEY ausente.'});
    const [[investigation]]=await pool.query(`SELECT id,user_id,title,objective,status,created_at,updated_at FROM investigations WHERE id=?`,[investigationId]);
    if(!investigation) return res.status(404).json({error:'Investigação não encontrada.'});
    if(!isAdmin(req.user) && Number(investigation.user_id)!==Number(req.user.id)) return res.status(403).json({error:'Você não tem acesso a esta investigação.'});
    const usage=await usageForUser(req.user.id); if(!isAdmin(req.user) && usage.analysis>=Number(req.user.analysis_limit)) return res.status(429).json({error:`Limite mensal de análises por IA atingido (${req.user.analysis_limit}).`});
    const [[sourceCount]] = await pool.query(`SELECT COUNT(*) AS total FROM sources WHERE investigation_id=?`,[investigationId]);
    if(Number(sourceCount.total||0)<1) return res.status(409).json({error:'Nenhuma fonte disponível. Execute uma pesquisa Web antes da análise.'});
    const [activeJobs]=await pool.query(`SELECT id,status FROM research_jobs WHERE investigation_id=? AND status IN('queued','running') ORDER BY id DESC LIMIT 1`,[investigationId]);
    if(activeJobs.length) return res.status(409).json({error:'Já existe uma pesquisa ou análise na fila/em execução.'});
    const [result]=await pool.query(`INSERT INTO research_jobs(investigation_id,status,job_type,payload,created_at) VALUES(?,'queued','analysis',?,NOW())`,[investigationId,JSON.stringify({provider:'openai',model:openAiModel})]);
    const [[job]]=await pool.query(`SELECT id,status,job_type,payload,created_at,started_at,finished_at,error_message FROM research_jobs WHERE id=?`,[result.insertId]);
    res.status(201).json({investigation:{...investigation,latest_analysis_job:job}}); void runAnalysisJob(result.insertId);
  } catch(error){ res.status(500).json({error:error.message}); }
});

const publicPath=path.join(__dirname,'public');
app.use(express.static(publicPath,{etag:false,maxAge:0,setHeaders:(res,filePath)=>{if(filePath.endsWith('.css')||filePath.endsWith('.js'))res.setHeader('Cache-Control','no-store');}}));
app.get('/login',(_req,res)=>res.sendFile(path.join(publicPath,'login.html')));
app.get('/admin',(_req,res)=>res.sendFile(path.join(publicPath,'admin.html')));
app.get('/signup',(_req,res)=>res.sendFile(path.join(publicPath,'signup.html')));
app.get(/^(?!\/api(?:\/|$)|\/login$|\/admin$)/,(_req,res)=>res.sendFile(path.join(publicPath,'index.html')));
Promise.all([ensureAnalysisSchema(),ensureAuthSchema()]).then(() => {
  app.listen(port,'0.0.0.0',()=>console.log(`Radar Editorial ${appVersion} running on port ${port}`));
}).catch(error => { console.error('Falha ao preparar os schemas:', error); process.exit(1); });
