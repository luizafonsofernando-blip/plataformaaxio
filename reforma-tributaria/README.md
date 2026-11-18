# Luce Reforma Tributária

Fundação Beta do módulo em desenvolvimento. Esta versão permite autenticação pelo endpoint existente do Portal Luce, cadastro de empresas e rascunhos de simulação com múltiplos itens, duplicação, filtros e salvamento automático após o primeiro salvamento, histórico de análises já registradas e prontidão dos motores. Também oferece consultas de CST/cClassTrib e NCM/NBS por data, exclusivamente quando o motor oficial do Regime Regular estiver implantado, autenticado e com versão `1.6.1` confirmada. Rascunhos não são cálculos nem resultados fiscais. Ainda não executa cálculos, valida XML ou gera DANFSe.

## Acesso

O endpoint `/api/rtc/status` exige um usuário ativo do Supabase com `reforma-tributaria` em `app_metadata.allowed_modules`, ou perfil de administrador, seguindo o helper server-side já usado pelo Portal. Usuários comuns sem essa permissão recebem `403`. A interface usa o login existente e guarda o token apenas na sessão do navegador.

`RTC_BETA_ENABLED=0` desativa os endpoints do módulo no servidor sem alterar os demais módulos. A API de rascunhos exige acesso ativo à organização e à empresa; usuários com papel `viewer` não gravam. Alterações usam versão otimista para evitar sobrescrita concorrente. A migration `20261118010000_create_luce_rtc_simulation_drafts.sql` cria somente tabelas/funções RTC novas, com RLS, auditoria transacional e sem alterar registros existentes. Ela está preparada no repositório, **não aplicada em Supabase hospedado**.

## Configuração futura

- `RTC_REGULAR_ENGINE_URL`: serviço do Regime Regular.
- `RTC_REGULAR_ENGINE_TOKEN`: token do gateway privado que protege o serviço oficial.
- `RTC_SIMPLES_ENGINE_URL`: serviço do Simples Nacional.
- `RTC_DANFSE_ENGINE_URL`: serviço do Gerador DANFSe.

Essas URLs e o token devem ser secretos e utilizados somente no backend. O gateway deve validar o token antes de encaminhar a requisição ao motor oficial. A presença da URL sinaliza apenas configuração pendente de validação. Antes de qualquer cálculo, são obrigatórios ambiente isolado, autenticação entre serviços, teste de health check, pin de versão oficial, casos tributários de referência e revisão técnica.

## Segurança e implantação

Nenhuma variável é necessária para exibir o estado "Não configurado". Não inserir dados tributários reais ou credenciais em ambientes de desenvolvimento. A interface e o catálogo estão preparados na branch, mas o cadastro Beta persistente requer aplicação autorizada das migrations RTC em ambiente isolado. Não publicar esta branch nem executar migrations hospedadas sem autorização expressa.
