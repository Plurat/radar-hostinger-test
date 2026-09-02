# Radar Editorial 0.5.0

Administração, autenticação, usuários e limites.

## Antes do deploy
Na Hostinger, adicione estas variáveis: `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Elas criam automaticamente o primeiro administrador na primeira inicialização, se ele ainda não existir. Não coloque a senha no GitHub.

O banco existente é preservado. As tabelas `users` e `sessions` são criadas automaticamente, e investigações antigas sem usuário são atribuídas ao primeiro administrador.

## Acesso
- `/login` — login
- `/` — Radar protegido
- `/admin` — painel administrativo, apenas administradores

## Limites
Usuários têm limites mensais para investigações, pesquisas Web e análises IA, além de limite de fontes por pesquisa. Administradores não sofrem os limites.
