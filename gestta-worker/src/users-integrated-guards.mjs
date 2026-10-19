// Validacoes puras para a homologacao da selecao visual de Usuarios.
// 596/596 checkboxes renderizados nao comprova, por si, que todos os usuarios
// cadastrados no Gestta tenham sido carregados. Nunca declarar cobertura global.
export function assertAllRenderedUsersChecked(info) {
  if (!info || info.found!==true ||
      !['uuid_class_confirmed','geometric_provisional'].includes(info.menuAssociation) ||
      info.nearbyMenus!==1 ||
      !Number.isInteger(info.inputCheckboxCount) || info.inputCheckboxCount<1 ||
      info.disabledInputCount!==0 || info.unknownInputCount!==0 ||
      info.checkedCount!==info.inputCheckboxCount || info.uncheckedCount!==0) {
    throw new Error('Checkboxes renderizados de Usuarios nao confirmados integralmente.');
  }
  return info.inputCheckboxCount;
}

export function assertUserSelectionPersisted(checkedBefore, after) {
  if (!Number.isInteger(checkedBefore) || checkedBefore<1) {
    throw new Error('Contagem inicial de Usuarios invalida.');
  }
  const observed=assertAllRenderedUsersChecked(after);
  if(observed!==checkedBefore) {
    throw new Error('Quantidade de checkboxes de Usuarios mudou apos Filtrar; nao homologado.');
  }
  return {visibleCheckboxes:observed,checkedCount:observed,allUsersProven:false};
}
