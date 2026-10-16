// Inspecao assistida dos filtros do Gestta.
// Abre Dashboard v2 -> menu lateral Tarefas automaticamente e pausa no Inspector.
// NAO exporta, NAO chama API Luce, NAO altera tarefas.
// Nunca compartilhe cookies, credenciais, tokens, arquivos de sessao ou dados de clientes.
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureTasksView } from './task-navigation.mjs';
import { taskFilterTrigger } from './task-filter.mjs';

process.env.PWDEBUG = '1';
// Inspector deve estar habilitado antes de carregar Playwright.
const { chromium } = await import('playwright');

const target = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const url = new URL(target);
if (url.protocol !== 'https:' || url.hostname !== 'app.gestta.com.br') {
  throw new Error('Endereco de navegador nao autorizado. Use somente https://app.gestta.com.br/.');
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
  await first.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const page = await ensureTasksView(context);
  console.log('Gestta: tela de tarefas aberta automaticamente.');
  await page.waitForTimeout(5000);
  const defaultLabels = await taskFilterTrigger(page).count();
  if (defaultLabels === 1 && await taskFilterTrigger(page).isVisible()) {
    console.log('Filtro superior esta em Todas as tarefas; nenhum reset necessario.');
  } else {
    console.log('O Gestta pode ter preservado tarefas selecionadas.');
    console.log('Ative Pick Locator no X do PRIMEIRO FILTRO (tarefas), perto da seta.');
    console.log('Nao clique no X de clientes, usuarios ou datas.');
    console.log('Envie somente o locator do X para escoparmos seu seletor CSS.');
  }
  console.log('Inspector em pausa; nao altere tarefas nem abra relatorios.');
  console.log('Nao use Selecionar todas ativas: isso pode selecionar tarefas nao E-BEF.');
  console.log('Nao clique em concluir, descartar, transferir ou alterar tarefas.');
  console.log('Nao copie URLs de sessao, nomes de clientes ou credenciais.');
  await page.pause();
} catch (error) {
  console.error('Inspecao dos filtros nao iniciada: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
