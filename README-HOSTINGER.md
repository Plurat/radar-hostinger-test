# Deploy — Radar Editorial 0.1.1

1. Atualize os arquivos do repositório GitHub conectado ao Hostinger.
2. Mantenha branch `main`, framework `Express`, Node `22.x`, root `./` e entry file `server.js`.
3. Faça o redeploy.
4. Não altere as variáveis `DB_*` já configuradas.
5. Não reimporte o schema: esta versão usa as seis tabelas já existentes.

Teste:
- `/api/health`
- página inicial;
- abrir uma investigação;
- clicar em **Iniciar pesquisa**;
- conferir `research_jobs` no phpMyAdmin.
