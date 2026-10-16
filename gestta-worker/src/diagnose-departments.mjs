// Diagnostico assistido de dropdown Departamento, sem download nem sync.
// Abre Gestta e seleciona SOMENTE os tres filtros de tarefas E-BEF ja
// homologados. O usuario abre manualmente Filtros avancados > Departamento.
// Não coleta HTML completo, URLs da sessão, cookies nem dados de clientes.
import 'dotenv/config';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { inspectDepartmentStructure } from './department-structure.mjs';

const target = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('O navegador só pode abrir https://app.gestta.com.br/.');
}

const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
async function promptForInspection(message) {
  const rl=createInterface({input,output});
  try { await rl.question(message + '\nVolte ao PowerShell e pressione ENTER... '); }
  finally { rl.close(); }
}
async function report(page,stage) {
  const info=await inspectDepartmentStructure(page);
  console.log(stage+': '+JSON.stringify(info));
  if (!info.rowCount) {
    console.log('Nenhuma linha do dropdown reconhecida: confirme que Filtros avançados > Departamento está ABERTO.');
  }
}
try {
  context=await chromium.launchPersistentContext(profile,{
    headless:false,acceptDownloads:false,viewport:{width:1366,height:860},
  });
  const first=context.pages()[0] || await context.newPage();
  await first.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
  const page=await ensureTasksView(context);
  const result=await selectEbefTasks(page);
  if(result.selected!==3)throw new Error('Três tarefas E-BEF não confirmadas.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');
  console.log('Diagnostico SOMENTE-LEITURA dos 21 departamentos conhecidos.');
  await promptForInspection(
    'No Chromium, abra manualmente o FUNIL > Departamento e deixe a lista expandida.'
  );
  await report(page,'ANTES');
  await promptForInspection(
    'Se estiver visivel "Selecionar todos", clique manualmente e deixe a lista aberta.\n' +
    'Se nao estiver disponivel ou ja estiver tudo marcado, nao clique em nada.'
  );
  await report(page,'DEPOIS');
  console.log('Diagnostico concluido. Nenhuma tarefa alterada e nenhum dado enviado à Luce.');
} catch(error) {
  console.error('FALHA NO DIAGNOSTICO DOS DEPARTAMENTOS: '+error.message);
  process.exitCode=1;
} finally {
  if(context)await context.close();
}
