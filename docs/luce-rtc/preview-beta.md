# RTC Beta: preparo do Preview isolado

Nenhuma migration hospedada, variável Vercel ou deploy foi alterado nesta rodada.
O código bloqueia os endpoints RTC em `VERCEL_ENV=production`, mesmo com `RTC_BETA_ENABLED=1`.

## Duas modalidades separadas

**A — Prévia visual:** `node infra/rtc-preview/build.mjs` gera `infra/rtc-preview/dist/` com somente `index.html`, `preview.js`, `style.css` e `vercel.json` (CSP e cabeçalhos). Esse diretório pode ser implantado como projeto Vercel estático independente, sem utilizar o build nem as variáveis do portal. Não inclui API, credencial, Supabase, dados reais ou persistência. Os campos aceitam interação local apenas para avaliação visual; salvar e calcular ficam desabilitados. O build normal do portal exclui essa página. Antes de criar ou compartilhar o deployment, habilitar e verificar Vercel Authentication/Deployment Protection para o projeto de prévia e limitar os membros autorizados. A autenticação da Vercel protege a página, mas **não substitui** a autorização do módulo RTC; esta modalidade não serve para testes de dados ou segurança do Supabase. Não há deploy desta modalidade nesta branch local.

**B — Beta funcional:** usa o Portal Luce em Vercel Preview, APIs RTC, Auth/PostgREST/Storage de um **projeto Supabase Beta isolado** e as quatro migrations RTC. Exige os testes reais de RLS, auditoria, concorrência e rollback antes de habilitar `RTC_BETA_ENABLED=1`. O backend aceita apenas administradores de `RTC_BETA_ADMIN_IDS` no Preview e bloqueia o RTC em produção. Os motores e cálculos fiscais permanecem desligados. Não há projeto Beta hospedado nem deploy desta modalidade.

## Banco de homologação sem Docker

1. **Projeto Supabase separado (recomendado para Beta completa):** fornece PostgreSQL, Auth, PostgREST e Storage iguais aos usados pelo módulo. O plano Free permite dois projetos ativos por proprietário/administrador; as duas vagas atuais têm finalidade própria. Pausar a homologação e-BEF liberaria uma vaga sem apagar dados, mas interromperia esse ambiente e contraria a decisão atual de mantê-lo ativo. Não fazer isso sem autorização expressa. Não colocar dados reais nem credenciais de produção em um futuro projeto Beta.
2. **PGlite local:** já executa as migrations e testes de SQL/RLS sem Docker e sem custo. Serve para validar regras e concorrência, mas não oferece Auth, PostgREST ou Storage Supabase; sozinho não permite teste HTTP de ponta a ponta nem Preview compartilhado.
3. **PostgreSQL hospedado gratuito de outro provedor:** evita Docker, mas não fornece equivalência de Auth, PostgREST e Storage. Exigiria substituir/adaptar componentes e não homologa o comportamento Supabase existente; não é a recomendação.
4. **Capacidade paga:** o Supabase Pro começa em US$ 25/mês, com projetos adicionais a partir de US$ 10/mês, sujeitos à configuração de compute e uso. Contratação somente após decisão expressa. Um Supabase autohospedado exige servidor, operação e hardening próprios; não é automaticamente gratuito nem equivale ao serviço gerenciado.

Não reutilizar o projeto de produção nem o projeto de homologação do e-BEF sem autorização específica. Não configurar Preview com chaves de produção.

## Checklist antes de qualquer publicação

1. Modalidade A: autorizar novo projeto Vercel estático que receba apenas `infra/rtc-preview/dist/`; confirmar que o artefato contém só quatro arquivos e não herda variáveis Supabase; ativar Vercel Authentication e conferir o acesso com conta autorizada e não autorizada. Sem essa verificação, não compartilhar a URL.
2. Modalidade B: autorizar e provisionar projeto Supabase Beta isolado, criar backup inicial, aplicar somente as quatro migrations RTC, executar advisors e testes reais de Auth/RLS/Storage/concorrência. Configurar variáveis apenas no Preview e garantir que a URL do banco não seja a principal nem a do e-BEF.
3. Para ambos: autorizar push da branch e deployment separadamente. Não apontar domínio de produção nem promover Preview. Verificar logs de erro sem tokens, documentos ou dados fiscais sensíveis.
4. Rollback A: desabilitar Deployment/retirar acesso ao projeto de prévia; nenhum dado foi gravado. Rollback B: definir `RTC_BETA_ENABLED=0` e publicar novo Preview; preservar banco, eventos e migrations para análise, sem exclusão destrutiva.

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
