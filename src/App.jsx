import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function App() {
  const [title, setTitle] = useState("");
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function loadInvestigations() {
    setLoading(true);
    try {
      const response = await fetch("/api/investigations");
      if (!response.ok) throw new Error("Falha ao carregar investigações.");
      setInvestigations(await response.json());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvestigations();
  }, []);

  async function createInvestigation(event) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;

    setCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível criar a investigação.");
      }

      setInvestigations((current) => [data, ...current]);
      setTitle("");
      setMessage("Investigação criada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">INTELIGÊNCIA EDITORIAL</div>
          <h1>Radar Editorial</h1>
        </div>
        <div className="version">Web 0.1.0</div>
      </header>

      <main className="content">
        <section className="hero">
          <div>
            <span className="badge">MVP</span>
            <h2>O que você quer investigar?</h2>
            <p>
              Crie uma investigação para organizar a próxima etapa do Radar:
              pesquisa, fontes, evidências e análise.
            </p>
          </div>

          <form className="investigation-form" onSubmit={createInvestigation}>
            <textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Ansiedade e uso de redes sociais"
              rows={3}
              maxLength={500}
            />
            <div className="form-footer">
              <span>{title.length}/500</span>
              <button disabled={creating || !title.trim()}>
                {creating ? "Criando..." : "Iniciar investigação"}
              </button>
            </div>
          </form>

          {message && <div className="message">{message}</div>}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">HISTÓRICO</div>
              <h3>Investigações</h3>
            </div>
            <button className="secondary" onClick={loadInvestigations}>
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="empty">Carregando...</div>
          ) : investigations.length === 0 ? (
            <div className="empty">
              Nenhuma investigação criada ainda.
            </div>
          ) : (
            <div className="investigation-list">
              {investigations.map((item) => (
                <article className="investigation-card" key={item.id}>
                  <div>
                    <h4>{item.title}</h4>
                    <div className="meta">
                      Criada em {formatDate(item.created_at)}
                    </div>
                  </div>
                  <span className="status">{item.status}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
