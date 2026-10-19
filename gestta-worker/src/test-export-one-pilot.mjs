// PILOTO EXPLORATORIO de UM XLSX (usuarios renderizados apenas, sem prova da cobertura global).
// Não aciona endpoints da Luce, não lê cookies, não altera tarefas, status ou
// prazos. Exporta apenas após conferir todos os filtros e a data autorizada.
import 'dotenv/config';
import {chromium} from 'playwright';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ensureTasksView} from './task-navigation.mjs';
import {selectEbefTasks} from './task-filter.mjs';
import {DATE_SELECTORS,applyDateWindow,readControlText} from './date-picker.mjs';
import {openAdvancedFilters} from './advanced-open-locator.mjs';
import {inspectAdvancedStatuses,ensureAllAdvancedStatuses} from './advanced-status-locators.mjs';
import {inspectTaskTypes,ensureAllTaskTypes} from './advanced-task-type-locators.mjs';
import {openDepartmentPicker,clickDepartmentSelectAll} from './department-controls.mjs';
import {inspectScopedDepartments} from './department-scope.mjs';
import {REQUIRED_DEPARTMENTS} from './advanced-filter-config.mjs';
import {assertDepartmentSelection,assertSelectedStatusesAndTypes} from './apply-test-guards.mjs';
import {clickAdvancedApplyButton} from './advanced-action-locators.mjs';
import {parseGesttaXlsx} from './parse-report.mjs';
import {
  assertClientsAndDataMeta,verifiedExportButton,
} from './export-test-guards.mjs';
import {withDeadline} from './timeout-utils.mjs';
import {parsePilotExportOptions} from './pilot-export-options.mjs';
import {
  inspectUserDropdownTopology,openUsersFilterForInspection,inspectUsersPopup,
} from './users-filter-inspection.mjs';
import {validateUsersBeforeSelect,selectUsersAllVisualOnly} from './users-select-all-guards.mjs';
import {assertAllRenderedUsersChecked,assertUserSelectionPersisted}
  from './users-integrated-guards.mjs';
import {verifyEbefCheckboxesAfterApply} from './ebef-selection-after-apply.mjs';

async function userTopology(page){
  const result=await withDeadline('Localizar filtro Usuarios',
    ()=>inspectUserDropdownTopology(page),15000);
  if(!result.topologyConfirmed)throw new Error('Filtro Usuarios ambiguo; sem download.');
  return result;
}
async function openUsers(page,topology){
  const id=await openUsersFilterForInspection(page,topology);
  await page.waitForTimeout(1500);
  const state=await withDeadline('Ler checkbox Usuarios',
    ()=>inspectUsersPopup(page,id),15000);
  if(!state.found)throw new Error('Menu Usuarios nao encontrado; sem download.');
  return {id,state};
}
async function closeUsers(page,topology,id){
  await openUsersFilterForInspection(page,topology);
  if(await page.locator('#'+id).getAttribute('aria-expanded')!=='false'){
    throw new Error('Menu Usuarios nao fechou; sem download.');
  }
}


// Somente execução explicitamente autorizada: um relatório e um intervalo.
const {window,expected,expectedRenderedUsers}=parsePilotExportOptions(process.argv.slice(2));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br') {
  throw new Error('Origem do Gestta nao autorizada.');
}

const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context,dir;
let lastStage='INICIALIZACAO';
function markStage(name){
  lastStage=name;
  console.log('PILOTO_ETAPA: '+name);
}
const compact=text=>String(text).replace(/\s/g,'');
try{
  console.log('PILOTO XLSX: apenas usuarios renderizados, cobertura global NAO comprovada.');
  console.log('PILOTO XLSX: requer aceite explicito; NENHUM DADO ENVIADO A LUCE.');
  console.log('XLSX UNICO: janela autorizada='+expected);
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:true,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('Tarefas E-BEF nao confirmadas 3/3.');
  console.log('XLSX UNICO: tarefas=3/3');

  markStage('VERIFICAR_CLIENTES_E_DATAMETA');
  await assertClientsAndDataMeta(page);
  markStage('LOCALIZAR_USUARIOS');
  const beforeTopology=await userTopology(page);
  markStage('ABRIR_MENU_USUARIOS');
  const {id:beforeId,state:beforeUsers}=await openUsers(page,beforeTopology);
  console.log('PILOTO_USUARIOS_ANTES: '+JSON.stringify({
    found:beforeUsers.found,association:beforeUsers.menuAssociation,
    inputs:beforeUsers.inputCheckboxCount,checked:beforeUsers.checkedCount,
    unchecked:beforeUsers.uncheckedCount,controlCount:beforeUsers.controlCount,
  }));
  if(beforeUsers.uncheckedCount>0){
    markStage('VALIDAR_SELECAO_USUARIOS');
    validateUsersBeforeSelect(beforeUsers);
    markStage('SELECIONAR_USUARIOS');
    await withDeadline('Selecionar Usuarios renderizados',
      ()=>selectUsersAllVisualOnly(page,beforeId,beforeUsers),45000);
  }
  markStage('CONFERIR_USUARIOS');
  const confirmedBefore=await withDeadline('Conferir Usuarios renderizados',
    ()=>inspectUsersPopup(page,beforeId),15000);
  const countBefore=assertAllRenderedUsersChecked(confirmedBefore);
  if(countBefore!==expectedRenderedUsers){
    throw new Error('Total de usuarios renderizados diferente do piloto homologado; sem download.');
  }
  markStage('FECHAR_MENU_USUARIOS');
  await closeUsers(page,beforeTopology,beforeId);
  console.log('PILOTO XLSX: usuarios renderizados antes='+countBefore+'/'+countBefore+
    '; abrangencia global NAO comprovada.');

  markStage('VERIFICAR_PERIODO');
  const dateRange=page.locator(process.env.GESTTA_DATE_RANGE_SELECTOR?.trim()||DATE_SELECTORS.range);
  if(await dateRange.count()!==1 || !(await dateRange.isVisible())) {
    throw new Error('Campo de datas ausente ou ambiguo.');
  }
  if(compact(await readControlText(dateRange))!==compact(expected)) {
    await applyDateWindow(page,window);
  }
  if(compact(await readControlText(dateRange))!==compact(expected)) {
    throw new Error('Datas do Gestta nao correspondem a janela autorizada.');
  }
  console.log('XLSX UNICO: periodo confirmado='+expected);

  markStage('FILTROS_AVANCADOS');
  await openAdvancedFilters(page);
  await ensureAllAdvancedStatuses(page);
  await ensureAllTaskTypes(page);
  await openDepartmentPicker(page);
  const before=await withDeadline('Ler 21 departamentos ANTES',
    ()=>inspectScopedDepartments(page),20000);
  if(!before.found || before.candidateScopes!==1 ||
     before.rowCount!==REQUIRED_DEPARTMENTS.length ||
     before.recognizedUnique!==REQUIRED_DEPARTMENTS.length ||
     !before.allExpectedPresent || before.unknownCount!==0 ||
     before.stateCounts.indeterminado!==0) {
    throw new Error('Escopo de departamentos incompleto. Nenhum XLSX sera baixado.');
  }
  if(before.stateCounts.marcado!==REQUIRED_DEPARTMENTS.length){
    await clickDepartmentSelectAll(page);
    await page.waitForTimeout(350);
  }
  const after=await withDeadline('Ler 21 departamentos DEPOIS',
    ()=>inspectScopedDepartments(page),20000);
  assertDepartmentSelection(after);
  assertSelectedStatusesAndTypes(
    await inspectAdvancedStatuses(page),
    await inspectTaskTypes(page)
  );
  console.log('XLSX UNICO: filtros avancados=4 status / 3 tipos / 21 departamentos.');
  markStage('APLICAR_FILTROS');
  await clickAdvancedApplyButton(page);
  await page.waitForTimeout(1500);

  if(compact(await readControlText(dateRange))!==compact(expected)){
    throw new Error('Botao Filtrar alterou o periodo autorizado. Exportacao interrompida.');
  }
  await assertClientsAndDataMeta(page);
  markStage('RECONFERIR_USUARIOS');
  const afterTopology=await userTopology(page);
  const {id:afterId,state:afterUsers}=await openUsers(page,afterTopology);
  const persisted=assertUserSelectionPersisted(countBefore,afterUsers);
  await closeUsers(page,afterTopology,afterId);
  console.log('PILOTO XLSX: usuarios renderizados depois='+persisted.checkedCount+'/'+
    persisted.visibleCheckboxes+' (nao prova todos cadastrados).');

  markStage('RECONFERIR_TAREFAS_EBEF');
  const tasksAfter=await withDeadline('Conferir tarefas EBEF apos Filtrar',
    ()=>verifyEbefCheckboxesAfterApply(page),60000);
  if(tasksAfter.checked!==3 || tasksAfter.found!==3){
    throw new Error('Tres tarefas EBEF nao confirmadas apos Filtrar.');
  }
  console.log('PILOTO XLSX: tarefas EBEF apos Filtrar=3/3 confirmadas.');

  markStage('VERIFICAR_BOTAO_EXPORTAR');
  const button=await verifiedExportButton(page);
  console.log('PILOTO XLSX: recorte exploratorio autorizado; iniciando UM download, sem sync.');

  // A exportação é uma ação autorizada apenas pelo --confirm-download;
  // os bytes ficam em diretório temporário privado e não são retransmitidos.
  markStage('DOWNLOAD_UNICO');
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:120000}),
    button.click({timeout:30000}),
  ]);
  if(!/\.xlsx$/i.test(download.suggestedFilename())) {
    throw new Error('Extensao diferente de XLSX. Validacao cancelada.');
  }
  dir=await mkdtemp(join(tmpdir(),'luce-ebef-homolog-'));
  const filepath=join(dir,'gestta-homologacao.xlsx');
  await download.saveAs(filepath);
  console.log('XLSX UNICO: download XLSX recebido e salvo em pasta temporaria.');
  markStage('VALIDAR_XLSX');
  let validated;
  try{
    validated=await parseGesttaXlsx(filepath,{expectedWindow:window,allowEmpty:false});
  }catch(error){
    // Não imprimir conteúdo de linha, cliente, documento ou URL em logs.
    const message=String(error.message||'');
    const kind=/colunas obrigat|faltam colunas/i.test(message)?'colunas_incompativeis':
      /sem Id|Id da tarefa|gestta/i.test(message)?'id_nao_validado':
      /Data Meta|fora do per[ií]odo|Vencimento/i.test(message)?'data_fora_do_periodo':
      /Linha\s+\d+/i.test(message)?'estrutura_de_linha_incompativel':'xlsx_incompativel';
    throw new Error('Validador XLSX interrompeu: '+kind+
      '. Arquivo temporario sera descartado; sem sincronizacao.');
  }
  const keyCount=new Set(validated.map(x=>x.source_key)).size;
  if(keyCount!==validated.length) throw new Error('IDs duplicados; nao homologado.');
  const types=validated.reduce((a,task)=>{
    a[task.tipo_tarefa]=(a[task.tipo_tarefa]||0)+1;
    return a;
  },{});
  console.log('XLSX UNICO: formato e identificadores validados; registros='+validated.length+
    '; categorias='+JSON.stringify(types)+'; ids_unicos='+keyCount);
  console.log('PILOTO XLSX: SUCESSO LOCAL. AMOSTRA NAO COMPROVA ABRANGENCIA GLOBAL; SEM ENVIO A LUCE.');
}catch(error){
  // Nunca expor conteudo bruto do Gestta nos logs de erro.
  console.error('PILOTO_FALHA_ETAPA: '+lastStage);
  // Erros de Playwright às vezes incluem texto DOM/URL em mensagens.
  // Somente erros explícitos do nosso validador são expostos literalmente.
  const known=String(error.message||'');
  if(/^(Tarefas E-BEF|Campo de datas|Datas do Gestta|Escopo de departamentos|Botao Filtrar|Extensao diferente|Validador XLSX|IDs duplicados|Filtro |Botao XLSX|Estrutura unica|Filtro de tarefas|Filtro superior|Origem do Gestta)/.test(known)){
    console.error('FALHA XLSX UNICO: '+known.slice(0,240));
  }else {
    console.error('FALHA XLSX UNICO: etapa nao concluida; verificar sessao, controle e layout do Gestta. Sem sincronizacao.');
  }
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechamento Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium demorou a encerrar; feche somente a instancia de teste.');}
  }
  if(dir){
    try{await rm(dir,{recursive:true,force:true});console.log('XLSX UNICO: arquivo temporario excluido.');}
    catch{console.error('ATENCAO: nao foi possivel confirmar a exclusao da pasta temporaria local de homologacao.');}
  }
}
