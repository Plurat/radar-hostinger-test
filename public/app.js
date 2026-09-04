const sourceTargetsArea=document.getElementById('source-targets'); const refreshSourceTargetsButton=document.getElementById('refresh-source-targets');
let currentUser=null;
async function ensureAuthenticated(){const r=await fetch('/api/auth/me',{cache:'no-store'});if(r.status===401){location.href='/login';return false}if(!r.ok)throw new Error('Não foi possível validar a sessão.');const d=await r.json();currentUser=d.user;const n=document.getElementById('account-name');if(n)n.textContent=currentUser.name||currentUser.email;const l=document.getElementById('admin-link');if(l&&currentUser.role==='admin')l.classList.remove('hidden');const b=document.getElementById('logout-button');if(b)b.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login'};return true}
const form = document.getElementById('investigation-form');
const titleInput = document.getElementById('title');
const objectiveInput = document.getElementById('objective');
const counter = document.getElementById('counter');
const message = document.getElementById('message');
const list = document.getElementById('investigation-list');
const submitButton = document.getElementById('submit-button');
const refreshButton = document.getElementById('refresh-button');
const homeView = document.getElementById('home-view');
const detailView = document.getElementById('detail-view');
const backButton = document.getElementById('back-button');
const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const detailMeta = document.getElementById('detail-meta');
const detailObjective = document.getElementById('detail-objective');
const startResearchButton = document.getElementById('start-research-button');
const startAnalysisButton = document.getElementById('start-analysis-button');
const analysisArea = document.getElementById('analysis-area');
const analysisNote = document.getElementById('analysis-note');
const jobArea = document.getElementById('job-area');
const sourcesArea = document.getElementById('sources-area');
const sourcesCount = document.getElementById('sources-count');
const evidenceCount = document.getElementById('evidence-count');
const gapsCount = document.getElementById('gaps-count');
const researchNote = document.getElementById('research-note');
const dedupSummary = document.getElementById('dedup-summary');

let currentInvestigationId = null;
let pollTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function showMessage(text, type = 'info') {
  message.textContent = text;
  message.className = `message ${type}`;
}

function updateCounter() {
  counter.textContent = `${titleInput.value.length}/500`;
}

async function loadInvestigations() {
  list.innerHTML = '<div class="empty">Carregando...</div>';
  try {
    const response = await fetch('/api/investigations');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as investigações.');
    if (!data.length) {
      list.innerHTML = '<div class="empty">Nenhuma investigação criada ainda.</div>';
      return;
    }
    list.innerHTML = data.map(item => `
      <button class="investigation-item" data-id="${escapeHtml(item.id)}" type="button">
        <div class="item-content">
          <h4>${escapeHtml(item.title)}</h4>
          ${item.objective ? `<p>${escapeHtml(item.objective)}</p>` : '<p class="muted">Sem objetivo definido.</p>'}
          <small>Criada em ${escapeHtml(formatDate(item.created_at))}</small>
        </div>
        <span class="status">${escapeHtml(item.status)}</span>
      </button>
    `).join('');
    document.querySelectorAll('.investigation-item').forEach(button => {
      button.addEventListener('click', () => openInvestigation(button.dataset.id));
    });
  } catch (error) {
    list.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
  }
}

async function openInvestigation(id) {
  currentInvestigationId = id;
  stopPolling();
  homeView.classList.add('hidden');
  detailView.classList.remove('hidden');
  detailTitle.textContent = 'Carregando...';
  jobArea.innerHTML = '<div class="empty">Carregando investigação...</div>';
  sourcesArea.innerHTML = '<div class="empty">Carregando fontes...</div>';
  try {
    await refreshDetail();
  } catch (error) {
    detailTitle.textContent = 'Erro';
    jobArea.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshDetail() {
  if (!currentInvestigationId) return;
  const response = await fetch(`/api/investigations/${encodeURIComponent(currentInvestigationId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a investigação.');
  renderDetail(data);

  if (['queued', 'running'].includes(data.latest_job?.status) || ['queued', 'running'].includes(data.latest_analysis_job?.status)) startPolling();
  else stopPolling();
}

function renderDetail(data) {
  detailTitle.textContent = data.title;
  detailStatus.textContent = data.status;
  detailMeta.textContent = `Criada em ${formatDate(data.created_at)} · Atualizada em ${formatDate(data.updated_at)}`;
  detailObjective.textContent = data.objective || 'Nenhum objetivo informado.';
  sourcesCount.textContent = data.counts?.sources ?? 0;
  evidenceCount.textContent = data.counts?.evidence ?? 0;
  gapsCount.textContent = data.counts?.gaps ?? 0;
  renderJob(data.latest_job);
  renderAnalysisJob(data.latest_analysis_job, data.analysis_summary);
  renderSources(data.sources || [], data.analyses || {});
  renderDedupSummary(data.relations, data.counts?.sources || 0);

  const jobStatus = data.latest_job?.status;
  const active = ['queued', 'running'].includes(jobStatus);
  startResearchButton.disabled = active;
  if (jobStatus === 'running') startResearchButton.textContent = 'Pesquisando...';
  else if (jobStatus === 'queued') startResearchButton.textContent = 'Pesquisa na fila';
  else startResearchButton.textContent = 'Iniciar pesquisa';

  if (jobStatus === 'completed') {
    researchNote.textContent = 'Pesquisa concluída. As fontes abaixo foram coletadas pela Web e armazenadas no Radar.';
  } else if (jobStatus === 'failed') {
    researchNote.textContent = data.latest_job?.error_message || 'A pesquisa falhou. Verifique a configuração do motor Web.';
  } else {
    researchNote.textContent = 'O Radar pesquisa a Web e grava as fontes nesta investigação. A classificação por IA será adicionada em uma etapa posterior.';
  }
}

function renderJob(job) {
  if (!job) {
    jobArea.innerHTML = '<div class="job-empty">Nenhuma pesquisa foi iniciada nesta investigação.</div>';
    return;
  }
  let payload = null;
  try { payload = job.payload ? JSON.parse(job.payload) : null; } catch {}
  const summary = payload?.inserted != null
    ? `${payload.raw_results || 0} resultados recebidos · ${payload.inserted} fontes novas · ${payload.duplicates || 0} duplicadas`
    : payload?.provider ? `Provedor: ${payload.provider}` : '';
  const diagnostic = payload?.outcome === 'empty_results'
    ? 'Tavily respondeu sem resultados. A consulta foi registrada para diagnóstico.'
    : payload?.outcome === 'error'
      ? `Falha do motor Web${payload.http_status ? ` · HTTP ${payload.http_status}` : ''}.`
      : '';
  jobArea.innerHTML = `
    <div class="job-row">
      <div class="job-main"><strong>Job #${escapeHtml(job.id)}</strong><span>${escapeHtml(job.job_type)}${summary ? ` · ${escapeHtml(summary)}` : ''}</span></div>
      <span class="status">${escapeHtml(job.status)}</span>
    </div>
    <small>Criado em ${escapeHtml(formatDate(job.created_at))}${job.finished_at ? ` · Finalizado em ${escapeHtml(formatDate(job.finished_at))}` : ''}</small>
    ${job.error_message ? `<p class="error">${escapeHtml(job.error_message)}</p>` : ''}
    ${diagnostic ? `<p class="muted">${escapeHtml(diagnostic)}</p>` : ''}
  `;
}


function renderAnalysisJob(job, summary) {
  if (!analysisArea) return;
  if (!job) {
    analysisArea.innerHTML = '<div class="job-empty">Nenhuma análise foi executada nesta investigação.</div>';
  } else {
    let payload = null;
    try { payload = job.payload ? JSON.parse(job.payload) : null; } catch {}
    const detail = payload?.sources_analyzed != null
      ? `${payload.sources_analyzed} fontes analisadas · ${payload.evidence || 0} evidências · ${payload.gaps || 0} lacunas`
      : payload?.model ? `Modelo: ${escapeHtml(payload.model)}` : '';
    analysisArea.innerHTML = `<div class="job-row"><div class="job-main"><strong>Análise #${escapeHtml(job.id)}</strong><span>${escapeHtml(job.job_type)}${detail ? ` · ${detail}` : ''}</span></div><span class="status">${escapeHtml(job.status)}</span></div><small>Criado em ${escapeHtml(formatDate(job.created_at))}${job.finished_at ? ` · Finalizado em ${escapeHtml(formatDate(job.finished_at))}` : ''}</small>${job.error_message ? `<p class="error">${escapeHtml(job.error_message)}</p>` : ''}`;
  }
  const active = ['queued','running'].includes(job?.status);
  if (startAnalysisButton) {
    startAnalysisButton.disabled = active;
    startAnalysisButton.textContent = job?.status === 'running' ? 'Analisando...' : job?.status === 'queued' ? 'Análise na fila' : 'Analisar fontes';
  }
  if (analysisNote) {
    if (job?.status === 'completed') analysisNote.textContent = `Análise concluída. ${summary?.sources_analyzed || 0} fontes foram analisadas com base nos dados coletados.`;
    else if (job?.status === 'failed') analysisNote.textContent = job.error_message || 'A análise falhou. Verifique a configuração da IA.';
    else analysisNote.textContent = 'O Radar analisa os dados coletados das fontes e separa pontos-chave, evidências e lacunas sem gerar o artigo.';
  }
}

function sourceTypeLabel(type) {
  const labels = { academic: 'Acadêmica', institutional: 'Institucional', journalistic: 'Jornalística', editorial: 'Editorial', social: 'Social', commercial: 'Comercial', web: 'Web' };
  return labels[type] || 'Web';
}

function confidenceLabel(level) {
  return level === 'high' ? 'ALTA' : level === 'low' ? 'BAIXA' : 'MÉDIA';
}

function renderDedupSummary(relations, total) {
  if (!dedupSummary) return;
  const duplicateSources = Number(relations?.duplicate_sources || 0);
  const relatedPairs = Number(relations?.related_pairs || 0);
  const unique = Math.max(0, Number(total || 0) - duplicateSources);
  dedupSummary.innerHTML = total
    ? `<strong>${unique} fontes únicas</strong> · ${duplicateSources} duplicatas prováveis · ${relatedPairs} relações entre fontes semelhantes`
    : '';
}


function renderSourceAnalysis(analysis) {
  if (!analysis) return '';
  const list = (items) => Array.isArray(items) && items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="analysis-none">Nenhum item identificado com segurança.</p>';
  return `<div class="source-analysis"><div class="analysis-label">ANÁLISE DA FONTE</div><p class="analysis-summary">${escapeHtml(analysis.editorial_summary || '')}</p><div class="analysis-columns"><div><strong>Pontos-chave</strong>${list(analysis.key_points)}</div><div><strong>Evidências</strong>${list(analysis.evidence)}</div><div><strong>Lacunas</strong>${list(analysis.gaps)}</div></div><div class="analysis-relevance"><strong>Relevância editorial:</strong> ${escapeHtml(analysis.editorial_relevance || '—')}</div></div>`;
}

function renderSources(sources, analyses = {}) {
  if (!sources.length) {
    sourcesArea.innerHTML = '<div class="empty">Nenhuma fonte armazenada ainda.</div>';
    return;
  }
  sourcesArea.innerHTML = sources.map((source, index) => {
    const confidence = confidenceLabel(source.confidence_level);
    const relationNote = (source.relations || []).length
      ? `<div class="relation-note">${source.relations.map(r => r.type === 'duplicate' ? 'Duplicata provável' : 'Relacionada a outra fonte').join(' · ')}</div>`
      : '';
    return `
    <article class="source-card">
      <div class="source-top">
        <div class="source-domain">${escapeHtml(source.domain || 'web')} · ${escapeHtml(sourceTypeLabel(source.source_type))}</div>
        <div class="source-score-group"><span class="source-score">Radar ${escapeHtml((Number(source.ranking_score || 0) * 100).toFixed(0))}/100</span><span class="confidence confidence-${escapeHtml(source.confidence_level || 'medium')}" title="${escapeHtml(confidence)} confiança"><span class="confidence-dot" aria-hidden="true"></span>${escapeHtml(confidence.charAt(0) + confidence.slice(1).toLowerCase())}</span></div>
      </div>
      <h4><span class="source-rank">#${index + 1}</span> <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a></h4>
      <div class="score-breakdown"><span>Relevância ${escapeHtml((Number(source.relevance_score || 0) * 100).toFixed(0))}</span><span>Qualidade ${escapeHtml((Number(source.quality_score || 0) * 100).toFixed(0))}</span><span>Autoridade ${escapeHtml((Number(source.authority_score || 0) * 100).toFixed(0))}</span><span>Recência ${source.recency_score == null ? 'não identificada' : `${escapeHtml(source.recency_label || 'data disponível')} · ${escapeHtml((Number(source.recency_score) * 100).toFixed(0))}`}</span><span>Correspondência ${escapeHtml((Number(source.correspondence_score || 0) * 100).toFixed(0))}</span></div>
      ${source.summary ? `<p>${escapeHtml(source.summary)}</p>` : ''}
      ${relationNote}
      ${renderSourceAnalysis(analyses[String(source.id)])}
      <div class="source-meta"><strong>${source.published_at ? `Data de publicação: ${escapeHtml(formatDate(source.published_at))}` : 'Data de publicação: não identificada'}</strong><span>Coletada em ${escapeHtml(formatDate(source.created_at))}</span></div>
    </article>`;
  }).join('');
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try { await refreshDetail(); } catch (error) { console.error(error); }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function startResearch() {
  if (!currentInvestigationId) return;
  startResearchButton.disabled = true;
  startResearchButton.textContent = 'Criando job...';
  try {
    const response = await fetch(`/api/investigations/${encodeURIComponent(currentInvestigationId)}/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_type: 'research' })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar a pesquisa.');
    await refreshDetail();
  } catch (error) {
    researchNote.textContent = error.message;
    startResearchButton.disabled = false;
    startResearchButton.textContent = 'Iniciar pesquisa';
  }
}


async function startAnalysis() {
  if (!currentInvestigationId) return;
  startAnalysisButton.disabled = true;
  startAnalysisButton.textContent = 'Criando análise...';
  if (analysisNote) analysisNote.textContent = 'Enviando as fontes para análise...';
  try {
    const response = await fetch(`/api/investigations/${encodeURIComponent(currentInvestigationId)}/analyses`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar a análise.');
    await refreshDetail();
  } catch (error) {
    if (analysisNote) analysisNote.textContent = error.message;
    startAnalysisButton.disabled = false;
    startAnalysisButton.textContent = 'Analisar fontes';
  }
}


async function loadSourceTargets(){ if(!sourceTargetsArea)return; try{ const response=await fetch('/api/recommended-sources',{cache:'no-store'}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Não foi possível carregar as fontes.'); if(!data.length){sourceTargetsArea.innerHTML='<div class="muted">Nenhuma fonte recomendada cadastrada pelo administrador.</div>';return;} sourceTargetsArea.innerHTML=data.map(x=>`<label class="source-target-item"><input type="checkbox" name="source_ids" value="${escapeHtml(x.id)}"><span><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.domain)} · ${escapeHtml(x.category)}</small></span></label>`).join(''); }catch(e){sourceTargetsArea.innerHTML=`<div class="error">${escapeHtml(e.message)}</div>`;} }
if(refreshSourceTargetsButton)refreshSourceTargetsButton.addEventListener('click',loadSourceTargets);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const objective = objectiveInput.value.trim();
  if (!title) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Criando...';
  showMessage('Criando investigação...');
  try {
    const response = await fetch('/api/investigations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, objective, source_ids:[...document.querySelectorAll('input[name=source_ids]:checked')].map(x=>Number(x.value)) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar a investigação.');
    titleInput.value = ''; objectiveInput.value = ''; document.querySelectorAll('input[name=source_ids]:checked').forEach(x=>x.checked=false); updateCounter();
    showMessage('Investigação criada com sucesso.', 'success');
    await loadInvestigations();
  } catch (error) { showMessage(error.message, 'error'); }
  finally { submitButton.disabled = false; submitButton.textContent = 'Criar investigação'; }
});

titleInput.addEventListener('input', updateCounter);
refreshButton.addEventListener('click', loadInvestigations);
backButton.addEventListener('click', () => {
  stopPolling(); currentInvestigationId = null; detailView.classList.add('hidden'); homeView.classList.remove('hidden'); loadInvestigations();
});
startResearchButton.addEventListener('click', startResearch);
if (startAnalysisButton) startAnalysisButton.addEventListener('click', startAnalysis);

updateCounter();
loadSourceTargets();
ensureAuthenticated().then(ok=>{if(ok)loadInvestigations()}).catch(()=>location.href="/login");
