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
- O Preview do Portal foi tentado com `RTC_BETA_ENABLED=1`, `RTC_PRIMARY_BETA_ENABLED=1`, `RTC_BETA_ADMIN_IDS` restrito ao Admin01 e `RTC_CALC_ENABLED=0`, mas o deploy falhou pelo limite de 12 funcoes serverless do plano Vercel. Essas variaveis afetam somente novos deploys Preview; producao permanece com a Beta desligada. A solucao incremental e isolar as APIs RTC em um projeto Vercel dedicado e rotea-las pelo Portal, sem remover APIs existentes.
- Uma tentativa de implantacao a partir do diretorio pai criou acidentalmente o projeto auxiliar `rtc-vercel-engine`, cujo deploy falhou. Ele nao contem dados nem credenciais RTC. O projeto correto do motor e `luce-rtc-engine-regular`.
- Testes locais: `check:rtc` (36 aprovados), `check:sign`, `check` e `check:orthography` aprovados. Ainda faltam testes autenticados ponta a ponta contra a implantacao hospedada.

## Preparado, nao operacional neste ambiente

- Previa visual isolada em `infra/rtc-preview/dist/`: somente HTML, CSS, JS e configuracao de cabeçalhos; sem API, banco, gravacao ou calculo. O build normal do Portal exclui essa pagina. Projeto Vercel separado publicado em `https://luce-rtc-visual-preview.vercel.app` com SSO para todas as URLs; CLI confirmou estado Ready. Nao foi inspecionada visualmente em navegador autenticado.
- Adaptadores de leitura dos catalogos oficiais de CST/cClassTrib, NCM/NBS e atividades do Simples. Exigem gateway autenticado, motores iniciados e versoes fixadas. Respostas simuladas sao usadas somente nos testes automatizados.
- Gateway local e scripts para fontes oficiais Regular, Simples e DANFSe. Java, Go e conteineres nao foram executados neste ambiente.
- Vercel Preview com flag `RTC_BETA_ENABLED` e bloqueio do projeto Supabase principal. Nao ha Preview publicado nem projeto Supabase Beta hospedado autorizado.

## Bloqueios e limites

- Os dois projetos gratuitos Supabase estao ocupados: producao e homologacao do e-BEF. O principal recebeu apenas as migrations RTC autorizadas; o e-BEF permaneceu intacto. PGlite cobre SQL/RLS localmente, mas nao substitui Auth, PostgREST ou Storage reais.
- O banco principal agora contem as estruturas RTC, mas ainda nao houve validacao autenticada de rascunhos e uploads ponta a ponta por HTTP nem teste visual autenticado no navegador.
- Nenhum calculo fiscal, aliquota, base de calculo, memoria, XML ou DANFSe deve ser apresentado como homologado. Os motores oficiais ainda exigem execucao e casos de referencia revisados por profissional fiscal.
- Nenhum push ao GitHub ou deploy do Portal Luce nesta rodada. O motor foi enviado apenas a um Preview protegido da Vercel; a Beta funcional nao foi publicada.

Ver `preview-beta.md`, `homologacao-local.md` e `integracao-oficial.md` para configuracao, testes e rollback.
