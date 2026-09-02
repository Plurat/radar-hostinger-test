import { FormEvent, useEffect, useState } from 'react';

type Investigation = { id:number; title:string; objective:string|null; status:string; created_at:string; updated_at:string };

export default function App() {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [items, setItems] = useState<Investigation[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const r = await fetch('/api/investigations');
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage('');
    const r = await fetch('/api/investigations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title, objective}) });
    const data = await r.json();
    if (!r.ok) return setMessage(data.error || 'Erro ao criar investigação.');
    setTitle(''); setObjective(''); setMessage(`Investigação #${data.id} criada.`); load();
  }

  return <main>
    <header><div><span className="eyebrow">RADAR EDITORIAL</span><h1>Inteligência editorial, começando pelo essencial.</h1><p>Web 0.1.0 · ambiente Hostinger</p></div><span className="badge">ONLINE</span></header>
    <section className="grid">
      <form className="card" onSubmit={submit}>
        <h2>Nova investigação</h2>
        <label>Tema<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Ansiedade e uso de redes sociais" required /></label>
        <label>Objetivo<textarea value={objective} onChange={e=>setObjective(e.target.value)} placeholder="O que você quer descobrir?" rows={5}/></label>
        <button>Iniciar investigação</button>{message && <small>{message}</small>}
      </form>
      <section className="card"><h2>Investigações recentes</h2>{items.length===0 ? <p className="muted">Nenhuma investigação criada ainda.</p> : <div className="list">{items.map(i=><article key={i.id}><strong>#{i.id} · {i.title}</strong><span>{i.status}</span>{i.objective && <p>{i.objective}</p>}</article>)}</div>}</section>
    </section>
  </main>
}
