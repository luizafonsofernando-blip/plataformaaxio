# Luce E-BEF Sync: execucao no Windows

## Seguranca

- Somente com autorizacao da ORTECONTE e permissao de uso automatizado do Gestta.
- Use conta Windows dedicada e pasta local protegida/criptografada, fora de OneDrive ou pastas compartilhadas. Restrinja acesso a .env (token) e .gestta-profile (cookies de sessao).
- Nao compartilhe senha ou MFA do Gestta. A entrada e feita manualmente na janela do Playwright.
- A chave SUPABASE_SERVICE_ROLE_KEY fica apenas na Vercel; no Windows configure somente LUCE_SYNC_TOKEN.
- Nao configure agendamento antes de validar filtros e a exportacao de XLSX completos.

## 1. Instalar

Instale Node.js 20 ou superior. Em Windows PowerShell 5.1+, abra o terminal na pasta do worker:

    cd C:\Luce\plataformaaxio\gestta-worker
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\setup.ps1

O script instala dependencias e Chromium do Playwright, executa testes e cria .env.example como .env quando necessario. Nao realiza login, envio ou agendamento.

## 2. Testar com seguranca

Edite .env localmente: LUCE_SYNC_URL e LUCE_SYNC_TOKEN. Configure GESTTA_REPORT_URL e GESTTA_EXPORT_SELECTOR apenas apos inspecionar a interface autenticada e confirmar que a URL abre relatorios ja filtrados para E-BEF.

    npm run login
    npm run sync -- --file "C:\Caminho\Clientes EBEF (1).xlsx" --dry-run
    npm run sync -- --backfill --recent=2 --auto --dry-run

Confira competencia, quantidade e status antes de executar um envio real:

    npm run sync -- --backfill --from=2026-01 --auto

O login manual/MFA e obrigatorio quando a sessao expirar. O robô nao contorna autenticacao nem captcha.

## 3. Agendar SOMENTE depois de homologar

PREVIA sem criar tarefa (horarios meramente ilustrativos):

    .\windows\register-task.ps1 -Times 09:00,15:00

HABILITAR duas execucoes em dias uteis apos aprovacao dos horarios:

    .\windows\register-task.ps1 -Times 09:00,15:00 -Apply

A tarefa usa o mesmo usuario Windows do login e executa somente quando esse usuario esta conectado. Nao e garantida a execucao se a maquina dormir, cair a internet ou o Gestta requerer nova autenticacao.

Teste como o Agendador executaria, mas sem enviar:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\run-sync.ps1 -DryRun

O agendamento usa --backfill --auto --recent=2. Para a primeira carga, execute --backfill --from=2026-01 --dry-run, confira cada mes e depois remova --dry-run em homologacao.

Os logs resumidos ficam em gestta-worker\logs\sync-AAAAMMDD.log e sao retidos por 30 dias. Um mutex evita execucoes simultaneas. Nao ha exclusao automatica de tarefas ausentes do arquivo.

Para desativar:

    Disable-ScheduledTask -TaskName 'Luce E-BEF - Gestta leitura'

## Limites do MVP

- Exportacao inteiramente automatica so funciona depois da calibracao da pagina/filtros e seletor do botao de exportacao.
- Um Windows ligado com a conta encerrada nao executa tarefa configurada como Interactive.
- Tarefa concluida no Gestta nao comprova protocolo de envio do E-BEF.
- O MVP sincroniza dados de XLSX, nao anexos, historicos ou prazos individuais.


## Exportacao por periodo

O periodo padrao inicial vai de janeiro de 2026 ao MES ATUAL COMPLETO, nao apenas ate o dia da execucao. Em meses de 31 dias, usa 01-30 e 02-31 para obedecer o limite de 30 dias; repeticoes sao conciliadas pelo ID. O Excel atual possui 15 colunas e a Data Meta deve estar presente para validar o intervalo. A automacao so funciona depois de calibrar os seletores reais do HTML e confirmar todos os filtros.

A calibracao automatica tambem exige GESTTA_DATE_MODE_SELECTOR para confirmar que o campo Exibir por esta em Data Meta. Somente inspecao do HTML autenticado pode estabelecer seletores confiaveis.


## Instalação guiada (primeiro dia, sem envio de dados)

No computador autorizado, instalar Git para Windows e Node.js 20+ (de preferência a versão LTS suportada).
Abra um PowerShell normal, sem permissões administrativas adicionais, e verifique:

    git --version
    node --version
    npm --version

Clonar SOMENTE a branch de homologação. O comando abaixo usa uma pasta dentro do
perfil de usuário, não interfere no Git/Vercel de produção:

    New-Item -ItemType Directory -Path "$HOME\Luce" -Force | Out-Null
    git clone --branch feature/ebef-gestta-readonly-sync --single-branch https://github.com/luizafonsofernando-blip/plataformaaxio.git "$HOME\Luce\plataformaaxio"
    Set-Location "$HOME\Luce\plataformaaxio\gestta-worker"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\setup.ps1

O instalador: baixa dependências do Node e navegador Chromium do Playwright,
executa testes e cria um arquivo local .env de exemplo. Não pede senha,
não autentica no Gestta, não importa Excel e não envia dados à Luce.

### Sessão autorizada

Depois da instalação, ainda dentro de gestta-worker, rode:

    npm run login

No Chromium aberto automaticamente, faça login manual no Gestta e complete MFA
se solicitado. Volte ao terminal e pressione Enter. O arquivo de sessão
fica apenas na pasta .gestta-profile (ignorando-se sincronização em nuvem).

Depois execute:

    npm run inspect

O Playwright Inspector permite o comando Pick Locator para obter seletores
dos filtros no **navegador local**. O script não exporta relatórios nem envia
informações ao Supabase. Não copie cookies, credenciais, tokens, perfis
ou conteúdo de clientes para conversas/repositórios.

### Verificação de parser, sem ligação com a Luce

    npm run sync -- --file "C:\CAMINHO\gestta.busca.xlsx" --dry-run

O teste acima somente lê um arquivo de Excel previamente exportado e exibe
contagens. O token da API da Luce ainda não é necessário.

Apenas após validar DOM, datas, checkboxes, filtros dos 21 departamentos e
a exportação real, configurar .env, Vercel e Supabase para integração.
Nunca registrar agendamento com -Apply nesta primeira fase.


## Calendário confirmado visualmente (15/10/2026)

A interface do Gestta abre um date-picker em `#date-range`, com atalhos "Mês atual", "Mês passado", "Hoje", "Últimos 12 meses", "Próximos 12 meses" e "Outro", dois campos DD/MM/AAAA e botão "Aplicar". O período 01/10/2026–31/10/2026 é exibido no calendário, mas a tela **não confirma** se uma exportação de 31 dias seria aceita.

O worker foi ajustado para usar "Outro": abrir o calendário, localizar data inicial, data final, clicar Aplicar, verificar o intervalo exibido e só então exportar. Não usa atalhos de meses porque são insuficientes para a carga histórica.

Configurar seletores de `GESTTA_DATE_CUSTOM_SELECTOR`, `GESTTA_DATE_START_SELECTOR`, `GESTTA_DATE_END_SELECTOR`, `GESTTA_DATE_APPLY_SELECTOR` após obter cada um pelo Pick Locator no computador autorizado. O seletor geral `GESTTA_DATE_RANGE_SELECTOR=#date-range` já foi identificado visualmente pelo Inspector.

A rotina de preenchimento usa `fill()` em campos de texto. Se forem read-only ou um calendário personalizado, a automação falhará sem clique alternativo, exigindo ajuste local. Não colocar em produção até validar.

Para atualizar a branch já clonada depois das alterações no GitHub:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker

Não compartilhe cookies, MFA ou segredos ao relatar eventuais problemas.


## Teste isolado do calendário (seletores inspecionados em 15/10/2026)

Referências confirmadas no Playwright Inspector:
- Campo principal: #date-range
- Início: input[name="daterangepicker_start"]
- Fim: input[name="daterangepicker_end"]
- Outro: getByText('Outro', {exact:true})
- Aplicar: getByRole('button', {name:'Aplicar',exact:true})

O módulo src/date-picker.mjs usa estes seletores como padrão, sem exigir a edição de suas variáveis no .env.

Encerre npm run inspect e feche o navegador Playwright para liberar o perfil.
Atualize a branch clonada:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker

Configure o endereço da página de tarefas no arquivo local .env
(sem compartilhar o arquivo, cookies ou senhas):

    notepad .env

Preencha GESTTA_REPORT_URL com a URL de tarefas do Gestta que contém o calendário.
Teste local sem download, envio de dados ou alteração de tarefas:

    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

O teste abre Chromium com a sessão local, seleciona Outro, preenche as
duas datas, clica Aplicar e confere o intervalo mostrado na tela.

Se os inputs forem somente leitura, a rotina falhará sem modificar dados
no Gestta e deverá ser adaptada após nova inspeção.
Não ative a exportação e o agendamento antes de homologar todos os outros filtros.


## Solução para erro locator('#date-range') após 20 segundos (15/10/2026)

O primeiro teste no computador Windows da ORTECONTE abriu o Chromium, mas expirou enquanto aguardava o filtro #date-range. O seletor já tinha sido confirmado no Inspector; o erro não comprova seletor incorreto. Pode haver redirecionamento do aplicativo Gestta, sessão não autenticada, carregamento lento ou página diferente.

Foi adicionada a navegação manual assistida em src/test-calendar.mjs: quando não encontra o campo, mantém o navegador aberto e pede ao usuário para navegar até a tela de tarefas, sem registrar log de URL, título da página ou informações de clientes. Após confirmar no PowerShell com Enter, localiza o controle entre abas abertas e tenta configurar as datas.

Para testar:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Se surgir a instrução de navegação, no Chromium do Playwright entre manualmente na visão de tarefas (com o filtro Data Meta visível), volte ao PowerShell e pressione Enter. Se houver login/MFA, realize apenas manualmente. O teste só manipula filtro visual, não baixa relatório nem envia dados à Luce.

Caso não apareça o calendário mesmo após navegação manual, enviar somente texto do erro sem dados privados. Ainda não ativar automação da exportação.


## Correção da navegação manual após teste de calendário aprovado

Na homologação, o robô validou o intervalo 01/10/2026 a 30/10/2026 depois de navegação manual. Uma possível causa da abertura da página inicial é a configuração da URL com # sem aspas no arquivo .env: dotenv trata o # não protegido como início de comentário.

Configure a variável com a URL COMPLETA entre aspas duplas, por exemplo:

    GESTTA_REPORT_URL="https://app.gestta.com.br/#/sidebar/task/overview/dashboard/6a4fc2888c762dd983242f93"

Feche o navegador Playwright antigo, atualize a branch com git pull --ff-only e execute de novo:

    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Agora o teste falha antecipadamente se a URL interpretada pelo dotenv não possuir a rota #/sidebar/task/. O próximo critério de homologação é abrir diretamente a lista de tarefas SEM intervenção manual. Caso o Gestta redirecione mesmo com a URL entre aspas, será preciso investigar sessão e navegação antes de habilitar o agendamento.


## Navegação inicial Dashboard → Tarefas (15/10/2026)

Confirmado pela ORTECONTE: após login o Gestta abre na Dashboard e é necessário clicar no menu "Tarefas" para exibir os filtros. Isso é um fluxo normal do aplicativo, não deve ser tratado como falha de autenticação nem depender de copiar uma URL de tarefa.

O módulo src/task-navigation.mjs agora tenta clicar no elemento com texto exato "Tarefas" e aguarda o campo #date-range. Ele só prossegue se o menu for único e se a tela de tarefas aparecer. Se houver múltiplos elementos Tarefas, configurar o seletor CSS GESTTA_TASKS_MENU_SELECTOR após inspecionar o item no Playwright Inspector. A navegação manual permanece disponível somente no teste assistido; a exportação automática falha de forma segura até que o menu seja homologado.

Para conferir no computador sem exportar: fechar npm run inspect, executar git pull --ff-only na branch e testar npm run test:calendar -- --start=2026-10-01 --end=2026-10-30. Se precisar navegar manualmente, usar Pick Locator no texto do MENU Tarefas (na lateral), e não no nome de uma tarefa já aberta. Enviar apenas o localizador, sem dados de clientes.

A URL com # no .env continua devendo estar entre aspas caso utilizada; ela não substitui a necessidade de clicar em Tarefas quando o Gestta redireciona à Dashboard.
