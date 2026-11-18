# Luce Reforma Tributaria: estado da Beta

Data: 18/11/2026. Branch: `feat/luce-rtc-on-current-portal`.

## Funcional no codigo, condicionado a banco Beta isolado

- Login pelo Portal Luce, verificacao server-side de acesso ao modulo e controle por organizacao e empresa.
- Cadastro de organizacao/empresa, rascunhos com ate 50 itens, duplicacao, filtros, salvamento automatico apos o primeiro salvamento, exclusao auditada e exportacao JSON dos dados informados.
- Historico imutavel de analises e relatorios privados, quando existirem analises oficiais registradas.
- RLS, auditoria, versoes otimistas e APIs protegidas preparados por migrations aditivas.
- `sentinela/sentinela.js` presente; suite global nao esta bloqueada por esse arquivo.

## Atualizacao de 18/11/2026

- As quatro migrations aditivas RTC foram aplicadas ao Supabase principal `prznhgwiibcazuwlwvnt`, mediante autorizacao do usuario. As oito tabelas RTC possuem RLS; o bucket `rtc-reports` e privado. Nenhuma tabela ou projeto do e-BEF foi alterado. Nao foram criadas empresas ou analises de teste na base principal.
- O motor oficial Regime Regular 1.6.1 foi empacotado em conteiner e publicado em Preview protegido no projeto Vercel `luce-rtc-engine-regular`. Um caso de referencia retornou CBS de R$ 42,24 e IBS de R$ 0,48, com `CALCULO_SIMULADO` e aviso oficial de dados simulados. Isso nao e homologacao fiscal.
- A API `/api/rtc/calculate` e a interface de teste existem no codigo, mas a flag `RTC_CALC_ENABLED` permanece desligada. Em novos testes, a inicializacao a frio do Java excedeu o tempo de resposta da Vercel e o health check nao se manteve pronto. Nao publicar a Beta funcional ate corrigir a estabilidade e testar o fluxo autenticado completo.
- O Portal de producao nao foi alterado nesta rodada. O link visual estatico existente nao realiza calculos nem persiste dados.
- O Preview do Portal foi tentado, mas o deploy falhou pelo limite de 12 funcoes serverless do plano Vercel. As quatro flags RTC de Preview adicionadas nessa tentativa foram removidas do projeto principal. A solucao incremental foi isolar as APIs RTC no projeto dedicado, sem remover APIs existentes.
- O projeto auxiliar `rtc-vercel-engine`, criado por engano durante um teste, foi excluido com autorizacao do usuario. O projeto correto do motor e `luce-rtc-engine-regular`.
- O limite de funcoes foi contornado sem remover APIs: o projeto dedicado `luce-rtc-beta` empacota 11 rotas RTC e o login compartilhado do Onboarding, totalizando 12 funcoes. Seu Preview protegido mais recente e `https://luce-rtc-beta-2cjy521pn-axion7.vercel.app`; o Production inicial existe, mas permanece bloqueado por `RTC_BETA_ENABLED=0`. A rota de status recusou acesso anonimo com HTTP 401.
- O motor oficial em Preview passou no health check apos inicializacao a frio e respondeu a uma operacao de referencia com estado `CALCULO_SIMULADO`. Token do gateway e bypass da Vercel foram rotacionados; tres bypasses temporarios foram revogados. O calculo nao esta liberado no aplicativo (`RTC_CALC_ENABLED=0`).
- O motor oficial tambem esta publicado em Production protegido pela autenticacao da Vercel e por token de gateway. O health check de Production retornou `ready: true`. O aplicativo RTC Production continua desabilitado; nao ha calculos publicos.
- O pacote RTC passou a limitar o login compartilhado ao perfil `reforma-tributaria`, a aplicar CSP restritiva e a oferecer um exemplo publico de operacao simulada sem execucao automatica.
- Repeticoes do health check mostraram uma primeira resposta `ready: false` em uma partida fria e respostas `ready: true` na sequencia. A API de calculo agora repete a consulta de versao uma vez quando o motor ainda esta iniciando, com timeout explicito; falta valida-lo no fluxo autenticado hospedado.
- A organizacao real `Luce Sistemas` foi criada no Supabase principal e o Admin01 recebeu automaticamente membership `admin`. Nenhuma empresa ficticia foi criada.
- Para concluir o teste autenticado, falta configurar `SUPABASE_SERVICE_ROLE_KEY` no projeto Vercel `luce-rtc-beta` (Preview), diretamente no painel da Vercel. Nao enviar o segredo por chat. Em seguida: redeploy do Preview, teste de login/organizacao/rascunhos, ativacao controlada do calculo, teste de persistencia, configuracao Production, link no Portal e publicacao final.
- O cartao do Portal apontando para `luce-rtc-beta.vercel.app` esta preparado na branch `feat/rtc-portal-card`, commit `b16ebd3`, sem deploy. O codigo RTC esta na branch `feat/luce-rtc-on-current-portal`; o Portal de producao ainda aponta para a previa visual antiga.
- Testes locais: `check:rtc` (36 aprovados), `check:sign`, `check` e `check:orthography` aprovados. Ainda faltam testes autenticados ponta a ponta contra a implantacao hospedada.

## Preparado, nao operacional neste ambiente

- Previa visual isolada em `infra/rtc-preview/dist/`: somente HTML, CSS, JS e configuracao de cabeçalhos; sem API, banco, gravacao ou calculo. O build normal do Portal exclui essa pagina. Projeto Vercel separado publicado em `https://luce-rtc-visual-preview.vercel.app` com SSO para todas as URLs; CLI confirmou estado Ready. Nao foi inspecionada visualmente em navegador autenticado.
- Adaptadores de leitura dos catalogos oficiais de CST/cClassTrib, NCM/NBS e atividades do Simples. O Regime Regular foi executado em Preview protegido; o Simples ainda exige motor iniciado. Versoes sao fixadas.
- Gateway local e scripts para fontes oficiais Regular, Simples e DANFSe. O conteiner Java Regular foi executado no Vercel Preview; os demais motores nao foram hospedados.
- Vercel Preview RTC isolado, com `RTC_BETA_ENABLED=1`, `RTC_PRIMARY_BETA_ENABLED=1` e lista explicita de administradores. O acesso ao Supabase principal foi autorizado e a estrutura RTC foi aplicada; a chave de escrita do projeto dedicado ainda falta.

## Bloqueios e limites

- Os dois projetos gratuitos Supabase estao ocupados: producao e homologacao do e-BEF. O principal recebeu apenas as migrations RTC autorizadas; o e-BEF permaneceu intacto. PGlite cobre SQL/RLS localmente, mas nao substitui Auth, PostgREST ou Storage reais.
- O banco principal contem as estruturas RTC e a organizacao Luce, mas ainda nao houve validacao autenticada de rascunhos e uploads ponta a ponta por HTTP nem teste visual autenticado no navegador.
- Nenhum calculo fiscal, aliquota, base de calculo, memoria, XML ou DANFSe deve ser apresentado como homologado. Os motores oficiais ainda exigem execucao e casos de referencia revisados por profissional fiscal.
- Nenhum push ao GitHub ou deploy do Portal Luce nesta rodada. O motor e o aplicativo RTC dedicado foram enviados a Previews protegidos da Vercel; a Beta funcional nao foi liberada.

Ver `preview-beta.md`, `homologacao-local.md` e `integracao-oficial.md` para configuracao, testes e rollback.
