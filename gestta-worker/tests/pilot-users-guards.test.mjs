import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_MIN_RENDERED_OPTIONS,validatePilotUsersStructure,
  validatePilotUsersSelected,assertPilotUsersStable}
  from '../src/pilot-users-guards.mjs';

const popup=(total=597,checked=total)=>({
  found:true,menuAssociation:'geometric_provisional',
  nearbyMenus:1,controlCount:1,
  inputCheckboxCount:total,checkedCount:checked,
  uncheckedCount:total-checked,disabledInputCount:0,unknownInputCount:0,
});
const classified=(total=597,checked=total)=>({
  found:true,association:'geometric_provisional',
  total:{count:total,checked,unchecked:total-checked,disabled:0},
  groups:{
    option:{count:total,checked,unchecked:total-checked,disabled:0},
    control:{count:0,checked:0,unchecked:0,disabled:0},
    unknown:{count:0,checked:0,unchecked:0,disabled:0},
  },allUsersProven:false,
});

test('597 opcoes, 596 marcadas e uma pendente exigem selecao',()=>{
  assert.equal(PILOT_MIN_RENDERED_OPTIONS,596);
  assert.equal(validatePilotUsersStructure(popup(597,596),classified(597,596)),597);
  assert.throws(()=>validatePilotUsersSelected(popup(597,596),classified(597,596)),
    /Nem todos/);
});
test('permite total dinamico apos marcar 597 e confere estabilidade',()=>{
  const approved=validatePilotUsersSelected(popup(597),classified(597));
  assert.deepEqual(approved,{
    visibleCheckboxes:597,checkedCount:597,allUsersProven:false,
  });
  assert.deepEqual(assertPilotUsersStable(approved,approved),approved);
  assert.equal(validatePilotUsersSelected(popup(596),classified(596)).visibleCheckboxes,596);
});
test('falha com contagem menor que piso ou alterada apos Filtrar',()=>{
  assert.throws(()=>validatePilotUsersStructure(popup(595),classified(595)),
    /Estrutura/);
  assert.throws(()=>assertPilotUsersStable(
    validatePilotUsersSelected(popup(597),classified(597)),
    validatePilotUsersSelected(popup(598),classified(598))),
  /mudou/);
});
test('nao aceita checkbox de controle, desconhecido, desabilitado ou estado divergente',()=>{
  const r=classified();
  assert.throws(()=>validatePilotUsersStructure(popup(),{
    ...r,groups:{...r.groups,option:{...r.groups.option,count:596},
      control:{count:1,checked:1,unchecked:0,disabled:0}},
  }),/Estrutura/);
  assert.throws(()=>validatePilotUsersStructure(popup(),{
    ...r,groups:{...r.groups,unknown:{count:1,checked:1,unchecked:0,disabled:0}},
  }),/Estrutura/);
  assert.throws(()=>validatePilotUsersStructure(popup(),{
    ...r,association:'uuid_class_confirmed',
  }),/Estrutura/);
  assert.throws(()=>validatePilotUsersStructure(popup(),{
    ...r,total:{...r.total,checked:596,unchecked:1},
  }),/Estrutura/);
  assert.throws(()=>validatePilotUsersStructure(popup(),{
    ...r,allUsersProven:true,
  }),/Estrutura/);
});
