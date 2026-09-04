let currentUser=null;
async function ensureAuthenticated(){const r=await fetch('/api/auth/me',{cache:'no-store'});if(r.status===401){location.href='/login';return false}if(!r.ok)throw new Error('Não foi possível validar a sessão.');const d=await r.json();currentUser=d.user;const n=document.getElementById('account-name');if(n)n.textContent=currentUser.name||currentUser.email;const role=document.querySelector('.account-role');if(role)role.textContent=currentUser.role==='admin'?'Administrador':'Usuário';const l=document.getElementById('admin-link');if(l&&currentUser.role==='admin')l.classList.remove('hidden');const b=document.getElementById('logout-button');if(b)b.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login'};return true}
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

let currentInvestigationId = Number(new URLSearchParams(location.search).get('id') || 0);
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
  bindSourceAdminActions();
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
      ${currentUser?.role==='admin' ? `<div class="source-actions"><button type="button" class="source-add-button secondary" data-source-url="${escapeHtml(source.url)}" data-source-title="${escapeHtml(source.title)}" data-source-domain="${escapeHtml(source.domain||'')}" title="Adicionar este domínio às fontes recomendadas">+ Adicionar fonte</button></div>` : ''}
      <div class="source-meta"><strong>${source.published_at ? `Data de publicação: ${escapeHtml(formatDate(source.published_at))}` : 'Data de publicação: não identificada'}</strong><span>Coletada em ${escapeHtml(formatDate(source.created_at))}</span></div>
    </article>`;
  }).join('');
}

function bindSourceAdminActions(){
  document.querySelectorAll('.source-add-button').forEach(button=>{
    button.addEventListener('click',async()=>{
      const domain=button.dataset.sourceDomain||'';
      if(!domain)return;
      if(!confirm(`Adicionar ${domain} às fontes recomendadas?`))return;
      button.disabled=true; button.textContent='Adicionando...';
      try{
        const r=await fetch('/api/admin/recommended-sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:domain,domain,category:'web',priority:50,description:`Fonte adicionada pelo administrador a partir de uma pesquisa: ${button.dataset.sourceTitle||''}`})});
        const d=await r.json(); if(!r.ok)throw new Error(d.error||'Não foi possível adicionar a fonte.');
        button.textContent=d.already_exists?'✓ Fonte já cadastrada':'✓ Fonte adicionada';
      }catch(e){button.disabled=false;button.textContent='+ Adicionar fonte';alert(e.message)}
    });
  });
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
  startResearchButton.textContent = 'Preparando pesquisa...';
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
  startAnalysisButton.textContent = 'Preparando análise...';
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

async function initDetailPage(){
  if(!await ensureAuthenticated()) return;
  if(!currentInvestigationId){ location.href='/investigacoes'; return; }
  const r=await fetch(`/api/investigations/${encodeURIComponent(currentInvestigationId)}`,{cache:'no-store'});
  if(r.status===404||r.status===403){ document.getElementById('detail-title').textContent='Investigação não encontrada'; return; }
  await refreshDetail();
}
initDetailPage().catch(e=>{const a=document.getElementById('job-area');if(a)a.innerHTML=`<div class="empty error">${escapeHtml(e.message)}</div>`;});
