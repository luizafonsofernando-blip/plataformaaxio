// Ícone do funil confirmado por diagnóstico headless em 16/10/2026:
// botão com classes btn btn-link, contendo glyphicon glyphicon-filter,
// dentro de .mixed-topfilter__actions.
// Selecionamos por estrutura, nunca por posição/nth.
export const ADVANCED_OPEN_CSS =
  '.mixed-topfilter__actions button.btn.btn-link:has(.glyphicon.glyphicon-filter)';

export function advancedOpenLocator(page, cssOverride) {
  const css=typeof cssOverride==='string' && cssOverride.trim()
    ? cssOverride.trim() : ADVANCED_OPEN_CSS;
  return page.locator(css);
}

export async function verifyAdvancedOpenLocator(page, cssOverride) {
  const locator=advancedOpenLocator(page,cssOverride);
  try { await locator.first().waitFor({state:'visible',timeout:15000}); }
  catch { /* detalhar contagem abaixo, sem clique */ }
  const count=await locator.count();
  if(count!==1 || !(await locator.isVisible())){
    throw new Error('Funil de Filtros avancados nao identificado de forma unica e visivel '+
      '(correspondencias='+count+'). Nenhum botao foi acionado.');
  }
  return locator;
}

export async function openAdvancedFilters(page, cssOverride) {
  const locator=await verifyAdvancedOpenLocator(page,cssOverride);
  await locator.click({timeout:10000});
}
