// Diagnóstico de Departamento em Chromium headless.
// Não pede cliques manuais, não usa Inspector/Resume, não baixa nem transmite.
// Abre apenas filtros VISUAIS de E-BEF e Departamento; não altera tarefas.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { openAdvancedFilters } from './advanced-open-locator.mjs';
import { openDepartmentPicker, clickDepartmentSelectAll } from './department-controls.mjs';
import { inspectDepartmentStructure, inspectDepartmentCounts } from './department-structure.mjs';
import { inspectScopedDepartments } from './department-scope.mjs';
import { withDeadline } from './timeout-utils.mjs';

const target = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('O navegador só pode abrir https://app.gestta.com.br/.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
async function report(page,stage) {
  console.log('DEPARTAMENTOS: iniciando leitura '+stage+' do menu...');
  // PRIMEIRO tentar apenas a lista de 21 opções associada ao Select All
  // que esteja visível. Não examinar 7.735 toggles se houver escopo válido.
  const scoped=await withDeadline('Escopo '+stage,
    () => inspectScopedDepartments(page),10000);
  console.log('ESCOPO_'+stage+': '+JSON.stringify({
    found:scoped.found,candidateScopes:scoped.candidateScopes,
    visibleSelectAllCandidates:scoped.visibleSelectAllCandidates,
    nearbyToggleCounts:scoped.nearbyToggleCounts,
  }));
  if(scoped.found){
    console.log(stage+': '+JSON.stringify(scoped));
    return {...scoped,scoped:true};
  }
  // Diagnóstico de transição: leitura global APENAS para investigar DOM,
  // jamais suficiente para autorizar Selecionar todos.
  const global=await withDeadline('Leitura global '+stage,
    () => inspectDepartmentStructure(page),20000);
  console.log(stage+': '+JSON.stringify(global));
  const counts=await withDeadline('Diagnostico estrutural',
    () => inspectDepartmentCounts(page),8000);
  console.log('ESTRUTURA: '+JSON.stringify(counts));
  return {...global,scoped:false};
}
try {
  console.log('DEPARTAMENTOS: teste headless sem Inspector ou intervencao manual.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0] || await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('Três tarefas E-BEF não confirmadas.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');

  await openAdvancedFilters(page);
  console.log('DEPARTAMENTOS: funil aberto pelo icone glyphicon-filter.');
  await openDepartmentPicker(page);
  console.log('DEPARTAMENTOS: menu Departamento aberto.');
  await page.waitForTimeout(500);
  // Se esta verificacao rapida nao responder, ha indicio de bloqueio
  // do contexto JS da pagina, e nao apenas um seletor sem elementos.
  const pageAlive=await withDeadline('Resposta basica do DOM',
    () => page.evaluate(() => document.readyState),6000);
  console.log('DEPARTAMENTOS: renderer_respondeu='+pageAlive);

  const before=await report(page,'ANTES');
  if(!before.scoped || !before.allExpectedPresent ||
     before.recognizedUnique!==21 || before.rowCount!==21){
    console.log('DEPARTAMENTOS: escopo da lista de 21 departamentos nao confirmado. '+
      'Nenhuma opcao Selecionar todos foi acionada.');
  } else if(before.stateCounts.marcado===21){
    console.log('DEPARTAMENTOS: todos os 21 ja parecem marcados, sem novo clique.');
    await report(page,'DEPOIS');
  } else {
    console.log('DEPARTAMENTOS: 21 nomes identificados; acionando Selecionar todos '+
      'somente no filtro de departamentos (sem aplicar Filtrar).');
    await clickDepartmentSelectAll(page);
    await page.waitForTimeout(350);
    const after=await report(page,'DEPOIS');
    if(after.scoped && after.allExpectedPresent && after.rowCount===21 && after.stateCounts.marcado===21){
      console.log('DEPARTAMENTOS: 21/21 marcados confirmados por estado de checkbox.');
    } else {
      console.log('DEPARTAMENTOS: clique nao comprova a selecao integral. '+
        'Verifique o diagnostico de estados e a estrutura do componente.');
    }
  }
  console.log('Diagnostico finalizado; nao houve download ou sincronizacao.');
} catch(error) {
  console.error('FALHA NO DIAGNOSTICO DOS DEPARTAMENTOS: '+error.message);
  process.exitCode=1;
} finally {
  if(context) {
    try {
      await withDeadline('Encerramento do Chromium', () => context.close(),8000);
    } catch {
      console.error('O Chromium de teste demorou a encerrar; finalize somente essa instancia.');
    }
  }
}
