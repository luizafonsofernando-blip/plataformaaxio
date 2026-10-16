// Diagnóstico assistido dos departamentos, SOMENTE-LEITURA.
// A navegação e o filtro E-BEF usam apenas as operações já homologadas.
// As duas interações de abertura/seleção dos departamentos são MANUAIS,
// supervisionadas pelo Playwright Inspector. Não baixa nem transmite dados.
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';
import { inspectDepartmentStructure } from './department-structure.mjs';

// O modo Inspector já funcionou anteriormente para inspecionar os filtros.
// Evitamos aguardar stdin/ENTER: nessa etapa o operador relatou que a janela
// Chromium aparentemente parou de responder (sem causa confirmada).
process.env.PWDEBUG = '1';
const { chromium } = await import('playwright');

const target = new URL(process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/');
if (target.protocol !== 'https:' || target.hostname !== 'app.gestta.com.br') {
  throw new Error('O navegador só pode abrir https://app.gestta.com.br/.');
}

const profile=resolve(process.cwd(),'.gestta-profile');
await mkdir(profile,{recursive:true,mode:0o700});
let context;
async function report(page,stage) {
  const info=await inspectDepartmentStructure(page);
  console.log(stage+': '+JSON.stringify(info));
  if (!info.rowCount) {
    console.log('Nenhuma linha de departamento reconhecida. Confirme o dropdown aberto no Gestta.');
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
  console.log('Diagnóstico SOMENTE-LEITURA dos 21 departamentos conhecidos.');
  await page.bringToFront();
  console.log('PAUSA 1/2: no Inspector, desative Pick Locator.');
  console.log('No Chromium, abra FUNIL > Departamento e deixe o menu EXPANDIDO.');
  console.log('Depois clique RESUME (triângulo verde) no Inspector, NAO pressione Enter no PowerShell.');
  await page.pause();
  await report(page,'ANTES');

  console.log('PAUSA 2/2: no Chromium, clique manualmente em Selecionar todos');
  console.log('SOMENTE se a opção estiver disponível. Deixe o dropdown de Departamento aberto.');
  console.log('Depois clique novamente RESUME no Inspector. Nao clicar em Filtrar.');
  await page.pause();
  await report(page,'DEPOIS');

  console.log('Diagnóstico concluído; nenhum relatório baixado ou transmitido à Luce.');
} catch(error) {
  console.error('FALHA NO DIAGNOSTICO DOS DEPARTAMENTOS: '+error.message);
  process.exitCode=1;
} finally {
  if(context) await context.close();
}
