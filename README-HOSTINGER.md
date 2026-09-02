# Deploy — Radar Editorial 0.2.0

1. Atualize o repositório GitHub conectado à aplicação.
2. Faça commit na branch `main`.
3. Na Hostinger, faça Redeploy.
4. Mantenha as variáveis `DB_*` existentes.
5. Adicione uma nova variável:

`TAVILY_API_KEY` = sua chave da Tavily

Opcional:

`SEARCH_MAX_RESULTS` = `15`

Não coloque a chave no GitHub, em `README` ou no frontend.

## Teste

1. Abra o Radar.
2. Abra uma investigação existente.
3. Clique em `Iniciar pesquisa`.
4. O job deve passar por `RUNNING` e depois `COMPLETED`.
5. As fontes reais devem aparecer na seção `Fontes encontradas`.
