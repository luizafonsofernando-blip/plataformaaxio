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


## Entrada no Gestta pelo gráfico de Tarefas Abertas (atualizado 15/10/2026)

A ORTECONTE confirmou que o Gestta abre na Dashboard. Para acessar o quadro que contém o filtro #date-range, é possível clicar em QUALQUER contador no gráfico Tarefas Abertas: No Prazo (no print 7), Em Atraso (17) ou Com Multas (0). Estes números são dinâmicos.

O módulo src/task-navigation.mjs agora procura o contador numérico vinculado ao rótulo "No Prazo" e clica nele. O teste exige que o rótulo e o número sejam encontrados de forma única em um grupo pequeno; não se baseia no valor 7. Se a estrutura do HTML impedir uma localização inequívoca, ele falha em segurança em vez de clicar em um número arbitrário.

Caso não consiga localizar o contador, utilize npm run inspect, ative Pick Locator e clique DIRETAMENTE SOBRE O NÚMERO do indicador "No Prazo" no gráfico Tarefas Abertas. Configure o CSS obtido na variável opcional GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR no arquivo .env. Não envie informações privadas do Gestta.

Ainda será necessário homologar se o filtro criado pelo atalho (por exemplo apenas tarefas no prazo) é substituído corretamente ao selecionar todos os status nos filtros avançados. Não executar sincronização automática sem esta verificação.

Para atualizar e validar SOMENTE a navegação e o calendário:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Após login na Dashboard, o robô tentará abrir Tarefas automaticamente pelo contador antes de preencher as datas. Se pedir navegação manual, coletar o localizador do número pelo Inspector para calibrar.


## Link numerico da Dashboard identificado pelo Playwright Inspector

O Inspector mostrou o numero clicavel como link com nome acessivel numerico ("21069" no exemplo). Esse numero e dinamico e NUNCA deve ser fixado no codigo.

O worker foi ajustado para procurar um unico link com nome composto por digitos: getByRole('link', { name: /^[0-9]+$/ }). Caso exista apenas um, ele tenta o clique e confirma que #date-range ficou visivel. Se houver varios, tenta a localizacao contextual pelo rotulo "No Prazo", e interrompe caso a escolha continue ambigua.

Teste somente navegação e calendário, após encerrar Chromium/Inspector anteriores:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Se continuar sem clicar, inspecionar href/atributos do link e obter seletor CSS estavel, configurando GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR. Nao enviar informacoes de sessao, cookies ou credenciais.

Ainda falta homologar se o atalho do grafico pre-aplica filtro de status (por exemplo No Prazo) e se os filtros avancados sao zerados/atualizados corretamente. Nao habilitar exportacao completa ate isso estar confirmado.


## Correcao de strict mode no grafico da Dashboard (15/10/2026)

A execucao no Windows mostrou que getByText('No Prazo', { exact:true }) corresponde a DUAS etiquetas. A espera da etiqueta antes de validar sua contagem disparava strict mode violation, bloqueando a navegacao mesmo apos uma intervencao manual.

Atualizacoes:
- Contar as etiquetas antes de usar waitFor (sem ambiguidade).
- Quando houver duas, limitar a procura ao grafico Tarefas Abertas, confirmando No Prazo, Em Atraso e Com Multas; aceitar apenas entre um e tres links numericos visiveis nesse grafico.
- Se a estrutura real ainda nao permitir identificar o grafico, interromper sem clicar em links incertos.
- No teste assistido, depois que o usuario navega manualmente, conferir #date-range diretamente, sem tentar clicar no grafico outra vez.

Para testar a branch atualizada:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Ainda nao foram executados testes ponta-a-ponta dessa alteracao no Gestta. O sucesso de um teste local nao autoriza exportacao ou sincronizacao sem homologar os filtros avancados.


## Estabilizacao da Dashboard antes do clique (15/10/2026)

A ORTECONTE informou que o Gestta demora alguns segundos para renderizar os numeros do grafico Tarefas Abertas. A rotina src/task-navigation.mjs agora espera o titulo desse grafico ficar visivel (ate 30s), aguarda MAIS 5 SEGUNDOS e so entao tenta localizar e clicar no indicador. A tela #date-range continua sendo verificada apos a navegacao.

O texto que deve aparecer no PowerShell e:

    Dashboard carregada. Aguardando 5 segundos para os indicadores estabilizarem...

Essa espera nao desabilita os mecanismos de seguranca: em caso de links ambiguos ou grafico ausente, o robo interrompe a navegacao automatica.

Para testar sem download nem transmissao:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Se o navegador continuar na Dashboard apos a espera, envie apenas as mensagens novas do PowerShell. Aguardar 5 segundos resolve atrasos de exibicao, mas nao substitui a calibracao de um seletor HTML ambiguo.

## Ajuste de espera da Dashboard (15/10/2026, segundo teste)

O teste no Windows retornou `Grafico Tarefas Abertas nao carregou em 30s`. Nas capturas o titulo pode ser exibido como `24 Tarefas Abertas`, com um numero variavel. O worker agora **nao exige mais** que exista um titulo EXATO para iniciar a espera de 5 segundos. Ele aguarda 5s logo apos entrar na Dashboard, registra apenas contagens de graficos e de rotulos `No Prazo` (sem dados de clientes) e tenta localizar o atalho do grafico. A identificacao contextual tambem aceita um titulo que inclua o contador.

Caso o teste entre novamente em modo assistido, o terminal agora informa `Diagnostico de navegacao (sem dados de clientes): graficos=..., rotulos No Prazo=...`. Envie essa linha e a mensagem de falha; isso permite verificar se o problema e o titulo ou a estrutura do link.

Para interromper o teste que estiver aguardando `ENTER para continuar`, pressione Ctrl+C no PowerShell. Em seguida, atualize a branch e reteste. Nenhum envio ou exportacao esta habilitado nessa rotina.


## Diagnostico antes de novos cliques (apos contadores 0/0)

Em uma execucao Windows, mesmo aguardando 5 segundos, o robô observou `graficos=0`, `rotulos No Prazo=0`, e depois nao encontrou `#date-range` na navegacao manual. Estes sintomas nao comprovam lentidao: o browser pode estar na rota errada, em autenticacao ou em outra aba/frame.

Novo comando estritamente de leitura para esclarecer o estado da pagina:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:navigation

Feche antes qualquer Chromium/Inspector aberto com o mesmo perfil Playwright.
O script abre Gestta, aguarda 8 segundos e imprime SOMENTE:
- categoria de rota (login, dashboard, tarefas ou outra), nunca URL completa;
- numero de abas e frames;
- presenca do campo de senha e do calendario;
- contagem de rotulos No Prazo, titulos Tarefas Abertas e links numericos.

Depois ele espera voce olhar o Chromium, navegar manualmente ate tarefas e pressionar Enter. Compara os mesmos indicadores antes/depois. Nao clica automaticamente nem faz download, captura de tela, log de cliente ou sincronizacao.
Envie as linhas `Aba 1: tipo=...` antes e depois, mas nao compartilhe credenciais ou paginas com dados sensiveis.

Se o Chromium estiver em login, autentique-se manualmente; se o calendario estiver em uma segunda aba, o log distinguira. Somente depois desse diagnostico calibrar o passo Dashboard -> Tarefas, sem alterar as funcoes ja validadas do calendario.

## Diagnostico ampliado de frames (15/10/2026)

No teste real, o Gestta abriu na rota dashboard e foram detectados 3 frames, mas
nenhum rótulo "No Prazo" ou gráfico na pagina principal. Depois da navegação
manual, #date-range apareceu normalmente. Isto sugere, sem comprovar, que a
Dashboard possa estar incorporada em um iframe.

O comando existente npm run diagnose:navigation agora enumera cada frame em
ambas as fases. Para cada frame interno do Gestta, imprime apenas as contagens
de calendário, rótulos No Prazo, títulos Tarefas Abertas e links numéricos.
Não mostra URLs de frames, HTML, nomes de clientes, cookies nem credenciais.
Frames de terceiros não são inspecionados.

Execute novamente (com Chromium/Inspector antigos fechados):

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:navigation

Envie somente o texto das linhas "Frame 1", "Frame 2" e "Frame 3" que
aparecerem após a espera inicial de 8 segundos. O script continua totalmente
somente-leitura. A navegação automática não foi modificada nesta etapa.


## Mudanca para o menu lateral Tarefas na Dashboard v2 (15/10/2026)

O ultimo print do Chromium mostra a URL dashboard-v2 e, na barra lateral esquerda,
um item chamado "Tarefas" logo abaixo de "Dashboard". Este item nao e um contador
dinamico e pode servir de atalho mais estavel ao controle E-BEF.

A rotina foi alterada para:
1. Verificar se o filtro #date-range ja esta aberto.
2. Na Dashboard v2, aguardar ate 60 segundos para que o elemento exato
   "Tarefas" do menu lateral fique visivel.
3. Exigir correspondencia unica e aguardar mais cinco segundos.
4. Clicar no menu lateral e aguardar ate 45 segundos pelo filtro #date-range.
5. Se a tela aberta nao tiver o filtro, PARAR: pode ser uma visao diferente
   da lista antiga. Nao fazer exportacoes nem sincronizacao.

Se houver varios elementos de texto exato "Tarefas", use npm run inspect,
Pick Locator sobre o item do MENU ESQUERDO "Tarefas" e configure o CSS real
em GESTTA_SIDEBAR_TASKS_SELECTOR no arquivo local .env. Nao fixe numeros dos
graficos, IDs de clientes ou valores de contadores. Os atalhos antigos do
grafico foram retirados como metodo automatico principal.

Primeiro teste sem downloads ou envio de dados, apos fechar Chromium antigo:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:calendar -- --start=2026-10-01 --end=2026-10-30

Mensagem esperada ao encontrar o menu: "Menu lateral Tarefas localizado; aguardando 5 segundos...".
Se o menu abrir outra tela sem o calendario, envie so a mensagem de erro e
uma captura sem dados de clientes. A primeira sincronizacao continua desabilitada.


## MARCO VALIDADO NO WINDOWS: navegacao e calendario (15/10/2026)

O PowerShell da ORTECONTE confirmou:
- "Menu lateral Tarefas localizado; aguardando 5 segundos..."
- "Menu lateral Tarefas acionado. Aguardando filtro de datas..."
- "Quadro de tarefas aberto automaticamente pelo menu lateral."
- "PERIODO VALIDADO NO GESTTA: 01/10/2026 - 30/10/2026"
- Teste sem download, envio de dados ou alteracao de tarefas.

A partir daqui, o foco da homologacao e a configuracao das tres tarefas E-BEF,
dos quatro status, dos 21 departamentos e dos demais filtros. Ainda NAO ativar
exportacoes ou sincronizacao automatica.

Para abrir diretamente a tela de tarefas e o Playwright Inspector, sem
navegacao manual e sem alterar tarefas:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run inspect:filters

Feche antes Chromium e Inspector anteriores. Na tela de tarefas, use Pick Locator
no campo do filtro de TAREFAS (na barra superior), sem abrir dados de clientes.
Envie apenas o localizador do campo; o codigo nao transfere relatorios nem
chama a API da Luce nesse comando.


## Filtro principal de tarefas identificado no Inspector (16/10/2026)

O Playwright Inspector confirmou o gatilho do dropdown, enquanto ainda mostra
o valor inicial "Todas as tarefas":

    getByText('Todas as tarefas')

Foi registrado em src/task-filter.mjs com correspondencia exata e validacao
de elemento unico/visivel. Isto NAO identifica nem seleciona ainda as tres
opcoes E-BEF dentro do dropdown. O texto do gatilho tambem pode mudar apos
selecionar uma tarefa, portanto nao deve ser a unica ancora definitiva
durante toda a sincronizacao.

Proximo passo em npm run inspect:filters:
- Se o dropdown estiver fechado, desativar Pick Locator, clicar normalmente
  em "Todas as tarefas" e abrir a lista de opcoes.
- Reativar Pick Locator e clicar sobre a caixa ou texto de UMA opcao
  de tarefa E-BEF. Enviar o localizador da opcao, nao dados de clientes.
- Se houver opcao "Desselecionar todas ativas" ou "Selecionar todas",
  tambem identificar seu texto/localizador antes de automatizar a troca
  de selecao.
- Nao ativar --auto: a selecao e a validacao das tres tarefas ainda nao
  foram homologadas. O Inspector apenas observa a interface.
