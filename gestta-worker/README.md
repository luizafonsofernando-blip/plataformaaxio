# Luce E-BEF Sync | Robô Gestta (somente leitura)

Serviço Node.js 20+ e Playwright que usa uma sessão autorizada no Gestta para exportar o relatório XLSX e sincronizá-lo com o backend da Luce. **Não executa operações de escrita no Gestta.** O navegador RPA roda no computador dedicado da ORTECONTE, fora da Vercel.

## Preparação

1. Revisar se a automação é permitida pelo contrato/políticas do Gestta e obter autorização interna.
2. Em homologação, executar a migração SQL em \`supabase/migrations/20261015_ebef_gestta_sync.sql\`. Ela **apenas cria duas tabelas**.
3. Na Vercel, definir as variáveis *server-side* \`GESTTA_SYNC_TOKEN\` (segredo exclusivo forte, 32+ caracteres), \`SUPABASE_URL\` e \`SUPABASE_SERVICE_ROLE_KEY\`. Nunca usar \`VITE_\` para a service role nem inseri-la no frontend.
4. No computador com navegador (Windows PowerShell), executar:

\`\`\`powershell
cd gestta-worker
npm install
npx playwright install chromium
Copy-Item .env.example .env
\`\`\`

5. Preencher \`.env\` com \`LUCE_SYNC_URL\` e \`LUCE_SYNC_TOKEN\` igual ao token Vercel. **Não compartilhe o arquivo, senhas ou cookies.**

## Testes sem escrita

\`\`\`powershell
npm test
npm run sync -- --file "C:\caminho\Clientes EBEF (1).xlsx" --dry-run
\`\`\`

O modo \`--dry-run\` valida e conta as tarefas sem chamar a API. Não divulga a lista de clientes em logs.

## Sincronização assistida

Primeiro, se a organização autorizar o acesso automatizado:

\`\`\`powershell
npm run login
\`\`\`

Entre no Gestta na janela exibida, incluindo eventual MFA, e retorne ao terminal. A sessão é guardada em \`.gestta-profile\`, ignorada pelo Git.

Em seguida:

\`\`\`powershell
npm run sync -- --backfill --dry-run
\`\`\`

No navegador, ajuste os filtros de **tarefas E-BEF e competências desejadas** e exporte o XLSX. Confirme contagens. Quando aprovado, executar sem \`--dry-run\`.

Também é possível sincronizar um relatório já baixado com \`npm run sync -- --file "C:\arquivo.xlsx"\`.

## Automação total (somente após calibrar a interface)

Configure a URL e os seletores da tela e dos filtros, conforme descrito no final deste documento. Valide que os filtros foram aplicados ao abrir a página em uma nova sessão. Depois:

\`\`\`powershell
npm run sync -- --backfill --recent=2 --auto --dry-run
npm run sync -- --backfill --recent=2 --auto
\`\`\`

A rotina não contorna login, MFA ou CAPTCHA e **não** adivinha seletores. Se o layout ou a sessão mudar, falhará e exigirá revisão. Não programe execução automática antes de verificar uma exportação completa e correta.

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

Nos meses com 31 dias, exportar 01-30 e 02-31, dois intervalos de ate 30 dias. A sobreposicao e removida pelo ID da tarefa. O mes atual e consultado por inteiro (inclusive vencimentos futuros). Todos os XLSX sao validados antes de enviar qualquer registro.

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
