// Pré-sincronizacao EXCLUSIVAMENTE EM MEMORIA, sem acesso a rede/banco.
// Sem snapshot COMPLETO de leitura, insercoes e atualizacoes sao DESCONHECIDAS.
// Somente retorna contagens: nunca expoe chaves, CNPJ, nomes ou linhas.
export const COMPARABLE_FIELDS=Object.freeze([
  'source_key','gestta_id','cnpj','competencia','tarefa','tipo_tarefa',
  'tipo_registro','cliente','departamento','responsavel','status_gestta',
  'vencimento','data_legal','concluido_em','feito_atrasado',
  'feito_com_multa','baixado',
]);

function requireComparableRow(row) {
  if(!row||typeof row!=='object'||Array.isArray(row)||
     !/^[a-f0-9]{64}$/.test(row.source_key??'')||
     !/^[a-f0-9]{24}$/.test(row.gestta_id??'')||
     !/^\d{14}$/.test(row.cnpj??'')||
     !['declaracao','verificacao'].includes(row.tipo_tarefa)||
     COMPARABLE_FIELDS.some(field=>!Object.hasOwn(row,field) ||
       row[field]===undefined)){
    throw new Error('Registro sem identidade/campos completos; comparacao interrompida.');
  }
  for(const field of ['vencimento','data_legal','concluido_em']){
    if(row[field]!==null &&
       (typeof row[field]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row[field]))){
      throw new Error('Data ausente ou invalida em registro comparavel.');
    }
  }
  for(const field of ['feito_atrasado','feito_com_multa','baixado']){
    if(row[field]!==null && typeof row[field]!=='boolean'){
      throw new Error('Indicador nao padronizado em registro comparavel.');
    }
  }
  return row.source_key;
}
function indexRows(rows){
  if(!Array.isArray(rows))throw new Error('Colecao de registros invalida.');
  const indexed=new Map();
  for(const row of rows){
    const id=requireComparableRow(row);
    if(indexed.has(id))throw new Error('ID duplicado em conjunto comparavel.');
    indexed.set(id,row);
  }
  return indexed;
}
function equivalent(a,b){
  return COMPARABLE_FIELDS.every(field=>a[field]===b[field]);
}
export function previewEbefSyncReadOnly(tasks,snapshot=null){
  const proposed=indexRows(tasks);
  const base={
    mode:'dry_run_local',
    proposedRecords:proposed.size,
    inserts:null,updates:null,unchanged:null,
    deletes:0,actualDatabaseCompared:false,
    writesPerformed:false,allUsersProven:false,
    needsReadOnlySnapshot:true,
  };
  if(snapshot===null){
    return {...base,decision:'aguardando_snapshot_completo_somente_leitura'};
  }
  if(!snapshot||snapshot.complete!==true ||
     snapshot.kind!=='explicit_readonly_snapshot' ||
     !Array.isArray(snapshot.rows)){
    throw new Error('Snapshot completo e explicitamente somente leitura obrigatorio.');
  }
  // Este metodo NAO coleta nem verifica a origem do snapshot por conta propria.
  // O operador deve obter/exportar uma copia consistente, somente leitura.
  const current=indexRows(snapshot.rows);
  let inserts=0,updates=0,unchanged=0;
  for(const [id,next] of proposed.entries()){
    const old=current.get(id);
    if(!old)inserts++;
    else if(old.gestta_id!==next.gestta_id || old.cnpj!==next.cnpj){
      throw new Error('Mesmo ID com identidade de cliente diferente; revisao obrigatoria.');
    }else if(equivalent(old,next))unchanged++;
    else updates++;
  }
  return {
    ...base,inserts,updates,unchanged,
    needsReadOnlySnapshot:false,
    actualDatabaseCompared:false,
    decision:'estimativa_sobre_snapshot_fornecido_nao_confirmado_no_banco',
  };
}
