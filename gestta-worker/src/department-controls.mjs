// Gestta: controles de Departamento confirmados via Pick Locator (16/10/2026).
// Acoes afetam somente o filtro visual, nao o cadastro de departamentos.
// Os 21 nomes/checkboxes precisam ser verificados separadamente antes de exportar.
export function departmentTrigger(page, cssOverride) {
  return cssOverride?.trim()
    ? page.locator(cssOverride.trim())
    : page.getByText('Todos departamentos'); // Locator exato fornecido pelo Inspector.
}

export function departmentSelectAll(page, cssOverride) {
  return cssOverride?.trim()
    ? page.locator(cssOverride.trim())
    : page.getByRole('menuitem', { name: 'Selecionar todos', exact: true }).locator('a');
}

export async function verifyDepartmentControl(locator, description) {
  try { await locator.first().waitFor({state:'visible',timeout:15000}); }
  catch { /* Exibir diagnostico de contagem abaixo, sem clicar. */ }
  const count = await locator.count();
  if (count !== 1 || !(await locator.isVisible())) {
    throw new Error(description + ' nao localizado de forma unica e visivel ' +
      '(correspondencias=' + count + '). Verifique estado do filtro Departamento.');
  }
  return locator;
}

export async function openDepartmentPicker(page, cssOverride) {
  const trigger = await verifyDepartmentControl(
    departmentTrigger(page,cssOverride), 'Campo Todos departamentos'
  );
  await trigger.click({timeout:10000});
}

export async function clickDepartmentSelectAll(page, cssOverride) {
  const selectAll = await verifyDepartmentControl(
    departmentSelectAll(page,cssOverride), 'Acao Selecionar todos de Departamento'
  );
  await selectAll.click({timeout:10000});
  // O clique sozinho NAO comprova que todas as 21 opcoes ficaram marcadas.
  // Essa verificacao permanece obrigatoria no exportador.
}
