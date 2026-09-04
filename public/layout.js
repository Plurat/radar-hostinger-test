window.RadarUI={
 async auth(){const r=await fetch('/api/auth/me',{cache:'no-store'});if(r.status===401){location.href='/login';return null}if(!r.ok)throw new Error('Não foi possível validar a sessão.');const d=await r.json();document.querySelectorAll('[data-user-name]').forEach(e=>e.textContent=d.user.name||d.user.email);document.querySelectorAll('[data-user-role]').forEach(e=>e.textContent=d.user.role==='admin'?'Administrador':'Usuário');document.querySelectorAll('[data-admin-only]').forEach(e=>{if(d.user.role!=='admin')e.remove()});document.querySelectorAll('[data-logout]').forEach(b=>b.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login'});return d},
 esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')},
 date(v){return v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):''}
};
