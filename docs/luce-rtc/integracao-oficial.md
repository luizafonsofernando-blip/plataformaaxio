# Integração com os motores oficiais RTC

Versões inspecionadas em 17/11/2026, sem executar código de terceiros:

| Serviço | Release | Commit | API observada |
| --- | --- | --- | --- |
| [Regime Regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/releases/tag/1.6.1) | 1.6.1 | `150cccbe414d` | `GET /api/calculadora/dados-abertos/versao`; `GET /api/calculadora/dados-abertos/situacoes-tributarias/cbs-ibs?data=AAAA-MM-DD` |
| [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/releases/tag/0.0.6) | 0.0.6 | `c5b0f01c8351` | `GET /api/versao`; `GET /api/calculadora/simples-nacional/atividades?data=AAAA-MM-DD` |
| [Gerador DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/releases/tag/1.0.0) | 1.0.0 | `8d79e6b2f7fa` | `GET /health/live`; `GET /health/ready`; `POST /api/danfse` com XML |

## Primeira integração implementada

`GET /api/rtc/classifications?data=AAAA-MM-DD` exige sessão Supabase ativa e permissão `reforma-tributaria` verificada no servidor. O backend valida a data, consulta a versão da calculadora regular e só então solicita CST/cClassTrib ao endpoint documentado na release `1.6.1`. O retorno inclui fonte, versão da aplicação, versão da base, data da operação e horário da consulta. Respostas inválidas, versões divergentes, indisponibilidade e ausência de configuração são erros explícitos; não há dados substitutos.

O navegador nunca acessa o motor diretamente. O backend usa `RTC_REGULAR_ENGINE_URL` e `RTC_REGULAR_ENGINE_TOKEN`, que devem existir somente no ambiente do servidor. A URL precisa ser HTTPS e apontar para um gateway privado que **valide o token** antes de encaminhar a chamada ao serviço oficial. Não basta publicar a calculadora diretamente na internet: o código oficial não foi tratado como mecanismo de autenticação da Luce.

Há limite de tempo, tamanho de resposta e frequência por usuário/IP conforme o helper do portal. A versão é fixada em `1.6.1` nesta integração; uma atualização exige revisão do contrato, testes de regressão e homologação, não troca automática da URL. O status da configuração não equivale a motor operacional.

## Infraestrutura pendente

- Docker, Java e Go não estão disponíveis no ambiente local inspecionado. A execução dos motores deve ocorrer em ambiente de contêiner isolado, com dependências e bases oficiais fixadas por versão.
- Não há ambiente RTC de homologação ou gateway autenticado configurado. Nenhuma variável RTC foi adicionada à produção.
- Não houve teste de ponta a ponta com o motor real, nem comparação de respostas com casos de referência oficiais.
- Simples Nacional e DANFSe foram inventariados, mas ainda não possuem conectores ativados.
- Cálculos, validação de XML e geração de documento fiscal continuam desabilitados até homologação específica.

## Gateway de homologação preparado

`infra/rtc-gateway/server.mjs` aceita somente consultas GET explicitamente permitidas dos motores Regular e Simples. Exige `RTC_GATEWAY_TOKEN`, compara o token em tempo constante, impõe timeout e limite de 5 MB, não segue redirects e não encaminha caminhos arbitrários. Há um Dockerfile, mas a imagem **ainda não foi construída nem executada em hospedagem de contêineres**.

O serviço deve ficar atrás de HTTPS/TLS e proteção de rede. `RTC_REGULAR_UPSTREAM`, `RTC_SIMPLES_UPSTREAM` e `RTC_DANFSE_UPSTREAM` apontam para endereços internos dos processos oficiais; nunca para endpoints públicos arbitrários. Configure o gateway com segredo distinto em cada ambiente. `RTC_REGULAR_ENGINE_URL` e `RTC_SIMPLES_ENGINE_URL` no backend do Portal devem apontar para a URL HTTPS externa do gateway; os respectivos tokens ficam apenas no servidor. Não inclua segredos no Git, navegador ou logs.

O gateway **não** encaminha cálculo nem XML/DANFSe. Essas operações exigem primeiro contrato validado, casos oficiais de referência, verificação de XML seguro e autorização específica. O probe DANFSe foi incluído somente para prontidão futura; ele não representa integração funcional de geração.

## Homologação obrigatória dos motores

1. Obter as tags e commits fixados acima diretamente da organização `ReceitaFederal`; verificar licença e dependências de build. Gerar a base SQLite com os scripts Flyway da release do Regime Regular. O Simples requer uma cópia dessa pasta `flyway/` para gerar sua própria base; sem base válida, não iniciar o processo.
2. Executar testes das duas aplicações Java 21 e do serviço Go no ambiente de build isolado. Guardar checksums de artefatos e imagem, e registrar a versão de base retornada pelos endpoints oficiais.
3. Iniciar os três processos em rede privada com recursos e persistência apropriados, sem publicação direta das portas. Publicar somente o gateway atrás de TLS, autenticação de serviço e controles de rede; configurar observabilidade e reinício.
4. Comparar catálogo Regular e atividades Simples com respostas oficiais de referência para pelo menos duas datas de vigência. Testar divergência de versão, banco ausente, timeout, payload grande, erro 4xx/5xx e token incorreto.
5. Para cálculo, selecionar casos oficiais de entrada/saída e revisão de um profissional fiscal. Para DANFSe, validar XML contra leiaute vigente, comparar PDF de referência e aplicar limites de tamanho. Até isso passar, manter as operações desabilitadas.
6. Aplicar a migration RTC apenas em banco de homologação; verificar RLS com usuários de organizações distintas e restauração de backup. O plano atual do Supabase principal não suporta branch de banco, portanto é necessário outro ambiente de homologação antes dessa etapa.

Não foi detectada hospedagem de contêineres persistentes vinculada ao Portal, e Docker/Java/Go não estão disponíveis no ambiente local usado. A implantação real dos motores depende da escolha desse ambiente. A Vercel continua adequada para o frontend e APIs curtas, não para manter essas três aplicações em execução contínua.

## Critério para ativação

1. Implantar os motores oficiais fixados em homologação, preservando licença e avisos.
2. Proteger os serviços atrás de gateway que valide autenticação de serviço, HTTPS, limites e logs sem dados fiscais sensíveis.
3. Confirmar a resposta real de versão e base, executar casos oficiais de consulta e cálculo e revisar divergências com profissional fiscal.
4. Validar isolamento entre usuários/empresas, falhas de upstream, limites de carga e plano de rollback.
5. Somente então considerar migrations RTC e liberação gradual do catálogo; produção depende de autorização expressa.
