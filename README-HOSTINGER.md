# Radar Editorial 0.4.0 — Hostinger Express

Configuração atual:
- Framework: Express
- Node: 22.x
- Entry file: `server.js`
- Root: `/`
- Frontend estático em `public/`

## Variáveis
Mantenha as variáveis existentes de banco e Tavily. Para análise por IA, adicione na Hostinger:

- `OPENAI_API_KEY` — chave da API da OpenAI
- `OPENAI_MODEL` — opcional; padrão `gpt-5.6-luna`

A aplicação cria automaticamente a tabela `source_analyses` na primeira inicialização da 0.4.0.

Não execute novamente o schema SQL no phpMyAdmin.
