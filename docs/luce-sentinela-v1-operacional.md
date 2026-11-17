# Luce Sentinela - V1 operacional

## Escopo entregue

- organização, associação de usuários e isolamento por `organization_id`;
- cadastro central de empresas com CNPJ único por organização;
- dashboard orientado por risco e painel de prioridades;
- Ficha Fiscal 360 por empresa;
- ocorrências, tarefas, comentários e evidências;
- histórico de auditoria com autor e data/hora;
- snapshots fiscais e achados normalizados;
- Connector Hub, fila idempotente, tentativas e dead-letter status;
- motor de regras configurável e feature flags;
- notificações e monitor técnico;
- controle de versão para impedir sobrescritas concorrentes;
- RLS com leitura restrita aos membros da organização;
- API server-side com autenticação, autorização de módulo, rate limit e auditoria.

## Prontidão para cadastro

- cadastro ampliado de empresas com contatos, inscrições e estado de onboarding;
- importação de carteira em CSV ou XLSX, com validação e relatório de rejeições;
- permissões granulares de leitura, criação, edição, exclusão e importação;
- upload privado de documentos e download por URL temporária assinada;
- auditoria das operações de cadastro, importação e documentos.

A ativação remota dessas entregas depende da aplicação da migration `20260905004027_prepare_sentinela_client_onboarding.sql`. O frontend e a API não devem ser publicados antes dessa etapa.

## Integrações oficiais

As integrações `federal-cnd`, `federal-situation`, `federal-mailbox` e `dctfweb` permanecem desativadas. O sistema não apresenta dados simulados como oficiais. A ativação depende de documentação vigente, contrato, credenciais, ambiente de homologação e validação dos endpoints oficiais.

## Fonte e atualidade

Cada snapshot fiscal registra fonte, status, instante da consulta e validade. Falhas futuras de consulta não devem apagar o último dado válido. Os estados `Não consultado`, `Indisponível` e `Desatualizado` permanecem distintos de `Regular`.

## Segurança

- nenhuma Service Role Key é enviada ao navegador;
- escrita ocorre exclusivamente pela API autenticada;
- novas tabelas possuem RLS forçado e política por organização;
- eventos de auditoria são escritos pelo backend;
- operações repetidas de conectores usam chave de idempotência;
- alterações concorrentes de empresas, ocorrências e tarefas retornam conflito.

## Próxima etapa de homologação

1. Fornecer contratos e credenciais das APIs oficiais.
2. Configurar ambiente de staging separado.
3. Implementar e homologar um conector federal por vez.
4. Validar normalização, retries, custos, limites e evidências.
5. Ativar a feature flag somente após o critério de aceite completo.
