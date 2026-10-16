import test from 'node:test';
import assert from 'node:assert/strict';
import {
  usersPortalClassFromTrigger,
  usersPortalMenuSelector,
  summarizeUsersCheckboxes,
} from '../src/users-portal-menu.mjs';
import {inspectUsersPopup} from '../src/users-filter-inspection.mjs';

test('identifica especificamente o portal do campo de usuarios sem ID fixo',()=>{
  assert.equal(usersPortalClassFromTrigger('gestta-multiselect-dropdown-4-p'),
    'data-uuid-gestta-multiselect-dropdown-4');
  assert.equal(usersPortalMenuSelector('gestta-multiselect-dropdown-22-p'),
    '.gestta-multiselect-dropdown__menu.data-uuid-gestta-multiselect-dropdown-22');
  for(const id of ['',null,'gestta-multiselect-dropdown-4','other-4-p','#gestta-multiselect-dropdown-4-p']) {
    assert.throws(()=>usersPortalClassFromTrigger(id),/invalido/);
  }
});

test('conta inputs sem concluir equivocadamente que todos os usuarios estão marcados',()=>{
  const summary=summarizeUsersCheckboxes([true,false,true,null],7,1);
  assert.equal(summary.inputCheckboxCount,4);
  assert.equal(summary.checkedCount,2);
  assert.equal(summary.uncheckedCount,1);
  assert.equal(summary.unknownInputCount,1);
  assert.equal(summary.allRenderedCheckboxesChecked,false);
  assert.equal(summary.allUsersProven,false);
  const complete=summarizeUsersCheckboxes([true,true,true],4,1);
  assert.equal(complete.allRenderedCheckboxesChecked,true);
  assert.equal(complete.allUsersProven,false);
  assert.throws(()=>summarizeUsersCheckboxes(null,4,1),/invalidos/);
});

test('quando portal está ausente ou ambíguo, diagnóstico não confirma seleção',async()=>{
  for(const result of [
    {found:false,reason:'menu_portal_nao_encontrado',count:0},
    {found:false,reason:'menu_portal_ambiguo_ou_oculto',count:2},
    {found:false,reason:'gatilho_nao_expandido',count:0},
  ]){
    const page={evaluate:async()=>result};
    const observed=await inspectUsersPopup(page,'gestta-multiselect-dropdown-4-p');
    assert.deepEqual(observed,result);
    assert.equal(observed.allUsersProven,undefined);
  }
});

test('diagnóstico real do portal lê estado do checkbox sem devolver nomes',async()=>{
  let requestedSelector='';
  const menu={
    tagName:'UL',
    getBoundingClientRect:()=>({left:660,right:940,top:48,bottom:298,width:280,height:250}),
    classList:{contains:token=>token==='data-uuid-gestta-multiselect-dropdown-4'},
    querySelectorAll:selector=>{
      if(selector==='li')return new Array(603).fill({});
      if(selector==='.gestta-multiselect-dropdown__item-toggle'){
        return Array.from({length:599},(_,idx)=>({
          closest:()=>({textContent:idx===0?'Selecionar todos':'Nome secreto de usuário'})
        }));
      }
      if(selector==='input[type="checkbox"]')return Array.from(
        {length:596},(_,idx)=>({checked:idx<595,disabled:false})
      );
      throw Error('CSS não autorizado: '+selector);
    },
  };
  const originalDocument=globalThis.document;
  const originalStyle=globalThis.getComputedStyle;
  const fakeDocument={
    getElementById:id=>id==='gestta-multiselect-dropdown-4-p'
      ?{getAttribute:key=>key==='aria-expanded'?'true':null,
        getBoundingClientRect:()=>({left:660,right:940,top:10,bottom:43})}:null,
    querySelectorAll:selector=>{
      requestedSelector=selector;
      return selector==='.gestta-multiselect-dropdown__menu'?[menu]:[];
    },
  };
  const page={
    evaluate:async(fn,args)=>{
      globalThis.document=fakeDocument;
      globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
      try{return fn(args);}
      finally{
        if(originalDocument===undefined)delete globalThis.document;
        else globalThis.document=originalDocument;
        if(originalStyle===undefined)delete globalThis.getComputedStyle;
        else globalThis.getComputedStyle=originalStyle;
      }
    }
  };
  const result=await inspectUsersPopup(page,'gestta-multiselect-dropdown-4-p');
  assert.equal(requestedSelector,'.gestta-multiselect-dropdown__menu');
  assert.equal(result.menuAssociation,'uuid_class_confirmed');
  assert.equal(result.found,true);
  assert.equal(result.liCount,603);
  assert.equal(result.inputCheckboxCount,596);
  assert.equal(result.checkedCount,595);
  assert.equal(result.uncheckedCount,1);
  assert.equal(result.controlCount,1);
  assert.equal(result.allUsersProven,false);
  assert.equal(JSON.stringify(result).includes('Nome secreto'),false);
});


test('localiza um unico menu proximo quando classe uuid nao e reconhecida, somente diagnostico',async()=>{
  const originalDocument=globalThis.document;
  const originalStyle=globalThis.getComputedStyle;
  const trigger={
    getAttribute:k=>k==='aria-expanded'?'true':null,
    getBoundingClientRect:()=>({left:660,right:940,top:10,bottom:45}),
  };
  const menu={
    classList:{contains:()=>false},
    getBoundingClientRect:()=>({left:660,right:940,top:50,bottom:300,width:280,height:250}),
    querySelectorAll:q=>{
      if(q==='input[type="checkbox"]')return [{checked:false,disabled:false}];
      if(q==='.gestta-multiselect-dropdown__item-toggle')
        return [{closest:()=>({textContent:'Operador fictício'})}];
      if(q==='li')return [{}];
      throw Error('Unexpected selector '+q);
    },
  };
  const page={evaluate:async(fn,args)=>{
    globalThis.document={
      getElementById:()=>trigger,
      querySelectorAll:()=>[menu],
    };
    globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
    try{return fn(args);}finally{
      if(originalDocument===undefined)delete globalThis.document;
      else globalThis.document=originalDocument;
      if(originalStyle===undefined)delete globalThis.getComputedStyle;
      else globalThis.getComputedStyle=originalStyle;
    }
  }};
  const result=await inspectUsersPopup(page,'gestta-multiselect-dropdown-4-p');
  assert.equal(result.found,true);
  assert.equal(result.menuAssociation,'geometric_provisional');
  assert.equal(result.checkedCount,0);
  assert.equal(result.uncheckedCount,1);
  assert.equal(result.allUsersProven,false);
});

test('nao associa painel por proximidade quando existirem dois menus proximos',async()=>{
  const originalDoc=globalThis.document;
  const originalStyle=globalThis.getComputedStyle;
  const trigger={
    getAttribute:k=>k==='aria-expanded'?'true':null,
    getBoundingClientRect:()=>({left:660,right:940,top:10,bottom:45}),
  };
  const candidate={
    classList:{contains:()=>false},
    getBoundingClientRect:()=>({left:660,right:940,top:50,bottom:300,width:280,height:250}),
  };
  const page={evaluate:async(fn,args)=>{
    globalThis.document={
      getElementById:()=>trigger,
      querySelectorAll:()=>[candidate,candidate],
    };
    globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
    try{return fn(args);}finally{
      if(originalDoc===undefined)delete globalThis.document;
      else globalThis.document=originalDoc;
      if(originalStyle===undefined)delete globalThis.getComputedStyle;
      else globalThis.getComputedStyle=originalStyle;
    }
  }};
  const result=await inspectUsersPopup(page,'gestta-multiselect-dropdown-4-p');
  assert.equal(result.found,false);
  assert.equal(result.reason,'menus_ambiguos');
});
