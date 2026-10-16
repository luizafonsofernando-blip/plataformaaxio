import { discoverDepartmentTriggerByRows } from './department-trigger-discovery.mjs';
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
  if(cssOverride?.trim()){
    const configured=await verifyDepartmentControl(
      departmentTrigger(page,cssOverride),'Campo Departamento configurado');
    await configured.click({timeout:10000});
    return;
  }
  const initial=departmentTrigger(page);
  const count=await initial.count();
  if(count===1 && await initial.isVisible()){
    await initial.click({timeout:10000});
    return;
  }
  if(count>1){
    throw new Error('Campo Todos departamentos ambiguo ('+count+
      ' correspondencias); nenhum dropdown foi acionado.');
  }
  // O Gestta preserva departamentos selecionados e altera o texto do
  // controle. O título Departamento não existia como nó simples no DOM
  // do ambiente real (títulos=0); usar a lista de 21 nomes homologados
  // para identificar exclusivamente o dropdown e um ponto longe do X.
  const {control,position}=await discoverDepartmentTriggerByRows(page);
  console.log('DEPARTAMENTOS: campo preenchido identificado pela lista unica 21+1.');
  await control.click({position,timeout:10000});
}

export async function clickDepartmentSelectAll(page, cssOverride) {
  const selectAll = await verifyDepartmentControl(
    departmentSelectAll(page,cssOverride), 'Acao Selecionar todos de Departamento'
  );
  await selectAll.click({timeout:10000});
  // O clique sozinho NAO comprova que todas as 21 opcoes ficaram marcadas.
  // Essa verificacao permanece obrigatoria no exportador.
}
