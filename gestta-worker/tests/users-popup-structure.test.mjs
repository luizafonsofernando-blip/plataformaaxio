import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUsersPopupStructure,validateUsersPopupStructure}
  from '../src/users-popup-structure.mjs';

test('recusa ID inválido ou seletor genérico, sem inspecionar DOM',async()=>{
  let calls=0;
  const page={evaluate:async()=>{calls++;}};
  await assert.rejects(()=>inspectUsersPopupStructure(page,'#gestta-multiselect-dropdown-4-p'),/invalido/);
  await assert.rejects(()=>inspectUsersPopupStructure(page,'gestta-multiselect-dropdown-4-p OR #other'),/invalido/);
  assert.equal(calls,0);
});

test('aceita diagnóstico seguro de menu que pode estar em portal externo',async()=>{
  const page={evaluate:async(fn,id)=>{
    assert.equal(id,'gestta-multiselect-dropdown-4-p');
    assert.match(fn.toString(),/document.querySelectorAll/);
    return {
      validId:true,triggerPresent:true,triggerState:{
        visible:true,hasOpenParent:false,ariaExpanded:false,
      },
      globalMenusCount:4,visibleCandidates:1,
      ancestors:[{depth:1,localMenus:0}],
      nearby:[{
        kind:'dropdown_menu',relativeX:0,relativeY:5,
        liCount:12,inputCheckboxCount:12,
      }],
    };
  }};
  const result=await inspectUsersPopupStructure(page,'gestta-multiselect-dropdown-4-p');
  assert.equal(result.visibleCandidates,1);
  assert.equal(result.ancestors[0].localMenus,0);
  assert.equal(result.nearby[0].kind,'dropdown_menu');
});

test('pode distinguir menu que não abriu de menu encontrado',()=>{
  assert.equal(validateUsersPopupStructure({
    validId:true,triggerPresent:true,visibleCandidates:0,
  }).visibleCandidates,0);
  assert.throws(()=>validateUsersPopupStructure(null),/incompleto/);
  assert.throws(()=>validateUsersPopupStructure({
    validId:false,visibleCandidates:1,
  }),/incompleto/);
});
