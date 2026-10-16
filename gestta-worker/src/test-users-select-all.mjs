// Executa SOMENTE o "Selecionar todos" dentro do filtro visual Usuários.
// Exige opt-in explícito. Nenhum download, XLSX, alteração de tarefas ou sync.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {
  inspectUserDropdownTopology,openUsersFilterForInspection,inspectUsersPopup,
} from './users-filter-inspection.mjs';
import {
  requireSelectAllConsent,selectUsersAllVisualOnly,
  validateUsersBeforeSelect,
} from './users-select-all-guards.mjs';
import {withDeadline} from './timeout-utils.mjs';

requireSelectAllConsent(process.argv.slice(2));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Apenas o dominio Gestta autorizado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
try{
  console.log('USERS SELECT: apenas filtros visuais; sem Filtrar, sem XLSX e sem sincronizacao.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('Tarefas E-BEF nao confirmadas 3/3.');
  console.log('USERS SELECT: tarefas=3/3');
  const topology=await withDeadline('Identificar filtro Usuarios',
    ()=>inspectUserDropdownTopology(page),15000);
  if(!topology.topologyConfirmed)throw new Error('Filtro Usuarios ambiguo.');
  const id=await openUsersFilterForInspection(page,topology);
  await page.waitForTimeout(1500);
  const before=await withDeadline('Ler estado de Usuarios',
    ()=>inspectUsersPopup(page,id),15000);
  console.log('USERS SELECT: antes='+JSON.stringify({
    encontrado:before.found,associacao:before.menuAssociation,
    checkedCount:before.checkedCount,uncheckedCount:before.uncheckedCount,
    inputCheckboxCount:before.inputCheckboxCount,
  }));
  validateUsersBeforeSelect(before);
  const output=await withDeadline('Selecionar todos Usuarios (visual)',
    ()=>selectUsersAllVisualOnly(page,id,before),45000);
  console.log('USERS SELECT: depois='+JSON.stringify(output));
  console.log('USERS SELECT: CHECKBOXES VISIVEIS CONFIRMADOS. SEM FILTRAR, SEM DOWNLOAD, SEM XLSX, SEM SINCRONIZAR.');
}catch(error){
  // Não revelar mensagens internas que possam conter nomes de usuários.
  const message=String(error.message||'');
  const safe=/^(Menu Usuarios nao validado|Acao Selecionar todos bloqueada|Link Selecionar todos|O menu Usuarios mudou|O Gestta nao confirmou|Filtro Usuarios ambiguo|Tarefas E-BEF)/.test(message);
  console.error('FALHA USERS SELECT: '+(safe?message.slice(0,200):
    'Nao foi possivel concluir a selecao visual de usuarios; nenhuma exportacao realizada.'));
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou a fechar; feche apenas a instancia de teste.');}
  }
}
