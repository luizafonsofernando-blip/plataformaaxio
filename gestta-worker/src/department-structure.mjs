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

export async function inspectDepartmentStructure(page) {
  const rows = departmentRowCandidates(page);
  const count = await rows.count();
  const allowed = new Set(REQUIRED_DEPARTMENTS.map(normalizeDepartmentLabel));
  const recognized = [];
  const snapshots = {};
  let unknownCount = 0;
  for (let i = 0; i < count; i++) {
    const snapshot = await rows.nth(i).evaluate(li => {
      const toggle = li.querySelector(':scope > .gestta-multiselect-dropdown__item-toggle');
      const checkbox = toggle?.querySelector('.checkbox-item') ?? null;
      const inner = checkbox?.matches('input[type="checkbox"]') ? checkbox :
        checkbox?.querySelector('input[type="checkbox"]') ?? null;
      const ariaNode = [checkbox, toggle, li].find(el =>
        el?.getAttribute('aria-checked') !== null) ?? null;
      const safeClasses = el => Array.from(el?.classList || [])
        .filter(x => /^[\w-]{1,64}$/.test(x))
        .slice(0,8);
      return {
        label: String(li.innerText || '').trim().slice(0,160),
        elementTag: checkbox?.tagName.toLowerCase() || 'none',
        toggleTag: toggle?.tagName.toLowerCase() || 'none',
        checkboxClasses: safeClasses(checkbox),
        toggleClasses: safeClasses(toggle),
        checkboxRole: checkbox?.getAttribute('role') || '',
        inputType: inner?.type || null,
        inputChecked: inner ? Boolean(inner.checked) : null,
        ariaChecked: ariaNode?.getAttribute('aria-checked') ?? null,
        dataState: checkbox?.getAttribute('data-state') || '',
      };
    });
    const normalized = normalizeDepartmentLabel(snapshot.label);
    if (!allowed.has(normalized)) {
      unknownCount++;
      continue; // nao exibir nomes desconhecidos, possivelmente de outros clientes
    }
    recognized.push(normalized);
    // Somente os nomes conhecidos da lista ORTECONTE são apresentados.
    snapshots[normalized] = {
      state: classifyChecked(snapshot),
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
