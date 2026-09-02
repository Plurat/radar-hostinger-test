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
const jobArea = document.getElementById('job-area');
const sourcesCount = document.getElementById('sources-count');
const evidenceCount = document.getElementById('evidence-count');
const gapsCount = document.getElementById('gaps-count');

let currentInvestigationId = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  homeView.classList.add('hidden');
  detailView.classList.remove('hidden');
  detailTitle.textContent = 'Carregando...';
  detailObjective.textContent = '—';
  jobArea.innerHTML = '<div class="empty">Carregando investigação...</div>';
  try {
    const response = await fetch(`/api/investigations/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a investigação.');
    renderDetail(data);
  } catch (error) {
    detailTitle.textContent = 'Erro';
    jobArea.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
  }
}

function renderDetail(data) {
  detailTitle.textContent = data.title;
  detailStatus.textContent = data.status;
  detailObjective.textContent = data.objective || 'Nenhum objetivo informado.';
  detailMeta.textContent = `Criada em ${formatDate(data.created_at)} · Atualizada em ${formatDate(data.updated_at)}`;
  sourcesCount.textContent = data.counts?.sources ?? 0;
  evidenceCount.textContent = data.counts?.evidence ?? 0;
  gapsCount.textContent = data.counts?.gaps ?? 0;
  renderJob(data.latest_job);
  const hasActiveJob = ['queued', 'running'].includes(data.latest_job?.status);
  startResearchButton.disabled = hasActiveJob;
  startResearchButton.textContent = hasActiveJob ? 'Pesquisa na fila' : 'Iniciar pesquisa';
}

function renderJob(job) {
  if (!job) {
    jobArea.innerHTML = '<div class="job-empty">Nenhuma pesquisa foi iniciada nesta investigação.</div>';
    return;
  }
  jobArea.innerHTML = `
    <div class="job-row">
      <div><strong>Job #${escapeHtml(job.id)}</strong><span>${escapeHtml(job.job_type)}</span></div>
      <span class="status">${escapeHtml(job.status)}</span>
    </div>
    <small>Criado em ${escapeHtml(formatDate(job.created_at))}</small>
  `;
}

async function startResearch() {
  if (!currentInvestigationId) return;
  startResearchButton.disabled = true;
  startResearchButton.textContent = 'Criando job...';
  try {
    const response = await fetch(`/api/investigations/${encodeURIComponent(currentInvestigationId)}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_type: 'research' })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar o job.');
    renderDetail(data.investigation);
  } catch (error) {
    jobArea.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
    startResearchButton.disabled = false;
    startResearchButton.textContent = 'Iniciar pesquisa';
  }
}

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, objective })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar a investigação.');
    titleInput.value = '';
    objectiveInput.value = '';
    updateCounter();
    showMessage('Investigação criada com sucesso.', 'success');
    await loadInvestigations();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Criar investigação';
  }
});

titleInput.addEventListener('input', updateCounter);
refreshButton.addEventListener('click', loadInvestigations);
backButton.addEventListener('click', () => {
  currentInvestigationId = null;
  detailView.classList.add('hidden');
  homeView.classList.remove('hidden');
  loadInvestigations();
});
startResearchButton.addEventListener('click', startResearch);

updateCounter();
loadInvestigations();
