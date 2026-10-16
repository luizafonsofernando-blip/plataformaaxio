// Controles semânticos do painel Filtros avançados do Gestta.
// Playwright Inspector em 16/10/2026: getByRole('button', { name: 'Filtrar' })
// Esse botão aplica filtros VISUAIS, não altera o status de tarefas.
// Nunca usar button:nth(...) nem iniciar exportação sem validar filtros.
export function advancedApplyButton(page, cssOverride) {
  return typeof cssOverride === 'string' && cssOverride.trim()
    ? page.locator(cssOverride.trim())
    : page.getByRole('button', { name: 'Filtrar', exact: true });
}

export async function verifyAdvancedApplyButton(page, cssOverride) {
  const button = advancedApplyButton(page, cssOverride);
  try {
    await button.first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // A contagem a seguir esclarece o motivo da falha sem revelar dados.
  }
  const count = await button.count();
  if (count !== 1 || !(await button.isVisible())) {
    throw new Error('Botao Filtrar nao localizado de forma unica e visivel ' +
      '(correspondencias=' + count + '). Confirme que Filtros avancados esta aberto.');
  }
  return button;
}

export async function clickAdvancedApplyButton(page, cssOverride) {
  const button = await verifyAdvancedApplyButton(page, cssOverride);
  await button.click({ timeout: 10000 });
}
