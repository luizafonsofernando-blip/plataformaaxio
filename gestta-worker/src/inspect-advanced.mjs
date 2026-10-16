// Inspecao assistida SOMENTE dos filtros avancados Gestta.
// Abre a tela de tarefas e seleciona as 3 tarefas E-BEF (apenas filtros
// visuais, sem modificar tarefas, baixar arquivos ou enviar dados).
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { selectEbefTasks } from './task-filter.mjs';

process.env.PWDEBUG = '1';
const { chromium } = await import('playwright');

const target = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const u = new URL(target);
if (u.protocol !== 'https:' || u.hostname !== 'app.gestta.com.br') {
  throw new Error('Apenas https://app.gestta.com.br/ pode ser aberto.');
}
// O Pick Locator retornou locator('button').nth(4) para o funil.
// Essa posicao NAO e seletor confiavel em producao: apenas diagnosticar
// atributos nao sensiveis e confirmar manualmente a identidade do controle.
async function inspectAdvancedButtonAttributes(page) {
  const buttons = page.locator('button');
  const total = await buttons.count();
  console.log('DIAGNOSTICO FUNIL: total_de_botoes=' + total + '.');
  if (total < 5) {
    console.log('DIAGNOSTICO FUNIL: botao de indice 4 nao encontrado; nenhum clique realizado.');
    return;
  }
  const candidate = buttons.nth(4);
  const attributes = await candidate.evaluate(el => {
    const allowed = ['id', 'type', 'title', 'aria-label', 'data-testid', 'data-test', 'name'];
    const button = {};
    for (const key of allowed) {
      const val = el.getAttribute(key);
      if (val && val.length <= 100) button[key] = val;
    }
    const parent = el.parentElement;
    const svg = el.querySelector('svg');
    const icon = {};
    if (svg) {
      for (const key of ['data-lucide', 'data-icon', 'aria-label', 'class']) {
        const val = svg.getAttribute(key);
        if (val && val.length <= 100) icon[key] = val;
      }
    }
    const parentData = {};
    if (parent) {
      for (const key of ['id', 'role', 'data-testid']) {
        const val = parent.getAttribute(key);
        if (val && val.length <= 100) parentData[key] = val;
      }
    }
    return {button, icon, parent:parentData};
  });
  const visible = await candidate.isVisible();
  console.log('DIAGNOSTICO FUNIL: quinto_botao_visivel=' + visible +
    '; atributos_permitidos=' + JSON.stringify(attributes));
  console.log('Apenas diagnostico; o indice 4 ainda nao sera usado para clicar automaticamente.');
}

const profile = resolve(process.cwd(), '.gestta-profile');
await mkdir(profile, { recursive: true, mode: 0o700 });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: false,
    viewport: { width: 1366, height: 860 },
  });
  const first = context.pages()[0] || await context.newPage();
  await first.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const page = await ensureTasksView(context);
  const result = await selectEbefTasks(page);
  if (result.selected !== 3) throw new Error('Tres tarefas E-BEF nao confirmadas.');
  console.log('TAREFAS E-BEF SELECIONADAS E VERIFICADAS: 3/3');
  await inspectAdvancedButtonAttributes(page);
  console.log('Inspector pausado para inspecionar filtros avancados (SEM EXPORTAR).');
  console.log('Desative Pick Locator e clique manualmente no funil da direita.');
  console.log('Reative Pick Locator e capture o checkbox de Concluida no painel aberto.');
  console.log('Depois inspecione os checkboxes de Aberta, Concluida, Impedimento e Desconsiderada.');
  console.log('Nao clique em concluir/descartar tarefas. Nao envie dados de clientes.');
  await page.pause();
} catch (error) {
  console.error('INSPECAO AVANCADA NAO INICIADA: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
