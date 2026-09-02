# Radar Editorial 0.2.1

Primeiro motor de pesquisa Web real.

## Fluxo

Tema + objetivo → job → Tavily Search → normalização → deduplicação por URL → MySQL → fontes na investigação.

A versão não usa IA para classificação, síntese, evidências ou lacunas. Essas camadas entram depois.

## Variáveis

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `TAVILY_API_KEY`
- `SEARCH_MAX_RESULTS` (opcional, padrão 15, máximo 20)

## Hostinger

O projeto é estático + Express e não exige Vite, React ou etapa de build.

Framework: Express
Node: 22.x
Entry file: server.js

Depois de adicionar `TAVILY_API_KEY` nas variáveis de ambiente da aplicação, faça redeploy.
