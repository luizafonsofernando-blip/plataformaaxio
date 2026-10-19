// Revisao mensal local dos relatórios Gestta E-BEF ja validados.
// O retorno "summary" e seguro para log: SOMENTE contagens.
// O array "tasks" destina-se a processamento local em memoria e NUNCA
// deve ser exibido, persistido ou transmitido por esta rotina.
import {ascii} from './normalize.mjs';
import {auditMonthlyEbefExports} from './monthly-ebef-audit.mjs';

function statusBucket(raw){
  const value=ascii(raw);
  if(value==='ABERTA'||value==='ABERTO')return 'aberta';
  if(value==='CONCLUIDA'||value==='CONCLUIDO')return 'concluida';
  if(value==='IMPEDIMENTO')return 'impedimento';
  if(value==='DESCONSIDERADA'||value==='DESCONSIDERADO')return 'desconsiderada';
  return 'outros';
}

export function reviewMonthlyEbefExports(month,exports){
  // Falha antes de qualquer contagem se faltarem janelas, houver IDs
  // duplicados em um arquivo, datas invalidas ou conflito entre observacoes.
  const audit=auditMonthlyEbefExports(month,exports);
  const records=new Map();
  for(const entry of exports){
    for(const task of entry.tasks){
      if(!/^\d{14}$/.test(task.cnpj??'')){
        throw new Error('Documento de cliente nao validado; auditoria interrompida.');
      }
      if(!records.has(task.source_key))records.set(task.source_key,task);
    }
  }
  if(records.size!==audit.distinctTasks)throw new Error('Consolidacao inconsistente.');
  const companies=new Map();
  const status={aberta:0,concluida:0,impedimento:0,desconsiderada:0,outros:0};
  for(const task of records.values()){
    const observed=companies.get(task.cnpj)??{declaracao:false,verificacao:false};
    observed[task.tipo_tarefa]=true;
    companies.set(task.cnpj,observed);
    status[statusBucket(task.status_gestta)]++;
  }
  let companiesOnlyVerification=0,companiesOnlyDeclaration=0,companiesBoth=0;
  for(const item of companies.values()){
    if(item.verificacao&&item.declaracao)companiesBoth++;
    else if(item.verificacao)companiesOnlyVerification++;
    else if(item.declaracao)companiesOnlyDeclaration++;
  }
  const summary={
    ...audit,
    uniqueCnpjs:companies.size,
    companiesOnlyVerification,
    companiesOnlyDeclaration,
    companiesBoth,
    statusCounts:status,
    declarationDeliveryVerified:false,
    actualDatabaseCompared:false,
    dataScope:'tarefas_renderizadas_exportadas',
    writesPerformed:false,
  };
  return {summary,tasks:[...records.values()]};
}
