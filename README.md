# Radar Editorial 0.4.0

Web MVP do Radar Editorial.

## 0.4.0
Esta versão adiciona uma única capacidade: **análise das fontes coletadas**.

O Radar usa os títulos, metadados e resumos já coletados para identificar pontos-chave, evidências, lacunas e relevância editorial. A análise não gera artigos.

A análise requer `OPENAI_API_KEY` na configuração da aplicação. O modelo padrão é `gpt-5.6-luna` e pode ser alterado por `OPENAI_MODEL`.

A análise é armazenada em uma tabela `source_analyses`, criada automaticamente na inicialização. Não é necessário executar SQL manualmente.
