// CONTRATO DE LEITURA FUTURA — NAO EXECUTA SQL.
// Qualquer adaptador real deve manter SELECTs na MESMA conexao,
// dentro de UMA transacao REPEATABLE READ + READ ONLY.
// Nunca fornecer tokens do Supabase ao worker Windows ou navegador.
import {COMPARABLE_FIELDS} from './pre-sync-preview.mjs';

const columns=COMPARABLE_FIELDS.join(', ');
const TABLE='public.ebef_gestta_tasks';

export function planEbefConsistentRead({pageSize=200}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500){
    throw new Error('Tamanho de pagina E-BEF invalido.');
  }
  return Object.freeze({
    status:'contract_only_not_executed',
    begin:'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;',
    count:'SELECT COUNT(*)::bigint AS total_rows FROM '+TABLE+';',
    page:'SELECT '+columns+' FROM '+TABLE+
      ' WHERE ($1::text IS NULL OR source_key > $1::text)'+
      ' ORDER BY source_key ASC LIMIT $2::integer;',
    finish:'ROLLBACK;',
    pageSize,
    boundArguments:['previousSourceKeyOrNull','pageSize'],
    sameConnectionRequired:true,
    oneSnapshotRequired:true,
    noOffsetPagination:true,
    schemaMustExistBeforeRead:true,
    databaseReadPerformed:false,
    writesPerformed:false,
    exportIncludesClientData:true,
    authorizationForWrites:false,
  });
}
