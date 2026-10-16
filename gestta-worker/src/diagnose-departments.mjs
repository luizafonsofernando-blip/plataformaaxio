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
import { inspectDepartmentStructure } from './department-structure.mjs';

const target = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('O navegador só pode abrir https://app.gestta.com.br/.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
async function withDeadline(label, task, ms=20000) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error(
          label+' excedeu '+ms/1000+' segundos; nao foi possivel ler os departamentos.'
        )),ms);
      }),
    ]);
  } finally {
    if(timer)clearTimeout(timer);
  }
}
async function report(page,stage) {
  console.log('DEPARTAMENTOS: iniciando leitura '+stage+' do menu...');
  const result=await withDeadline('Leitura '+stage,inspectDepartmentStructure(page));
  console.log(stage+': '+JSON.stringify(result));
  if(result.rowCount===0){
    // Somente contagens estruturais para diagnosticar mudança do HTML.
    const li=await withDeadline('Contagem toggles',
      page.locator('.gestta-multiselect-dropdown__item-toggle').count(),8000);
    const checkbox=await withDeadline('Contagem checkboxes',
      page.locator('.checkbox-item').count(),8000);
    console.log('ESTRUTURA: toggles='+li+'; checkbox_items='+checkbox);
  }
  return result;
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

  const before=await report(page,'ANTES');
  if(!before.allExpectedPresent || before.recognizedUnique!==21){
    console.log('DEPARTAMENTOS: menu nao apresentou os 21 nomes distintos esperados. '+
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
    if(after.allExpectedPresent && after.stateCounts.marcado===21){
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
      await withDeadline('Encerramento do Chromium',context.close(),8000);
    } catch {
      console.error('O Chromium de teste demorou a encerrar; finalize somente essa instancia.');
    }
  }
}
