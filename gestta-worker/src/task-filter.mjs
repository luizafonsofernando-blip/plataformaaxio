// Filtro principal de tarefas. Localizador validado com Pick Locator em 16/10/2026:
// getByText('Todas as tarefas'). Nao confundir com menu lateral 'Tarefas'.
// O rotulo e confiavel apenas enquanto nenhuma tarefa especifica esta selecionada.
export const TASK_FILTER_DEFAULT_LABEL = 'Todas as tarefas';

export function taskFilterTrigger(page) {
  return page.getByText(TASK_FILTER_DEFAULT_LABEL, { exact: true });
}

export async function verifyTaskFilterTrigger(page) {
  const trigger = taskFilterTrigger(page);
  const count = await trigger.count();
  if (count !== 1) {
    throw new Error('Filtro principal "Todas as tarefas" nao localizado de forma unica (' +
      count + ' correspondencias). Inspecione a caixa superior ou calibre o seletor.');
  }
  if (!(await trigger.isVisible())) {
    throw new Error('Filtro principal de tarefas ainda nao esta visivel.');
  }
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

export async function selectEbefTasks(page, { searchCss, rowCss, checkboxCss } = {}) {
  if (![searchCss,rowCss,checkboxCss].every(v => typeof v === 'string' && v.trim())) {
    throw new Error('Calibrar GESTTA_TASK_SEARCH_SELECTOR, GESTTA_TASK_RESULT_ROW_SELECTOR e ' +
      'GESTTA_TASK_ROW_CHECKBOX_SELECTOR antes de selecionar tarefas automaticamente.');
  }

  // Sem evidência de um comando para limpar seleções previas, não presumir que
  // "bef" exclui escolhas anteriores ao filtro de busca.
  const trigger = await verifyTaskFilterTrigger(page);
  await trigger.click({ timeout: 10000 });

  const search = page.locator(searchCss);
  if (await search.count() !== 1 || !(await search.isVisible())) {
    throw new Error('Campo de pesquisa do filtro Tarefas nao localizado unicamente.');
  }
  await search.fill(EBEF_SEARCH_TERM, {timeout:10000});
  if ((await search.inputValue()).toLowerCase().trim() !== EBEF_SEARCH_TERM) {
    throw new Error('Gestta nao confirmou texto bef na busca de tarefas.');
  }
  const rows = page.locator(rowCss);
  // Aguarda a renderizacao dos tres resultados, sem depender de um timeout fixo.
  try { await rows.nth(2).waitFor({state:'visible',timeout:15000}); }
  catch { throw new Error('Busca bef nao apresentou tres opcoes E-BEF em 15s.'); }
  const count = await rows.count();
  if (count !== 3) throw new Error('Busca bef retornou ' + count + ' opcoes, esperado exatamente tres.');
  const names = [];
  const boxes = [];
  for (let i=0;i<3;i++) {
    const row = rows.nth(i);
    if (!(await row.isVisible())) throw new Error('Opcao E-BEF oculta no resultado da pesquisa.');
    names.push((await row.innerText()).trim());
    const checkbox=row.locator(checkboxCss);
    if (await checkbox.count() !== 1) throw new Error('Opcao ' + (i+1) + ' sem checkbox unico.');
    boxes.push(checkbox);
  }
  validateEbefOptionNames(names);
  for (const box of boxes) {
    if (!(await box.isChecked())) await box.check({timeout:10000});
  }
  for (const box of boxes) {
    if (!(await box.isChecked())) throw new Error('Uma das tarefas E-BEF nao permaneceu selecionada.');
  }
  return {selected:3};
}
