// Homologação do botão Filtrar após selecionar SOMENTE filtros visuais E-BEF.
// Usa Chromium headless; não exporta XLSX, não transmite à Luce, não altera
// tarefas, prazos ou status de tarefas individuais.
// A execução é separada do teste integrado já aprovado.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { openAdvancedFilters } from './advanced-open-locator.mjs';
import { inspectAdvancedStatuses, ensureAllAdvancedStatuses } from './advanced-status-locators.mjs';
import { inspectTaskTypes, ensureAllTaskTypes } from './advanced-task-type-locators.mjs';
import { openDepartmentPicker, clickDepartmentSelectAll } from './department-controls.mjs';
import { inspectScopedDepartments } from './department-scope.mjs';
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';
import { clickAdvancedApplyButton, verifyAdvancedApplyButton } from './advanced-action-locators.mjs';
import { readControlText, DATE_SELECTORS } from './date-picker.mjs';
import { withDeadline } from './timeout-utils.mjs';

const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Endereço não autorizado; somente o Gestta pode ser acessado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});

export function assertDepartmentSelection(info) {
  const n=REQUIRED_DEPARTMENTS.length;
  if(!info.found || info.candidateScopes!==1 || info.rowCount!==n ||
     info.recognizedUnique!==n || !info.allExpectedPresent ||
     info.unknownCount!==0 || info.stateCounts.indeterminado!==0 ||
     info.stateCounts.marcado!==n || info.stateCounts.desmarcado!==0){
    throw new Error('Selecao dos 21 departamentos nao foi comprovada. '+
      'Nao acionar Filtrar.');
  }
}

export function assertSelectedStatusesAndTypes(statuses,types) {
  if(Object.keys(statuses).length!==4 || Object.values(statuses).some(item=>!item.checked) ||
     Object.keys(types).length!==3 || Object.values(types).some(item=>!item.checked)){
    throw new Error('Um status ou tipo de tarefa nao permaneceu selecionado; '+
      'nao acionar Filtrar.');
  }
}

let context;
try{
  console.log('TESTE APLICAR FILTROS: somente filtros visuais, sem XLSX ou sincronizacao.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const taskResult=await selectEbefTasks(page);
  if(taskResult.selected!==3)throw new Error('Tarefas E-BEF nao confirmadas: 3/3.');
  console.log('APLICAR: tarefas=3/3');

  const dateRange=page.locator(process.env.GESTTA_DATE_RANGE_SELECTOR?.trim()||DATE_SELECTORS.range);
  if(await dateRange.count()!==1 || !(await dateRange.isVisible())){
    throw new Error('Campo de periodo nao esta visivel ou e ambiguo.');
  }
  const dateBefore=(await readControlText(dateRange)).trim();
  if(!/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(dateBefore)){
    throw new Error('Periodo atual nao reconhecido; nao aplicar filtro sem referencia.');
  }
  console.log('APLICAR: periodo_antes='+dateBefore);

  await openAdvancedFilters(page);
  await ensureAllAdvancedStatuses(page);
  await ensureAllTaskTypes(page);
  console.log('APLICAR: status=4/4; tipos=3/3');

  await openDepartmentPicker(page);
  const before=await withDeadline('Escopo dos departamentos ANTES',
    ()=>inspectScopedDepartments(page),20000);
  if(!before.found || before.candidateScopes!==1 || before.rowCount!==REQUIRED_DEPARTMENTS.length ||
     !before.allExpectedPresent || before.unknownCount!==0 ||
     before.stateCounts.indeterminado!==0){
    throw new Error('Escopo dos 21 departamentos ambiguo ou incompleto; Filtrar nao foi acionado.');
  }
  if(before.stateCounts.marcado!==REQUIRED_DEPARTMENTS.length){
    await clickDepartmentSelectAll(page);
    await page.waitForTimeout(350);
  }
  const after=await withDeadline('Escopo dos departamentos DEPOIS',
    ()=>inspectScopedDepartments(page),20000);
  assertDepartmentSelection(after);
  console.log('APLICAR: departamentos=21/21');

  const statuses=await inspectAdvancedStatuses(page);
  const types=await inspectTaskTypes(page);
  assertSelectedStatusesAndTypes(statuses,types);
  console.log('APLICAR: verificacao_final=4 status / 3 tipos / 21 departamentos');

  // Confirmar a presença de apenas um botão Filtrar antes do clique.
  await verifyAdvancedApplyButton(page);
  console.log('APLICAR: botao Filtrar unico e visivel; aplicando filtros visuais.');
  await clickAdvancedApplyButton(page);
  await page.waitForTimeout(1500);

  if(await dateRange.count()!==1 || !(await dateRange.isVisible())){
    throw new Error('Apos Filtrar, campo de periodo deixou de existir/ser visivel.');
  }
  const dateAfter=(await readControlText(dateRange)).trim();
  if(dateAfter.replace(/\s/g,'')!==dateBefore.replace(/\s/g,'')){
    throw new Error('O botao Filtrar mudou o periodo exibido; revisar antes de exportar.');
  }
  console.log('APLICAR: periodo_depois='+dateAfter);
  console.log('APLICAR: botao Filtrar acionado; tela de tarefas e periodo preservados.');
  console.log('APLICAR: SUCESSO SEM DOWNLOAD, SEM EXPORTACAO E SEM SINCRONIZACAO.');
}catch(error){
  console.error('FALHA NO TESTE DE APLICACAO: '+error.message);
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Encerrar Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou a fechar; encerre apenas a instancia de teste.');}
  }
}
