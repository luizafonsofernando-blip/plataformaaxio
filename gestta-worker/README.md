# Luce E-BEF Sync | Robô Gestta (somente leitura)

## Painel visual LUCE E-BEF — a partir do Excel ja salvo (sem novo download)

Se voce ja tem `reports/LUCE_EBEF_2026_10_....xlsx`, **NAO
execute o robô Gestta novamente**. Basta preparar uma cópia estruturada
local e abrir a interface:

```powershell
git pull --ff-only origin feature/ebef-gestta-readonly-sync
npm run dashboard:prepare
Start-Process ..\ebef\index.html
```

O primeiro comando atualiza o projeto; o segundo usa o **Excel mais
recente** dentro de `reports/` e cria um arquivo
`LUCE_EBEF_2026_10_..._painel_XXXXXXXX.json` na mesma pasta. O terceiro
abre o painel gráfico no navegador. No painel, clicar **Importar controle
local** e selecionar o JSON recém-gerado.

O painel oferece pesquisa por nome, CNPJ, responsável e tarefa, além de
filtros por status, categoria, e visões por empresas ou tarefas. O
carregamento do JSON ocorre exclusivamente pela File API do navegador,
**sem fetch, upload ou escrita no Supabase**. Não utiliza cookies de
autenticação. Não publicar nem compartilhar o JSON: contém nomes, CNPJs,
dados de responsáveis e tarefas. Ao fechar o navegador, os dados em
memória são descartados (não há armazenamento no navegador).

Este painel é um MVP **local**, não um módulo de produção com login e
persistência na LUCE. A rota está nos arquivos da branch em `ebef/`;
publicar no domínio oficial só depois de revisão de acesso e UX.
O Excel e o JSON ficam no seu computador, não são enviados pela plataforma.


Serviço Node.js 20+ e Playwright que usa uma sessão autorizada no Gestta para exportar o relatório XLSX e sincronizá-lo com o backend da Luce. **Não executa operações de escrita no Gestta.** O navegador RPA roda no computador dedicado da ORTECONTE, fora da Vercel.

## MVP funcional imediato — Relatório Excel local

A forma mais rápida de usar a automação hoje é gerar o **controle E-BEF
diretamente no computador Windows**, sem instalar tabelas no Supabase
e sem aguardar desenvolvimento do dashboard da LUCE.

No PowerShell, dentro de `gestta-worker`:

```powershell
git pull --ff-only origin feature/ebef-gestta-readonly-sync
node --test .\\tests\\ebef-local-report.test.mjs
npm run export:october-local
```

- **Atenção:** o último comando autoriza 2 downloads reais do Gestta,
  janelas de outubro `01–30` e `02–31`, e armazenamento local do
  controle resultante. Execute somente com a devida autorização.
- O robô aplica os filtros já homologados, confere as janelas, deduplica
  os IDs, valida a consolidação e gera UMA planilha Excel com três abas:
  **Painel**, **Empresas** e **Tarefas**, com filtros, CNPJs em formato
  texto e cores da LUCE.
- O arquivo final é salvo na pasta `gestta-worker/reports/`, com nome
  `LUCE_EBEF_2026_10_<identificador>.xlsx`, e **não é apagado**.
  A pasta `reports/` consta no `.gitignore`. Guardar o arquivo com
  acesso restrito porque contém nomes de clientes, CNPJs e responsáveis.
- O relatório mostra tarefas de verificação, declarações e status do
  **Gestta**. Ele **não comprova a transmissão de uma E-BEF**.
- A seleção de checkboxes renderizados não prova cobertura de todos os
  usuários. A competência corrente pode mudar até o fechamento mensal.
- Nenhuma API da LUCE é chamada; não há criação de tabelas, importação
  ou sincronização. Os XLSX intermediários são removidos depois da
  conferência.
- O comando anterior `test:export-paired-october` continua igual, sem
  salvar relatório final, para diagnósticos.

Este é o MVP utilizável enquanto a integração visual com a LUCE
estiver em desenvolvimento.

## Situação atual — somente leitura e homologação

**NÃO executar migração SQL, NÃO enviar registros ao Supabase e NÃO remover
o bloqueio de sincronização nesta etapa.** A API da branch aceita apenas
`validate_only`, e o worker só aceita `sync --dry-run`.

As tabelas E-BEF propostas ainda não existem no Supabase consultado.
Os pilotos de outubro identificaram 44 tarefas para 38 CNPJs, sem provar
que todos os usuários ou declarações transmitidas foram contemplados.

## Preparação no Windows

1. Confirmar a autorização interna para o acesso automatizado ao Gestta.
2. Manter o projeto na branch `feature/ebef-gestta-readonly-sync`.
3. No PowerShell, instalar as dependências locais (se necessário):

```powershell
cd gestta-worker
npm install
npx playwright install chromium
```

4. Não incluir senhas, tokens, cookies ou arquivos `.env` no GitHub.
   **Não configurar credenciais do Supabase para esta homologação.**

## Testes e diagnóstico sem escrita

```powershell
npm test
npm run diagnose:tasks-view
npm run test:preflight-export
npm run test:preflight-export-31
```

Os diagnósticos com Chromium interagem somente com os filtros visuais e
não fazem download. O comando `npm test` não utiliza navegador.

Os pilotos XLSX exigem autorização individual porque baixam relatórios
reais. O comando pareado `npm run test:export-paired-october` realiza
**dois downloads** e descarta os XLSX depois da auditoria offline.
Ele não consulta nem escreve no Supabase.

A única forma permitida de testar o comando legado é com
`--dry-run`; executar `npm run sync` sem essa opção falha
antes de tentar exportação ou envio. Não habilitar agendamentos
automáticos ou sincronização de produção.

## Cuidados operacionais

- Exportações parciais não excluem tarefas que estavam no banco; ausência da tarefa não equivale a conclusão.
- Quando o XLSX contém ID de tarefa Gestta válido, a chave lógica deriva desse ID; sem ID, existe uma chave alternativa baseada em CNPJ + competência + título normalizado. A importação mensal com janela de datas exige ID válido, evitando que mudança de título crie outra identidade.
- O status da tarefa **não comprova** a transmissão E-BEF. Protocolo, comprovantes e outras informações do controle continuam independentes.
- Tokens/senhas não vão para o GitHub nem ao frontend; cookies permanecem no robô local.
- O banco só permite acesso via função protegida de servidor; não foram criadas policies de leitura para usuários comuns.
- Os seletores da interface real do Gestta e o agendamento ainda precisam de validação em homologação.
- Fazer backup e revisar o fluxo antes de usar em produção.


## Execução no Windows durante o expediente

Para instalar o robô localmente e preparar um agendamento opcional no Agendador de Tarefas do Windows, consulte [`windows/README.md`](windows/README.md). Os scripts criam uma **prévia por padrão** e só registram horários com `-Apply`, depois da homologação da exportação e da autenticação. Não use em produção antes de confirmar filtros, contagens e autorização do Gestta.
 
## Fluxo mensal 2026 (novo formato com Id e Vencimento)

O relatorio de outubro apresenta 15 colunas: Id, Nome, Tipo, Status, Cliente, CNPJ/CPF, Departamento, Responsavel, Vencimento, Data Legal, Competencia, Data de Conclusao, Feito atrasado, Feito com multa e Baixado.

O ID proprio do Gestta evita duplicidades entre exportacoes (e mudancas de status, titulo e responsavel). O campo Vencimento valida se o filtro por Data Meta foi aplicado. Competencia e armazenada separadamente.

Primeira carga, com acoes manuais no navegador e SEM enviar dados:

    npm run sync -- --backfill --from=2026-01 --dry-run

Rotina para os dois meses mais recentes, tambem sem enviar dados:

    npm run sync -- --backfill --recent=2 --dry-run

Nos meses com 31 dias, exportar 01-30 e 02-31, dois intervalos de ate 30 dias. A sobreposicao e removida pelo ID da tarefa. O mes atual e consultado por inteiro (inclusive vencimentos futuros). Todos os XLSX sao validados localmente; o envio de registros para LUCE permanece bloqueado.

Automacao completa, apenas depois de calibrar seletores CSS reais no Windows e confirmar os 3 filtros de tarefa, todos os clientes, todos os usuarios, Data Meta e botao Exportar:

    npm run sync -- --backfill --recent=2 --auto --dry-run

Parametros exigidos: GESTTA_REPORT_URL, GESTTA_DATE_RANGE_SELECTOR, GESTTA_FILTER_APPLY_SELECTOR, GESTTA_CLIENTS_ALL_SELECTOR, GESTTA_USERS_ALL_SELECTOR, GESTTA_TASK_CHECKBOX_SELECTORS (JSON com 3 seletores) e GESTTA_EXPORT_SELECTOR.

A captura de tela nao revela seletores HTML. Se o date-picker for somente leitura ou os checkboxes forem componentes customizados, sera necessaria calibracao presencial no Windows. NAO agendar antes desse teste.

A calibracao automatica tambem exige GESTTA_DATE_MODE_SELECTOR para confirmar que o campo Exibir por esta em Data Meta. Somente inspecao do HTML autenticado pode estabelecer seletores confiaveis.

A rotina tambem exige calibrar o filtro avancado Departamento: GESTTA_ADVANCED_DEPARTMENT_SELECTOR, GESTTA_ADVANCED_DEPARTMENT_SELECT_ALL_SELECTOR, GESTTA_ADVANCED_DEPARTMENT_ROW_SELECTOR e GESTTA_ADVANCED_DEPARTMENT_ROW_CHECKBOX_SELECTOR. Ao abrir o campo, o robo aciona **Selecionar todos** e valida cada checkbox e os nomes dos 21 departamentos confirmados pela ORTECONTE. Na captura, Arquivo estava desmarcado. Nao deduzir cobertura total pelo resumo `Contabil +16`. Se a lista for virtualizada, inspecionar e adaptar a verificacao antes de ativar o agendamento.


## Auditoria mensal local sem sincronização (após o primeiro piloto)

- O piloto 01/10/2026–30/10/2026 foi validado localmente com 43 registros de categoria `verificacao`, 43 IDs únicos e descarte da cópia temporária. Isso **não comprova a cobertura integral de outubro** nem a quantidade total de usuários do Gestta.
- Em meses de 31 dias, devem existir as duas janelas já planejadas (`01–30` e `02–31`). A segunda exportação real **exige autorização específica**; não está habilitada pelo primeiro piloto.
- `src/monthly-ebef-audit.mjs` contém uma auditoria **pura, sem I/O ou rede**: recebe tarefas já normalizadas pelo parser, exige todas as janelas esperadas, valida datas, consolida por chave de ID, conta duplicatas da sobreposição e bloqueia registros conflitantes.
- `tests/monthly-ebef-audit.test.mjs` exercita janelas completas e ausentes, 31º dia, duplicações e divergências. Execute `npm test` para validar as regras.
- O retorno mostra **somente números agregados**, nunca lista de clientes, CNPJ, nomes ou IDs. `allUsersProven:false` e `synchronized:false` permanecem explícitos no resumo. O módulo ainda não recebe arquivos XLSX diretamente: a integração com relatórios reais será feita depois de homologar a segunda janela, sem acesso ao banco LUCE.

### Segunda janela de outubro — comandos separados (preparados, ainda nao homologados)

Os comandos abaixo estao separados do piloto original. A segunda janela requer
`--confirm-second-window` alem das autorizacoes existentes. Nunca utilizar
um piloto como comprovacao de cobertura global dos usuarios.

1. Conferir as regras sem navegador: `npm test`.
2. Conferir filtros sem XLSX: `npm run test:preflight-export-31`.
3. **Somente mediante autorizacao expressa para um novo download real**,
   executar `npm run test:export-pilot-31` (02/10–31/10/2026).

O XLSX do primeiro piloto (01–30) foi descartado. O segundo piloto isolado
tambem apaga seu proprio XLSX. Portanto, realizar apenas a segunda exportacao
NAO permite consolidar os dois arquivos: depois de homologar as duas janelas,
sera necessario implementar a execucao mensal pareada que processe ambas na
mesma rodada, em memoria, auditando os IDs sem escrever na LUCE.
Enquanto essa rotina pareada nao existir, nao declarar outubro consolidado.

### Execucao pareada experimental de outubro/2026 (nao executada automaticamente)

O comando `npm run test:export-paired-october` prepara **duas exportacoes reais**,
01/10–30/10 e 02/10–31/10, em uma unica sessao Chromium headless. Ele
exige simultaneamente os consentimentos `--confirm-two-downloads`,
`--confirm-rendered-users-only` e `--confirm-no-sync`, incorporados no
script npm. Executar SOMENTE apos autorizacao para dois downloads reais.
Nao reutiliza os XLSX anteriores porque os pilotos isolados os apagaram.

Cada XLSX passa pelo parser (colunas, ID unico, Data Meta e campos esperados).
O modulo `monthly-ebef-audit.mjs` compara os registros das duas janelas por
chave de ID, conta duplicatas, rejeita conflitos de titulo/status/competencia
e so considera o calendario mensal validado quando AMBAS as janelas passarem.
Resultados agregados sao mostrados no terminal sem dados de clientes.
A pasta temporaria privada e excluida ao final (o script avisa se falhar
a exclusao). Nenhum registro e enviado a LUCE/Supabase.

O numero de checkboxes renderizados selecionados, mesmo 597/597, **nao e
evidencia suficiente para afirmar todos os usuarios cadastrados**. Da mesma
forma, tarefas com tipo `verificacao` nao comprovam uma declaracao transmitida.
Enquanto a abrangencia nao for validada por uma fonte independente, este
processo continua estritamente exploratorio, sem sincronizacao.

### Conferencia empresarial e pre-sincronizacao segura (somente codigo)

- `src/monthly-ebef-review.mjs` aplica a auditoria de janelas e calcula
  `uniqueCnpjs`, empresas so com `verificacao`, so com `declaracao`, com
  ambas e totais de status em grupos codificados. O resumo nao inclui CNPJs,
  nomes ou IDs; a classificacao da tarefa NAO confirma entrega E-BEF.
- `src/pre-sync-preview.mjs` faz uma comparacao PURA em memoria contra um
  snapshot local **explicito e declarado completo** dos registros existentes.
  Sem snapshot, as contagens de inclusoes, atualizacoes e inalterados ficam
  `null` (DESCONHECIDAS), jamais se presume que a tabela esteja vazia.
  Um snapshot fornecido nao e evidência independente de que o banco foi
  efetivamente consultado; esse resultado e rotulado estimativa offline.
- A comparacao contempla apenas campos persistiveis normalizados. Um mesmo
  ID do Gestta associado a CNPJ diferente bloqueia a simulacao. Nao ha
  deletions, requests de rede, credenciais ou comandos SQL nestes modulos.
- `test-export-paired-october.mjs` agora imprime
  `PAREADO_CONFERENCIA_AGREGADA` e `PAREADO_PRE_SYNC_SEM_BANCO` apos
  auditar os dois XLSX na mesma memoria. O ultimo mostra contagens
  `inserts:null` e `updates:null` enquanto a LUCE nao fornecer um
  snapshot confiavel em modo somente leitura.
- Os pilotos anteriores descartaram os XLSX. Nao e possivel recuperar uma
  contagem de CNPJs unicos dos resumos com 44 tarefas. Para calcular essa
  metrica com dados reais, uma nova execucao pareada precisa de autorizacao.
- **Antes de qualquer integracao de producao**, conferir a migracao SQL
  `supabase/migrations/20261015_ebef_gestta_sync.sql` e o esquema efetivo
  da LUCE. A versao originalmente truncada foi substituida na branch por
  proposta coerente com os campos normalizados, ainda **NAO APLICADA**
  ao Supabase. Sua sintaxe e seguranca operacional requerem revisao antes
  de DDL, backup e autorizacao explicita. O teste de contrato de colunas e
  RLS e `tests/ebef-migration-contract.test.mjs`.

Testes isolados, sem Playwright/Chromium ou banco: `npm test`.


### Estado da base e bloqueio de provisionamento (19/10/2026)

- Consulta **somente leitura** no Supabase conectado nao encontrou tabelas
  publicas com `ebef` ou `gestta` no nome; nenhuma criacao/DDL executada.
- A migracao corrigida define `ebef_gestta_tasks` e
  `ebef_gestta_sync_runs` isoladamente, revoga acesso de
  `public`, `anon`, `authenticated`, habilita RLS e
  permite a `service_role` somente operacoes planejadas, sem `DELETE`.
- Esta proposta SQL ainda nao foi validada contra a API que escrevera no
  banco e NAO deve ser aplicada ate haver revisao, backup e autorizacao.
- A ausencia das tabelas nao significa base vazia para a simulacao:
  `inserts` e `updates` continuam desconhecidos; o preview offline
  permanece desativado para consultas reais.

### Revisao da API Gestta -> LUCE (modo seguro, 19/10/2026)

**Importante: ainda NAO existe sincronizacao real homologada.** A auditoria
pareada encontrou 44 tarefas E-BEF de verificacao para 38 CNPJs, mas isso
nao equivale a 44 declaracoes entregues nem comprova todos usuarios Gestta.

- `api/ebef/gestta-sync-contract.mjs`: contrato de validacao puro.
  Exige identidade de tarefa verificavel (ID Gestta e SHA-256), CNPJ
  com 14 digitos, competencia, campos presentes, datas ISO validas,
  booleanos corretos, categorias E-BEF conhecidas e IDs unicos.
- `api/ebef/gestta-sync.js`: **somente** POST autenticado com
  `mode:"validate_only"` e `source:"gestta"`. Retorna exclusivamente
  `acceptedRecords`, contagens por categoria e marcadores
  `writesPerformed:false`, `dbCompared:false` e
  `allUsersProven:false`. Nao chama Supabase, nao transmite registros
  nem guarda dados. O formato legado de sincronizacao e recusado com 423.
- `gestta-worker/src/sync.mjs` e `gestta-worker/src/cli.mjs`:
  `npm run sync` sem `--dry-run` agora falha ANTES de executar
  exportacoes ou acessar a rede. Apenas simulacoes locais sao permitidas.
- Testes sem Chromium e sem rede: `tests/gestta-api-contract.test.mjs`,
  `tests/gestta-api-readonly.test.mjs`; executar `npm test`.
- A futura escrita exigira reconciliacao transacional, controle de
  idempotencia e backup. Nao configurar variaveis do Supabase para
  contornar este bloqueio; a ausencia de tabela e a validacao de payload
  nao autorizam criacao/insercao. Nao executar migrations por enquanto.

A validacao `validate_only` e um contrato de backend, nao uma chamada
de producao ou comprovante de entrega da obrigacao fiscal.

### Planejamento de reconciliacao offline (apos 220 testes unitarios aprovados)

- `src/ebef-reconciliation-plan.mjs` e
  `tests/ebef-reconciliation-plan.test.mjs`: separacao entre novas,
  alteradas e inalteradas usando identidade validada do Gestta;
  snapshots incompletos ou identidades conflitantes bloqueiam o plano.
- Sem snapshot, inclusoes/atualizacoes/inalterados permanecem
  desconhecidos (null). Com snapshot declarado completo, as contagens
  sao apenas **estimativas offline**; nao ha consulta real ao banco.
- A execucao pareada imprime `PAREADO_PLANO_OFFLINE_SEM_BANCO`
  sem CNPJs/nomes/IDs. Continua exigindo autorizacao para 2 downloads
  no Gestta e nao escreve na LUCE.
- Os requisitos ainda pendentes para idempotencia, concorrencia,
  transacao unica e integracao efetiva estao em
  `docs/reconciliation-safety.md`.
- Nenhuma alteracao da branch principal, deployment ou banco foi
  realizada. Execute `npm test` para validar os novos testes.

## Validação de páginas para futura fotografia offline

- `src/ebef-snapshot-pages.mjs` implementa montagem **em memória** de
  páginas fornecidas pelo operador, com validação de ordem global de IDs,
  quantidade esperada, revisão constante, datas e contrato das tarefas.
  Em erros de paginação, aborta sem criar snapshot.
- O objeto `snapshot.complete:true` significa exclusivamente que todas
  as páginas batem com o manifesto **autodeclarado**; não comprova que o
  banco foi lido em uma transação consistente ou que a tabela exista.
- Ainda não há adaptador de consulta real ao Supabase, pois as tabelas
  E-BEF continuam não provisionadas. A futura leitura deve ser exclusiva
  das tabelas Gestta, usar transação/snapshot consistente no banco e
  permissões mínimas. Não utilizar `service_role` para um leitor local.
- Testes puramente sintéticos em
  `tests/ebef-snapshot-pages.test.mjs`, executados por `npm test`.
