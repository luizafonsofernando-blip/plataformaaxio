import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAllRenderedUsersChecked,assertUserSelectionPersisted}
  from '../src/users-integrated-guards.mjs';

const valid=()=>({
  found:true,menuAssociation:'geometric_provisional',nearbyMenus:1,
  inputCheckboxCount:596,checkedCount:596,uncheckedCount:0,
  disabledInputCount:0,unknownInputCount:0,
});

test('valida 596 checkboxes renderizados e nao infere cobertura global',()=>{
  assert.equal(assertAllRenderedUsersChecked(valid()),596);
  assert.deepEqual(assertUserSelectionPersisted(596,valid()),{
    visibleCheckboxes:596,checkedCount:596,allUsersProven:false,
  });
});

test('rejeita selecao parcial, DOM ambiguo ou total alterado',()=>{
  const cases=[
    {checkedCount:595,uncheckedCount:1},
    {unknownInputCount:1},
    {disabledInputCount:1},
    {nearbyMenus:2},
    {menuAssociation:'desconhecida'},
    {found:false},
    {inputCheckboxCount:0,checkedCount:0},
  ];
  for(const patch of cases){
    assert.throws(()=>assertAllRenderedUsersChecked({...valid(),...patch}));
  }
  assert.throws(()=>assertUserSelectionPersisted(596,{...valid(),inputCheckboxCount:595,checkedCount:595}));
  assert.throws(()=>assertUserSelectionPersisted(0,valid()));
});

test('aceita associacao forte ao portal com mesma selecao completa',()=>{
  assert.equal(assertAllRenderedUsersChecked({...valid(),menuAssociation:'uuid_class_confirmed'}),596);
});
