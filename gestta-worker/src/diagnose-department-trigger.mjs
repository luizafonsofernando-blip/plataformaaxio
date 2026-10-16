// Diagnóstico do campo DEPARTAMENTO preenchido.
// Não clica no próprio dropdown, não seleciona departamentos, não aplica Filtrar,
// não baixa nem transmite dados. Apenas reúne metadados do DOM já carregado.
// Não imprimir textos desconhecidos, nomes de clientes, HTML, URLs ou cookies.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { openAdvancedFilters } from './advanced-open-locator.mjs';
import { ensureAllAdvancedStatuses } from './advanced-status-locators.mjs';
import { ensureAllTaskTypes } from './advanced-task-type-locators.mjs';
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';
import { inspectDepartmentTriggerLayout } from './department-trigger-layout.mjs';
import { withDeadline } from './timeout-utils.mjs';

const url=new URL(process.env.GESTTA_REPORT_URL?.trim()||'https://app.gestta.com.br/');
if(url.protocol!=='https:' || url.hostname!=='app.gestta.com.br') {
  throw new Error('Endereco nao autorizado para diagnostico.');
}
const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
try{
  console.log('DIAGNOSTICO CAMPO DEPARTAMENTO: Chromium headless, sem download nem Filtrar.');
  context=await chromium.launchPersistentContext(profile,{
    headless:true,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0]||await context.newPage();
  await first.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const tasks=await selectEbefTasks(page);
  if(tasks.selected!==3)throw new Error('As tres tarefas E-BEF nao foram confirmadas.');
  await openAdvancedFilters(page);
  await ensureAllAdvancedStatuses(page);
  await ensureAllTaskTypes(page);
  console.log('DIAGNOSTICO: tarefas=3/3; status=4/4; tipos=3/3.');
  const result=await withDeadline('Estrutura do campo Departamento',
    ()=>inspectDepartmentTriggerLayout(page),15000);
  console.log('DEPT_TRIGGER: '+JSON.stringify(result));
  if(result.uniqueGroupCount!==1){
    console.log('DEPT_TRIGGER: menu de 21 departamentos ainda nao foi identificado de forma unica.');
  } else {
    console.log('DEPT_TRIGGER: lista de 21 departamentos identificada; somente leitura.');
  }
  console.log('DIAGNOSTICO: nenhuma exportacao, sincronizacao ou clique em Filtrar.');
}catch(error){
  console.error('FALHA DIAGNOSTICO DEPARTAMENTO: '+error.message);
  process.exitCode=1;
}finally{
  if(context){
    try{await withDeadline('Fechar Chromium',()=>context.close(),8000);}
    catch{console.error('Instancia de teste demorou a fechar.');}
  }
}
