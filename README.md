# Radar Editorial 0.1.0 — Hostinger Express

Versão inicial preparada especificamente para a implantação **Express.js** do Hostinger Node.js Web App.

## Decisão de implantação

O frontend desta versão é servido como arquivos estáticos por Express. Não depende de Vite, React em runtime ou de uma etapa de build da Hostinger.

Fluxo:

Browser → Express → frontend estático
                  └→ MySQL

Isso evita o problema de o preset Express da Hostinger não expor um campo de build/output no fluxo utilizado.

## Configuração

- Node.js: 22.x
- Framework: Express
- Arquivo de entrada: `server.js`
- Gerenciador: npm
- Banco: MySQL por variáveis de ambiente

Variáveis:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Banco

`sql/001_schema.sql` contém o schema inicial. O banco já criado no Hostinger não precisa ser recriado ou reimportado para esta atualização.

## Rotas

- `/` — interface web
- `/api/health` — teste da aplicação + MySQL
- `GET /api/investigations`
- `POST /api/investigations`
- `GET /api/investigations/:id`
