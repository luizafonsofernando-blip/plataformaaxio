# Luce Reforma Tributária

Fundação do módulo em desenvolvimento. Esta versão permite autenticação pelo endpoint existente do Portal Luce e mostra, somente a usuários autorizados, a prontidão de configuração dos motores tributários. Ainda não executa cálculos, valida XML ou gera DANFSe.

## Acesso

O endpoint `/api/rtc/status` exige um usuário ativo do Supabase com `reforma-tributaria` em `app_metadata.allowed_modules`, ou perfil de administrador, seguindo o helper server-side já usado pelo Portal. Usuários comuns sem essa permissão recebem `403`. A interface usa o login existente e guarda o token apenas na sessão do navegador.

## Configuração futura

- `RTC_REGULAR_ENGINE_URL`: serviço do Regime Regular.
- `RTC_SIMPLES_ENGINE_URL`: serviço do Simples Nacional.
- `RTC_DANFSE_ENGINE_URL`: serviço do Gerador DANFSe.

Essas URLs devem ser secretas e utilizadas somente no backend. Sua presença sinaliza apenas configuração pendente de validação. Antes de qualquer cálculo, são obrigatórios ambiente isolado, autenticação entre serviços, teste de health check, pin de versão oficial, casos tributários de referência e revisão técnica.

## Segurança e implantação

Nenhuma variável é necessária para exibir o estado "Não configurado". Não inserir dados tributários reais ou credenciais em ambientes de desenvolvimento. Não publicar esta branch, adicionar o módulo ao catálogo público ou executar migrations sem homologação e autorização expressa.
