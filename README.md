# Radar Hostinger — Teste mínimo

Este pacote serve apenas para validar se o ambiente Node.js Web App da Hostinger aceita uma aplicação Express mínima.

Arquivos:
- package.json
- server.js

Configuração esperada:
- Framework: Express.js (se a Hostinger solicitar)
- Node.js: 20, 22 ou 24 LTS disponível
- Start command: npm start
- Startup file: server.js, se solicitado

Após o deploy:
- `/` deve mostrar "Node.js + Express funcionando."
- `/api/health` deve retornar JSON com `ok: true`

Não há MySQL, React, Vite ou outras dependências além do Express neste teste.
