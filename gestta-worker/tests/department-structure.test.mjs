import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_DEPARTMENTS } from '../src/advanced-filter-config.mjs';
import {
  inspectDepartmentStructure, normalizeDepartmentLabel, departmentRowCandidates,
  summarizeDepartmentSnapshots, inspectDepartmentCounts,
} from '../src/department-structure.mjs';

const snapshot = (label, state='indeterminado')=>({
  label, elementTag:state==='indeterminado'?'span':'input',
  toggleTag:'div', checkboxClasses:['checkbox-item'],
  toggleClasses:['gestta-multiselect-dropdown__item-toggle'],
  checkboxRole:'',inputType:state==='indeterminado'?null:'checkbox',
  inputChecked:state==='marcado'?true:state==='desmarcado'?false:null,
  ariaChecked:null,dataState:'',
});
function fakeDepartmentList(list) {
  let reads=0;
  const rows={count:async()=>list.length};
  const page={
    locator:css=>{
      assert.equal(css,'li:has(> .gestta-multiselect-dropdown__item-toggle > .checkbox-item)');
      return rows;
    },
    evaluate:async fn=>{
      reads++;
      assert.match(fn.toString(),/document.querySelectorAll/);
      return list;
    },
  };
  return {page,rows,reads:()=>reads};
}

test('não espera nem consulta locator.evaluateAll quando DOM está vazio',async()=>{
  const f=fakeDepartmentList([]);
  const summary=await inspectDepartmentStructure(f.page);
  assert.equal(summary.rowCount,0);
  assert.equal(summary.allExpectedPresent,false);
  assert.equal(f.reads(),1);
});

test('normaliza acentos e espaços dos nomes esperados',()=>{
  assert.equal(normalizeDepartmentLabel('  Contábil  '),'CONTABIL');
});

test('reconhece os 21 departamentos por nome e lê os nativos marcados',async()=>{
  const all=REQUIRED_DEPARTMENTS.map(name=>snapshot(name,'marcado'));
  const {page}=fakeDepartmentList(all);
  assert.equal(await departmentRowCandidates(page).count(),21);
  const info=await inspectDepartmentStructure(page);
  assert.equal(info.rowCount,21);
  assert.equal(info.recognizedUnique,21);
  assert.equal(info.allExpectedPresent,true);
  assert.deepEqual(info.stateCounts,{marcado:21,desmarcado:0,indeterminado:0});
  assert.equal(info.examples.ADMINISTRATIVO.inputType,'checkbox');
});

test('não presume que componente visual equivale a checkbox marcado',async()=>{
  const rows=REQUIRED_DEPARTMENTS.map(name=>snapshot(name,'indeterminado'));
  const info=await inspectDepartmentStructure(fakeDepartmentList(rows).page);
  assert.equal(info.allExpectedPresent,true);
  assert.equal(info.stateCounts.indeterminado,21);
});

test('não considera completa uma lista truncada ou duplicada',async()=>{
  const truncated=REQUIRED_DEPARTMENTS.slice(0,5).map(name=>snapshot(name));
  const info=await inspectDepartmentStructure(fakeDepartmentList(truncated).page);
  assert.equal(info.allExpectedPresent,false);
  const dupes=[...REQUIRED_DEPARTMENTS.slice(0,20),'Administrativo'].map(name=>snapshot(name));
  const second=await inspectDepartmentStructure(fakeDepartmentList(dupes).page);
  assert.equal(second.recognizedUnique,20);
  assert.equal(second.allExpectedPresent,false);
});

test('snapshot único produz mesmo resumo sem esperar 21 avaliações independentes',async()=>{
  const snapshots=REQUIRED_DEPARTMENTS.map(name=>snapshot(name,'marcado'));
  const summary=summarizeDepartmentSnapshots(snapshots);
  assert.equal(summary.rowCount,21);
  assert.equal(summary.stateCounts.marcado,21);
  assert.equal(summary.allExpectedPresent,true);
});

test('não divulga nomes de itens estranhos aos 21 departamentos',async()=>{
  const list=[snapshot('DADO DE CLIENTE PRIVADO'),snapshot('Administrativo','marcado')];
  const info=await inspectDepartmentStructure(fakeDepartmentList(list).page);
  assert.equal(info.unknownCount,1);
  assert.equal(info.recognizedCount,1);
  assert(!JSON.stringify(info).includes('DADO DE CLIENTE PRIVADO'));
});
