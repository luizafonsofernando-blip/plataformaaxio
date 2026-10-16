import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSequenceTestOptions} from '../src/sequence-test-options.mjs';

const args=['--from=2026-09','--through=2026-10-16','--limit=3'];

test('setembro -> duas janelas de outubro preserva ordem cronologica',()=>{
  const plan=buildSequenceTestOptions(args);
  assert.equal(plan.limit,3);
  assert.deepEqual(plan.windows.map(x=>[x.start,x.end]),[
    ['2026-09-01','2026-09-30'],
    ['2026-10-01','2026-10-30'],
    ['2026-10-02','2026-10-31'],
  ]);
});
test('recusa executar dez meses e dezesseis janelas neste teste',()=>{
  assert.throws(()=>buildSequenceTestOptions([
    '--from=2026-01','--through=2026-10-16','--limit=3'
  ]),/16 janelas/);
});
test('exige dois meses e impede somente janelas de outubro',()=>{
  assert.throws(()=>buildSequenceTestOptions([
    '--from=2026-10','--through=2026-10-16','--limit=2'
  ]),/dois meses/);
});
test('argumentos incompletos, duplicados, desconhecidos ou com limite indevido falham',()=>{
  for(const invalid of [
    [],['--from=2026-09','--through=2026-10-16'],
    [...args,'--auto'],[...args,'--limit=3'],
    ['--from=2026-09','--through=2026-10-16','--limit=16'],
    ['--from=2026-09','--through=2026-10-16','--limit=4'],
    ['--from=2026-09','--through=2026-10-16','--limit=1'],
  ])assert.throws(()=>buildSequenceTestOptions(invalid));
});
test('rejeita data final invalida ou periodo futuro invertido',()=>{
  assert.throws(()=>buildSequenceTestOptions([
    '--from=2026-11','--through=2026-10-16','--limit=3'
  ]));
  assert.throws(()=>buildSequenceTestOptions([
    '--from=2026-09','--through=2026-10-32','--limit=3'
  ]));
});
