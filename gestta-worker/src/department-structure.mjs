// Inspecao SOMENTE-LEITURA do dropdown Departamento no Gestta.
// O Inspector mostrou os seguintes componentes em 16/10/2026:
//   Administrativo: locator('.checkbox-item').first()
//   Arquivo: locator('li:nth-child(5) > .gestta-multiselect-dropdown__item-toggle > .checkbox-item').first()
// O indice nth-child NAO deve ser usado em producao.
// O objetivo e descobrir uma ancora de linha por nome e como ler "marcado".
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';

export function normalizeDepartmentLabel(text) {
  return String(text ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

export function departmentRowCandidates(page) {
  // Match estrutural originado do seletor do Inspector, sem nth-child.
  // Se a pagina virtualizar ou mudar de componentes, diagnostico falha seguro.
  return page.locator('li:has(> .gestta-multiselect-dropdown__item-toggle > .checkbox-item)');
}

function classifyChecked(snapshot) {
  if (snapshot.inputType === 'checkbox' && typeof snapshot.inputChecked === 'boolean') {
    return snapshot.inputChecked ? 'marcado' : 'desmarcado';
  }
  if (snapshot.ariaChecked === 'true') return 'marcado';
  if (snapshot.ariaChecked === 'false') return 'desmarcado';
  return 'indeterminado';
}

export function summarizeDepartmentSnapshots(allSnapshots) {
  const snapshotsList = Array.isArray(allSnapshots) ? allSnapshots : [];
  const count = snapshotsList.length;
  const allowed = new Set(REQUIRED_DEPARTMENTS.map(normalizeDepartmentLabel));
  const recognized = [];
  const snapshots = {};
  let unknownCount = 0;

  for (const snapshot of snapshotsList) {
    const normalized = normalizeDepartmentLabel(snapshot.label);
    if (!allowed.has(normalized)) {
      unknownCount++;
      continue; // não imprimir outros nomes ou texto do Gestta
    }
    recognized.push(normalized);
    snapshots[normalized] = {
      state:classifyChecked(snapshot),
      elementTag:snapshot.elementTag,
      toggleTag:snapshot.toggleTag,
      checkboxRole:snapshot.checkboxRole,
      inputType:snapshot.inputType,
      ariaChecked:snapshot.ariaChecked,
      dataState:snapshot.dataState,
      checkboxClasses:snapshot.checkboxClasses,
      toggleClasses:snapshot.toggleClasses,
    };
  }
  return {
    rowCount:count,
    recognizedUnique:new Set(recognized).size,
    recognizedCount:recognized.length,
    unknownCount,
    allExpectedPresent:REQUIRED_DEPARTMENTS.every(
      name=>recognized.includes(normalizeDepartmentLabel(name))
    ) && recognized.length === REQUIRED_DEPARTMENTS.length,
    stateCounts:{
      marcado:Object.values(snapshots).filter(x=>x.state==='marcado').length,
      desmarcado:Object.values(snapshots).filter(x=>x.state==='desmarcado').length,
      indeterminado:Object.values(snapshots).filter(x=>x.state==='indeterminado').length,
    },
    examples:{
      ADMINISTRATIVO:snapshots.ADMINISTRATIVO || null,
      ARQUIVO:snapshots.ARQUIVO || null,
    },
  };
}

// Leitura sem espera por localizadores do Playwright. A versao anterior
// usava locator.evaluateAll() com :has(), que nao retornou no Gestta real.
// querySelectorAll() no DOM e imediata, inclusive quando houver ZERO linhas.
// textContent evita calculos de layout de innerText em menus grandes.
export async function inspectDepartmentStructure(page) {
  const snapshots = await page.evaluate(() => {
    const toggles = document.querySelectorAll('.gestta-multiselect-dropdown__item-toggle');
    const list = [];
    for (const toggle of toggles) {
      const li=toggle.closest('li');
      if (!li || !toggle.querySelector('.checkbox-item')) continue;
      const checkbox=toggle.querySelector('.checkbox-item');
      const inner=checkbox.matches('input[type="checkbox"]') ? checkbox :
        checkbox.querySelector('input[type="checkbox"]');
      const ariaNode=[checkbox,toggle,li].find(el=>
        el && el.getAttribute('aria-checked') !== null);
      const safeClasses=el=>Array.from(el?.classList || [])
        .filter(x=>/^[\w-]{1,64}$/.test(x)).slice(0,8);
      list.push({
        label:String(li.textContent || '').trim().replace(/\s+/g,' ').slice(0,160),
        elementTag:checkbox.tagName.toLowerCase(),
        toggleTag:toggle.tagName.toLowerCase(),
        checkboxClasses:safeClasses(checkbox),
        toggleClasses:safeClasses(toggle),
        checkboxRole:checkbox.getAttribute('role') || '',
        inputType:inner?.type || null,
        inputChecked:inner ? Boolean(inner.checked) : null,
        ariaChecked:ariaNode?.getAttribute('aria-checked') ?? null,
        dataState:checkbox.getAttribute('data-state') || '',
      });
    }
    return list;
  });
  return summarizeDepartmentSnapshots(snapshots);
}

// Diagnostica SOMENTE contagens, sem acessar dados de clientes ou de tarefas.
export async function inspectDepartmentCounts(page) {
  return page.evaluate(() => ({
    toggleCount:document.querySelectorAll('.gestta-multiselect-dropdown__item-toggle').length,
    checkboxItemCount:document.querySelectorAll('.checkbox-item').length,
    listItemCount:document.querySelectorAll('li').length,
  }));
}
