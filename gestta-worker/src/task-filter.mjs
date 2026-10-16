// Filtro principal de tarefas. Localizador validado com Pick Locator em 16/10/2026:
// getByText('Todas as tarefas'). Nao confundir com menu lateral 'Tarefas'.
// O rotulo e confiavel apenas enquanto nenhuma tarefa especifica esta selecionada.
export const TASK_FILTER_DEFAULT_LABEL = 'Todas as tarefas';

export function taskFilterTrigger(page) {
  return page.getByText(TASK_FILTER_DEFAULT_LABEL, { exact: true });
}

// O Gestta renderiza os controles da lista de tarefas de modo assincrono.
// count() nao aguarda elementos; antes ele retornava zero prematuramente.
export async function verifyTaskFilterTrigger(page) {
  const trigger = taskFilterTrigger(page);
  try {
    await trigger.first().waitFor({ state: 'visible', timeout: 30000 });
  } catch {
    // Continua para diagnosticar quantidade e visibilidade sem registrar dados privados.
  }
  const count = await trigger.count();
  if (count !== 1) {
    throw new Error('Filtro principal "Todas as tarefas" nao localizado de forma unica ' +
      'apos aguardar ate 30 segundos (correspondencias=' + count + '). ' +
      'Verifique o carregamento da tela. Nenhum filtro foi limpo.');
  }
  if (!(await trigger.isVisible())) {
    throw new Error('Filtro principal "Todas as tarefas" ainda esta invisivel.');
  }
  return trigger;
}

// O Gestta pode manter o filtro selecionado de uma execução para outra,
// substituindo o texto "Todas as tarefas" pelo nome da tarefa e exibindo um X.
// Somente limpar quando o seletor CSS do X específico do FILTRO DE TAREFAS
// estiver calibrado e houver uma correspondência única e visível.
export async function ensureUnfilteredTaskPicker(page, {
  clearCss = process.env.GESTTA_TASK_FILTER_CLEAR_SELECTOR?.trim(),
} = {}) {
  const trigger = taskFilterTrigger(page);
  // O caller já aguarda 5 segundos depois de abrir a tela Tarefas.
  // Uma espera curta adicional evita diagnosticar renderização lenta como filtro salvo.
  try { await trigger.first().waitFor({ state: 'visible', timeout: 5000 }); }
  catch { /* A contagem abaixo diferencia estado inicial de seletor ausente. */ }
  const count = await trigger.count();
  if (count === 1 && await trigger.isVisible()) return trigger;
  if (count > 1) {
    throw new Error('Filtro Todas as tarefas ambiguo (' + count +
      ' ocorrencias). Cancelando sem clicar.');
  }

  if (!clearCss) {
    throw new Error('Todas as tarefas nao aparece. O Gestta pode ter preservado ' +
      'as tarefas selecionadas; falta calibrar GESTTA_TASK_FILTER_CLEAR_SELECTOR ' +
      'com o X especifico da caixa superior de tarefas. NENHUM X foi clicado.');
  }

  // Exigir seletor específico: jamais clicar em X por ordem do DOM ou usar
  // seletores vagos que possam limpar Clientes, Usuários ou período.
  const unsafe = /^(?:button|a|span|svg|\*|\.close|\.clear|\.ng-clear|\.select2-selection__clear)$/i;
  if (unsafe.test(clearCss)) {
    throw new Error('Seletor do X demasiado generico. Use um CSS escopado ' +
      'exclusivamente ao filtro superior de tarefas.');
  }
  const clear = page.locator(clearCss);
  const matches = await clear.count();
  if (matches !== 1 || !(await clear.isVisible())) {
    throw new Error('X do filtro de tarefas nao localizado de forma unica e visivel ' +
      '(correspondencias=' + matches + '). Nenhum filtro foi limpo.');
  }
  await clear.click({ timeout: 10000 });

  try { await trigger.first().waitFor({ state: 'visible', timeout: 15000 }); }
  catch {
    throw new Error('O X foi acionado, mas Todas as tarefas nao reapareceu ' +
      'em 15 segundos. Interrompendo sem pesquisar bef.');
  }
  if (await trigger.count() !== 1 || !(await trigger.isVisible())) {
    throw new Error('Estado inicial do filtro de tarefas nao confirmado apos limpar o X.');
  }
  console.log('Selecao anterior de tarefas limpa; Todas as tarefas confirmado.');
  return trigger;
}

export const EBEF_SEARCH_TERM = 'bef';

// A interface é filtrável por "bef", conforme confirmado pelo operador.
// Seleção automática somente quando os seletores internos forem calibrados.
// Escopo estrito: uma opção DECLARAÇÃO e duas VERIFICAR NECESSIDADE.
// Pré-condição: nenhuma tarefa previamente selecionada (rótulo Todas as tarefas).
// Isso evita incluir tarefas fora do E-BEF em uma exportação.
export function validateEbefOptionNames(names) {
  if (!Array.isArray(names) || names.length !== 3) {
    throw new Error('Busca E-BEF deve retornar exatamente tres opcoes; recebidas ' +
      (Array.isArray(names) ? names.length : 'valor invalido') + '.');
  }
  const norm = text => String(text).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g,' ').trim();
  const normalized = names.map(norm);
  if (normalized.some(name => !name.includes('EBEF'))) {
    throw new Error('Busca incluiu opcao que nao corresponde a E-BEF.');
  }
  const declarations = normalized.filter(name => name.includes('DECLARACAO DE EBEF')).length;
  const verifications = normalized.filter(name => name.includes('VERIFICAR NECESSIDADE DE EBEF')).length;
  if (declarations !== 1 || verifications !== 2) {
    throw new Error('Escopo incorreto: esperado 1 Declaracao de EBEF e 2 Verificar Necessidade de EBEF.');
  }
  if (new Set(normalized).size !== 3) {
    throw new Error('Tarefas E-BEF repetidas na lista de resultados.');
  }
  return true;
}

// Playwright Inspector confirmou o input e os menuitems em 16/10/2026.
// Em vez de arrastar a scrollbar por pixels, scrollIntoViewIfNeeded() rola
// SOMENTE o suficiente para revelar a opção alvo (se existir no DOM).
export function taskSearchLocator(page, css) {
  return css?.trim()
    ? page.locator(css.trim())
    // O Inspector forneceu getByRole('textbox', { name: 'Buscar por tarefa' }),
    // SEM exact:true. Usar regex tolera eventuais espacos e sufixos da label.
    : page.getByRole('textbox', { name: /Buscar\s+por\s+tarefa/i });
}

export function ebefMenuItemsLocator(page, css) {
  return css?.trim()
    ? page.locator(css.trim())
    : page.getByRole('menuitem', { name: /EBEF/i });
}

export function menuItemCheckbox(item, css) {
  return css?.trim()
    ? item.locator(css.trim())
    : item.getByRole('checkbox');
}

export async function selectEbefTasks(page, { searchCss, rowCss, checkboxCss } = {}) {
  // Evitar seleções acumuladas entre consultas: restaurar o estado inicial
  // apenas com o X da caixa de tarefas devidamente calibrado.
  console.log('Tela de tarefas aberta. Aguardando 5 segundos para carregar os filtros...');
  await page.waitForTimeout(5000);
  const trigger = await ensureUnfilteredTaskPicker(page);
  await trigger.click({ timeout: 10000 });

  const search = taskSearchLocator(page, searchCss);
  // A lista do Gestta pode abrir de forma assincrona. Antes, count()
  // executado imediatamente após click() devolvia 0 de modo intermitente.
  // .first() aqui apenas aguarda o primeiro campo; a cardinalidade eh
  // conferida antes de digitar, portanto nunca selecionamos um ambiguo.
  let timedOut = false;
  try {
    await search.first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    timedOut = true;
  }
  const matches = await search.count();
  const visible = matches === 1 && await search.isVisible();
  if (timedOut || matches !== 1 || !visible) {
    // Logar somente contagens de controles, nunca texto digitado por usuarios,
    // nomes de clientes, DOM, URLs de sessao ou outros dados privados.
    const textboxes = await page.getByRole('textbox').count();
    const items = await page.getByRole('menuitem').count();
    const selectAll = await page.getByText('Selecionar todas ativas', { exact: true }).count();
    throw new Error('Campo Buscar por tarefa indisponivel: ' +
      'correspondencias=' + matches + ', visivel=' + visible +
      ', total_textboxes=' + textboxes +
      ', total_menuitems=' + items +
      ', acao_selecionar_todas=' + selectAll +
      '. O dropdown pode estar fechado ou o nome acessivel pode ter mudado.');
  }
  await search.fill(EBEF_SEARCH_TERM, { timeout: 10000 });
  if ((await search.inputValue()).trim().toLowerCase() !== EBEF_SEARCH_TERM) {
    throw new Error('Busca do Gestta nao confirmou o texto bef.');
  }

  const rows = ebefMenuItemsLocator(page, rowCss);
  // Se o Gestta renderizar os itens fora da área visível, o Playwright faz
  // a rolagem interna quando necessário. Se a lista for virtualizada
  // (ainda não houver 3 elementos no DOM), falhar com diagnóstico.
  try {
    await rows.nth(2).waitFor({ state: 'attached', timeout: 15000 });
  } catch {
    throw new Error('A busca bef nao carregou tres itens no DOM. ' +
      'Inspecione a rolagem ou a lista virtualizada antes de automatizar.');
  }
  const total = await rows.count();
  if (total !== 3) {
    throw new Error('A busca bef localizou ' + total +
      ' menuitems E-BEF; esperado exatamente tres.');
  }

  const names = [];
  const boxes = [];
  for (let i = 0; i < total; i++) {
    const row = rows.nth(i);
    try {
      await row.scrollIntoViewIfNeeded({ timeout: 10000 });
    } catch {
      throw new Error('Nao foi possivel rolar a lista ate a opcao E-BEF ' +
        (i + 1) + '. Inspecione o contêiner da barra de rolagem.');
    }
    if (!(await row.isVisible())) {
      throw new Error('A opcao E-BEF ' + (i + 1) + ' continua invisivel.');
    }
    names.push((await row.innerText()).trim());
    const checkbox = menuItemCheckbox(row, checkboxCss);
    if (await checkbox.count() !== 1) {
      throw new Error('A opcao E-BEF ' + (i + 1) + ' nao possui checkbox unico.');
    }
    boxes.push(checkbox);
  }
  validateEbefOptionNames(names); // Falhar ANTES de marcar qualquer checkbox.
  for (const box of boxes) {
    await box.scrollIntoViewIfNeeded({ timeout: 10000 });
    if (!(await box.isChecked())) await box.check({ timeout: 10000 });
  }
  for (const box of boxes) {
    if (!(await box.isChecked())) {
      throw new Error('Uma tarefa E-BEF nao permaneceu selecionada.');
    }
  }
  return { selected: 3 };
}
