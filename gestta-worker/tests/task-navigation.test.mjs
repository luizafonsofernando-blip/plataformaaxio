import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS_VIEW_SELECTOR, dashboardIndicatorLocator,
  findDashboardIndicator, ensureTasksView,
} from '../src/task-navigation.mjs';

function mockGestta({ alreadyInTasks = false, duplicateIndicator = false,
  noNumericIndicator = false, customSelector = null } = {}) {
  let visible = alreadyInTasks;
  let clickCount = 0;
  const date = {
    isVisible: async () => visible,
    waitFor: async () => {
      if (!visible) throw new Error('data ausente');
    },
  };
  const value = {
    count: async () => noNumericIndicator ? 0 : 1,
    first: () => value,
    isVisible: async () => true,
    click: async () => { clickCount++; visible = true; },
  };
  const parent = {
    getByText: (pattern) => {
      assert(pattern instanceof RegExp);
      return value;
    },
  };
  const label = {
    waitFor: async () => {},
    count: async () => duplicateIndicator ? 2 : 1,
    locator: xpath => {
      assert(xpath === 'xpath=..' || xpath === 'xpath=../..');
      return parent;
    },
  };
  const page = {
    url: () => 'https://app.gestta.com.br/#/dashboard',
    isClosed: () => false,
    locator: css => {
      if (css === TASKS_VIEW_SELECTOR) return date;
      if (css === customSelector) return value;
      throw new Error('seletor inesperado: ' + css);
    },
    getByText: (text, opts) => {
      assert.equal(text, 'No Prazo');
      assert.equal(opts.exact, true);
      return label;
    },
  };
  return {
    context: { pages: () => [page] }, page,
    getClickCount: () => clickCount,
  };
}

test('abre quadro pelo indicador numerico No Prazo sem fixar 7 ou 17', async () => {
  const { context, page, getClickCount } = mockGestta();
  assert.equal(await ensureTasksView(context), page);
  assert.equal(getClickCount(), 1);
});
test('nao clica se filtro de Data Meta ja estiver visivel', async () => {
  const { context, page, getClickCount } = mockGestta({alreadyInTasks:true});
  assert.equal(await ensureTasksView(context), page);
  assert.equal(getClickCount(), 0);
});
test('aborta se No Prazo ambiguo', async () => {
  const { context, getClickCount } = mockGestta({duplicateIndicator:true});
  await assert.rejects(() => ensureTasksView(context), /No Prazo.*ambigua/);
  assert.equal(getClickCount(), 0);
});
test('aborta se nenhum numero proximo estiver acessivel', async () => {
  const { context, getClickCount } = mockGestta({noNumericIndicator:true});
  await assert.rejects(() => ensureTasksView(context), /nao localizado com seguranca/);
  assert.equal(getClickCount(), 0);
});
test('admite seletor calibrado no numero do grafico', async () => {
  const selector = '[data-testid="dashboard-on-time-tasks"]';
  const {page} = mockGestta({customSelector:selector});
  assert.equal(dashboardIndicatorLocator(page, {selector}), page.locator(selector));
  assert.equal(await findDashboardIndicator(page,{selector}),page.locator(selector));
});
