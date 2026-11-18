# RTC Beta: preparo do Preview isolado

Nenhuma migration hospedada, variável Vercel ou deploy foi alterado nesta rodada.
O código bloqueia os endpoints RTC em `VERCEL_ENV=production`, mesmo com `RTC_BETA_ENABLED=1`.

## Banco de homologação sem Docker

1. **Projeto Supabase separado (recomendado):** fornece PostgreSQL, Auth, PostgREST e Storage iguais aos usados pelo módulo. O plano Free permite dois projetos ativos por proprietário/administrador; as duas vagas atuais têm finalidade própria. Sem pausar um deles ou contratar capacidade adicional, não há vaga livre na conta atual. Não colocar dados reais nem credenciais de produção em um futuro projeto Beta; sua criação depende de decisão e autorização específicas.
2. **PGlite local:** já executa as migrations e testes de SQL/RLS sem Docker e sem custo. Serve para validar regras e concorrência, mas não oferece Auth, PostgREST ou Storage Supabase; sozinho não permite teste HTTP de ponta a ponta nem Preview compartilhado.
3. **PostgreSQL hospedado gratuito de outro provedor:** evita Docker, mas exigiria substituir/adaptar Auth, RLS via API, Storage e o cliente Supabase. Isso amplia risco e trabalho para a Beta; não é a recomendação.

Não reutilizar o projeto de produção nem o projeto de homologação do e-BEF sem autorização específica. Não configurar Preview com chaves de produção.

## Prontidão do Preview

O código está na branch `feat/luce-rtc-on-current-portal`; não há push ou URL de Preview desta rodada. Um Preview da Vercel requer:

- Migration RTC aplicada **somente** ao projeto Beta separado, após aprovação e revisão dos advisors de segurança.
- Administrador de teste criado no Auth desse projeto, com `app_metadata.role=admin` e UUID incluído em `RTC_BETA_ADMIN_IDS`. Não copiar senhas de produção. A API do RTC nega acesso no Preview a usuários comuns, mesmo que possuam o módulo autorizado, e falha fechada se a lista estiver vazia.
- Variáveis Vercel limitadas ao ambiente **Preview desta branch**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do projeto Beta, `RTC_BETA_ENABLED=1` e `RTC_BETA_ADMIN_IDS` com UUIDs administrativos separados por vírgula. Nunca colocar `SERVICE_ROLE_KEY` no navegador. O código bloqueia RTC no Preview se a flag não estiver ativa ou se `SUPABASE_URL` apontar para o projeto principal. Como `SUPABASE_URL` é compartilhada pelos outros módulos do portal, estes também apontarão para o projeto Beta **nesse Preview**; não usar esse Preview para homologar os demais módulos. Variáveis de produção ficam intactas.
- Proteção de Preview pela autenticação da Vercel, além da autenticação e autorização do módulo.
- URLs e tokens dos motores RTC **ausentes** até homologação oficial; nenhum cálculo fiscal deve ser habilitado.
- Teste de login, criação de organização, empresa e rascunho, listagem, edição/exclusão com `version`, acesso cruzado negado, `viewer` sem escrita, auditoria e erro de conflito. Repetir em dois navegadores/usuários e confirmar que não há registros em produção.

## Operação e rollback

O salvamento automático funciona apenas depois do primeiro salvamento manual de um rascunho. Uma alteração feita enquanto a gravação está em andamento é agendada novamente depois da resposta; sair da página com alterações não salvas apresenta aviso do navegador. Erros de conflito interrompem o autosave e exigem recarregar o registro, sem sobrescrever a versão mais recente. A duplicação cria um novo identificador. A exclusão exige autoria e versão atual e é auditada; não há exclusão direta pelo papel `authenticated`. A exportação JSON contém apenas os dados informados, sem resultado fiscal. O limite atual é de 50 itens e 32 KB de cenário por rascunho.

Em caso de falha no Preview, definir `RTC_BETA_ENABLED=0` para negar login e APIs RTC e promover um novo Preview com essa variável. Não apagar registros nem reverter migrations para desabilitar o módulo. O catálogo público pode continuar exibindo a entrada de homologação, mas sem acesso à API. Verificar a proteção de Preview da Vercel antes de compartilhar a URL.

As consultas de CST/cClassTrib, atividades do Simples, NCM e NBS exigem gateway autenticado e versão oficial fixada. Sem motor ativo, retornam indisponibilidade. NCM/NBS não determinam automaticamente o enquadramento; parâmetros de Imposto Seletivo presentes nas fontes podem ser de homologação. Cálculo, XML e DANFSe ainda não estão habilitados.

## Estado dos testes

Os testes PGlite executam SQL real e verificam isolamento por empresa, impossibilidade de escrita ou exclusão pelo papel `authenticated`, auditoria atômica, incremento de versão e conflito por versão antiga. Os testes de API cobrem autenticação ausente e desligamento da Beta. O teste HTTP contra Supabase Beta real continua pendente até existir projeto isolado autorizado. PGlite não substitui testes de Auth, PostgREST e Storage em Supabase real. A ausência de Docker não impede a preparação do Preview, mas a ausência de banco Beta impede a validação persistente de ponta a ponta.
