// Status do painel Filtros avançados do Gestta, confirmados no
// Playwright Inspector em 16/10/2026.
// "Aberta" e "Impedimento" exibiram glifo adicional no nome acessível.
// Por isso, usar expressão ancorada no nome + borda de palavra;
// nunca fixar um caractere de ícone ou um índice de checkbox.
// Estes controles afetam APENAS filtros visuais, não o estado das tarefas.

export const VERIFIED_STATUS_LABELS = Object.freeze({
  ABERTA: 'Aberta',
  CONCLUIDA: 'Concluída',
  IMPEDIMENTO: 'Impedimento',
  DESCONSIDERADA: 'Desconsiderada',
});

// Todos os quatro usam correspondência ancorada, tolerando apenas
// espaços/ícones ao final do nome acessível. O diagnóstico integrado
// encontrou Concluída na primeira leitura, mas após um clique no filtro
// anterior a busca por igualdade exata retornou zero correspondências.
// A hipótese de um glifo dinâmico será verificada no próximo teste real.
const NAME_MATCHERS = Object.freeze({
  ABERTA: /^Aberta\b/i,
  CONCLUIDA: /^Concluída\b/i,
  IMPEDIMENTO: /^Impedimento\b/i,
  DESCONSIDERADA: /^Desconsiderada\b/i,
});

export function statusCheckbox(page, key) {
  if (!Object.hasOwn(NAME_MATCHERS, key)) {
    throw new Error('Status E-BEF não reconhecido: ' + String(key));
  }
  return page.getByRole('checkbox', { name: NAME_MATCHERS[key] });
}

export function concludedStatusCheckbox(page) {
  return statusCheckbox(page, 'CONCLUIDA');
}

export async function inspectConcludedStatus(page) {
  const checkbox = concludedStatusCheckbox(page);
  const count = await checkbox.count();
  if (count !== 1) {
    throw new Error('Checkbox Concluída: esperado 1, encontrados ' + count +
      '. Abra Filtros avançados e confira o localizador.');
  }
  if (!(await checkbox.isVisible())) {
    throw new Error('Checkbox Concluída encontrado, mas não visível.');
  }
  return { found: true, checked: await checkbox.isChecked() };
}

export async function inspectAdvancedStatuses(page) {
  const results = {};
  for (const key of Object.keys(VERIFIED_STATUS_LABELS)) {
    const item = statusCheckbox(page,key);
    try { await item.first().waitFor({ state: 'visible', timeout: 15000 }); }
    catch { /* Capturar contagem detalhada abaixo sem clicar. */ }
    const count = await item.count();
    if (count !== 1 || !(await item.isVisible())) {
      throw new Error('Filtro avançado ' + key + ' não localizado de forma ' +
        'única e visível (correspondências=' + count + ').');
    }
    results[key] = { checked: await item.isChecked() };
  }
  return results;
}

export async function ensureAllAdvancedStatuses(page) {
  // Conferir o grupo inteiro antes de qualquer marcação. A cada alteração
  // confirmar o estado do elemento, sem tocar em status de tarefas reais.
  const initial = await inspectAdvancedStatuses(page);
  console.log('STATUS: encontrados=4/4; marcados_iniciais='+
    Object.values(initial).filter(x=>x.checked).length);
  for (const key of Object.keys(VERIFIED_STATUS_LABELS)) {
    const item = statusCheckbox(page,key);
    const matches=await item.count();
    if(matches!==1 || !(await item.isVisible())){
      const applied=await page.getByRole('button',{name:'Filtrar',exact:true}).count();
      throw new Error('Status '+key+' desapareceu ou ficou ambiguo apos '+
        'interacao anterior (correspondencias='+matches+'; botoes_Filtrar='+applied+'). '+
        'Nao prosseguir com a exportacao.');
    }
    const previouslyChecked=await item.isChecked();
    if(!previouslyChecked) await item.check({timeout:10000});
    if(!(await item.isChecked())){
      throw new Error('Status '+key+' nao permaneceu marcado.');
    }
    console.log('STATUS: '+key+'=marcado'+(previouslyChecked?' (ja estava)':' (selecionado)'));
  }
  const final = await inspectAdvancedStatuses(page);
  if (Object.values(final).some(x => x.checked !== true)) {
    throw new Error('Nem todos os quatro status permaneceram selecionados.');
  }
  return { selected: 4 };
}
