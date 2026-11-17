# LUCE SENTINELA - Relatorio de Arquitetura e Prontidao

> Documento historico do discovery inicial. A fundacao descrita aqui como pendente foi implementada posteriormente. O estado atual para entrada de clientes esta consolidado em `docs/luce-sentinela-prontidao-cadastro.md` e `docs/luce-sentinela-v1-operacional.md`.

Data do discovery: 31/08/2026  
Status: discovery concluido; nenhuma alteracao estrutural, migration ou deploy executado.

## 1. Resumo executivo

O Luce Sentinela deve ser incorporado como um novo modulo nativo do ecossistema Luce, compartilhando autenticacao, gestao de usuarios, matriz de modulos, identidade visual, Supabase e publicacao Vercel existentes.

A base atual e suficiente para iniciar uma V1 controlada, mas ainda nao esta pronta para receber operacoes fiscais reais sem uma fundacao adicional. O principal bloqueador e a ausencia de multi-tenancy por `organization_id`. Tambem nao existem, no projeto atual, fila duravel, scheduler de producao, workers dedicados, ambientes separados, cobertura automatizada de RLS nem conectores governamentais homologados.

Recomendacao: implementar a V1 por slices verticais, com dados mockados ou anonimizados em desenvolvimento e integracoes oficiais desativadas por feature flags ate a homologacao.

## 2. Stack existente identificada

### Frontend

- Aplicacao multipagina baseada em HTML, CSS e JavaScript nativos.
- Alguns artefatos TypeScript/TSX existem para o Property, mas a aplicacao publicada utiliza majoritariamente arquivos estaticos e bundles compilados.
- Navegacao por diretorios: `app/`, `cerne/`, `property/`, `review-folha/`, `radar-sindical/` e `comunicados-orteconte/`.
- Sem framework SPA central, roteador compartilhado ou gerenciador global de estado.
- Componentes e estilos de autenticacao compartilhados em `assets/module-auth.js` e `assets/auth-luce.css`.
- Design tokens existentes, mas fragmentados entre `styles.css`, `assets/auth-luce.css`, `app/index.html` e CSS dos modulos.
- Bibliotecas principais: `formidable`, `jszip`, `pdfjs-dist` e `xlsx`.

### Backend

- Vercel Functions em JavaScript ESM sob `api/`.
- Supabase Edge Functions em TypeScript/Deno sob `supabase/functions/`.
- Supabase Auth, PostgreSQL, PostgREST e migrations versionadas.
- Acesso privilegiado ao Supabase apenas no backend por `SUPABASE_SERVICE_ROLE_KEY`.
- Cabecalhos de seguranca e CSP configurados no `vercel.json`.
- Rate limiting persistente para autenticacao e rate limiting em memoria para algumas APIs.
- Auditoria em `security_audit_log` e auditorias especializadas em Property/CERNE.

### Infraestrutura

- Vercel project: `lucesistemas` (`prj_OZMFAvV8cfCpJWB0ozgI0p5ReXn8`).
- Vercel team: `team_p9qE6g1mtoPXkApNy2QYSPbg`.
- Dominio de producao: `https://lucesistemas.vercel.app`.
- Supabase vinculado: `prznhgwiibcazuwlwvnt`, PostgreSQL 17.
- Supabase Realtime e Storage habilitados na configuracao local.
- Nao foi identificado repositorio Git nesta pasta local.
- Nao foram identificados CI/CD versionado, staging independente, workers dedicados, DLQ ou scheduler de producao.

## 3. Modulos atuais e reutilizacao

Modulos existentes na landing page:

1. Onboarding Contabil.
2. Review Folha.
3. Property.
4. Radar Sindical.
5. CERNE - Inteligencia Comercial.
6. Comunicados.

O Sentinela deve ser registrado como o setimo modulo, com ID tecnico sugerido `sentinela`, sem alterar os IDs existentes.

Elementos reutilizaveis:

- login e recuperacao de senha do ecossistema;
- `app_metadata.allowed_modules` para autorizacao de acesso ao modulo;
- protecao server-side de modulo em `api/_security.js`;
- painel administrativo de usuarios;
- auditoria com hash de IP;
- padrao visual Luce e favicon;
- CSP e cabecalhos de seguranca;
- consultas CNPJ via backend;
- padrao de timeline e CRM do CERNE;
- geracao de documentos e importacao XLSX existentes.

## 4. Banco e seguranca atuais

Entidades existentes relevantes:

- `onboarding_documents`;
- `security_audit_log`;
- `auth_rate_limits`;
- `property_module_state`;
- `property_module_audit`;
- `cerne_clients`;
- `cerne_onboarding_queue`;
- tabelas relacionais do CRM CERNE;
- `cerne_client_exits`.

Pontos positivos:

- migrations versionadas;
- RLS e `FORCE ROW LEVEL SECURITY` em tabelas sensiveis;
- grants reduzidos em tabelas internas;
- service role mantida no backend;
- auditoria e controle de concorrencia em partes do sistema;
- bloqueio de usuario suspenso e autorizacao por modulo no servidor.

Lacunas para o Sentinela:

- nao existe `organizations` nem associacao usuario-organizacao;
- varias estruturas atuais usam `owner_id`, que nao substitui isolamento por organizacao;
- papeis atuais sao essencialmente `user/admin`, abaixo da granularidade exigida;
- nao existe MFA operacional para acoes fiscais criticas;
- rate limit em memoria da Vercel nao e global nem duravel entre instancias;
- configuracao local de rede do banco permite todos os CIDRs;
- o projeto nao possui testes automatizados de isolamento entre organizacoes;
- configuracao local do Supabase nao representa necessariamente a configuracao remota e deve ser conferida antes da homologacao.

## 5. Arquitetura recomendada para a V1

### Interface

Diretorio sugerido: `sentinela/`.

Primeiras telas reais:

- Dashboard de risco.
- O que precisa ser feito hoje.
- Empresas.
- Ficha Fiscal 360.
- Ocorrencias.
- Documentos.
- Notificacoes.
- Integracoes e matriz de cobertura.

Nenhuma tela deve exibir dado fiscal ficticio como real. Empty states devem informar claramente `Nao consultado`, `Integracao nao configurada` ou `Pendente de credencial`.

### API server-side

Namespace sugerido: `api/sentinela/`.

Servicos iniciais:

- empresas;
- ocorrencias;
- tarefas;
- documentos;
- notificacoes;
- dashboard;
- conectores;
- health checks;
- importacao.

Todas as rotas devem validar JWT, usuario ativo, acesso ao modulo, organizacao e permissao granular.

### Connector Hub

Cada conector deve implementar contrato equivalente a:

```text
authenticate()
checkHealth()
fetchData()
normalize()
persist()
logResult()
```

O frontend nunca acessara diretamente uma fonte governamental. Credenciais, certificados e tokens ficarao apenas no backend/vault.

### Processamento assincrono

O Sentinela necessita de fila persistente desde a fundacao. O modelo deve conter:

- jobs;
- tentativas;
- agendamento;
- lock;
- idempotency key;
- timeout;
- retry exponencial;
- dead-letter state;
- resultado e erro sanitizados.

Vercel Functions podem atender APIs curtas, mas consultas fiscais longas e recorrentes devem ser executadas por worker/scheduler apropriado. A tecnologia definitiva fica `PENDENTE DE DEFINICAO` apos avaliacao de custos e limites do plano.

## 6. Modelo de dados conceitual V1

Todas as entidades de dominio devem incluir `organization_id`, timestamps e, quando aplicavel, `created_by`, `updated_by`, `version` e `deleted_at`.

Fundacao:

- `organizations`;
- `organization_members`;
- `roles`;
- `permissions`;
- `role_permissions`;
- `member_roles`;
- `modules` e `module_access` ou adaptacao segura da matriz atual;
- `feature_flags`;
- `audit_events`.

Dominio fiscal:

- `sentinel_companies`;
- `sentinel_establishments`;
- `sentinel_company_contacts`;
- `sentinel_certificates`;
- `sentinel_proxies`;
- `sentinel_data_sources`;
- `sentinel_connectors`;
- `sentinel_connector_credentials` (somente referencia ao vault);
- `sentinel_connector_runs`;
- `sentinel_fiscal_snapshots`;
- `sentinel_findings`;
- `sentinel_certificates_status`;
- `sentinel_messages`;
- `sentinel_obligations`;
- `sentinel_documents`;
- `sentinel_occurrences`;
- `sentinel_tasks`;
- `sentinel_comments`;
- `sentinel_attachments`;
- `sentinel_notifications`;
- `sentinel_rule_definitions`;
- `sentinel_rule_executions`;
- `sentinel_jobs`;
- `sentinel_job_attempts`.

Nao armazenar certificados ou senhas em JSON aberto. Arquivo e segredo devem permanecer separados.

## 7. RLS e autorizacao

Padrao obrigatorio para tabelas expostas:

- RLS habilitada e forcada;
- acesso condicionado a membership ativa em `organization_members`;
- `organization_id` imutavel por usuarios comuns;
- `USING` e `WITH CHECK` em updates;
- views com `security_invoker = true`;
- funcoes privilegiadas em schema nao exposto, com `search_path` fixo e grants explicitos;
- nenhuma decisao de autorizacao baseada em `user_metadata`;
- permissoes administrativas em `app_metadata` ou tabelas protegidas;
- testes negativos entre Organizacao A e Organizacao B.

Papeis V1:

- Usuario: leitura limitada.
- Analista: trata ocorrencias e tarefas.
- Supervisor: gerencia equipe e carteira.
- Administrador: configuracao da organizacao.
- Admin01 permanece autoridade raiz do ecossistema, sem substituir administradores de cada organizacao.

## 8. APIs oficiais e prontidao

### CND Federal / CPEND

Status: `PENDENTE DE CONTRATACAO`, `PENDENTE DE CREDENCIAL` e `PENDENTE DE HOMOLOGACAO`.

Ha API oficial REST no catalogo Conecta para consulta/emissao de CND, com ambientes de homologacao e producao e autenticacao por token. A integracao so podera ser marcada como operacional depois de contrato, credenciais, teste, normalizacao, persistencia, logs e health check.

Referencia: https://www.gov.br/conecta/catalogo/apis/consultar-certidao-negativa-de-debito

### Situacao Fiscal / Integra Contador

Status: `PENDENTE DE VALIDACAO TECNICA`, `PENDENTE DE CONTRATACAO` e `PENDENTE DE CREDENCIAL`.

E necessario confirmar no catalogo/contrato SERPRO quais servicos, scopes, limites, certificados e custos estao disponiveis para a organizacao contratante.

### DCTFWeb

Status: `PENDENTE DE VALIDACAO TECNICA`.

Existem documentacao e leiautes oficiais da RFB, mas a disponibilidade de operacoes por API deve ser comprovada no servico contratado antes de qualquer implementacao real.

Referencia: https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb

### Caixa Postal

Status: `PENDENTE DE VALIDACAO TECNICA`.

A Receita disponibiliza servicos de comunicacoes eletronicas, mas a forma de integracao automatizada, escopos e poderes de procuracao devem ser confirmados oficialmente.

Referencia: https://www.gov.br/receitafederal/pt-br/servicos/comunicacoes-eletronicas

### PGFN

Status: `PENDENTE DE VALIDACAO TECNICA`.

Servicos existem no REGULARIZE, mas a disponibilidade de API adequada ao produto deve ser validada antes de incluir a fonte na V1.

## 9. Escopo controlado

### V1 - obrigatoria

- base multi-tenant;
- organizacoes, membros, papeis e permissoes;
- cadastro e importacao de empresas;
- dashboard sem dados ficticios;
- ocorrencias, tarefas, comentarios, anexos e timeline;
- notificacoes internas;
- documentos com storage privado;
- Connector Hub;
- fila persistente e idempotencia;
- logs, auditoria e data freshness;
- matriz de integracoes;
- CND Federal como primeiro conector, somente se houver credencial oficial homologada;
- feature flags;
- testes de RLS e isolamento.

### V1 - melhoria

- Realtime para ocorrencias e notificacoes;
- importacao XLSX com validacao e relatorio de erros;
- score fiscal inicial baseado em regras explicaveis;
- relatorios CSV/XLSX essenciais.

### Backlog

- Situacao Fiscal, Caixa Postal e DCTFWeb apos validacao contratual;
- pagamentos, guias e parcelamentos;
- escalonamento avancado;
- IA contextual;
- produtividade e SLA.

### Fase futura

- estados e municipios em escala nacional;
- portal do cliente;
- WhatsApp;
- transmissoes fiscais;
- SPED/XML/NF-e/NFS-e;
- inteligencia tributaria avancada.

## 10. Slices de implementacao

### Slice 0 - seguranca e ambientes

- criar repositorio Git e baseline versionada;
- estabelecer development, staging e production;
- inventariar secrets sem copiar valores;
- definir backup e teste de restauracao;
- validar configuracao remota do Supabase;
- definir rollback.

### Slice 1 - organizacoes e RBAC

- migrations;
- RLS;
- associacao de usuarios;
- permissao `sentinela`;
- testes de isolamento.

### Slice 2 - empresas

- cadastro manual;
- CNPJ unico por organizacao;
- importacao CSV/XLSX;
- backend, RLS, UI e auditoria.

### Slice 3 - ocorrencias e tarefas

- workflow completo;
- timeline;
- anexos;
- notificacoes;
- painel `O que precisa ser feito hoje`.

### Slice 4 - Connector Hub e CND

- conector em homologacao;
- fila;
- normalizacao;
- persistencia;
- comparacao;
- criacao de ocorrencia;
- health check;
- matriz de cobertura.

### Slice 5 - dashboard e Ficha Fiscal 360

- indicadores provenientes exclusivamente do banco;
- fonte e data freshness;
- status distinguindo regular, irregular e nao consultado.

## 11. Riscos e bloqueadores

Criticos:

- multi-tenancy ainda inexistente;
- ausencia de staging separado;
- ausencia de repositorio Git na pasta ativa;
- contratos e credenciais de APIs ainda nao comprovados;
- inexistencia de worker/fila duravel;
- ausencia de testes automatizados de RLS.

Altos:

- frontend fragmentado e com estilos duplicados;
- sessoes de alguns modulos ainda armazenadas em `sessionStorage`;
- rate limit local em memoria nao protege de forma distribuida;
- modelo JSON do Property nao e adequado ao dominio fiscal;
- MFA ainda nao habilitado para acoes criticas.

Medios:

- design tokens nao consolidados;
- ausencia de observabilidade centralizada;
- backups e restore nao documentados no repositorio;
- CSP global ainda permite `unsafe-inline`.

## 12. Dependencias que devem ser fornecidas ou decididas

- razao social e dados da organizacao contratante das APIs;
- contrato SERPRO/Conecta e servicos habilitados;
- credenciais de homologacao, fornecidas somente por secret manager;
- carteira piloto anonimizada;
- departamentos e matriz de responsabilidade;
- politica de retencao de documentos e logs;
- responsavel por homologacao fiscal;
- plano Supabase/Vercel e limites contratados;
- tecnologia do worker/fila;
- dominio/subrota definitiva do modulo.

## 13. Criterio de inicio da codificacao

A implementacao estrutural deve iniciar somente apos aprovacao deste discovery e confirmacao de:

1. estrategia de organizacoes e RBAC;
2. ambiente de staging;
3. repositorio e rollback;
4. fila/worker;
5. primeira integracao oficial e suas credenciais de homologacao;
6. escopo V1 sem expansao para itens de backlog.

## 14. Proxima entrega recomendada

Preparar o pacote tecnico do Slice 0 e Slice 1, contendo:

- ADR de arquitetura;
- diagrama de componentes;
- modelo relacional detalhado;
- migrations propostas, ainda nao aplicadas;
- matriz de RLS;
- matriz de permissoes;
- plano de ambientes;
- plano de backup e rollback;
- testes de isolamento multi-tenant.

Somente depois dessa revisao devem ser aplicadas migrations e criado o primeiro codigo do modulo.
