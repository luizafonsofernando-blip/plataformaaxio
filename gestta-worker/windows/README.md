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


## Busca das tres tarefas E-BEF pelo termo "bef" (16/10/2026)

O usuario confirmou o comportamento real do dropdown: abrir "Todas as tarefas",
DIGITAR `bef` no campo de pesquisa e marcar as tres opcoes retornadas:
uma `DECLARAÇÃO DE EBEF | TÉCNICO` e duas iniciadas por
`VERIFICAR NECESSIDADE DE EBEF | ...`. Os dois textos aparecem
truncados no print: precisamos dos atributos HTML para diferenciá-los.

O codigo src/task-filter.mjs ja incorpora a sequencia prevista e valida
a busca, a quantidade de tres resultados e o padrao de nomes, mas somente
sera executado em --auto depois que estes seletores forem obtidos:
- GESTTA_TASK_SEARCH_SELECTOR: input que recebe `bef`
- GESTTA_TASK_RESULT_ROW_SELECTOR: linhas visiveis filtradas (tres)
- GESTTA_TASK_ROW_CHECKBOX_SELECTOR: checkbox relativo a cada linha

A rotina exige no inicio o rotulo `Todas as tarefas` para evitar carregar
outras selecoes previas. **Ainda nao existe rotina homologada para limpar
uma selecao anterior**; portanto o RPA devera parar ao encontrar outro
estado. A lista de opcoes deve ser verificada em todas as janelas antes
de permitir a automacao mensal. Esta limitacao impede por enquanto a
carga historica automatica sem nova calibracao.

Nao clicar em `Selecionar todas ativas`: esta acao pode incluir tarefas
fora do E-BEF. Enquanto os seletores do input/checkbox nao estiverem
confirmados pelo Inspector, nao utilizar --auto.

Para inspecionar sem alterar tarefas:
    npm run inspect:filters

No navegador: abrir `Todas as tarefas`, pesquisar `bef`, ativar
Pick Locator no input de busca e depois no checkbox da primeira
opcao; enviar os dois localizadores sem dados de clientes.


## Diagnostico do campo Buscar por tarefa (16/10/2026)

O teste npm run test:tasks confirmou a navegacao Dashboard -> Tarefas, mas
retornou "Campo Buscar por tarefa nao localizado de forma unica" antes
de pesquisar bef. O problema esta no input do dropdown, nao no calendario.

A busca foi corrigida para esperar ate 15 segundos pelo textbox visivel,
utilizando o nome acessivel /Buscar\s+por\s+tarefa/i sem exigir igualdade
literal. Caso falhe, o terminal imprime apenas contagens seguras:
correspondencias, visivel, total_textboxes, total_menuitems e
acao_selecionar_todas. Nenhum nome de cliente, URL privada ou dado de
tarefa e registrado no diagnostico.

Para conferir:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:tasks

Se obtiver a mensagem "TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3",
a etapa foi concluida. Se falhar, envie somente o texto da nova falha
incluindo as contagens. O teste nao baixa relatórios nem sincroniza.


## Resolvido no codigo: carregamento tardio do texto Todas as tarefas (16/10/2026)

O print posterior comprovou que Todas as tarefas aparece normalmente
no Gestta quando a tela termina de carregar. O erro com contagem 0 foi
provavelmente causado por uma consulta prematura usando locator.count().
A hipotese anterior de filtro persistente nao foi comprovada.

Nova rotina de selecao em src/task-filter.mjs:
- Aguarda 5 segundos depois de abrir a visao de Tarefas.
- Espera ate 30 segundos pelo texto exato Todas as tarefas ficar visivel.
- Somente depois conta os elementos e clica se houver exatamente um.
- Se nao houver, falha com contagem, sem clicar em X, limpar filtros,
  alterar tarefas, exportar relatórios ou transmitir dados à Luce.

Para retestar, apos fechar Chromium/Inspector anterior:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:tasks

Mensagem esperada antes da busca:
    Tela de tarefas aberta. Aguardando 5 segundos para carregar os filtros...

O teste continua limitado a selecao visual das tres tarefas E-BEF.


## Marco aprovado em Windows: filtro de tres tarefas E-BEF (16/10/2026)

O terminal confirmou "TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3".
O teste abriu Gestta, navegou por Tarefas, aguardou 5 segundos, pesquisou
bef, rolou o dropdown e confirmou uma Declaracao e duas Verificacoes.
Nao houve exportacao nem transmissao de dados. O sucesso abrange apenas
navegacao, calendario (teste anterior) e selecao das tres tarefas.

Para iniciar a proxima fase de inspeção dos filtros avancados, execute:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run inspect:advanced

Este comando abre a tela de tarefas, seleciona as tres tarefas E-BEF
ja homologadas e pausa o Playwright Inspector. Use Pick Locator no botao
do funil, no alto a direita; envie apenas o locator encontrado. Depois
inspecione os quatro status: Aberta, Concluida, Impedimento e
Desconsiderada. Ainda faltam homologar esses filtros, os tipos, todos os
21 departamentos, a exportacao mensal XLSX e a sincronizacao para a Luce.
Nao habilitar operacao automatica antes dessas validacoes.


## Funil de filtros avançados: quinto botão no Inspector (16/10/2026)

O Playwright Inspector identificou o botão do funil como:
    locator('button').nth(4)

Esse é o quinto botão do DOM e NÃO deve ser fixado no fluxo produtivo,
pois pode mudar quando o Gestta renderizar outros componentes.

A rotina npm run inspect:advanced agora faz diagnóstico apenas de leitura:
depois de selecionar as três tarefas E-BEF, registra total_de_botoes,
visibilidade do quinto e atributos limitados ao id, title, aria-label,
data-testid, nome e propriedades do SVG/elemento pai. NÃO clica no botão
automaticamente; tampouco registra nomes de clientes, URL ou conteúdo do DOM.

Após atualizar o repositório, inicie npm run inspect:advanced, localize
a linha "DIAGNOSTICO FUNIL" no terminal e depois, com o Inspector pausado,
desative Pick Locator, clique manualmente no funil e reative Pick Locator
sobre o checkbox "Concluída" dentro do painel. Envie somente os atributos
de diagnóstico e o localizador de Concluída para calibrar o status.
Ainda não exportar nem sincronizar até homologar os filtros.


## Primeiro checkbox dos status confirmado: Concluída (16/10/2026)

O Inspector, com Filtros avançados aberto, retornou exatamente:
    getByRole('checkbox', { name: 'Concluída' })

Esse controle está registrado em src/advanced-status-locators.mjs
com conferência de unicidade, visibilidade e leitura de isChecked().
NÃO é acionado automaticamente nesta fase.

Próximo passo: sem fechar o Inspector atual, use Pick Locator nas caixas
Aberta, Impedimento e Desconsiderada, uma de cada vez. Envie apenas
os três localizadores. Depois será necessário capturar o botão Filtrar
(que aplica os status) e homologar o funil por identificador estável.
Não marcar/desmarcar tarefas reais; somente inspecionar os filtros.


## 4 status E-BEF mapeados no Inspector (16/10/2026)

Confirmados na página real:
- Aberta: checkbox com nome acessível Aberta + ícone auxiliar
- Concluída: getByRole('checkbox', { name: 'Concluída' })
- Impedimento: checkbox com nome acessível Impedimento + ícone auxiliar
- Desconsiderada: getByRole('checkbox', { name: 'Desconsiderada' })

Em src/advanced-status-locators.mjs, Aberta/Impedimento são regex
ancoradas pelo nome para tolerar glifos decorativos do Gestta.
Concluída/Desconsiderada usam nomes exatos.
A rotina exige os 4 checkboxes únicos/visíveis ANTES de marcar, só marca
os que estiverem desmarcados e confirma que os 4 permanecem marcados.
Essa operação seleciona filtros visuais; não altera status de tarefas.
O exportador agora utiliza estes seletores semânticos, mas a sincronização
automática NÃO está pronta porque faltam calibrar o botão de abrir filtros,
o botão Filtrar para aplicar, tipos, departamentos e demais controles.

Próximo passo com Inspector JÁ aberto: inspecionar o botão Filtrar
na parte inferior do painel Filtros avançados. Enviar apenas o
localizador. Não é necessário executar outro comando neste momento.


## Botão Filtrar confirmado no Inspector (16/10/2026)

O botão laranja que aplica os Filtros avançados foi localizado pelo Inspector:
    getByRole('button', { name: 'Filtrar' })

Novo módulo src/advanced-action-locators.mjs utiliza:
    getByRole('button', { name: 'Filtrar', exact: true })

Verifica que há EXATAMENTE um botão visível antes de clicar; caso contrário,
interrompe sem alterar filtros. O exportador utiliza esse localizador e
GESTTA_ADVANCED_APPLY_SELECTOR passou a ser apenas um ajuste opcional.
Isso NÃO habilita a exportação: o controle de abrir o painel, tipos,
departamentos, clientes/usuários e XLSX ainda precisam de homologação.

Próximo passo com Inspector atual aberto: inspecionar, um de cada vez, os
checkboxes Fluxo de tarefas, Solicitação de serviço e Recorrente
na parte superior do painel Filtros avançados. Enviar somente os três
localizadores. Não é necessário clicar em Filtrar nem reiniciar o Inspector.


## Três tipos de tarefa identificados (16/10/2026)

O Inspector da ORTECONTE confirmou os controles:
- getByRole('checkbox', {name:'Fluxo de tarefas' + glifo auxiliar})
- getByRole('checkbox', {name:'Solicitação de serviço' + glifo auxiliar})
- getByRole('checkbox', {name:'Recorrente' + glifo auxiliar})

O módulo src/advanced-task-type-locators.mjs usa getByRole('checkbox')
com expressões ancoradas nos textos, ignorando glifos decorativos.
A rotina exige os três únicos/visíveis antes de marcar, marca somente
os desmarcados e confere que os três permanecem selecionados. O exportador
já usa essa função, mas a fase de produção permanece BLOQUEADA até os demais
controles estarem homologados.

Validação simulada: seleciona dois inicialmente desmarcados, deixa intacto
o já marcado e não altera nenhum se houver opção ausente ou duplicada.

Próxima fase com Inspector JÁ aberto: inspecionar o dropdown
"Departamento" e sua ação "Selecionar todos" dentro de Filtros avançados.
Não abrir nem executar exportação. Enviar somente os localizadores desses
dois controles para planejar a validação dos 21 departamentos.


## Filtro Departamento: dropdown e Selecionar todos identificados (16/10/2026)

O Inspector confirmou, em Filtros avançados:
- Campo: getByText('Todos departamentos')
- Selecionar todos: getByRole('menuitem', { name: 'Selecionar todos' }).locator('a')

O worker usa estes locators de forma padrao, exigindo que ambos
sejam únicos e visíveis antes de cada clique. Os dois seletores CSS
de ambiente (GESTTA_ADVANCED_DEPARTMENT_SELECTOR e
GESTTA_ADVANCED_DEPARTMENT_SELECT_ALL_SELECTOR) ficaram OPCIONAIS.

IMPORTANTE: clicar em "Selecionar todos" NÃO comprova que todos os
21 departamentos ficaram selecionados! O exportador mantém a verificação
obrigatória dos nomes e checkboxes de cada departamento; ainda faltam
identificar via Inspector o DOM das linhas e seus checkboxes.
As operações de exportação e sincronização continuam não homologadas.

Próximo passo na MESMA janela Inspector, sem reiniciar:
- Com o dropdown Departamento aberto, use Pick Locator sobre o checkbox
  do departamento Administrativo e envie o texto obtido.
- Se possível, faça o mesmo com Arquivo (outro departamento).
- Os locators servirão para descobrir se cada opção é uma linha com
  checkbox nativo e se a lista virtualiza itens fora da rolagem.
Não clicar em concluir tarefas nem exportar relatórios.


## Estrutura dos checkboxes de departamentos - duas amostras (16/10/2026)

O Inspector revelou:
- Administrativo: locator('.checkbox-item').first()
- Arquivo: locator('li:nth-child(5) > .gestta-multiselect-dropdown__item-toggle > .checkbox-item').first()

A interface utiliza as classes .gestta-multiselect-dropdown__item-toggle
e .checkbox-item. O uso de first()/nth-child(5) NÃO é robusto: esses
seletors identificam posicoes, nao nomes de departamentos. Ainda nao foi
comprovado se .checkbox-item e input checkbox nativo, tem role checkbox
ou apenas um componente estilizado. Nao deve ser assumido isChecked().

Adicionado diagnostico isolado SOMENTE-LEITURA:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Feche Chromium/Inspector anteriores. O programa abre Gestta, seleciona
as tres tarefas E-BEF ja homologadas e espera intervencao manual:
1. No Chromium, abrir funil > Departamento e deixar a lista expandida.
   Pressionar Enter no PowerShell para diagnostico ANTES.
2. Se estiver disponivel Selecionar todos, clicar manualmente e manter
   a lista aberta. Pressionar Enter para diagnostico DEPOIS.
   Caso nao esteja, nao clicar em nenhuma outra opcao.

Copiar para esta conversa SOMENTE linhas ANTES e DEPOIS do PowerShell.
O log compara numero de linhas detectadas, nomes que pertencem ao grupo
conhecido de 21 departamentos e informacoes limitadas dos checkboxes de
Administrativo/Arquivo. Nao salva HTML, nomes inesperados, dados de clientes,
URLs ou cookies. O script nao altera tarefas, nao faz download e nao
transmite dados à Luce.

A implementacao de producao continua travada: somente sera permitido
concluir que TODOS os departamentos estao selecionados se 21 nomes
distintos forem identificados e o estado de cada checkbox for comprovado.


## Ajuste de repeticao mensal: o filtro de tarefas guarda selecao (16/10/2026)

O usuario confirmou com nova imagem do Gestta: apos selecionar as tarefas
EBEF, o filtro superior passa a mostrar "DECLARAÇÃO DE EBEF | ..." e um
X pequeno antes da seta. Clicando nesse X, volta o rotulo Todas as tarefas.

O worker foi atualizado com dois estados:
- **Inicial:** Todas as tarefas visivel -> abrir dropdown e buscar bef.
- **Reutilizado:** nome de tarefa mostrado -> encontrar APENAS o X do filtro
  superior de tarefas, clicar uma vez e verificar que Todas as tarefas voltou.
  Somente entao abrir dropdown, buscar bef, e validar exatamente tres tarefas.

SEGURANCA: por ora o X ainda não foi calibrado pelo Inspector. Nao foi
inventado CSS do botao; GESTTA_TASK_FILTER_CLEAR_SELECTOR deve conter
seletor unico e restrito à caixa superior de tarefas, confirmado ao apontar
diretamente o X. Se a selecao anterior existir e esta variavel nao estiver
definida, a automacao FALHA antes da exportacao. Nenhum X geral será clicado.
O codigo jamais usa nth(4) nem limpa os filtros de clientes/usuarios.

Para capturar o seletor de forma assistida, sem exportacoes:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run inspect:filters

Com Inspector aberto, Pick Locator no X da caixa superior de tarefas
(ao lado de seta). Enviar o locator encontrado, sem tokens ou dados de
clientes. Se a caixa exibir Todas as tarefas, primeiro selecionar as
tres tarefas pelo comando npm run test:tasks e entao abrir a inspecao;
o Gestta costuma manter as selecoes. O comando inspect:filters apenas
diagnostica e pausa no Inspector, nao remove selecao alguma.

Depois que o seletor for homologado no Windows, executaremos test:tasks
com o filtro previamente preenchido e repetiremos duas vezes para
confirmar a idempotencia. Ainda sem liberar o --auto/exportacoes.


## X de limpar Tarefas confirmado no Inspector (16/10/2026)

O Inspector retornou exatamente:
    locator('#gestta-multiselect-dropdown-5-p').getByRole('button')

O worker usa esse localizador default no filtro de Tarefas, sem necessidade
de alterar o .env. A escolha é deliberadamente estreita: nunca clicar num
button genérico ou num X de outro filtro. Se o Gestta alterar o ID, o
worker aborta com segurança e permite um CSS alternativo exclusivo em
GESTTA_TASK_FILTER_CLEAR_SELECTOR.

Sequência de consultas:
1. Se "Todas as tarefas" está visível, não limpar nada.
2. Se foi preservada seleção anterior, localizar X único e visível,
   conferir que o contêiner default contém EBEF, clicar e confirmar
   que "Todas as tarefas" voltou.
3. Buscar bef, conferir as três tarefas, marcar e verificar 3/3.

Homologação RECOMENDADA NO WINDOWS, com Chromium/Inspector antigos fechados:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:tasks
    npm run test:tasks

Executar o mesmo comando duas vezes: a segunda deverá primeiro registrar
"Selecao anterior de tarefas limpa; Todas as tarefas confirmado."
e concluir novamente com "TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3".
O teste modifica SOMENTE os filtros visuais, não tarefas ou dados do Gestta.
Nenhum arquivo é exportado e nenhuma informação é transmitida à Luce.
Atenção: o ID #gestta-multiselect-dropdown-5-p foi observado na interface
atual e ainda exige confirmação na repetição real do Windows.


## Homologação real do reuso do filtro de tarefas (16/10/2026)

Duas execuções consecutivas de \`npm run test:tasks\` foram concluídas no
Windows, ambas com "TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3".
Na PRIMEIRA execução, o PowerShell também confirmou:
"Selecao anterior de tarefas limpa; Todas as tarefas confirmado."
Na SEGUNDA, a limpeza não precisou ser registrada e a seleção 3/3
também funcionou. Assim, os dois estados de entrada observados
foram exercitados (filtro com seleção persistida e filtro já inicial).
Não ocorreu download, transmissão à Luce nem alteração das tarefas.

Escopo homologado: abrir Tarefas, esperar renderização, reconhecer a caixa
de filtro, limpar uma seleção E-BEF anterior quando necessário, pesquisar
"bef", rolar e confirmar as três tarefas.
Ainda faltam homologar a verificação dos 21 departamentos, a aplicação
integrada dos filtros, a exportação mensal e a sincronização com a Luce.

Próximo diagnóstico seguro:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

O diagnóstico pausa para abrir manualmente o funil > Departamento, lê a
lista, e solicita um segundo Enter após a seleção manual de
"Selecionar todos". Nenhum arquivo será baixado ou enviado.


## Chromium congelou durante diagnóstico de departamentos (16/10/2026)

O teste diagnose:departments chegou a "TAREFAS E-BEF SELECIONADAS E
VERIFICADAS: 3/3" e parou na pergunta para abrir o funil manualmente,
mas o usuário relatou que somente a JANELA do Chromium parou de responder;
o PowerShell permanecia normal. Ainda NÃO há causa identificada: aguardar
resposta do PowerShell (readline) normalmente não congela o navegador.
Não presumir que a pausa por ENTER seja a origem do problema.

Em primeiro lugar, pressionar Ctrl+C no PowerShell e fechar SOMENTE o
Chromium de teste. Não encerrar todo Google Chrome indiscriminadamente.

Foi criado diagnose:browser para separar indisponibilidade do renderizador
de problemas de foco/interface. O comando NÃO aguarda ENTER nem pede
interação manual. Após entrar na lista e confirmar E-BEF 3/3,
traz o Chromium para frente, executa duas leituras leves de DOM separadas
por 8 segundos e imprime:
- BROWSER_ANTES: readyState, visibility, hasFocus, calendarElements, elapsedMs;
- BROWSER_DEPOIS_8S: mesmos campos.
Se o renderizador não responder em 6,5 segundos, anota erro de timeout.
Não lê nomes de clientes, não tira screenshots, não exporta nem transmite.

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:browser

Depois de terminar, enviar APENAS as linhas BROWSER_ANTES,
BROWSER_DEPOIS_8S e eventualmente DIAGNOSTICO CHROMIUM.
Se houver congelamento/erro gráfico, podemos testar separadamente
com aceleração de GPU desligada (apenas na sessão atual):

    $env:GESTTA_DISABLE_GPU="1"
    npm run diagnose:browser
    Remove-Item Env:GESTTA_DISABLE_GPU

Esse teste adicional é opcional e não deve ser feito antes de analisar
o resultado no modo normal. Se até o teste sem interação congelar,
avaliar consumo de memória/CPU e processos do Chromium antes de prosseguir.
Nenhum comando de sincronização ou exportação deve ser usado aqui.


## Resposta do Chromium confirmada; alteração do diagnóstico dos departamentos (16/10/2026)

O usuário executou diagnose:browser e obteve:
- BROWSER_ANTES: ok=true, readyState=complete, visible, hasFocus=true,
  calendarElements=1, elapsedMs=7.
- BROWSER_DEPOIS_8S: mesmo estado com elapsedMs=4.
- Filtro E-BEF confirmado: 3/3.

As duas leituras mostram o DOM responsivo, mas NÃO garantem que toda a
interação com mouse/teclado esteja funcionando. O congelamento aparente
aconteceu no teste anterior ao pedir que o usuário operasse o Chromium
enquanto o PowerShell aguardava ENTER. A causa ainda não está determinada.

O comando diagnose:departments foi alterado para usar duas pausas do
Playwright Inspector, mecanismo que já funcionou em inspeções anteriores,
sem depender do PowerShell aguardar ENTER.

Após fechar todos os Chromiums de TESTE anteriores:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Fluxo do novo teste:
1. O Chromium abre a lista E-BEF (3/3); abre o Inspector na primeira pausa.
2. Desativar Pick Locator, abrir manualmente Funil > Departamento e deixar
   o dropdown expandido. No Inspector, clicar RESUME (triângulo verde).
   O terminal imprimirá ANTES: {...}.
3. O Inspector pausa uma segunda vez. Clicar manualmente "Selecionar todos"
   no dropdown (se disponível), manter aberto e clicar RESUME.
   O terminal imprimirá DEPOIS: {...}.

Se a janela Chromium continuar sem responder, não insistir em clicar.
Fechar somente Chromium e Inspector de teste, interromper pelo terminal
e compartilhar o erro ou a descrição. Não baixar nem transmitir dados.


## Chromium não responde visualmente durante pausas, mesmo após Resume (16/10/2026)

O usuário confirmou que o Chromium deixou de aceitar cliques nas tentativas
de diagnosticar Departamento, tanto ao aguardar ENTER no terminal quanto
após RESUME do Inspector. O teste diagnose:browser, por outro lado, indicou
renderizador responsivo nas duas avaliações leves (7 ms e 4 ms).
Esses fatos NÃO esclarecem a causa do congelamento da interface.

Mudança: interromper o uso de page.pause, readline e cliques manuais nesse
fluxo, até podermos resolver o problema. Foi introduzido diagnose:funnel:
- Executa Chromium em headless:true, reutilizando o perfil persistente local.
- Navega para Tarefas e seleciona visualmente os 3 filtros E-BEF.
- Lê propriedades restritas de classes e SVGs dos botões.
- Faz o índice 4 SOMENTE objeto do diagnóstico; nunca clica nele.
- Não toca nos controles avançados, não baixa, não envia nem altera tarefas.
- Não registra HTML, nomes de clientes, urls de sessão ou tokens.

Feche Chromium e Inspector de testes anteriores e interrompa o worker
anterior com Ctrl+C antes de usar:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:funnel

Enviar o bloco do PowerShell começando com FUNIL: e eventual mensagem
FALHA NO DIAGNOSTICO DO FUNIL. Não executar novamente diagnose:departments
ainda. Se o teste headless falhar por sessão/autenticação, interromper com
segurança e considerar sessão compatível, sem tentar burlar autenticação.
O filtro do funil e a validação dos 21 departamentos permanecem pendentes.


## Funil identificado e diagnóstico 100% headless dos departamentos (16/10/2026)

O usuário executou npm run diagnose:funnel sem janelas gráficas.
Resultado real:
- Tarefas E-BEF 3/3;
- 10 botões no DOM;
- candidato 4: class="btn btn-link", icon "glyphicon glyphicon-filter";
  parent="mixed-topfilter__actions";
- nenhum botão foi acionado naquele diagnóstico.

O seletor estável agora é:
    .mixed-topfilter__actions button.btn.btn-link:has(.glyphicon.glyphicon-filter)

Ele é usado em src/advanced-open-locator.mjs, com contagem 1 e
visibilidade obrigatórias antes do clique. Não se usa índice 4 em produção.

O comando npm run diagnose:departments FOI SUBSTITUÍDO. Agora:
- abre Chromium HEADLESS (sem janela de Gestta nem Inspector);
- seleciona 3 tarefas E-BEF;
- abre funil (pelo ícone) e campo Departamento (pelo texto);
- imprime ANTES com contagens e estados de apenas os departamentos conhecidos;
- somente se reconhecer os 21 nomes distintos, clica Selecionar todos
  quando necessário e imprime DEPOIS;
- não clica Filtrar, não baixa relatórios, não altera tarefas e não sincroniza.

Executar com instâncias anteriores de Chromium/Inspector fechadas:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Enviar ANTES, DEPOIS (se houver), ESTRUTURA e eventual FALHA.
Se o estado do checkbox não for inferível a partir de input/aria-checked,
ele será indicado como indeterminado — não concluir falsamente 21/21.
Os seletores de departamentos ainda precisam de validação no ambiente real.
Não executar npm run sync -- --auto nesta etapa.


## Diagnóstico de departamentos parou após "menu Departamento aberto" (16/10/2026)

O usuário mostrou o terminal com:
- TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3
- DEPARTAMENTOS: funil aberto pelo icone glyphicon-filter.
- DEPARTAMENTOS: menu Departamento aberto.

Ainda não havia linha ANTES na captura; não é possível concluir se a
execução apenas estava lendo o menu ou estava travada. A implementação
anterior fazia 1 locator.evaluate() por linha, e cada operação poderia
aguardar se a lista do Gestta fosse renderizada novamente.

Foi substituída por uma única chamada evaluateAll() com leitura de todos
os elementos no mesmo snapshot, sem nth nem espera individual.
O comando também registra:
    DEPARTAMENTOS: iniciando leitura ANTES do menu...
e interrompe a leitura se não responder em até 20 segundos. O contexto
Chromium tem limite de espera ao encerrar.

Se a execução anterior terminar normalmente e imprimir ANTES/DEPOIS,
aproveitar essa saída. Se ficar sem atualização por mais de 30 segundos,
interromper com Ctrl+C e instalar o ajuste:

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Não há download, alteração de tarefas ou envio de dados à Luce.
Não concluir seleção 21/21 se o estado permanecer indeterminado.


## Correção de task is not a function no diagnóstico de departamentos (16/10/2026)

A execução real concluiu navegação E-BEF 3/3, abertura do funil e
abertura de Departamento, mas falhou ao iniciar ANTES:
    FALHA NO DIAGNOSTICO DOS DEPARTAMENTOS: task is not a function
A causa foi confirmada no código: withDeadline(label,task) invocava
task(), mas recebia Promises já iniciadas, inclusive de context.close().
Isso gerou também rejeição tardia do Playwright após encerramento,
com "Target page, context or browser has been closed".

Correção:
- Função withDeadline centralizada em src/timeout-utils.mjs.
- Todas as chamadas utilizam callbacks, por exemplo:
    withDeadline('Leitura ANTES', () => inspectDepartmentStructure(page))
- Promise.race observa a rejeição tardia mesmo se o timeout ocorrer.
- Encerramento do contexto também passa callback.
- Testes automatizados com sucesso para leitura, timeout, erros
  síncronos/assíncronos, promessa inválida e rejeição tardia.
Não foi executado ainda contra o Gestta real após a correção.

Para repetir com Chromium headless e sem Inspector:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Enviar ANTES, DEPOIS, ESTRUTURA ou eventual FALHA que aparecer.
Não rodar exportações ou sincronização enquanto departamentos e
checkboxes não forem homologados.


## Leitura de Departamentos excedeu 20 segundos (16/10/2026)

O teste real abriu Tarefas E-BEF (3/3), funil e dropdown Departamento,
mas a linha ANTES nao retornou em 20 segundos. Isso NAO comprova que
os departamentos estejam ausentes ou desmarcados.

Possivel causa: consulta Playwright com locator.evaluateAll() sobre
um seletor com :has() sem correspondencia, sujeita a esperar pela lista.
A causa exata ainda depende do novo diagnostico.

Mudanca aplicada:
- inspectDepartmentStructure() agora faz UMA consulta page.evaluate()
  com querySelectorAll('.gestta-multiselect-dropdown__item-toggle');
- usa textContent sem calculo de layout de innerText e filtra pela lista
  conhecida de 21 nomes; nao registra nomes de clientes;
- a leitura termina imediatamente quando nao ha linhas correspondentes;
- novo teste basico de responsividade antes da leitura:
      DEPARTAMENTOS: renderer_respondeu=complete
- se nao encontrar todos os departamentos, informa ESTRUTURA com contagens
  e nao clica em Selecionar todos;
- mantém tempo limite e falha sem exportacao ou sincronizacao.

Repetir apos fechar instancias anteriores de teste:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Enviar as linhas renderer_respondeu, ANTES, ESTRUTURA, DEPOIS (se houver)
e eventuais mensagens de erro. A homologacao dos 21 checkboxes segue pendente.


## Homologado no Windows: 21/21 departamentos marcados (16/10/2026)

Resultado REAL do npm run diagnose:departments, em modo headless:
- Tarefas E-BEF verificadas 3/3.
- Funil de Filtros avançados aberto.
- Dropdown Departamento aberto.
- ANTES: 21 departamentos conhecidos distintos, 0 marcados e 21 desmarcados.
- Selecionar todos acionado apenas no filtro de Departamento.
- DEPOIS: 21 departamentos conhecidos distintos e 21 marcados.
- Mensagem: "DEPARTAMENTOS: 21/21 marcados confirmados por estado de checkbox."
- Nenhum download, envio à Luce ou alteração de tarefa.

A leitura global produziu rowCount=7735 (unknownCount=7714), pois o
Gestta conserva milhares de toggles de outros elementos no DOM. Isso
não invalida a validação pontual dos 21 nomes, mas impede confiar em
contagens globais em automação produtiva.

Preparada nova leitura com src/department-scope.mjs, que:
- ancora-se no menuitem visível Selecionar todos (ou Desselecionar todos);
- busca o menor contêiner cuja lista contenha EXATAMENTE os 21 nomes
  distintos cadastrados, sem itens desconhecidos;
- rejeita escopo ausente/ambíguo, sem clicar em Selecionar todos;
- imprime ESCOPO_ANTES e ESCOPO_DEPOIS com somente contagens;
- permite ao futuro exportador confirmar, dentro do escopo, 21/21
  marcados, sem CSS baseado em nth-child e sem percorrer milhares de linhas.
Este NOVO escopo ainda precisa ser testado contra o Gestta real.

Próxima verificação segura (SEM EXPORTACAO):
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Se ESCOPO_ANTES indicar found=false, o script NÃO deve clicar em
Selecionar todos, mesmo que a leitura global mostre os 21 nomes;
enviar ESCOPO_ANTES, ANTES e ESTRUTURA para calibração.
Se found=true, validar rowCount=21, unknownCount=0 e DEPOIS 21/21.
Não habilitar sincronização antes do teste conjunto dos filtros.


## ESCOPO_ANTES falhou com 22 toggles próximos (16/10/2026)

No teste real, o Gestta abriu o menu Departamento e informou:
    ESCOPO_ANTES: found=false, candidateScopes=0,
      visibleSelectAllCandidates=2, nearbyToggleCounts=[1,22,64]
A consulta global confirmou 21 nomes dos departamentos da ORTECONTE,
todos desmarcados antes de qualquer ação. A rotina corretamente NÃO
clicou em Selecionar todos, pois o escopo local exigia exatamente 21
toggles e o contêiner menor próximo ao controle apresentava 22.

A nova regra aceita dois formatos de contêiner, SOMENTE quando válidos:
1) exatamente 21 toggles correspondendo a cada um dos 21 nomes esperados;
2) exatamente 22 toggles: 21 nomes esperados distintos + 1 controle
   de nome EXATAMENTE "Selecionar todos" ou "Desselecionar todos".
Não aceita nenhum outro 22º nome e não imprime nomes estranhos ao escopo.
Se a classificação falhar, o script para sem clicar, registrando apenas
nearbyCandidateProfiles (contagens, nenhuma informação do cliente).
Se ocorrerem dois contêineres igualmente válidos, aborta por ambiguidade.

src/department-scope.mjs implementa essa identificação; os diagnósticos
e o exportador ainda exigem 21/21 nomes e checkboxes marcados e sempre
falham sem exportar quando o menu correto não estiver confirmado.

Teste local de estrutura DOM sintética reproduziu um menu 22 controles
(21 departamentos + Selecionar todos) e também um 22º item inesperado.
O primeiro foi reconhecido, o segundo bloqueado. Nove testes simulados
da rotina de escopo passaram. A validação REAL no Gestta segue pendente.

Próximo teste em Chromium headless, sem exportar:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:departments

Solicitar o resultado ESCOPO_ANTES, ANTES, ESCOPO_DEPOIS e DEPOIS.
Se found=false, observar nearbyCandidateProfiles e não assumir sucesso.


## Escopo dos 21 departamentos homologado em Chromium headless (16/10/2026)

O usuário executou o teste após ajuste para aceitar um controle extra
"Selecionar todos". Evidências do próprio Gestta:
- ESCOPO_ANTES: found=true, candidateScopes=1, nearbyToggleCounts=[1,22];
- item extra reconhecido como comando, ignoredSelectAllControls=1;
- rowCount=21, recognizedUnique=21, unknownCount=0;
- ANTES: 0 marcados e 21 desmarcados;
- ESCOPO_DEPOIS: found=true, candidateScopes=1;
- DEPOIS: 21 marcados e 0 desmarcados;
- "DEPARTAMENTOS: 21/21 marcados confirmados por estado de checkbox";
- nenhuma exportação ou sincronização.

Status: homologados em ambiente REAL a abertura do funil e a validação dos
21 checkboxes por escopo. A PR permanece draft porque o teste integrado,
o botão Filtrar, o período mensal XLSX e o envio à Luce ainda precisam
de validação antes de produção.

Próxima fase: teste dos filtros EM CONJUNTO, sem Filtrar nem download.

    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:advanced

O teste abre Chromium HEADLESS, navega à lista de tarefas, valida as três
tarefas E-BEF, quatro status (Aberta, Concluída, Impedimento e
Desconsiderada), três tipos (Fluxo de tarefas, Solicitação de serviço,
Recorrente) e o escopo único de 21 departamentos. Confere novamente
status e tipos após a seleção dos departamentos.

Saída esperada: INTEGRADO: tarefas E-BEF=3/3; status selecionados=4/4;
tipos selecionados=3/3; departamentos selecionados=21/21; sucesso SEM
EXPORTACAO, SEM FILTRAR E SEM SINCRONIZACAO.

Se falhar, enviar a mensagem começando em FALHA NO TESTE INTEGRADO;
não executar o comando sync nem habilitar automação agendada.


## Falha no teste integrado: checkbox Concluída após leitura inicial (16/10/2026)

No Windows, npm run test:advanced confirmou 3/3 tarefas E-BEF e encontrou
4/4 checkboxes de status. Durante a seleção, falhou com:
  Filtro avançado CONCLUIDA não localizado de forma única e visível
  (correspondências=0).

Isso não comprova que o status está ausente; pode indicar nome acessível
com glifo adicional após rerender, ou desaparecimento do controle após
interagir com outro checkbox. As duas hipóteses precisam de teste real.

Correção incremental:
- Todos os quatro status agora usam getByRole('checkbox') com regex
  ancorada no nome, permitindo glifos/ícones após o rótulo.
- Cada status só é marcado se for único e visível.
- Ao selecionar, verifica imediatamente isChecked(), depois lê todos
  os quatro novamente.
- Loga STATUS: encontrados=4/4 e cada STATUS: <chave>=marcado.
- Em caso de desaparecimento/ambiguidade, informa número de matches
  e presença do botão Filtrar, sem clicar em nenhum outro status.
- Se falhar, NÃO aplica Filtrar, NÃO exporta, NÃO transmite à Luce.

Testes simulados: 6/6 passaram; a homologação real ainda é necessária.
Executar:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:advanced

Copiar o bloco desde STATUS: ou FALHA NO TESTE INTEGRADO.
Se aparecer erro com botoes_Filtrar=0, possivelmente o painel fechou;
não tentar corrigir clicando botões globais sem investigação.


## TESTE INTEGRADO APROVADO NO WINDOWS (16/10/2026)

O usuário executou npm run test:advanced, com resultado real:
- Tarefas E-BEF: 3/3
- Quatro status: 4/4, incluindo Concluída e Desconsiderada
- Três tipos de tarefa: 3/3
- Escopo de Departamento validado: 21 nomes; ANTES 0 marcados,
  DEPOIS 21/21 marcados
- Verificação após a seleção: status e tipos permaneceram marcados
- INTEGRADO: SUCESSO SEM EXPORTACAO, SEM FILTRAR E SEM SINCRONIZACAO.

Portanto, a seleção INTEGRADA dos filtros está homologada, mas o
botão Filtrar, as datas mensais, o XLSX e a sincronização NÃO estão.

Proxima etapa preparada: teste isolado do botão Filtrar, ainda sem
qualquer download ou envio de dados:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:apply

Esse teste em headless:
- seleciona e confirma E-BEF 3/3;
- registra o período atual antes do clique;
- garante 4/4 status, 3/3 tipos e 21/21 departamentos;
- reconfirma seleções e valida o botão Filtrar único e visível;
- CLICA no botão Filtrar (aplica apenas filtros visuais);
- espera a tela carregar e confirma que o período exibido permaneceu
  idêntico ao observado antes do clique;
- NÃO muda datas, NÃO faz download, NÃO exporta XLSX, NÃO envia à Luce.

Se falhar, enviar o log a partir de APLICAR: ou
FALHA NO TESTE DE APLICACAO:. Não executar npm run sync -- --auto.
A aprovação desse teste não substitui a homologação das datas e do XLSX.


## Filtrar ainda não clicou: rótulo "Todos departamentos" desapareceu (16/10/2026)

Após sucesso do teste integrado (tarefas 3/3, status 4/4, tipos 3/3,
departamentos 21/21), o Windows executou npm run test:apply. O teste:
- confirmou tarefas=3/3;
- leu e preservou a referência do período 01/10/2026 - 31/10/2026;
- confirmou status=4/4 e tipos=3/3;
- PAROU antes de abrir Departamento:
  "Campo Todos departamentos ... correspondencias=0".

Causa provável: o Gestta mantém os departamentos selecionados entre
consultas e altera o texto do campo (ex.: "Contábil +16"). Assim, o
localizador getByText('Todos departamentos') não serve como único modo
de abrir o menu depois da primeira execução.

Correção:
- src/department-trigger-discovery.mjs tenta encontrar o título exato
  "Departamento" e o ID estrutural de um único dropdown associado
  ao título, sem usar posição, texto de cliente ou botão X;
- src/department-controls.mjs mantém o seletor inicial, usando o novo
  mecanismo somente quando "Todos departamentos" não aparece;
- se existir mais de um candidato, título ambíguo ou controle oculto,
  aborta sem clicar, exportar ou sincronizar;
- após abrir o menu, as rotinas ainda exigem o escopo 21/21 validado.
- Doze testes simulados de seleção inicial, seleção persistente,
  ausência e ambiguidade passaram. Falta testar essa descoberta no Gestta real.

Próximo teste em Chromium headless, sem download:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:apply

No resultado, procurar:
    DEPARTAMENTOS: selecao anterior detectada; campo encontrado pelo titulo Departamento.
    APLICAR: departamentos=21/21
    APLICAR: botao Filtrar unico e visivel; aplicando filtros visuais.
    APLICAR: SUCESSO SEM DOWNLOAD, SEM EXPORTACAO E SEM SINCRONIZACAO.

Se falhar na descoberta, NÃO escolher qualquer outro dropdown
manualmente ou via índice; enviar somente a mensagem de erro
FALHA NO TESTE DE APLICACAO, sem dados de clientes.


## Diagnóstico do campo Departamento já selecionado (16/10/2026)

O usuário repetiu npm run test:apply em modo headless. A execução:
- confirmou tarefas E-BEF 3/3;
- confirmou período 01/10/2026 - 31/10/2026;
- confirmou 4/4 status e 3/3 tipos;
- falhou ANTES de clicar em Filtrar, quando o fallback tentou
  localizar um texto "Departamento" como nó de texto simples:
  "titulos=0; candidatos=0; profundidade=0".

Isso indica que o seletor por título NÃO foi encontrado no DOM do Gestta,
embora a aparência visual anterior apresente o campo Departamento.
Não é seguro atribuir o problema definitivamente à persistência do
filtro, nem clicar por índice, usar o primeiro campo ou limpar todos.

Próxima etapa é diagnóstico SOMENTE-LEITURA, sem tentar abrir Departamento:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:department-trigger

O novo comando:
- acessa o Gestta em Chromium headless;
- seleciona as três tarefas E-BEF, status e tipos já homologados;
- procura os 21 nomes de departamentos conhecidos na estrutura DOM,
  mesmo que o título "Departamento" esteja ausente;
- imprime exclusivamente DEPT_TRIGGER com contagens, IDs do componente
  gestta-multiselect-dropdown-...-p e classes estruturais dos ancestrais;
- não imprime nomes de clientes, outros nomes, HTML, URLs ou segredos;
- NÃO abre/clica no campo Departamento, NÃO clica em Filtrar,
  NÃO exporta, NÃO sincroniza.

Usar a linha DEPT_TRIGGER para determinar um seletor que identifique o
dropdown de maneira unica na interface real. Ainda NÃO modificar
automaticamente o seletor de produção nem liberar exportação.


## Campo Departamento persistido mapeado pela estrutura real (16/10/2026)

O teste somente leitura npm run diagnose:department-trigger identificou:
- 21 nomes distintos de departamentos da lista oficial;
- uniqueGroupCount=1;
- um menu ul.gestta-multiselect-dropdown__menu com 22 itens:
  21 departamentos e 1 controle de selecao;
- ancestral mais proximo com um unico ID de dropdown:
  gestta-multiselect-dropdown-6-p;
- ancestrais distantes com outros dropdowns que NAO devem ser clicados.

O numero 6 foi observado apenas nesta consulta: os IDs podem mudar.
A implementacao NAO depende de IDs numericos fixos.

Ajuste:
- Conserva getByText('Todos departamentos') no estado inicial;
- No estado preenchido, reconhece a lista exata de 21+1 e deriva
  dinamicamente o ID do dropdown unico do ancestral proximo;
- Antes do clique valida controle unico e visivel, dimensoes e um
  ponto seguro a esquerda, sem sobrepor X, button, input, link ou item
  de dropdown. Se nao houver ponto seguro, aborta;
- Exige novamente estado de 21/21 departamentos marcados antes do
  botao Filtrar, sem exportacao XLSX nem transmissao Luce.

Os 13 testes simulados passaram, incluindo testes negativos. Falta
homologacao real do novo clique no Windows.

Com instancias anteriores do Chromium/Inspector fechadas:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run test:apply

Enviar log a partir de APLICAR:, DEPARTAMENTOS: ou
FALHA NO TESTE DE APLICACAO. O teste aplica apenas filtros visuais,
sem baixar arquivos ou transmitir dados a Luce.


## Falha no menu Tarefas antes dos filtros (16/10/2026)

No teste real npm run test:apply o Chromium iniciou, mas parou em:
  Falha ao abrir menu lateral Tarefas:
  locator.waitFor: Timeout 60000ms exceeded.
  waiting for getByText('Tarefas', { exact: true }).first() to be visible

Nenhuma tarefa, status ou Departamento foi selecionado nessa tentativa.
O problema atual é ANTERIOR ao seletor de Departamento corrigido.
Possíveis causas: sessão expirada, retorno à tela de login,
Dashboard ainda não renderizada ou alterações no menu lateral.
Não alterar o seletor para algo genérico nem limpar o perfil local.

Novo diagnóstico sem Inspector, sem clique e sem espera de 60 segundos:
    cd "$HOME\Luce\plataformaaxio"
    git pull --ff-only
    cd gestta-worker
    npm run diagnose:entry

O script abre o Chromium headless com o perfil existente, espera
8 segundos e registra ENTRADA_8S. Se o estado continuar ambíguo,
registra ENTRADA_14S após mais 6 segundos. Mostra APENAS categoria de
rota (Dashboard, tarefas, login possível ou outra), estado de
carregamento, número de correspondências do mesmo localizador
getByText('Tarefas', exact=true), presença de calendário e de campo de
senha. Não registra URLs completas, HTML, usuário, token ou cookie.

Se diagnostico indicar autenticacao_possivelmente_necessaria,
renovar sessão apenas pelo procedimento autorizado npm run login,
com MFA manual. Não contornar login nem copiar tokens.

Se indicar dashboard_sem_menu_tarefas, investigar mudança de DOM,
menu recolhido e carregamento antes de alterar códigos existentes.
Se indicar menu_tarefas_disponivel, pode ter sido falha transitória;
validar uma nova execução de test:apply após confirmar que o perfil
foi encerrado e não está aberto em outro Chromium.

A PR continua DRAFT: aplicar Filtrar, exportar XLSX, validar janelas
mensais e sincronizar ainda NÃO estão homologados.
