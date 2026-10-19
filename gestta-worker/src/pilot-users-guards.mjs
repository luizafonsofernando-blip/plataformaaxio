// Regras do piloto com filtros de Usuarios: somente checkboxes renderizados.
// Nao afirma cobertura global nem gera autorizacao de sincronizacao.
// O piso corresponde a cobertura VISUAL ja homologada (596), mas nao fixa
// o total: novas opcoes reconhecidas devem ser selecionadas e verificadas.
export const PILOT_MIN_RENDERED_OPTIONS=596;

export function validatePilotUsersStructure(popup,classified){
  if(!popup || popup.found!==true || !classified || classified.found!==true ||
     !['uuid_class_confirmed','geometric_provisional'].includes(popup.menuAssociation) ||
     popup.menuAssociation!==classified.association ||
     popup.nearbyMenus!==1 || popup.controlCount!==1 ||
     !Number.isInteger(popup.inputCheckboxCount) ||
     popup.inputCheckboxCount<PILOT_MIN_RENDERED_OPTIONS ||
     !Number.isInteger(popup.checkedCount) ||
     !Number.isInteger(popup.uncheckedCount) ||
     popup.checkedCount+popup.uncheckedCount!==popup.inputCheckboxCount ||
     popup.disabledInputCount!==0 || popup.unknownInputCount!==0 ||
     classified.total?.count!==popup.inputCheckboxCount ||
     classified.total?.checked!==popup.checkedCount ||
     classified.total?.unchecked!==popup.uncheckedCount ||
     classified.total?.disabled!==0 ||
     classified.groups?.option?.count!==popup.inputCheckboxCount ||
     classified.groups?.option?.checked!==popup.checkedCount ||
     classified.groups?.option?.unchecked!==popup.uncheckedCount ||
     classified.groups?.option?.disabled!==0 ||
     classified.groups?.control?.count!==0 ||
     classified.groups?.unknown?.count!==0 ||
     classified.allUsersProven!==false){
    throw new Error('Estrutura dos Usuarios divergiu no piloto; sem download.');
  }
  return popup.inputCheckboxCount;
}

export function validatePilotUsersSelected(popup,classified){
  const count=validatePilotUsersStructure(popup,classified);
  if(popup.checkedCount!==count || popup.uncheckedCount!==0){
    throw new Error('Nem todos os Usuarios renderizados estao selecionados; sem download.');
  }
  return {visibleCheckboxes:count,checkedCount:count,allUsersProven:false};
}

export function assertPilotUsersStable(before,after){
  if(!before || !after ||
     !Number.isInteger(before.visibleCheckboxes) ||
     before.visibleCheckboxes<PILOT_MIN_RENDERED_OPTIONS ||
     before.checkedCount!==before.visibleCheckboxes ||
     after.visibleCheckboxes!==before.visibleCheckboxes ||
     after.checkedCount!==after.visibleCheckboxes ||
     before.allUsersProven!==false || after.allUsersProven!==false){
    throw new Error('Total renderizado mudou entre etapas; piloto interrompido.');
  }
  return {...after,allUsersProven:false};
}
