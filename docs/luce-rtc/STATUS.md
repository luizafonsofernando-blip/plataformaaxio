# Luce Reforma Tributaria: estado da Beta

Data: 18/11/2026. Branch: `feat/luce-rtc-on-current-portal`.

## Funcional no codigo, condicionado a banco Beta isolado

- Login pelo Portal Luce, verificacao server-side de acesso ao modulo e controle por organizacao e empresa.
- Cadastro de organizacao/empresa, rascunhos com ate 50 itens, duplicacao, filtros, salvamento automatico apos o primeiro salvamento, exclusao auditada e exportacao JSON dos dados informados.
- Historico imutavel de analises e relatorios privados, quando existirem analises oficiais registradas.
- RLS, auditoria, versoes otimistas e APIs protegidas preparados por migrations aditivas.
- `sentinela/sentinela.js` presente; suite global nao esta bloqueada por esse arquivo.

## Preparado, nao operacional neste ambiente

- Previa visual isolada em `infra/rtc-preview/dist/`: somente HTML, CSS, JS e configuracao de cabeçalhos; sem API, banco, gravacao ou calculo. O build normal do Portal exclui essa pagina. Ainda nao foi publicada nem inspecionada visualmente em navegador.
- Adaptadores de leitura dos catalogos oficiais de CST/cClassTrib, NCM/NBS e atividades do Simples. Exigem gateway autenticado, motores iniciados e versoes fixadas. Respostas simuladas sao usadas somente nos testes automatizados.
- Gateway local e scripts para fontes oficiais Regular, Simples e DANFSe. Java, Go e conteineres nao foram executados neste ambiente.
- Vercel Preview com flag `RTC_BETA_ENABLED` e bloqueio do projeto Supabase principal. Nao ha Preview publicado nem projeto Supabase Beta hospedado autorizado.

## Bloqueios e limites

- Os dois projetos gratuitos Supabase estao ocupados: producao e homologacao do e-BEF. Nenhum deles foi modificado pelo RTC. PGlite cobre SQL/RLS localmente, mas nao substitui Auth, PostgREST ou Storage reais.
- Sem banco Beta isolado nao foi possivel validar login, rascunhos e uploads de ponta a ponta por HTTP, nem realizar teste visual autenticado no navegador.
- Nenhum calculo fiscal, aliquota, base de calculo, memoria, XML ou DANFSe deve ser apresentado como homologado. Os motores oficiais ainda exigem execucao e casos de referencia revisados por profissional fiscal.
- Nada foi enviado ao GitHub, Vercel ou Supabase hospedado nesta etapa. Nao usar a base principal para contornar a falta de ambiente Beta.

Ver `preview-beta.md`, `homologacao-local.md` e `integracao-oficial.md` para configuracao, testes e rollback.
