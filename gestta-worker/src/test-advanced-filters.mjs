// Homologação integrada dos filtros visuais E-BEF, SEM exportação ou sync.
// O teste NÃO clica em "Filtrar", não faz download e não altera tarefas.
// Executa Chromium headless para contornar congelamento da janela do Windows.
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
import { withDeadline } from './timeout-utils.mjs';

const u = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (u.protocol !== 'https:' || u.hostname !== 'app.gestta.com.br') {
  throw new Error('Endereço do navegador não autorizado.');
}
const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, {recursive:true,mode:0o700});

function requireCompleteDepartmentScope(info, stage) {
  const n=REQUIRED_DEPARTMENTS.length;
  if(!info.found || info.candidateScopes!==1 || info.rowCount!==n ||
     info.recognizedUnique!==n || !info.allExpectedPresent ||
     info.unknownCount!==0 || info.stateCounts.indeterminado!==0) {
    throw new Error(stage+': escopo de Departamento não confirmado com exatamente '+
      n+' itens válidos. Nenhum relatório será exportado.');
  }
  return info;
}

let context;
try {
  console.log('TESTE INTEGRADO E-BEF: somente filtros visuais, sem exportacao ou transmissao.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0] || await context.newPage();
  await first.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('As tres tarefas E-BEF nao foram confirmadas.');
  console.log('INTEGRADO: tarefas E-BEF=3/3');

  await openAdvancedFilters(page);
  const statusesBefore=await withDeadline('Leitura dos 4 status',
    () => inspectAdvancedStatuses(page),20000);
  console.log('INTEGRADO: status encontrados='+Object.keys(statusesBefore).length+'/4');
  await ensureAllAdvancedStatuses(page);
  console.log('INTEGRADO: status selecionados=4/4');

  const typesBefore=await withDeadline('Leitura dos 3 tipos',
    () => inspectTaskTypes(page),20000);
  console.log('INTEGRADO: tipos encontrados='+Object.keys(typesBefore).length+'/3');
  await ensureAllTaskTypes(page);
  console.log('INTEGRADO: tipos selecionados=3/3');

  await openDepartmentPicker(page);
  const before=requireCompleteDepartmentScope(
    await withDeadline('Leitura dos departamentos ANTES',
      () => inspectScopedDepartments(page),20000),
    'ANTES');
  console.log('INTEGRADO: departamento_escopo=1; itens='+before.rowCount+
    '; marcados_antes='+before.stateCounts.marcado);

  if(before.stateCounts.marcado!==REQUIRED_DEPARTMENTS.length){
    await clickDepartmentSelectAll(page);
    await page.waitForTimeout(350);
  }
  const after=requireCompleteDepartmentScope(
    await withDeadline('Leitura dos departamentos DEPOIS',
      () => inspectScopedDepartments(page),20000),
    'DEPOIS');
  if(after.stateCounts.marcado!==REQUIRED_DEPARTMENTS.length ||
     after.stateCounts.desmarcado!==0) {
    throw new Error('Departamento não permaneceu com 21/21 marcados.');
  }
  console.log('INTEGRADO: departamentos selecionados=21/21');

  // Confirma que o estado das demais seleções não foi alterado pela escolha
  // dos departamentos. Não aplica o botão Filtrar nesta primeira homologação.
  const statusesAfter=await inspectAdvancedStatuses(page);
  const typesAfter=await inspectTaskTypes(page);
  if(Object.values(statusesAfter).some(x=>!x.checked) ||
     Object.values(typesAfter).some(x=>!x.checked)){
    throw new Error('Seleção de Departamento alterou outro grupo de filtros.');
  }
  console.log('INTEGRADO: filtros mantidos=3 tarefas / 4 status / 3 tipos / 21 departamentos');
  console.log('INTEGRADO: SUCESSO SEM EXPORTACAO, SEM FILTRAR E SEM SINCRONIZACAO.');
} catch(error) {
  // Exibe somente a mensagem do diagnóstico. Não incluir HTML, URLs ou tokens.
  console.error('FALHA NO TESTE INTEGRADO: '+error.message);
  process.exitCode=1;
} finally {
  if(context){
    try{await withDeadline('Fechamento do Chromium',()=>context.close(),8000);}
    catch{console.error('Chromium de teste demorou a encerrar; finalize somente esta instancia.');}
  }
}
