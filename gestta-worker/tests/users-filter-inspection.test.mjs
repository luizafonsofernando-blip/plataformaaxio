import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUserDropdownTopology,inspectUserDropdownTopology,
  openUsersFilterForInspection,inspectUsersPopup,
} from '../src/users-filter-inspection.mjs';

const valid=()=>({
  clients:1,candidates:1,dateVisible:true,
  userId:'gestta-multiselect-dropdown-4-p',
});

test('aceita somente filtro unico geometricamente entre Todos clientes e calendário',()=>{
  assert.equal(validateUserDropdownTopology(valid()),
    'gestta-multiselect-dropdown-4-p');
  for(const changes of [
    {clients:0},{clients:2},{candidates:0},{candidates:2},
    {dateVisible:false},{userId:'gestta-multiselect-dropdown-5-p extra'},
  ])assert.throws(()=>validateUserDropdownTopology({...valid(),...changes}),
    /nao confirmada/);
});

test('não clica em outros filtros ou no botão de limpar',async()=>{
  let clicks=0;
  const control={
    count:async()=>1,isVisible:async()=>true,
    evaluate:async()=>({safe:true,x:12,y:15}),
    click:async options=>{
      clicks++;
      assert.deepEqual(options.position,{x:12,y:15});
    },
  };
  const page={locator:selector=>{
    assert.equal(selector,'#gestta-multiselect-dropdown-4-p');
    return control;
  }};
  const id=await openUsersFilterForInspection(page,valid());
  assert.equal(id,valid().userId);
  assert.equal(clicks,1);
});

test('bloqueia área do X, botão secundário ou controle encoberto',async()=>{
  for(const unsafe of ['clique_em_controle_secundario','elemento_encoberto']){
    let clicks=0;
    const page={locator:()=>({
      count:async()=>1,isVisible:async()=>true,
      evaluate:async()=>({safe:false,reason:unsafe}),
      click:async()=>{clicks++;},
    })};
    await assert.rejects(()=>openUsersFilterForInspection(page,valid()),/ponto seguro/);
    assert.equal(clicks,0);
  }
});

test('somente nome codificado e contagens podem sair do diagnóstico',async()=>{
  const result=await inspectUserDropdownTopology({evaluate:async()=>({
    ...valid(),topDropdowns:3,labelKind:'resumo_com_quantidade',
    userClasses:['gestta-multiselect-dropdown__toggle'],
  })});
  assert.equal(result.topologyConfirmed,true);
  assert.equal(JSON.stringify(result).includes('Abigail'),false);
});

test('inspeção do popup vincula o portal ao ID e nunca declara todos usuarios comprovados',async()=>{
  let calls=0;
  const page={evaluate:async(fn,args)=>{
    calls++;
    assert.deepEqual(args,{
      id:valid().userId,
      portalClass:'data-uuid-gestta-multiselect-dropdown-4',
    });
    return {found:true,menuAssociation:'data_uuid_trigger',liCount:603,
      inputStates:[true,false,true],disabledInputCount:0,
      toggleCount:6,controlCount:1};
  }};
  const info=await inspectUsersPopup(page,valid().userId);
  assert.equal(info.inputCheckboxCount,3);
  assert.equal(info.checkedCount,2);
  assert.equal(info.uncheckedCount,1);
  assert.equal(info.allUsersProven,false);
  assert.equal(JSON.stringify(info).includes('inputStates'),false);
  assert.equal(calls,1);
  await assert.rejects(()=>inspectUsersPopup(page,'#something'),/invalido/);
});
