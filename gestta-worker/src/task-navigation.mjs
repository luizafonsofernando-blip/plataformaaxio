// Gestta: a Dashboard pode ser a pagina inicial apos login.
// Entrada no quadro de tarefas: clique no INDICADOR numerico "No Prazo"
// dentro do grafico "Tarefas Abertas", nunca por numeros fixos (7/17/0).
// Apenas navega, nao altera tarefas nem realiza exportacao.
export const TASKS_VIEW_SELECTOR = '#date-range';
const STARTER_LABEL = 'No Prazo';

export async function findTaskView(context, selector = TASKS_VIEW_SELECTOR) {
  for (const page of context.pages()) {
    try {
      if (!page.isClosed() && await page.locator(selector).isVisible({ timeout: 1500 })) {
        return page;
      }
    } catch (_) { /* Proxima aba */ }
  }
  return null;
}

export function dashboardIndicatorLocator(page, { selector = process.env.GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR } = {}) {
  // Melhor opcao: CSS exato obtido com Pick Locator no numero clicavel da dashboard.
  if (typeof selector === 'string' && selector.trim()) return page.locator(selector.trim());
  // Fallback calibravel: ancora na ETIQUETA, e nao no valor numerico que muda.
  // Localizar unico valor numerico em um ancestral proximo do texto No Prazo.
  return null;
}

export async function findDashboardIndicator(page, { selector = process.env.GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR } = {}) {
  const custom = dashboardIndicatorLocator(page, { selector });
  if (custom) {
    if (await custom.count() !== 1 || !(await custom.isVisible())) {
      throw new Error('Atalho personalizado para tarefas deve localizar um elemento unico e visivel.');
    }
    return custom;
  }
  // Inspector em 15/10: o numero clicavel é um link com nome acessivel
  // numerico (exemplo observado: "21069"). Não fixar seu valor.
  // Só usar este atalho se houver EXATAMENTE UM link numerico visivel;
  // caso contrario, parar para calibrar um seletor estável.
  const numericLinks = page.getByRole('link', { name: /^\d+$/ });
  const countNumeric = await numericLinks.count();
  if (countNumeric === 1 && await numericLinks.isVisible()) {
    return numericLinks;
  }
  // A Dashboard possui dois rótulos "No Prazo". NÃO chamar waitFor()
  // antes de conferir count(), pois strict mode falha quando existem dois.
  const label = page.getByText(STARTER_LABEL, { exact: true });
  const labelCount = await label.count();
  if (labelCount !== 1) {
    // Prioriza o grafico "Tarefas Abertas" e seus tres status conhecidos.
    // Os valores numericos mudam; o usuario confirmou que os indicadores
    // No Prazo, Em Atraso e Com Multas levam ao quadro de tarefas.
    // O titulo do grafico pode conter um contador (ex.: 24 Tarefas Abertas).
    const chartHeadings = page.getByText(/Tarefas\s+Abertas/i);
    const headingsCount = await chartHeadings.count();
    if (headingsCount >= 1 && headingsCount <= 3) {
      for (let headingIndex = 0; headingIndex < headingsCount; headingIndex++) {
        const heading = chartHeadings.nth(headingIndex);
        for (let depth = 1; depth <= 7; depth++) {
          const chart = heading.locator('xpath=' + '../'.repeat(depth).slice(0, -1));
        const statuses = await Promise.all(
          ['No Prazo', 'Em Atraso', 'Com Multas'].map(
            title => chart.getByText(title, { exact: true }).count()
          )
        );
        if (statuses.every(n => n === 1)) {
          const chartLinks = chart.getByRole('link', { name: /^\d+$/ });
          const total = await chartLinks.count();
          // Apenas links numericos dentro do grafico conhecido: sao os
          // indicadores cuja navegacao foi confirmada pelo operador.
          if (total >= 1 && total <= 3) {
            const visible = [];
            for (let i = 0; i < total; i++) {
              if (await chartLinks.nth(i).isVisible()) visible.push(chartLinks.nth(i));
            }
            if (visible.length === total) return visible[0];
          }
        }
        }
      }
    }
    throw new Error('Dashboard possui ' + labelCount +
      ' rótulos "No Prazo" e nao foi possivel identificar um link exclusivo ' +
      'do grafico Tarefas Abertas. Configure o seletor calibrado ' +
      'GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR.');
  }
  await label.waitFor({ state: 'visible', timeout: 15000 });
  // Nunca usa valores absolutos. Procura somente UM numero em um ancestral proximo.
  // Sao permitidos ate dois niveis acima para evitar clicar em outros graficos.
  for (let level = 1; level <= 2; level++) {
    const container = label.locator('xpath=' + '../'.repeat(level).slice(0,-1));
    const numbers = container.getByText(/^\d+$/, { exact: true });
    if (await numbers.count() === 1 && await numbers.first().isVisible()) {
      return numbers.first();
    }
  }
  throw new Error('Link numerico de tarefas nao localizado unicamente na Dashboard. ' +
    'Use Pick Locator no link do grafico e configure GESTTA_DASHBOARD_TASKS_SHORTCUT_SELECTOR.');
}

export async function ensureTasksView(context, { timeout = 20000, selector = TASKS_VIEW_SELECTOR } = {}) {
  const already = await findTaskView(context, selector);
  if (already) return already;
  const pages = context.pages().filter(p => !p.isClosed());
  const page = pages.find(p => {
    try { return new URL(p.url()).hostname === 'app.gestta.com.br'; }
    catch { return false; }
  }) || pages[0];
  if (!page) throw new Error('Chromium sem pagina do Gestta.');

  // A Dashboard do Gestta pode exibir primeiro o layout e só depois os
  // contadores. Aguarde 5 segundos antes de localizar o atalho.
  // Tempo solicitado para homologação; nunca clicar sem confirmar o alvo.
  // O titulo visivel pode ser "24 Tarefas Abertas", portanto nao exigir
  // correspondencia EXATA nem aguardar o titulo antes da espera inicial.
  console.log('Dashboard aberta. Aguardando 5 segundos para os indicadores estabilizarem...');
  await page.waitForTimeout(5000);
  const chartHeadings = page.getByText(/Tarefas\s+Abertas/i);
  const chartCount = await chartHeadings.count();
  const labelCount = await page.getByText('No Prazo', { exact: true }).count();
  console.log('Diagnostico de navegacao (sem dados de clientes): graficos=' +
    chartCount + ', rotulos No Prazo=' + labelCount + '.');
  // Caso o usuário tenha navegado à lista durante a espera, não clicar no gráfico.
  const nowInTasks = await findTaskView(context, selector);
  if (nowInTasks) return nowInTasks;

  let indicator;
  try {
    indicator = await findDashboardIndicator(page);
    await indicator.click({ timeout: 10000 });
  } catch (error) {
    throw new Error('Nao foi possivel acessar tarefas pelo grafico da Dashboard: ' + error.message);
  }
  // Aplicativo SPA pode trocar de aba ou atualizar a rota: observar sem supor destino.
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
  } catch (_) {
    const nextPage = await findTaskView(context, selector);
    if (nextPage) return nextPage;
    throw new Error('Indicador da Dashboard foi acionado, mas o quadro de tarefas nao carregou. ' +
      'Inspecione o numero clicavel com Pick Locator.');
  }
  const result = await findTaskView(context, selector);
  if (!result) throw new Error('Visao Tarefas nao confirmada.');
  return result;
}
