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


### SMTP na 0.5.2
Para envio de e-mails, crie uma conta de e-mail na Hostinger e configure na aplicação: `SMTP_USER`, `SMTP_PASSWORD` e, se necessário, `SMTP_FROM_EMAIL`/`SMTP_FROM_NAME`. Por padrão o pacote usa `smtp.hostinger.com`, porta 465 e SSL/TLS. A Hostinger também informa 587 com TLS/STARTTLS como alternativa.
