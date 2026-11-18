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

## Critério para ativação

1. Implantar os motores oficiais fixados em homologação, preservando licença e avisos.
2. Proteger os serviços atrás de gateway que valide autenticação de serviço, HTTPS, limites e logs sem dados fiscais sensíveis.
3. Confirmar a resposta real de versão e base, executar casos oficiais de consulta e cálculo e revisar divergências com profissional fiscal.
4. Validar isolamento entre usuários/empresas, falhas de upstream, limites de carga e plano de rollback.
5. Somente então considerar migrations RTC e liberação gradual do catálogo; produção depende de autorização expressa.
