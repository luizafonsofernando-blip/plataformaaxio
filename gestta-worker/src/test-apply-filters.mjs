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
import { assertDepartmentSelection, assertSelectedStatusesAndTypes } from './apply-test-guards.mjs';
import { clickAdvancedApplyButton, verifyAdvancedApplyButton } from './advanced-action-locators.mjs';
import { readControlText, DATE_SELECTORS, applyDateWindow } from './date-picker.mjs';
import { withDeadline } from './timeout-utils.mjs';
import {parseApplyPreflightOptions} from './export-preflight-options.mjs';
import {inspectEbefFilterLabelSafely} from './ebef-summary-diagnostic.mjs';
import {
  assertClientsAndDataMeta,verifiedExportButton,
} from './export-test-guards.mjs';
import {verifyEbefCheckboxesAfterApply} from './ebef-selection-after-apply.mjs';
import {
  inspectUserDropdownTopology,openUsersFilterForInspection,inspectUsersPopup,
} from './users-filter-inspection.mjs';
import {
  validateUsersBeforeSelect,selectUsersAllVisualOnly,
} from './users-select-all-guards.mjs';
import {
  assertAllRenderedUsersChecked,assertUserSelectionPersisted,
} from './users-integrated-guards.mjs';

// O teste padrao continua sem alterar selecao de Usuarios.
// A variante integrada exige permissao explicita, mesmo sem exportacao.
const {verifyUsers,preflight}=parseApplyPreflightOptions(process.argv.slice(2));

const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br'){
  throw new Error('Endereço não autorizado; somente o Gestta pode ser acessado.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});


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
  let usersBeforeApply=null;
  if(verifyUsers){
    const topology=await withDeadline('Identificar controle Usuarios',
      ()=>inspectUserDropdownTopology(page),15000);
    if(!topology.topologyConfirmed){
      throw new Error('Controle Usuarios nao confirmado; nao acionar Filtrar.');
    }
    const id=await openUsersFilterForInspection(page,topology);
    await page.waitForTimeout(1500);
    const before=await withDeadline('Ler Usuarios antes',
      ()=>inspectUsersPopup(page,id),15000);
    if(!before.found){
      throw new Error('Menu Usuarios nao confirmado; nao acionar Filtrar.');
    }
    if(before.uncheckedCount>0){
      validateUsersBeforeSelect(before);
      await withDeadline('Marcar checkboxes visiveis Usuarios',
        ()=>selectUsersAllVisualOnly(page,id,before),45000);
    }
    const confirmed=await withDeadline('Confirmar Usuarios antes de Filtrar',
      ()=>inspectUsersPopup(page,id),15000);
    usersBeforeApply=assertAllRenderedUsersChecked(confirmed);
    console.log('APLICAR: usuarios_visiveis_antes='+usersBeforeApply+'/'+usersBeforeApply);
    // Fechar menu sem acionar X ou qualquer outro filtro.
    await openUsersFilterForInspection(page,topology);
    if(await page.locator('#'+id).getAttribute('aria-expanded')!=='false'){
      throw new Error('Menu Usuarios nao fechou; nao acionar Filtrar.');
    }
  }

  const dateRange=page.locator(process.env.GESTTA_DATE_RANGE_SELECTOR?.trim()||DATE_SELECTORS.range);
  if(await dateRange.count()!==1 || !(await dateRange.isVisible())){
    throw new Error('Campo de periodo nao esta visivel ou e ambiguo.');
  }
  let dateBefore=(await readControlText(dateRange)).trim();
  if(!/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(dateBefore)){
    throw new Error('Periodo atual nao reconhecido; nao aplicar filtro sem referencia.');
  }
  console.log('APLICAR: periodo_antes='+dateBefore);
  if(preflight){
    const compact=x=>String(x).replace(/\s/g,'');
    if(compact(dateBefore)!==compact(preflight.expected)){
      await withDeadline('Configurar periodo de preflight',
        ()=>applyDateWindow(page,preflight.window),45000);
      dateBefore=(await readControlText(dateRange)).trim();
    }
    if(compact(dateBefore)!==compact(preflight.expected)){
      throw new Error('Preflight: Data Meta nao confirmou janela autorizada. Sem download.');
    }
    await assertClientsAndDataMeta(page);
    console.log('PREFLIGHT: periodo='+preflight.expected+'; clientes e Data Meta confirmados.');
  }

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
  if(verifyUsers){
    const topology=await withDeadline('Localizar Usuarios apos Filtrar',
      ()=>inspectUserDropdownTopology(page),15000);
    if(!topology.topologyConfirmed){
      throw new Error('Controle Usuarios nao localizado apos Filtrar.');
    }
    const id=await openUsersFilterForInspection(page,topology);
    await page.waitForTimeout(1500);
    const state=await withDeadline('Ler Usuarios apos Filtrar',
      ()=>inspectUsersPopup(page,id),15000);
    const persisted=assertUserSelectionPersisted(usersBeforeApply,state);
    console.log('APLICAR: usuarios_apos_filtrar='+persisted.checkedCount+'/'+
      persisted.visibleCheckboxes+' CHECKBOXES RENDERIZADOS.');
    console.log('APLICAR: todos usuarios cadastrados NAO comprovados; sem exportacao.');
    if(preflight){
      await openUsersFilterForInspection(page,topology);
      if(await page.locator('#'+id).getAttribute('aria-expanded')!=='false'){
        throw new Error('Preflight: menu Usuarios nao fechou. Sem download.');
      }
    }
  }
  if(preflight){
    await assertClientsAndDataMeta(page);
    // Apenas leitura: registrar estrutura de dropdowns (sem texto bruto)
    // antes da guarda rigorosa. A falha continua bloqueando a homologacao.
    const taskSummary=await withDeadline('Diagnosticar resumo EBEF apos Filtrar',
      ()=>inspectEbefFilterLabelSafely(page),15000);
    console.log('PREFLIGHT_EBEF_DIAG: '+JSON.stringify(taskSummary));
    const checkedTasks=await withDeadline('Verificar 3 checkboxes EBEF depois de Filtrar',
      ()=>verifyEbefCheckboxesAfterApply(page),60000);
    console.log('PREFLIGHT: tarefas EBEF apos Filtrar='+checkedTasks.checked+'/'+checkedTasks.found+' checkboxes.');
    await verifiedExportButton(page);
    console.log('PREFLIGHT: 3 EBEF marcadas no menu, usuarios renderizados, Data Meta e botao Exportar reconfirmados.');
    console.log('PREFLIGHT: APROVADO SEM DOWNLOAD. Abrangencia global de Usuarios ainda NAO comprovada.');
  }
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
