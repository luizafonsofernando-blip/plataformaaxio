import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASKS_VIEW_SELECTOR, dashboardIndicatorLocator,
  findDashboardIndicator, ensureTasksView,
} from '../src/task-navigation.mjs';

function mockGestta({ alreadyInTasks = false, duplicateIndicator = false,
  noNumericIndicator = false, customSelector = null, roleLinkCount = 0,
  chartLinkCount = 0 } = {}) {
  let visible = alreadyInTasks;
  let clicks = 0;
  const date = {
    isVisible: async () => visible,
    waitFor: async () => { if (!visible) throw new Error('data ausente'); },
  };
  const click = async () => { visible = true; clicks++; };
  const link = {
    count: async () => roleLinkCount,
    first: () => link,
    isVisible: async () => true,
    click,
  };
  const number = {
    count: async () => noNumericIndicator ? 0 : 1,
    first: () => number,
    isVisible: async () => true,
    click,
  };
  const chartLinks = {
    count: async () => chartLinkCount,
    nth: () => ({ isVisible: async () => true, click }),
  };
  const chart = {
    getByText: (text) => ({ count: async () =>
      ['No Prazo', 'Em Atraso', 'Com Multas'].includes(text) ? 1 : 0
    }),
    getByRole: (role, options) => {
      assert.equal(role,'link');
      assert(options.name instanceof RegExp);
      return chartLinks;
    },
  };
  const heading = {
    count: async () => 1,
    locator: () => chart,
  };
  const parent = {getByText: () => number};
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
      if (css === customSelector) return link;
      throw new Error('seletor inesperado: ' + css);
    },
    getByRole: (role, options) => {
      assert.equal(role, 'link');
      assert(options.name instanceof RegExp);
      assert(options.name.test('21069'));
      return link;
    },
    getByText: (text, options) => {
      assert.equal(options.exact, true);
      if (text === 'No Prazo') return label;
      if (text === 'Tarefas Abertas') return heading;
      throw new Error('label inesperado: ' + text);
    },
  };
  return {context: {pages: () => [page]},page, clicks:()=>clicks};
}

test('acessa tarefas com um unico indicador numerico',async () => {
  const {context,page,clicks}=mockGestta({roleLinkCount:1});
  assert.equal(await ensureTasksView(context),page);
  assert.equal(clicks(),1);
});
test('ignora Dashboard quando o calendario ja esta visivel',async () => {
  const {context,page,clicks}=mockGestta({alreadyInTasks:true});
  assert.equal(await ensureTasksView(context),page);
  assert.equal(clicks(),0);
});
test('localiza link no grafico mesmo com dois rotulos No Prazo na Dashboard',async () => {
  const {context,page,clicks}=mockGestta({
    duplicateIndicator:true,roleLinkCount:3,chartLinkCount:3,
  });
  assert.equal(await ensureTasksView(context),page);
  assert.equal(clicks(),1);
});
test('duas etiquetas sem grafico delimitado causam falha segura',async () => {
  const {context,clicks}=mockGestta({
    duplicateIndicator:true,roleLinkCount:3,chartLinkCount:0,
  });
  await assert.rejects(()=>ensureTasksView(context),/Dashboard possui 2/);
  assert.equal(clicks(),0);
});
test('falha se nao existe link nem indicador numerico',async () => {
  const {context,clicks}=mockGestta({noNumericIndicator:true});
  await assert.rejects(()=>ensureTasksView(context),/nao localizado unicamente/);
  assert.equal(clicks(),0);
});
test('admite seletor CSS calibrado no grafico',async () => {
  const selector='[data-testid="tarefas-dashboard"]';
  const {page}=mockGestta({customSelector:selector});
  assert.equal(dashboardIndicatorLocator(page,{selector}),page.locator(selector));
  assert.equal(await findDashboardIndicator(page,{selector}),page.locator(selector));
});
