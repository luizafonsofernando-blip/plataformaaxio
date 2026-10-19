// Reproduz somente o inicio do piloto XLSX para localizar bloqueios,
// SEM Filtrar, SEM selecionar Usuarios, SEM download, SEM transmissao.
// Logs exclusivamente dados codificados, sem nomes de clientes/usuarios.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {inspectGlobalFilters} from './global-filters-diagnostic.mjs';
import {inspectUserDropdownTopology,openUsersFilterForInspection,inspectUsersPopup} from './users-filter-inspection.mjs';
import {inspectUsersCheckboxKinds} from './users-checkbox-kinds-diagnostic.mjs';
import {assertClientsAndDataMeta} from './export-test-guards.mjs';
import {withDeadline} from './timeout-utils.mjs';

if(process.argv.length!==2){
  throw new Error('Este diagnostico nao aceita parametros.');
}
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Origem Gestta nao autorizada.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});

async function inspectStage(page,label){
  const info=await withDeadline('Ler globais '+label,
    ()=>inspectGlobalFilters(page),20000);
  // Apenas correspondencias, visibilidade e contagens.
  console.log('DIAG_PILOTO_'+label+'_GLOBAIS: '+JSON.stringify({
    clients:info.textualMatches?.clients,
    dataMeta:info.textualMatches?.dataMeta,
    users:info.textualMatches?.users,
    dateRangeVisible:info.dateRangeVisible,
    totalTopDropdowns:info.totalTopDropdowns,
  }));
  let globalsOk=false;
  try{
    await assertClientsAndDataMeta(page);
    globalsOk=true;
  }catch{
    console.log('DIAG_PILOTO_'+label+'_CLIENTES_DATAMETA: NAO_CONFIRMADOS');
  }
  if(globalsOk){
    console.log('DIAG_PILOTO_'+label+'_CLIENTES_DATAMETA: CONFIRMADOS');
  }
  const users=await withDeadline('Ler topologia Usuarios '+label,
    ()=>inspectUserDropdownTopology(page),15000);
  console.log('DIAG_PILOTO_'+label+'_USUARIOS: '+JSON.stringify({
    topologyConfirmed:users.topologyConfirmed,
    clients:users.clients,
    candidates:users.candidates,
    dateVisible:users.dateVisible,
    labelKind:users.labelKind,
  }));
  return {globalsOk,usersTopologyConfirmed:users.topologyConfirmed};
}

let context;
try{
  console.log('DIAG_PILOTO: SOMENTE LEITURA; sem usuarios, Filtrar, XLSX ou sync.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const page=context.pages()[0]||await context.newPage();
  await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const tasksPage=await ensureTasksView(context);
  const selected=await selectEbefTasks(tasksPage);
  if(selected.selected!==3){
    throw new Error('Selecao EBEF diferente de 3/3.');
  }
  console.log('DIAG_PILOTO: tarefas EBEF=3/3.');
  const initial=await inspectStage(tasksPage,'IMEDIATO');
  if(!initial.globalsOk || !initial.usersTopologyConfirmed){
    await tasksPage.waitForTimeout(2000);
    const retry=await inspectStage(tasksPage,'APOS_2S');
    if(retry.globalsOk && retry.usersTopologyConfirmed){
      console.log('DIAG_PILOTO: controle ficou disponivel apos espera; verificar timing.');
    }else {
      console.log('DIAG_PILOTO: controle ainda nao confirmado apos espera.');
    }
  }
  // Reproduz o proximo passo do piloto, ainda SEM alterar um unico checkbox.
  const topology=await withDeadline('Inspecao final da topologia Usuarios',
    ()=>inspectUserDropdownTopology(tasksPage),15000);
  if(topology.topologyConfirmed){
    console.log('DIAG_PILOTO_USUARIOS_MENU: ABRINDO_APENAS_PARA_LEITURA');
    const id=await openUsersFilterForInspection(tasksPage,topology);
    await tasksPage.waitForTimeout(1500);
    const popup=await withDeadline('Ler popup Usuarios',
      ()=>inspectUsersPopup(tasksPage,id),15000);
    console.log('DIAG_PILOTO_USUARIOS_POPUP: '+JSON.stringify({
      found:popup.found===true,
      association:popup.menuAssociation??'nao_confirmada',
      reason:popup.found?'confirmado':'nao_confirmado',
      inputCheckboxCount:popup.inputCheckboxCount??0,
      checkedCount:popup.checkedCount??0,
      uncheckedCount:popup.uncheckedCount??0,
      unknownInputCount:popup.unknownInputCount??0,
      disabledInputCount:popup.disabledInputCount??0,
      controlCount:popup.controlCount??0,
    }));
    if(popup.found){
      const classified=await withDeadline('Classificar tipos de checkbox sem nomes',
        ()=>inspectUsersCheckboxKinds(tasksPage,id),15000);
      console.log('DIAG_PILOTO_USUARIOS_CHECKBOX_TIPOS: '+JSON.stringify(classified));
      console.log('DIAG_PILOTO_USUARIOS_POPUP: LEITURA_CONFIRMADA_SEM_MARCAR');
    }else{
      console.log('DIAG_PILOTO_USUARIOS_POPUP: LEITURA_INCOMPLETA_SEM_MARCAR');
    }
  }else{
    console.log('DIAG_PILOTO_USUARIOS_POPUP: TOPOLOGIA_NAO_CONFIRMADA_SEM_ABRIR');
  }
  console.log('DIAG_PILOTO: FIM. Nenhum download e nenhuma sincronizacao.');
}catch{
  console.error('DIAG_PILOTO: falha na navegacao ou leitura. Nenhum download ou sync.');
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('DIAG_PILOTO: Chromium demorou a fechar.');}
  }
}
