// Guardas de segurança para baixar SOMENTE UM XLSX de homologação.
// Estes critérios devem ser verdadeiros antes de clicar em Exportar.
import {validateDateWindow} from './date-picker.mjs';
import {parsePeriodTestOptions} from './period-test-options.mjs';
import {inspectExportControl} from './export-control-diagnostic.mjs';

export const EXPORT_BUTTON_CSS =
  '.mixed-topfilter__actions button.mixed-topfilter__action--export:has(.fa-download)';

export function parseSingleExportOptions(args) {
  const flag='--confirm-download';
  if(args.filter(x=>x===flag).length!==1) {
    throw new Error('Para exportar apenas um XLSX local, informe --confirm-download uma unica vez.');
  }
  const {window,expected}=parsePeriodTestOptions(args.filter(x=>x!==flag));
  // Primeira homologação deliberadamente limitada à janela já testada.
  if(window.start!=='2026-10-01' || window.end!=='2026-10-30') {
    throw new Error('Nesta primeira homologacao, permitido somente 01/10/2026 a 30/10/2026.');
  }
  validateDateWindow(window);
  return {window,expected};
}

async function uniqueVisible(locator,label) {
  const count=await locator.count();
  if(count!==1 || !(await locator.isVisible())){
    throw new Error('Filtro '+label+' nao confirmado de forma unica e visivel '+
      '(correspondencias='+count+'). Nenhum XLSX sera baixado.');
  }
}

// Preflight SEM DOWNLOAD: confirma somente clientes e Data Meta.
// A abrangencia de Usuarios e verificada separadamente pelos checkboxes;
// o resumo visual dos Usuarios nao e prova de abrangencia total.
export async function assertClientsAndDataMeta(page) {
  await uniqueVisible(page.getByText(/^Todos\s+(?:os\s+)?clientes$/i),'Todos clientes');
  await uniqueVisible(page.getByText(/^Data\s+Meta$/i),'Data Meta');
  return {allClientsLabel:true,modeDataMeta:true};
}

// Usa texto conhecido dos controles, NUNCA clica nos filtros globais.
// Se o Gestta mudar a nomenclatura, falha com segurança para calibrar.
export async function assertGlobalExportFilters(page) {
  await uniqueVisible(page.getByText(/^Todos\s+(?:os\s+)?clientes$/i),'Todos clientes');
  await uniqueVisible(page.getByText(/^Todos\s+(?:os\s+)?usu[aá]rios$/i),'Todos usuarios');
  await uniqueVisible(page.getByText(/^Data\s+Meta$/i),'Data Meta');
  return {allClients:true,allUsers:true,modeDataMeta:true};
}

export async function assertEbefSelectionPreserved(page) {
  // Identificador já calibrado para o filtro superior de tarefas.
  const container=page.locator('#gestta-multiselect-dropdown-5-p');
  if(await container.count()!==1 || !(await container.isVisible())) {
    throw new Error('Filtro de tarefas E-BEF nao identificado apos Filtrar; exportacao bloqueada.');
  }
  const text=(await container.innerText()).normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toUpperCase();
  // O resumo observado na homologacao e "DECLARACAO DE EBEF | TECNICO +2".
  // Um simples "inclui EBEF" aceita selecao parcial, por exemplo 1/3.
  // Este resumo e apenas uma verificacao de cobertura aparente: nao substitui
  // a leitura dos 3 checkboxes, que deve ser validada em homologacao no Gestta.
  if (!/^DECLARACAO DE EBEF\b[\s\S]*\+\s*2\s*$/.test(text.trim())) {
    throw new Error('Filtro superior de tarefas nao confirma resumo E-BEF 3/3; exportacao bloqueada.');
  }
  // Não exibir texto integral do componente.
  return true;
}

export async function verifiedExportButton(page) {
  const structure=await inspectExportControl(page);
  if(!structure.exportClassAndIconConfirmed || structure.uniqueExportCandidate!==true){
    throw new Error('Estrutura unica de Exportar nao confirmada; sem download.');
  }
  const button=page.locator(EXPORT_BUTTON_CSS);
  const count=await button.count();
  if(count!==1 || !(await button.isVisible()) || !(await button.isEnabled())){
    throw new Error('Botao XLSX nao e unico, visivel e habilitado ('+count+').');
  }
  return button;
}
