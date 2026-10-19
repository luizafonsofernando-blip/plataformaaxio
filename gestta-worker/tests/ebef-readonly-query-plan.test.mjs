import test from 'node:test';
import assert from 'node:assert/strict';
import {planEbefConsistentRead}
  from '../src/ebef-readonly-query-plan.mjs';
import {COMPARABLE_FIELDS} from '../src/pre-sync-preview.mjs';

test('contrato usa mesma transacao consistente e somente leitura',()=>{
  const plan=planEbefConsistentRead();
  assert.match(plan.begin,/REPEATABLE READ, READ ONLY/);
  assert.equal(plan.finish,'ROLLBACK;');
  assert.match(plan.count,/^SELECT COUNT\(\*\)::bigint AS total_rows FROM public\.ebef_gestta_tasks;$/);
  assert.match(plan.page,/^SELECT /);
  assert.match(plan.page,/FROM public\.ebef_gestta_tasks /);
  assert.match(plan.page,/WHERE \(\$1::text IS NULL OR source_key > \$1::text\)/);
  assert.match(plan.page,/ORDER BY source_key ASC LIMIT \$2::integer;$/);
  assert.equal(plan.sameConnectionRequired,true);
  assert.equal(plan.oneSnapshotRequired,true);
  assert.equal(plan.noOffsetPagination,true);
  assert.equal(plan.databaseReadPerformed,false);
  assert.equal(plan.writesPerformed,false);
  assert.equal(plan.authorizationForWrites,false);
});
test('contrato projeta todos os campos comparaveis e nao contem instrucao DML',()=>{
  const plan=planEbefConsistentRead({pageSize:500});
  for(const field of COMPARABLE_FIELDS){
    assert.ok(plan.page.split(' FROM ')[0].includes(field),field);
  }
  for(const query of [plan.begin,plan.count,plan.page,plan.finish]){
    assert.doesNotMatch(query,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  }
  assert.equal(plan.pageSize,500);
  assert.equal(plan.schemaMustExistBeforeRead,true);
  assert.equal(plan.exportIncludesClientData,true);
});
test('contrato rejeita pagina fora dos limites, fracao ou entrada invalida',()=>{
  for(const n of [0,-1,501,2.5,NaN,Infinity,'100',null]){
    assert.throws(()=>planEbefConsistentRead({pageSize:n}),/invalido/);
  }
  assert.equal(planEbefConsistentRead().pageSize,200);
});
