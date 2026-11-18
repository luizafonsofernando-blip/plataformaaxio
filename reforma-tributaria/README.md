# Luce Reforma Tributária

Fundação do módulo em desenvolvimento. Esta versão permite autenticação pelo endpoint existente do Portal Luce e mostra, somente a usuários autorizados, a prontidão de configuração dos motores tributários. Também oferece a consulta de CST e cClassTrib por data, exclusivamente quando o motor oficial do Regime Regular estiver implantado, autenticado e com versão `1.6.1` confirmada. Ainda não executa cálculos, valida XML ou gera DANFSe.

## Acesso

O endpoint `/api/rtc/status` exige um usuário ativo do Supabase com `reforma-tributaria` em `app_metadata.allowed_modules`, ou perfil de administrador, seguindo o helper server-side já usado pelo Portal. Usuários comuns sem essa permissão recebem `403`. A interface usa o login existente e guarda o token apenas na sessão do navegador.

## Configuração futura

- `RTC_REGULAR_ENGINE_URL`: serviço do Regime Regular.
- `RTC_REGULAR_ENGINE_TOKEN`: token do gateway privado que protege o serviço oficial.
- `RTC_SIMPLES_ENGINE_URL`: serviço do Simples Nacional.
- `RTC_DANFSE_ENGINE_URL`: serviço do Gerador DANFSe.

Essas URLs e o token devem ser secretos e utilizados somente no backend. O gateway deve validar o token antes de encaminhar a requisição ao motor oficial. A presença da URL sinaliza apenas configuração pendente de validação. Antes de qualquer cálculo, são obrigatórios ambiente isolado, autenticação entre serviços, teste de health check, pin de versão oficial, casos tributários de referência e revisão técnica.

## Segurança e implantação

Nenhuma variável é necessária para exibir o estado "Não configurado". Não inserir dados tributários reais ou credenciais em ambientes de desenvolvimento. Não publicar esta branch, adicionar o módulo ao catálogo público ou executar migrations sem homologação e autorização expressa.
