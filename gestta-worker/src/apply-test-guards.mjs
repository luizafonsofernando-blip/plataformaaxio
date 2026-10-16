// Validadores puros para o teste supervisionado do botão Filtrar.
import { REQUIRED_DEPARTMENTS } from './advanced-filter-config.mjs';

export function assertDepartmentSelection(info) {
  const n=REQUIRED_DEPARTMENTS.length;
  if(!info?.found || info.candidateScopes!==1 || info.rowCount!==n ||
     info.recognizedUnique!==n || !info.allExpectedPresent ||
     info.unknownCount!==0 || info.stateCounts?.indeterminado!==0 ||
     info.stateCounts?.marcado!==n || info.stateCounts?.desmarcado!==0){
    throw new Error('Selecao dos 21 departamentos nao foi comprovada. '+
      'Nao acionar Filtrar.');
  }
}

export function assertSelectedStatusesAndTypes(statuses,types) {
  if(!statuses || !types ||
     Object.keys(statuses).length!==4 || Object.values(statuses).some(item=>!item.checked) ||
     Object.keys(types).length!==3 || Object.values(types).some(item=>!item.checked)){
    throw new Error('Um status ou tipo de tarefa nao permaneceu selecionado; '+
      'nao acionar Filtrar.');
  }
}
