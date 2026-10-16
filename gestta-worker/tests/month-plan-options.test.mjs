import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMonthPlanOptions,buildMonthPlan} from '../src/month-plan-options.mjs';

test('planeja janeiro até a competência outubro com 16 janelas',()=>{
  const p=buildMonthPlan([], '2026-10-16');
  assert.equal(p.options.from,'2026-01');
  assert.equal(p.months.length,10);
  assert.equal(p.windows.length,16);
  assert.deepEqual(p.months[0].periods.map(x=>[x.start,x.end]),[
    ['2026-01-01','2026-01-30'],
    ['2026-01-02','2026-01-31'],
  ]);
  assert.deepEqual(p.months.at(-1).periods.map(x=>[x.start,x.end]),[
    ['2026-10-01','2026-10-30'],
    ['2026-10-02','2026-10-31'],
  ]);
});

test('todos os meses ficam cobertos com no máximo 30 dias inclusivos',()=>{
  const p=buildMonthPlan([], '2026-10-16');
  for(const {month,periods} of p.months){
    const [,year,mon]=/^(\d{4})-(\d{2})$/.exec(month);
    const days=new Date(Date.UTC(Number(year),Number(mon),0)).getUTCDate();
    const coverage=new Set();
    for(const range of periods){
      assert.equal(range.start.slice(0,7),month);
      assert.equal(range.end.slice(0,7),month);
      const begin=Number(range.start.slice(-2)),end=Number(range.end.slice(-2));
      assert(end>=begin && end-begin<30);
      for(let day=begin;day<=end;day++)coverage.add(day);
    }
    assert.equal(coverage.size,days);
  }
});

test('permite planejar somente dois meses recentes sem mexer no navegador',()=>{
  const p=buildMonthPlan(['--recent=2'],'2026-10-16');
  assert.deepEqual(p.months.map(x=>x.month),['2026-09','2026-10']);
  assert.equal(p.windows.length,3);
});

test('permite escolher competência inicial e data de referência explicitamente',()=>{
  const p=buildMonthPlan(['--from=2026-07','--through=2026-08-19'],'2026-10-16');
  assert.deepEqual(p.months.map(x=>x.month),['2026-07','2026-08']);
});

test('recusa argumento desconhecido, malformado, repetido ou período invertido',()=>{
  for(const args of [
    ['--auto'],['--sync'],['--recent=0'],['--recent=25'],
    ['--recent=1.5'],['--recent=2','--recent=2'],
    ['--through=2026-02-30'],
    ['--from=2026-12','--through=2026-10-16'],
    ['--from=01/2026'],['--from'],['--year=2026'],
  ])assert.throws(()=>buildMonthPlan(args,'2026-10-16'));
  assert.deepEqual(parseMonthPlanOptions([], '2026-10-16'),
    {from:'2026-01',through:'2026-10-16'});
});
