// Associação direta entre gatilho e menu portaled do multiselect Gestta.
// Ex.: id gestta-multiselect-dropdown-4-p =>
// ul.gestta-multiselect-dropdown__menu.data-uuid-gestta-multiselect-dropdown-4
// NUNCA usar índice global, primeiro menu da tela nem nomes de usuários.
export function usersPortalClassFromTrigger(id) {
  const match=/^gestta-multiselect-dropdown-(\d+)-p$/.exec(id||'');
  if(!match)throw new Error('Identificador de gatilho de Usuarios invalido.');
  return 'data-uuid-gestta-multiselect-dropdown-'+match[1];
}
export function usersPortalMenuSelector(id) {
  return '.gestta-multiselect-dropdown__menu.'+usersPortalClassFromTrigger(id);
}

export function summarizeUsersCheckboxes(inputStates, toggleCount, controlCount) {
  if(!Array.isArray(inputStates) ||
     !Number.isInteger(toggleCount)||toggleCount<0 ||
     !Number.isInteger(controlCount)||controlCount<0) {
    throw new Error('Estados de checkboxes Usuarios invalidos.');
  }
  const inputCheckboxCount=inputStates.length;
  const checkedCount=inputStates.filter(value=>value===true).length;
  const uncheckedCount=inputStates.filter(value=>value===false).length;
  const unknownInputCount=inputCheckboxCount-checkedCount-uncheckedCount;
  return {
    inputCheckboxCount,checkedCount,uncheckedCount,unknownInputCount,
    toggleCount,controlCount,
    // É apenas uma observação do DOM carregado. NUNCA considerar esta
    // flag prova de seleção de TODOS usuários (pode haver virtualização).
    allRenderedCheckboxesChecked:inputCheckboxCount>0 &&
      uncheckedCount===0 && unknownInputCount===0,
    allUsersProven:false,
  };
}
