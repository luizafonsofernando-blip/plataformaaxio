# Gestta / E-BEF — planejamento de reconciliação (somente offline)

> **Estado: proposta técnica, não é mecanismo transacional.**
> Não há transação implementada, não existe sincronização liberada, não se
> aplica migração SQL, não há leitura ou escrita no Supabase por este módulo.

## O que já foi verificado

- A homologação de outubro/2026 trouxe 44 tarefas únicas de **verificação**
  para 38 CNPJs, após deduplicação das janelas 01–30 e 02–31.
- O resultado não comprova cobertura de todos os usuários e não comprova
  que alguma declaração E-BEF foi transmitida.
- As tabelas Gestta ainda não foram provisionadas no banco consultado.
- O endpoint `api/ebef/gestta-sync.js` na branch aceita somente
  `mode: "validate_only"`. O CLI exige `--dry-run`.
- Essas proteções existem no **código desta branch**; não constituem
  confirmação do comportamento do deployment atual da Vercel.

## Planejamento offline

`src/ebef-reconciliation-plan.mjs` recebe:

- `tasks`: tarefas normalizadas do parser e validadas pelo contrato API,
  com ID Gestta verificável;
- `snapshot`: opcional; objeto explicitamente fornecido pelo operador
  contendo `kind: "explicit_readonly_snapshot"`,
  `origin: "operator_supplied_offline"`, `complete: true`,
  `capturedAt` ISO UTC e `rows` já projetadas nos mesmos 17 campos.

Sem snapshot, o total de candidatas é mostrado, mas inclusões,
atualizações e inalterados retornam **null**.
Com snapshot, o planejador calcula uma **estimativa offline**, não
uma confirmação do estado do banco. Ele bloqueia:
IDs repetidos, source_key inválido, identidades divergentes no mesmo ID,
alteração de CNPJ/competência/tipo de tarefa e snapshots incompletos.
Registros antigos fora da exportação permanecem intocados; exclusões
são sempre zero. Os resultados públicos têm só números e hashes SHA-256
de verificação; nenhuma linha de cliente é impressa.

## Pendências obrigatórias para uma futura transação (NÃO implementadas)

1. Validar independentemente a cobertura das tarefas e usuários Gestta.
2. Revisar o contrato E-BEF: tarefa `verificacao` e status Gestta concluída
   jamais devem ser registrados como declaração transmitida.
3. Revisar e aprovar a migração SQL isolada; executar backup e conferir RLS,
   privilégios, índices e acesso do backend. Não aplicar agora.
4. Implementar acesso **somente leitura** restrito para gerar snapshot
   íntegro, com escopo, paginação e versão/cursor consistentes.
5. No futuro mecanismo de escrita, exigir uma **única transação de banco**
   para leitura sob bloqueio, comparação de versão atual, upsert de
   campos exclusivamente Gestta e inserção do registro de execução.
   Não usar lotes HTTP separados que possam gravar parcialmente.
6. Criar chave idempotente da execução, bloqueio de concorrência,
   reconciliação condicionada à versão observada, trilha de auditoria
   sem dados pessoais e um caminho de recuperação de falhas.
7. Testar em ambiente isolado com registros sintéticos, executar plano
   de reversão, obter autorização expressa antes de qualquer escrita.

Até a implementação e homologação de todos esses controles,
**não alterar `validate_only`, não habilitar `sync` e não aplicar SQL**.
