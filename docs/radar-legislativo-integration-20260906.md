# Integração do Radar Legislativo ao Portal Luce

## Estrutura

- Portal: `lucesistemas` na Vercel.
- Aplicativo: `luce-radar-legislativo` na Vercel.
- Entrada no Portal: `/radar-legislativo/`.
- Código consolidado no GitHub: `apps/luce-radar-legislativo/`.
- Identificador de permissão: `radar-legislativo`.

O Radar permanece como uma subaplicação Next.js com deploy isolado. O Portal apresenta o módulo no catálogo e transfere a sessão por POST HTTPS para o domínio fixo do Radar. Os tokens não são adicionados a query strings, fragmentos, histórico ou logs de URL. O servidor valida origem, sessão, status e permissão antes de criar os cookies seguros do Supabase.

## Autenticação e autorização

- A identidade continua centralizada no projeto Supabase da Luce.
- Administradores ativos possuem acesso ao módulo.
- Usuários comuns precisam receber `radar-legislativo` em `app_metadata.allowed_modules`.
- Contas pendentes, rejeitadas ou suspensas são bloqueadas.
- APIs internas sensíveis validam o token e a permissão antes de usar a chave secreta no servidor.

## Compatibilidade

O identificador legado `radar-sindical` é aceito somente para leitura de permissões antigas. Novas concessões usam `radar-legislativo`.

## Publicação

O Portal e o Radar possuem projetos Vercel independentes. Ambos devem ser publicados após a validação para que o fluxo integrado esteja disponível em produção.
