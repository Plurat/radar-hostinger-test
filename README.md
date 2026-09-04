# Radar Editorial 0.5.1

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

## 0.5.2
- Cadastro com CRP no formato XX/XXXXX.
- E-mail automático ao solicitar cadastro e ao aprovar.
- Templates de e-mail editáveis no painel administrativo.
- Registro de envios e falhas de e-mail.
- SMTP configurável por variáveis de ambiente.


## 0.6.0.1
- Fontes recomendadas controladas pelo administrador.
- Usuário pode selecionar fontes prioritárias por investigação.
- Pesquisa Web usa consultas `site:dominio` para as fontes selecionadas e não exclui a pesquisa geral quando nenhuma fonte é selecionada.
- Domínios desconhecidos encontrados em links/fontes geram sugestões para avaliação do administrador.

## 0.6.0.1
Correção do fluxo de pesquisa direcionada: remove erro de variável indefinida no fechamento do job e registra corretamente a consulta principal.


## 0.6.2.2.1
- Shell global de navegação para usuário e administrador.
- Dashboard inicial do usuário e indicadores administrativos.
- Administrador pode adicionar um domínio diretamente de um resultado de pesquisa às fontes recomendadas, mediante confirmação.
