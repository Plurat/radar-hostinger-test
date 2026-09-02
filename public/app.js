const form = document.getElementById('investigation-form');
const titleInput = document.getElementById('title');
const objectiveInput = document.getElementById('objective');
const counter = document.getElementById('counter');
const message = document.getElementById('message');
const list = document.getElementById('investigation-list');
const submitButton = document.getElementById('submit-button');
const refreshButton = document.getElementById('refresh-button');

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
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
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

    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível carregar as investigações.');
    }

    if (!data.length) {
      list.innerHTML = '<div class="empty">Nenhuma investigação criada ainda.</div>';
      return;
    }

    list.innerHTML = data.map(item => `
      <article class="investigation-item">
        <div>
          <h4>${escapeHtml(item.title)}</h4>
          ${item.objective ? `<p>${escapeHtml(item.objective)}</p>` : ''}
          <small>Criada em ${escapeHtml(formatDate(item.created_at))}</small>
        </div>
        <span class="status">${escapeHtml(item.status)}</span>
      </article>
    `).join('');
  } catch (error) {
    list.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
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

    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível criar a investigação.');
    }

    titleInput.value = '';
    objectiveInput.value = '';
    updateCounter();
    showMessage('Investigação criada com sucesso.', 'success');
    await loadInvestigations();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Iniciar investigação';
  }
});

titleInput.addEventListener('input', updateCounter);
refreshButton.addEventListener('click', loadInvestigations);

updateCounter();
loadInvestigations();
