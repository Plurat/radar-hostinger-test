(async function(){
  const d=await RadarUI.auth();
  if(!d||d.user.role!=='admin'){location.href='/';return;}
  const r=await fetch('/api/admin/email-settings');
  const x=await r.json();
  for(const k of ['email_signup_subject','email_signup_body','email_approved_subject','email_approved_body']) document.getElementById(k).value=x.settings[k]||'';
  document.getElementById('smtp-status').textContent=x.smtp_configured?'SMTP configurado':'SMTP não configurado';
  document.getElementById('save-email').onclick=async()=>{
    const body={};
    for(const k of ['email_signup_subject','email_signup_body','email_approved_subject','email_approved_body']) body[k]=document.getElementById(k).value;
    const z=await fetch('/api/admin/email-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await z.json(); alert(z.ok?'Mensagens salvas.':j.error);
  };
  document.getElementById('send-test').onclick=async()=>{
    const z=await fetch('/api/admin/email-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('test-email').value})});
    const j=await z.json(); alert(z.ok?'E-mail de teste enviado.':j.error);
  };
})();
