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
- A chave lógica é derivada de CNPJ + competência + título normalizado. Mudança no título gera uma chave nova; revisão posterior será necessária.
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
