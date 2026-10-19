// Diagnostico de estrutura do resumo E-BEF, exclusivamente para homologacao.
// Nunca registra texto DOM completo, nomes de clientes/usuarios ou HTML.
// Nao clica em nenhum controle nem concede permissao de download.
const FILTER_PATTERN=/^gestta-multiselect-dropdown-\d+-p$/;

export function classifyEbefFilterLabel(raw) {
  const normalized=String(raw??'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toUpperCase();
  const suffix=normalized.match(/\+\s*(\d+)$/);
  return {
    empty: normalized.length===0,
    textLength: normalized.length,
    hasEbef: normalized.includes('EBEF'),
    hasDeclaracao: normalized.includes('DECLARACAO DE EBEF'),
    hasVerificacao: normalized.includes('VERIFICAR NECESSIDADE DE EBEF'),
    startsDeclaracao: normalized.startsWith('DECLARACAO DE EBEF'),
    isTodasTarefas: normalized==='TODAS AS TAREFAS',
    hasNumericSuffix: Boolean(suffix),
    // Nao inferir que +2 significa 3 checkboxes realmente selecionados.
    suffixIsTwo: Boolean(suffix && suffix[1]==='2'),
    strictSummaryMatch: /^DECLARACAO DE EBEF\b[\s\S]*\+\s*2\s*$/.test(normalized),
  };
}

export async function inspectEbefFilterLabelSafely(page) {
  const locator=page.locator('#gestta-multiselect-dropdown-5-p');
  const count=await locator.count();
  const result={targetCount:count,targetVisible:false,target:null,candidates:[]};
  if(count===1 && await locator.isVisible()){
    result.targetVisible=true;
    result.target=classifyEbefFilterLabel(await locator.innerText());
  }

  // Apenas metadados codificados dos dropdowns superiores; nunca retornar texto.
  const all=page.locator('[id^="gestta-multiselect-dropdown-"][id$="-p"]');
  const countAll=await all.count();
  result.topDropdownCount=countAll;
  for(let i=0;i<Math.min(countAll,9);i++){
    const node=all.nth(i);
    if(!(await node.isVisible()))continue;
    const id=await node.getAttribute('id');
    if(!FILTER_PATTERN.test(id??''))continue;
    const summary=classifyEbefFilterLabel(await node.innerText());
    result.candidates.push({
      id,hasEbef:summary.hasEbef,hasDeclaracao:summary.hasDeclaracao,
      startsDeclaracao:summary.startsDeclaracao,
      isTodasTarefas:summary.isTodasTarefas,
      suffixIsTwo:summary.suffixIsTwo,
      strictSummaryMatch:summary.strictSummaryMatch,
    });
  }
  return result;
}
