// Homologação de UM relatório Gestta XLSX, com descarte local obrigatório.
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
  parseSingleExportOptions,assertGlobalExportFilters,
  assertEbefSelectionPreserved,verifiedExportButton,
} from './export-test-guards.mjs';
import {withDeadline} from './timeout-utils.mjs';

// Somente execução explicitamente autorizada: um relatório e um intervalo.
const {window,expected}=parseSingleExportOptions(process.argv.slice(2));
const target=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(target.protocol!=='https:'||target.hostname!=='app.gestta.com.br') {
  throw new Error('Origem do Gestta nao autorizada.');
}

const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context,dir;
const compact=text=>String(text).replace(/\s/g,'');
try{
  console.log('XLSX UNICO: homologacao local, SEM ENVIO A LUCE; arquivo sera apagado ao final.');
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

  await assertGlobalExportFilters(page);
  console.log('XLSX UNICO: todos clientes / todos usuarios / Data Meta confirmados.');

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
  await clickAdvancedApplyButton(page);
  await page.waitForTimeout(1500);

  if(compact(await readControlText(dateRange))!==compact(expected)){
    throw new Error('Botao Filtrar alterou o periodo autorizado. Exportacao interrompida.');
  }
  await assertGlobalExportFilters(page);
  await assertEbefSelectionPreserved(page);
  const button=await verifiedExportButton(page);
  console.log('XLSX UNICO: controles e periodo reconfirmados; iniciando UM download.');

  // A exportação é uma ação autorizada apenas pelo --confirm-download;
  // os bytes ficam em diretório temporário privado e não são retransmitidos.
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
  let validated;
  try{
    validated=await parseGesttaXlsx(filepath,{expectedWindow:window,allowEmpty:true});
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
  console.log('XLSX UNICO: SUCESSO LOCAL. NENHUM DADO ENVIADO A LUCE.');
}catch(error){
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
