(function(){
  const saved=localStorage.getItem('radar-theme');
  if(saved==='dark'||saved==='light') document.documentElement.dataset.theme=saved;
})();
window.RadarUI={
 async auth(){
   const r=await fetch('/api/auth/me',{cache:'no-store'});
   if(r.status===401){location.href='/login';return null}
   if(!r.ok)throw new Error('Não foi possível validar a sessão.');
   const d=await r.json();
   document.querySelectorAll('[data-user-name]').forEach(e=>e.textContent=d.user.name||d.user.email);
   document.querySelectorAll('[data-user-role]').forEach(e=>e.textContent=d.user.role==='admin'?'Administrador':'Usuário');
   document.querySelectorAll('[data-admin-only]').forEach(e=>{if(d.user.role!=='admin')e.remove()});
   document.querySelectorAll('[data-nav]').forEach(e=>{if(e.dataset.nav===RadarUI.currentNav()) e.setAttribute('aria-current','page')});
   document.querySelectorAll('[data-logout]').forEach(b=>b.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login'});
   RadarUI.initTheme();
   return d;
 },
 currentNav(){
   const p=location.pathname;
   if(p==='/'||p==='/index.html')return 'dashboard';
   if(p==='/investigacoes'||p==='/investigacao')return 'investigacoes';
   if(p==='/nova-investigacao')return 'nova';
   if(p==='/pesquisa-web')return 'pesquisa';
   if(p==='/perfil')return 'perfil';
   if(p==='/atualizacoes')return 'atualizacoes';
   return '';
 },
 initTheme(){
   const current=document.documentElement.dataset.theme||'light';
   document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
     b.setAttribute('aria-pressed',current==='dark'?'true':'false');
     b.title=current==='dark'?'Usar modo claro':'Usar modo escuro';
     b.onclick=()=>RadarUI.setTheme(current==='dark'?'light':'dark');
   });
 },
 setTheme(theme){
   document.documentElement.dataset.theme=theme;
   localStorage.setItem('radar-theme',theme);
   document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
     b.setAttribute('aria-pressed',theme==='dark'?'true':'false');
     b.title=theme==='dark'?'Usar modo claro':'Usar modo escuro';
   });
 },
 esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')},
 date(v){return v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):''}
};