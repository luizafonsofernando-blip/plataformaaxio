import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePeriodTestOptions } from '../src/period-test-options.mjs';

test('outubro 01-30 permitido (janela 30 dias)',()=>{
  assert.deepEqual(parsePeriodTestOptions(['--start=2026-10-01','--end=2026-10-30']),{
    window:{start:'2026-10-01',end:'2026-10-30'},
    expected:'01/10/2026 - 30/10/2026',
  });
});
test('outubro 02-31 permitido (segunda janela complementar)',()=>{
  assert.equal(
    parsePeriodTestOptions(['--start=2026-10-02','--end=2026-10-31']).expected,
    '02/10/2026 - 31/10/2026'
  );
});
test('janela de 31 dias nunca é permitida',()=>{
  assert.throws(
    ()=>parsePeriodTestOptions(['--start=2026-10-01','--end=2026-10-31']),
    /30 dias/
  );
});
test('recusa meses cruzados e datas impossíveis',()=>{
  assert.throws(
    ()=>parsePeriodTestOptions(['--start=2026-09-30','--end=2026-10-01']),
    /atravessar meses/
  );
  assert.throws(
    ()=>parsePeriodTestOptions(['--start=2026-02-29','--end=2026-02-29']),
    /inexistente/
  );
});
test('recusa parametro ausente, desconhecido, repetido ou mal formatado',()=>{
  const invalids=[
    [],
    ['--start=2026-10-01'],
    ['--start=2026-10-01','--end=2026-10-30','--auto'],
    ['--start=2026-10-01','--end=2026-10-30','--end=2026-10-31'],
    ['--start=01/10/2026','--end=30/10/2026'],
  ];
  for(const args of invalids){
    assert.throws(()=>parsePeriodTestOptions(args));
  }
});
