import test from 'node:test';
import assert from 'node:assert/strict';
import {
 requireSelectAllConsent,validateUsersBeforeSelect,
 inspectSelectAllTarget,selectUsersAllVisualOnly,
} from '../src/users-select-all-guards.mjs';

const before=()=>({
 found:true,menuAssociation:'geometric_provisional',nearbyMenus:1,
 controlCount:1,disabledInputCount:0,unknownInputCount:0,
 inputCheckboxCount:596,checkedCount:2,uncheckedCount:594,
});

test('exige confirmacao explicita e unica',()=>{
  assert.equal(requireSelectAllConsent(['--confirm-select-all']),true);
  for(const arg of [[],['--auto'],['--confirm-select-all','--confirm-select-all']]){
    assert.throws(()=>requireSelectAllConsent(arg),/confirm-select-all/);
  }
});
test('aceita apenas menu unico consistente com 594 opcoes desmarcadas',()=>{
  assert.equal(validateUsersBeforeSelect(before()),true);
  for(const delta of [
   {found:false},{nearbyMenus:2},{controlCount:2},
   {disabledInputCount:1},{unknownInputCount:1},{inputCheckboxCount:0},
   {uncheckedCount:0},{checkedCount:100},
   {menuAssociation:'uncertain'},
  ]){
    assert.throws(()=>validateUsersBeforeSelect({...before(),...delta}),
      /nao validado/);
  }
});
test('rejeita ID invalido antes de consultar pagina',async()=>{
 let calls=0;
 await assert.rejects(()=>inspectSelectAllTarget({
  evaluate:async()=>{calls++;}
 },'invalid'),/invalido/);
 assert.equal(calls,0);
});
test('a verificacao do clique bloqueia dropdown fora de Usuarios',async()=>{
  const page={evaluate:async()=>({safe:false,reason:'fora_da_secao_usuarios'})};
  assert.deepEqual(await inspectSelectAllTarget(page,'gestta-multiselect-dropdown-4-p'),
    {safe:false,reason:'fora_da_secao_usuarios'});
});
test('clica UMA vez se menu unico nao mudou e verifica todos checkboxes',async()=>{
 let clicks=0,checks=0,reads=0;
 const select={
  count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,
  click:async()=>{clicks++;},
 };
 const page={
  evaluate:async()=>({safe:true,menuIndex:2,nearbyMenus:1,selectAllCount:1,
   checkboxCount:596,uncheckedCount:594}),
  locator:(css)=>{
   assert.equal(css,'.gestta-multiselect-dropdown__menu');
   return {
    nth:idx=>{
     assert.equal(idx,2);
     return {locator:(sel)=>{
      assert.equal(sel,'li');
      return {filter:({hasText})=>{
       assert(hasText.test('Selecionar todos'));
       return {locator:css=>{
        assert.equal(css,'a');
        return select;
       }};
      }};
     }};
    },
   };
  },
  waitForTimeout:async()=>{},
 };
 // Simular o retorno de inspectUsersPopup sem navegador real requer
 // que a pagina avalie o resumo já validado e retornado pelo helper.
 const origEvaluate=page.evaluate;
 page.evaluate=async(fn,args)=>{
   if(typeof args==='string'){
     return origEvaluate(fn,args);
   }
   if(args && Object.hasOwn(args,'portalClass')){
     reads++;
     return {found:true,menuAssociation:'geometric_provisional',
       totalGlobalMenus:3,nearbyMenus:1,uuidMatches:0,liCount:603,
       inputStates:new Array(596).fill(true),disabledInputCount:0,
       toggleCount:599,controlCount:1};
   }
   return origEvaluate(fn,args);
 };
 const result=await selectUsersAllVisualOnly(page,
   'gestta-multiselect-dropdown-4-p',before());
 assert.equal(clicks,1);
 assert.equal(checks,0);
 assert.equal(reads,1);
 assert.equal(result.confirmedRendered,true);
 assert.equal(result.afterChecked,596);
 assert.equal(result.allUsersProven,false);
});
test('interrompe sem clicar quando o alvo mudou entre verificacoes',async()=>{
 let clicks=0,reads=0;
 const page={
  evaluate:async()=>({safe:true,menuIndex:reads++===0?2:1,
   checkboxCount:596,uncheckedCount:594}),
  locator:()=>({nth:()=>({locator:()=>({filter:()=>({locator:()=>({
   count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,
   click:async()=>{clicks++}
  })})})})}),
 };
 await assert.rejects(()=>selectUsersAllVisualOnly(page,
  'gestta-multiselect-dropdown-4-p',before()),/mudou antes/);
 assert.equal(clicks,0);
});
test('nao permite exportacao nem afirma allUsersProven',()=>{
 const code=selectUsersAllVisualOnly.toString();
 assert.equal(/exportReport|fetch\(|clickAdvancedApplyButton|syncTasks/.test(code),false);
});
