# Radar Editorial 0.1.0 — Hostinger

Primeira versão funcional para Node.js Web App da Hostinger.

## Stack
- Node.js 22
- Express 5
- React 19
- Vite 7
- MySQL 8+

## Deploy na Hostinger
Use o repositório GitHub e selecione:
- Framework: Express
- Branch: main
- Node.js: 22.x
- Root: ./
- Build: npm run build
- Start: npm start
- Startup file: server.js, se solicitado

Configure no painel:
- DB_HOST
- DB_PORT
- DB_NAME
- DB_USER
- DB_PASSWORD

Não coloque senhas ou chaves de API no GitHub.

## Banco
Importe `sql/001_schema.sql` no banco MySQL exclusivo do Radar.

## Testes
- `/`
- `/api/health`

A interface permite criar e listar investigações. O motor de pesquisa ainda será implementado na próxima etapa.
