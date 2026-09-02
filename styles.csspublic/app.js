:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #18202a;
  background: #f4f6f8;
}
* { box-sizing: border-box; }
body { margin: 0; }
.app-shell { min-height: 100vh; }
.topbar {
  max-width: 1180px;
  margin: 0 auto;
  padding: 42px 24px 18px;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: .14em;
  font-weight: 800;
  color: #66717e;
}
h1 { font-size: 38px; line-height: 1.08; margin: 8px 0; }
h2 { margin: 16px 0 8px; font-size: 28px; }
h3 { margin: 6px 0 0; font-size: 22px; }
h4 { margin: 0; font-size: 17px; }
p { color: #697582; line-height: 1.55; }
.version {
  border: 1px solid #d8dee5;
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 800;
}
.content {
  max-width: 1180px;
  margin: auto;
  padding: 18px 24px 60px;
  display: grid;
  gap: 22px;
}
.card {
  background: #fff;
  border: 1px solid #dfe5ea;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 30px rgba(24, 32, 42, .05);
}
.hero {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 30px;
}
.badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 800;
  border: 1px solid #cfd7df;
  border-radius: 999px;
  padding: 8px 12px;
  background: #fff;
}
.investigation-form { display: grid; gap: 8px; }
label {
  display: block;
  font-weight: 750;
  font-size: 14px;
  margin-top: 2px;
}
label span { color: #8a949e; font-weight: 500; }
textarea {
  display: block;
  width: 100%;
  border: 1px solid #cfd7df;
  border-radius: 10px;
  padding: 12px;
  font: inherit;
  resize: vertical;
  margin-bottom: 10px;
}
textarea:focus {
  outline: 2px solid #d8e0e7;
  border-color: #aab5c0;
}
.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.form-footer span, small { color: #697582; font-size: 12px; }
button {
  border: 0;
  border-radius: 10px;
  padding: 12px 16px;
  font-weight: 800;
  cursor: pointer;
  background: #18202a;
  color: #fff;
}
button:disabled { opacity: .55; cursor: not-allowed; }
.secondary {
  background: #fff;
  color: #18202a;
  border: 1px solid #cfd7df;
}
.message {
  grid-column: 1 / -1;
  margin-top: 4px;
  padding: 11px 13px;
  border-radius: 10px;
  font-size: 14px;
  background: #f3f5f7;
}
.message.success { background: #edf7ef; }
.message.error { background: #fceded; }
.hidden { display: none; }
.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 18px;
}
.list { display: grid; gap: 10px; }
.investigation-item {
  border: 1px solid #e1e6eb;
  border-radius: 12px;
  padding: 15px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}
.investigation-item p { margin: 7px 0; font-size: 14px; }
.status {
  white-space: nowrap;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #66717e;
  border: 1px solid #d8dee5;
  border-radius: 999px;
  padding: 6px 8px;
}
.empty {
  padding: 28px 12px;
  text-align: center;
  color: #697582;
}
.error { color: #a13b3b; }
@media (max-width: 800px) {
  .hero { grid-template-columns: 1fr; }
  h1 { font-size: 30px; }
  .topbar { padding-top: 28px; }
  .investigation-item { flex-direction: column; }
}
