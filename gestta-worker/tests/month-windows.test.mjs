import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthWindows, brazilRange, brazilToday } from '../src/month-windows.mjs';

test('ano de 2026: meses de 31 dias geram um intervalo extra', () => {
  const windows = buildMonthWindows({ from: '2026-01', through: '2026-10-15' });
  assert.equal(windows.length, 16);
  assert.deepEqual(windows.slice(0, 2).map(x => [x.start, x.end]), [
    ['2026-01-01', '2026-01-30'], ['2026-01-02', '2026-01-31'],
  ]);
  assert.deepEqual(windows.at(-2), {start:'2026-10-01', end:'2026-10-30', month:'2026-10'});
  assert.deepEqual(windows.at(-1), {start:'2026-10-02', end:'2026-10-31', month:'2026-10'});
  assert.equal(brazilRange(windows.at(-2)), '01/10/2026 - 30/10/2026');
});
test('incremental inclui mes anterior e o atual', () => {
  const windows = buildMonthWindows({ from: '2026-01', through: '2026-10-15', recentMonths: 2 });
  assert.deepEqual(windows.map(x => x.start), ['2026-09-01', '2026-10-01', '2026-10-02']);
});
test('leap year e meses de 31 dias sao cobertos sem lacunas', () => {
  const windows = buildMonthWindows({ from: '2028-02', through: '2028-03-31' });
  assert.deepEqual(windows.map(x => [x.start, x.end]), [
    ['2028-02-01','2028-02-29'], ['2028-03-01','2028-03-30'], ['2028-03-02','2028-03-31'],
  ]);
});
test('data invalida ou periodo futuro incoerente e recusado', () => {
  assert.throws(() => buildMonthWindows({from:'2026-12',through:'2026-10-15'}));
  assert.throws(() => buildMonthWindows({from:'2026-01',through:'2026-02-31'}));
});
test('data brasileira usa America/Sao_Paulo', () => {
  assert.equal(brazilToday(new Date('2026-10-16T01:00:00Z')), '2026-10-15');
});
