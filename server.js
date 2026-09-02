const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.status(200).send(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Radar Editorial — Teste Hostinger</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Arial, sans-serif;
            background: #f5f5f7;
            color: #202124;
          }
          main {
            max-width: 680px;
            margin: 24px;
            padding: 32px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0,0,0,.08);
          }
          h1 { margin-top: 0; }
          code {
            padding: 3px 6px;
            border-radius: 5px;
            background: #f0f0f0;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Radar Editorial</h1>
          <p>Teste mínimo de compatibilidade da Hostinger.</p>
          <p><strong>Node.js + Express funcionando.</strong></p>
          <p>Versão: <code>0.1.0</code></p>
        </main>
      </body>
    </html>
  `);
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "radar-hostinger-test",
    framework: "express",
    node: process.version
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Radar Hostinger Test running on port ${port}`);
});
