// Outubro/2026: DUAS exportacoes reais na MESMA execucao Chromium.
// Exclusivamente homologacao em memoria. Nao importa ./sync.mjs e nao
// faz escrita na LUCE nem no Supabase. Apaga XLSX do diretorio temporario.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {parsePairedPilotOptions,PAIRED_MONTH} from './paired-pilot-options.mjs';
import {runValidatedPilotWindow} from './export-pilot-window-workflow.mjs';
import {auditMonthlyEbefExports} from './monthly-ebef-audit.mjs';
import {reviewMonthlyEbefExports} from './monthly-ebef-review.mjs';
import {previewEbefSyncReadOnly} from './pre-sync-preview.mjs';
import {planEbefReconciliationOffline} from './ebef-reconciliation-plan.mjs';
import {saveEbefLocalWorkbook} from './ebef-local-report.mjs';
import {withDeadline} from './timeout-utils.mjs';

const saveFlag='--confirm-save-local-report';
const args=process.argv.slice(2);
if(args.filter(x=>x===saveFlag).length>1){
  throw new Error('Autorizacao de arquivo local duplicada.');
}
const saveLocal=args.includes(saveFlag);
const windows=parsePairedPilotOptions(args.filter(x=>x!==saveFlag));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Origem Gestta nao autorizada para auditoria pareada.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context,dir;
let stage='INICIALIZACAO';
try{
  console.log('PAREADO: duas janelas 01-30 e 02-31 outubro. DOIS XLSX autorizados.');
  console.log('PAREADO: Usuarios renderizados NAO comprovam todos os cadastrados.');
  console.log('PAREADO: SOMENTE memoria e pasta temporaria, NENHUMA sincronizacao.');
  dir=await mkdtemp(join(tmpdir(),'luce-ebef-paired-'));
  stage='ABRIR_CHROMIUM';
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:true,viewport:{width:1366,height:860},
  });
  const exports=[];
  for(let i=0;i<windows.length;i++){
    const {window,expected}=windows[i];
    stage='VALIDAR_JANELA_'+(i+1);
    console.log('PAREADO: janela '+(i+1)+'/2 = '+expected+'.');
    const tasks=await runValidatedPilotWindow(context,target,dir,window,expected);
    console.log('PAREADO: janela '+(i+1)+'/2 validada; registros='+tasks.length+
      ' (nao provar cobertura global).');
    exports.push({window,tasks});
  }
  stage='AUDITORIA_MENSAL';
  const result=auditMonthlyEbefExports(PAIRED_MONTH,exports);
  if(!result.completeWindows||result.receivedWindows!==2||
     result.allUsersProven!==false||result.synchronized!==false) {
    throw new Error('Auditoria mensal incompleta.');
  }
  console.log('PAREADO_RESUMO_SEM_DADOS_PESSOAIS: '+JSON.stringify(result));
  stage='CONFERENCIA_CLIENTES_CATEGORIAS';
  const reviewed=reviewMonthlyEbefExports(PAIRED_MONTH,exports);
  if(reviewed.summary.distinctTasks!==result.distinctTasks){
    throw new Error('Resumo mensal divergente.');
  }
  console.log('PAREADO_CONFERENCIA_AGREGADA: '+JSON.stringify({
    uniqueCnpjs:reviewed.summary.uniqueCnpjs,
    companiesOnlyVerification:reviewed.summary.companiesOnlyVerification,
    companiesOnlyDeclaration:reviewed.summary.companiesOnlyDeclaration,
    companiesBoth:reviewed.summary.companiesBoth,
    categories:reviewed.summary.categories,
    statusCounts:reviewed.summary.statusCounts,
    declarationDeliveryVerified:false,
    allUsersProven:false,
  }));
  stage='PRE_SYNC_SOMENTE_LEITURA';
  const preview=previewEbefSyncReadOnly(reviewed.tasks);
  if(preview.inserts!==null||preview.updates!==null||
     preview.writesPerformed!==false||preview.actualDatabaseCompared!==false){
    throw new Error('Preview anunciou alteracoes sem base confirmada.');
  }
  console.log('PAREADO_PRE_SYNC_SEM_BANCO: '+JSON.stringify(preview));
  stage='PLANEJAMENTO_RECONCILIACAO_INERTE';
  const reconciliation=planEbefReconciliationOffline(reviewed.tasks);
  if(reconciliation.inserts!==null||reconciliation.updates!==null||
     reconciliation.writesPerformed!==false||
     reconciliation.applyAuthorized!==false){
    throw new Error('Reconciliação sem snapshot afirmou operacoes indevidas.');
  }
  console.log('PAREADO_PLANO_OFFLINE_SEM_BANCO: '+JSON.stringify({
    proposedRecords:reconciliation.proposedRecords,
    inserts:reconciliation.inserts,updates:reconciliation.updates,
    unchanged:reconciliation.unchanged,wouldDelete:0,
    needsReadOnlySnapshot:true,applyAuthorized:false,writesPerformed:false,
    concurrencyRechecked:false,
  }));
  if(saveLocal){
    stage='SALVAR_RELATORIO_LOCAL';
    const saved=await saveEbefLocalWorkbook(reviewed);
    console.log('PAREADO_ARQUIVO_LOCAL: reports/'+saved.filename+
      ' | empresas='+saved.companies+' | tarefas='+saved.records);
    console.log('PAREADO: Relatorio contem dados confidenciais. Guardar localmente; nunca commitar.');
  }
  console.log('PAREADO: AUDITORIA LOCAL CONCLUIDA. SEM SINCRONIZACAO. '+
    'A cobertura de todos Usuarios NAO foi comprovada.');
}catch{
  // Nao expor nomes, links, DOM nem dados de clientes em excecoes externas.
  console.error('PAREADO_FALHA_ETAPA: '+stage);
  console.error('PAREADO: interrompido; nenhum dado enviado a LUCE.');
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Encerrar Chromium',()=>context.close(),8000);}
    catch{
      console.error('PAREADO: nao foi possivel confirmar encerramento Chromium.');
      process.exitCode=1;
    }
  }
  if(dir){
    try{
      await rm(dir,{recursive:true,force:true});
      console.log('PAREADO: pasta temporaria dos XLSX excluida.');
    }catch{
      console.error('PAREADO: ATENCAO: exclusao da pasta temporaria nao confirmada.');
      process.exitCode=1;
    }
  }
}
