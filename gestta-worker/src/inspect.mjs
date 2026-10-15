// Inspeção local assistida da interface Gestta; sem downloads, envio à Luce ou alteração de tarefas.
// Playwright Inspector permite "Pick Locator" e "Record" apenas no computador autorizado.
// Nunca compartilhe cookies, token, senhas, screenshots com dados de clientes ou arquivos de sessão.
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

process.env.PWDEBUG = '1';
// Importação dinâmica para ativar Inspector antes do Playwright ser carregado.
const { chromium } = await import('playwright');
const profile = resolve(process.cwd(), '.gestta-profile');
const target = process.env.GESTTA_REPORT_URL?.trim() || 'https://app.gestta.com.br/';
const u = new URL(target);
if (u.protocol !== 'https:' || u.hostname !== 'app.gestta.com.br') {
  throw new Error('Endereço não autorizado: somente https://app.gestta.com.br/.');
}

await mkdir(profile, { recursive: true, mode: 0o700 });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: false,
    viewport: { width: 1366, height: 860 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(u.href, { waitUntil: 'domcontentloaded' });
  console.log('Luce E-BEF | Inspeção local do Gestta.');
  console.log('Use Pick Locator no Playwright Inspector para conhecer os seletores.');
  console.log('Este script não envia relatórios e não clica nos controles do Gestta.');
  console.log('Após concluir, clique Resume no Inspector ou encerre esta janela.');
  console.log('NÃO copie os dados de login, cookies, tokens, URLs contendo tokens ou dados de clientes.');
  await page.pause();
} catch (error) {
  console.error('Falha na inspeção local: ' + error.message);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
