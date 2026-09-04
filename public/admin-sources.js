(async()=>{
const d=await RadarUI.auth();
if(!d||d.user.role!=='admin'){location.href='/';return}
const area=document.getElementById('recommended-sources-area'),suggest=document.getElementById('source-suggestions-area');
const modal=document.getElementById('source-edit-modal');
const form=document.getElementById('source-edit-form');
const closeModal=()=>{modal.classList.add('hidden');form.reset();document.getElementById('source-edit-id').value=''};

document.getElementById('source-edit-cancel').onclick=closeModal;document.getElementById('source-edit-cancel-2').onclick=closeModal;
modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});

function categoryLabel(v){return ({academic:'Acadêmica',institutional:'Institucional',journalistic:'Jornalística',editorial:'Editorial',social:'Social',commercial:'Comercial',web:'Web'})[v]||v||'Web'}
function openEdit(row){
 document.getElementById('source-edit-id').value=row.id;
 document.getElementById('source-edit-name').value=row.name||'';
 document.getElementById('source-edit-domain').value=row.domain||'';
 document.getElementById('source-edit-category').value=row.category||'web';
 document.getElementById('source-edit-priority').value=row.priority??50;
 document.getElementById('source-edit-description').value=row.description||'';
 modal.classList.remove('hidden');
 document.getElementById('source-edit-name').focus();
}

async function load(){
 const r=await fetch('/api/admin/recommended-sources');
 const rows=await r.json();
 area.innerHTML=rows.map(x=>`<div class="admin-source-row"><div><strong>${RadarUI.esc(x.name)}</strong><span>${RadarUI.esc(x.domain)} · ${RadarUI.esc(categoryLabel(x.category))} · prioridade ${x.priority}</span>${x.description?`<small class="admin-source-description">${RadarUI.esc(x.description)}</small>`:''}</div><div class="form-actions"><button class="secondary" data-edit="${x.id}">Alterar</button><button class="secondary" data-toggle="${x.id}">${x.active?'Desativar':'Ativar'}</button><button class="secondary" data-delete="${x.id}">Excluir</button></div></div>`).join('')||'<div class="empty">Nenhuma fonte.</div>';
 area.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const x=rows.find(x=>String(x.id)===b.dataset.edit);if(x)openEdit(x)});
 area.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const x=rows.find(x=>String(x.id)===b.dataset.toggle);if(!x)return;const r=await fetch('/api/admin/recommended-sources/'+b.dataset.toggle,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!x.active})});if(!r.ok){const e=await r.json().catch(()=>({}));alert(e.error||'Não foi possível alterar o status.');return}load()});
 area.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Excluir esta fonte?')){const r=await fetch('/api/admin/recommended-sources/'+b.dataset.delete,{method:'DELETE'});if(!r.ok){const e=await r.json().catch(()=>({}));alert(e.error||'Não foi possível excluir a fonte.');return}load()}})
}

form.onsubmit=async e=>{
 e.preventDefault();
 const id=document.getElementById('source-edit-id').value;
 const body={name:document.getElementById('source-edit-name').value.trim(),domain:document.getElementById('source-edit-domain').value.trim(),category:document.getElementById('source-edit-category').value,priority:Number(document.getElementById('source-edit-priority').value),description:document.getElementById('source-edit-description').value.trim()};
 const r=await fetch('/api/admin/recommended-sources/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok){const x=await r.json().catch(()=>({}));alert(x.error||'Não foi possível alterar a fonte.');return}
 closeModal();load();
};

document.getElementById('source-form').onsubmit=async e=>{e.preventDefault();const body={name:document.getElementById('rs-name').value,domain:document.getElementById('rs-domain').value,category:document.getElementById('rs-category').value,priority:+document.getElementById('rs-priority').value,description:document.getElementById('rs-description').value};const r=await fetch('/api/admin/recommended-sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){const x=await r.json();alert(x.error);return}e.target.reset();load()};

async function loadSuggestions(){const r=await fetch('/api/admin/source-suggestions'),rows=await r.json();suggest.innerHTML=rows.length?rows.map(x=>`<div class="admin-source-row"><div><strong>${RadarUI.esc(x.domain)}</strong><span>${RadarUI.esc(x.example_title||'Sem título')} · ${RadarUI.esc(x.user_name||x.user_email||'Usuário')}</span><a href="${RadarUI.esc(x.example_url||'#')}" target="_blank" rel="noopener">Ver exemplo</a></div><div class="form-actions"><button data-approve="${x.id}">Adicionar</button><button class="secondary" data-reject="${x.id}">Ignorar</button></div></div>`).join(''):'<div class="empty">Nenhuma sugestão pendente.</div>';suggest.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{const row=rows.find(x=>String(x.id)===b.dataset.approve);const name=prompt('Nome da fonte:',row.domain);if(!name)return;await fetch('/api/admin/source-suggestions/'+b.dataset.approve+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,category:'web',priority:50})});load();loadSuggestions()});suggest.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{await fetch('/api/admin/source-suggestions/'+b.dataset.reject+'/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});loadSuggestions()})}

document.getElementById('refresh-suggestions').onclick=loadSuggestions;
load();loadSuggestions();
})();
