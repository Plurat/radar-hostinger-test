# Radar Editorial 0.1.0 — Hostinger

Pacote simplificado para implantação como Node.js Web App na Hostinger.

## Estrutura

O `package.json` está na raiz do ZIP para permitir a detecção automática do framework.

- Frontend: React + Vite
- Backend: Express.js
- Banco: MySQL
- Entrada: `server.js`
- Build: `npm run build`
- Start: `npm start`

## Configuração esperada na Hostinger

- Node.js: 20.x, 22.x ou 24.x
- Framework: Express.js (se detectado automaticamente)
- Build command: `npm run build`
- Start command: `npm start`
- Entry file: `server.js` (se solicitado)
- Output directory: `dist` (se solicitado)

## Banco

Importe `sql/001_schema.sql` no banco MySQL exclusivo do Radar e configure as variáveis `DB_*` no painel.

Não inclua `.env` no ZIP.
