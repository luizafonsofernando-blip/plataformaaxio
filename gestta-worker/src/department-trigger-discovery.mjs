// Encontra o dropdown de Departamento quando o Gestta mantém seleções
// e deixa de exibir "Todos departamentos" (ex.: "Contábil +16").
// Nunca clica por índice, por texto do departamento ou em botão X.
// Apenas identifica um ID de dropdown relacionado ao título Departamento.
export function validateDepartmentTriggerDiscovery(diagnostic) {
  if (!diagnostic || diagnostic.labelCount!==1 || diagnostic.candidateCount!==1 ||
      !/^gestta-multiselect-dropdown-\d+-p$/.test(diagnostic.candidateId||'') ||
      diagnostic.depth < 1 || diagnostic.depth > 5) {
    throw new Error('Campo Departamento preenchido: contêiner não identificado '+
      'de forma segura (titulos='+ (diagnostic?.labelCount ?? '?')+
      '; candidatos='+ (diagnostic?.candidateCount ?? '?')+
      '; profundidade='+ (diagnostic?.depth ?? '?')+'). Nada foi clicado.');
  }
  return '#'+diagnostic.candidateId;
}

export async function discoverDepartmentTrigger(page) {
  const diagnostic=await page.evaluate(() => {
    // Inspeciona apenas o título do campo, jamais nomes de clientes ou
    // texto de departamentos. Retorna só identificador DOM e contagens.
    const labels=[...document.querySelectorAll('label, span, div, strong, b')]
      .filter(el=>el.children.length===0 &&
        el.textContent?.trim().normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'').toUpperCase()==='DEPARTAMENTO');
    if(labels.length!==1) {
      return {labelCount:labels.length,candidateCount:0,depth:0,candidateId:''};
    }
    let parent=labels[0].parentElement;
    for(let depth=1;parent && depth<=5;depth++,parent=parent.parentElement) {
      const candidates=[...parent.querySelectorAll(
        '[id^="gestta-multiselect-dropdown-"][id$="-p"]'
      )];
      // Não confundir o departamento com todos os dropdowns da tela:
      // tomar somente o primeiro ancestral com um único ID de dropdown.
      if(candidates.length!==0){
        return {labelCount:1,candidateCount:candidates.length,
          depth,candidateId:candidates.length===1?candidates[0].id:''};
      }
    }
    return {labelCount:1,candidateCount:0,depth:0,candidateId:''};
  });
  const selector=validateDepartmentTriggerDiscovery(diagnostic);
  const control=page.locator(selector);
  const count=await control.count();
  if(count!==1 || !(await control.isVisible())){
    throw new Error('Controle identificado para Departamento não é único e visível '+
      '(correspondências='+count+'). Nada foi clicado.');
  }
  return control;
}
