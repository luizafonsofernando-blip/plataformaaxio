import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_SELECTORS, formatDateBR, validateDateWindow } from '../src/date-picker.mjs';

test('seletor dos campos foi identificado pelo Inspector', () => {
  assert.equal(DATE_SELECTORS.range, '#date-range');
  assert.equal(DATE_SELECTORS.start, 'input[name="daterangepicker_start"]');
  assert.equal(DATE_SELECTORS.end, 'input[name="daterangepicker_end"]');
});
test('formata datas do periodo mensal 2026', () => {
  assert.equal(formatDateBR('2026-10-01'), '01/10/2026');
  assert.equal(validateDateWindow({start:'2026-10-01',end:'2026-10-30'}),
    '01/10/2026 - 30/10/2026');
  assert.equal(validateDateWindow({start:'2026-10-02',end:'2026-10-31'}),
    '02/10/2026 - 31/10/2026');
});
test('falha em periodo maior que 30 dias ou invertido', () => {
  assert.throws(() => validateDateWindow({start:'2026-10-01',end:'2026-10-31'}), /30 dias/);
  assert.throws(() => validateDateWindow({start:'2026-10-30',end:'2026-10-01'}), /30 dias/);
});
test('falha em data inexistente ou periodo entre meses', () => {
  assert.throws(() => formatDateBR('2026-02-29'), /inexistente/);
  assert.throws(() => validateDateWindow({start:'2026-09-30',end:'2026-10-01'}), /atravessar meses/);
});
