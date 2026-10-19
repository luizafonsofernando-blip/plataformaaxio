// Sincronizacao Gestta/LUCE BLOQUEADA: somente simulacao local.
import {parseGesttaXlsx} from './parse-report.mjs';

function summarize(tasks){
  const statuses={},categories={};
  for(const task of tasks){
    statuses[task.status_gestta]=(statuses[task.status_gestta]||0)+1;
    categories[task.tipo_tarefa]=(categories[task.tipo_tarefa]||0)+1;
  }
  return {statuses,categories};
}
export async function syncTasks(tasks,exportSha256,{dryRun=false}={}){
  // Nao confiar em variaveis de ambiente para liberar escrita.
  // Uma versao futura deve exigir revisao do backend e aprovacao explicita.
  if(dryRun!==true){
    throw new Error('Sincronizacao real Gestta/LUCE desabilitada. Utilize apenas --dry-run.');
  }
  if(!Array.isArray(tasks)||tasks.some(row=>!row||typeof row!=='object')){
    throw new Error('Tarefas invalidas para simulacao.');
  }
  if(typeof exportSha256!=='string'||!/^[a-f0-9]{64}$/.test(exportSha256)){
    throw new Error('Identificador de exportacao invalido para simulacao.');
  }
  const counts=summarize(tasks);
  console.log('SIMULACAO LOCAL: '+tasks.length+' tarefas. Nenhum envio realizado.');
  return {tasks:tasks.length,...counts,dryRun:true,synchronized:false};
}
export async function syncFile(filePath,{dryRun=false}={}){
  if(dryRun!==true){
    throw new Error('Sincronizacao real Gestta/LUCE desabilitada. Utilize apenas --dry-run.');
  }
  const tasks=await parseGesttaXlsx(filePath);
  const {createHash}=await import('node:crypto');
  const {readFile}=await import('node:fs/promises');
  const sha=createHash('sha256').update(await readFile(filePath)).digest('hex');
  return syncTasks(tasks,sha,{dryRun:true});
}
