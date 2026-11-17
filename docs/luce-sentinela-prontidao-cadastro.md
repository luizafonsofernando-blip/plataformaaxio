# Luce Sentinela - Prontidão para cadastro de clientes

## Entregas internas concluídas

- cadastro central ampliado com contatos, inscrições e situação de onboarding;
- importação CSV/XLSX de até 500 empresas por lote;
- validação individual e relatório persistido de linhas rejeitadas;
- prevenção de duplicidade por CNPJ dentro da organização;
- matriz RBAC para Usuário, Analista, Supervisor e Administrador;
- autorização de escrita e exclusão validada na API;
- bucket privado `sentinel-documents` e upload autenticado de evidências;
- download temporário por URL assinada com validade de 120 segundos;
- auditoria de cadastros, importações e documentos;
- controle otimista de concorrência mantido para empresas, ocorrências e tarefas;
- conectores fiscais externos mantidos desativados por feature flag.

## Aplicação da migration

Aplicar, primeiro em staging:

`supabase/migrations/20260905004027_prepare_sentinela_client_onboarding.sql`

Validar após a aplicação:

1. tabelas e índices criados;
2. RLS e `FORCE ROW LEVEL SECURITY` ativos;
3. bucket `sentinel-documents` privado;
4. permissões sem acesso de escrita direto para `anon` ou `authenticated`;
5. Service Role disponível somente nas funções Vercel;
6. importação de uma carteira piloto anonimizada;
7. isolamento entre duas organizações de teste.

## Ambientes

### Development

- dados sintéticos ou anonimizados;
- conectores desligados;
- chaves próprias do ambiente.

### Staging

- projeto Supabase separado;
- projeto/alias Vercel separado;
- migrations aplicadas antes de produção;
- carteira piloto anonimizada;
- testes de RLS, importação, upload e rollback.

### Production

- aplicar somente após homologação em staging;
- confirmar backup recuperável;
- preservar todas as feature flags fiscais desligadas;
- monitorar erros de API, Storage e importação.

## Rollback

A migration é aditiva e não remove dados. Em caso de falha de aplicação, desativar os botões de importação e upload pela versão anterior do frontend. Não executar `DROP` em produção. Registros já importados devem ser preservados e tratados por exclusão lógica quando necessário.

## Pendências exclusivamente externas

- criação efetiva do projeto de staging e seus secrets;
- aplicação da migration no Supabase remoto;
- contratos e credenciais de APIs oficiais;
- homologação do primeiro conector fiscal;
- definição dos CNPJs da carteira piloto real.
