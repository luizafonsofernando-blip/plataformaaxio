// Auditoria mensal offline do Gestta E-BEF. Recebe tarefas JA validadas
// pelo parseGesttaXlsx; nao faz I/O, nao comunica com a LUCE e nao retorna
// nomes, documentos, dados pessoais ou linhas de tarefas no resumo.
import {buildMonthWindows} from './month-windows.mjs';

function monthWindows(month){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month??'')){
    throw new Error('Mes de consolidacao invalido (AAAA-MM).');
  }
  const [year,number]=month.split('-').map(Number);
  const last=new Date(Date.UTC(year,number,0)).getUTCDate();
  return buildMonthWindows({from:month,through:month+'-'+String(last).padStart(2,'0')});
}

function assertIsoDay(value){
  if(typeof value!=='string'|| !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
     Number.isNaN(Date.parse(value+'T00:00:00Z')) ||
     new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value){
    throw new Error('Data invalida em uma observacao.');
  }
}
function fingerprint(task){
  // Comparar campos essenciais sem expor seus valores no erro.
  return JSON.stringify([
    task.gestta_id,task.cnpj,task.competencia,task.tarefa,
    task.tipo_tarefa,task.tipo_registro,task.cliente,task.departamento,
    task.responsavel,task.status_gestta,task.vencimento,task.data_legal,
    task.concluido_em,task.feito_atrasado,task.feito_com_multa,task.baixado,
  ]);
}

export function auditMonthlyEbefExports(month,exports){
  const expected=monthWindows(month);
  if(!Array.isArray(exports)||exports.length!==expected.length){
    throw new Error('Mes ainda incompleto: faltam janelas de exportacao.');
  }
  const expectedKeys=new Set(expected.map(w=>w.start+'|'+w.end));
  const seenWindows=new Set();
  const seenTasks=new Map();
  let totalRows=0,duplicateRows=0;
  for(const entry of exports){
    if(!entry || typeof entry!=='object'|| !Array.isArray(entry.tasks)||
       !entry.window || typeof entry.window.start!=='string' ||
       typeof entry.window.end!=='string'){
      throw new Error('Estrutura de janela mensal invalida.');
    }
    const key=entry.window.start+'|'+entry.window.end;
    if(!expectedKeys.has(key) || seenWindows.has(key)){
      throw new Error('Janela mensal inesperada ou duplicada.');
    }
    seenWindows.add(key);
    const fileIds=new Set();
    for(const task of entry.tasks){
      if(!task || typeof task!=='object' ||
         !/^[a-f0-9]{64}$/.test(task.source_key??'')||
         !/^[a-f0-9]{24}$/.test(task.gestta_id??'') ||
         !['declaracao','verificacao'].includes(task.tipo_tarefa) ||
         !task.status_gestta || typeof task.status_gestta!=='string'){
        throw new Error('Registro mensal nao validado para auditoria.');
      }
      assertIsoDay(task.vencimento);
      if(task.vencimento<entry.window.start||task.vencimento>entry.window.end){
        throw new Error('Data Meta fora da janela exportada.');
      }
      if(fileIds.has(task.source_key)){
        throw new Error('ID repetido dentro do mesmo XLSX.');
      }
      fileIds.add(task.source_key);
      totalRows++;
      const previous=seenTasks.get(task.source_key);
      const signature=fingerprint(task);
      if(previous){
        if(previous!==signature){
          throw new Error('Mesmo ID apresentou campos divergentes entre janelas; revisar manualmente.');
        }
        duplicateRows++;
      }else {
        seenTasks.set(task.source_key,signature);
      }
    }
  }
  if(seenWindows.size!==expectedKeys.size){
    throw new Error('Janelas obrigatorias ausentes.');
  }
  // Contar categorias sem devolver dados brutos nem depender da ordem de exports.
  const seen=new Set();
  const categories={declaracao:0,verificacao:0};
  for(const entry of exports){
    for(const task of entry.tasks){
      if(seen.has(task.source_key))continue;
      seen.add(task.source_key);
      categories[task.tipo_tarefa]++;
    }
  }
  return {
    month,expectedWindows:expected.map(({start,end})=>({start,end})),
    receivedWindows:seenWindows.size,rawRows:totalRows,
    distinctTasks:seenTasks.size,overlapDuplicates:duplicateRows,
    categories,completeWindows:true,allUsersProven:false,
    synchronized:false,
  };
}

export function expectedEbefMonthWindows(month){
  return monthWindows(month).map(({start,end})=>({start,end}));
}
