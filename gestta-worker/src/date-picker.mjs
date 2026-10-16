import { fillDateFields } from './calendar-field-entry.mjs';

// Interface do calendário Gestta, inspecionada localmente em 15/10/2026.
// Somente aplica filtros visuais de data; nunca altera tarefas ou envia dados.
export const DATE_SELECTORS = Object.freeze({
  range: '#date-range',
  start: 'input[name="daterangepicker_start"]',
  end: 'input[name="daterangepicker_end"]',
});

export function formatDateBR(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) throw new Error('Data deve seguir AAAA-MM-DD.');
  const date = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error('Data inexistente: ' + iso);
  }
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}

export function validateDateWindow(window) {
  if (!window || typeof window !== 'object') throw new Error('Janela de datas ausente.');
  const from = formatDateBR(window.start);
  const to = formatDateBR(window.end);
  const diff = (Date.parse(window.end + 'T00:00:00Z') -
    Date.parse(window.start + 'T00:00:00Z')) / 86400000;
  if (diff < 0 || diff > 29) {
    throw new Error('Janela de exportacao deve ter entre 1 e 30 dias inclusivos.');
  }
  if (window.start.slice(0, 7) !== window.end.slice(0, 7)) {
    throw new Error('Uma exportacao nao deve atravessar meses.');
  }
  return from + ' - ' + to;
}

export async function readControlText(locator) {
  const tag = await locator.evaluate(el => el.tagName.toLowerCase());
  return /^(input|textarea|select)$/.test(tag) ? locator.inputValue() : locator.innerText();
}

export async function applyDateWindow(page, window) {
  const desired = validateDateWindow(window);
  const rangeCss = process.env.GESTTA_DATE_RANGE_SELECTOR?.trim() || DATE_SELECTORS.range;
  const startCss = process.env.GESTTA_DATE_START_SELECTOR?.trim() || DATE_SELECTORS.start;
  const endCss = process.env.GESTTA_DATE_END_SELECTOR?.trim() || DATE_SELECTORS.end;
  const customCss = process.env.GESTTA_DATE_CUSTOM_SELECTOR?.trim();
  const applyCss = process.env.GESTTA_DATE_APPLY_SELECTOR?.trim();
  const range = page.locator(rangeCss);
  await range.waitFor({ state: 'visible', timeout: 20000 });
  if (await range.count() !== 1) throw new Error('Campo de periodo nao corresponde a um elemento unico.');

  await range.click({ timeout: 10000 });
  const custom = customCss ? page.locator(customCss) : page.getByText('Outro', { exact: true });
  if (await custom.count() !== 1) throw new Error('Opcao Outro nao foi encontrada uma unica vez.');
  await custom.click({ timeout: 10000 });

  const initial = page.locator(startCss);
  const final = page.locator(endCss);
  // Ao trocar de setembro para outubro, digitar início primeiro deixa
  // momentaneamente início > fim antigo. O plugin pode reverter as datas.
  // Decidir a ordem olhando os campos atuais, esperar rerender e não
  // clicar Aplicar se as duas datas não permanecerem corretas.
  await fillDateFields(page,{
    initial,final,
    start:formatDateBR(window.start),
    end:formatDateBR(window.end),
  });
  const noWhitespace = x => String(x).replace(/\s/g, '');

  const apply = applyCss ? page.locator(applyCss) :
    page.getByRole('button', { name: 'Aplicar', exact: true });
  if (await apply.count() !== 1) throw new Error('Botao Aplicar nao identificado de forma unica.');
  await apply.click({ timeout: 10000 });
  // Aguarda a renderização do valor em vez de confiar só no clique.
  try {
    await page.waitForFunction(({ css, target }) => {
      const el = document.querySelector(css);
      if (!el) return false;
      const value = ('value' in el ? el.value : el.textContent) || '';
      return value.replace(/\s/g, '') === target;
    }, { css: rangeCss, target: noWhitespace(desired) }, { timeout: 15000 });
  } catch (_) {
    const observed = await readControlText(range);
    throw new Error('Gestta nao confirmou intervalo ' + desired +
      '. Verifique se o datepicker alterou/aplicou as datas. Obtido: ' + observed.slice(0, 90));
  }
  return { requested: desired, applied: (await readControlText(range)).trim() };
}
