import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePilotExportOptions} from '../src/pilot-export-options.mjs';

test('piloto exige dois consentimentos e restricao a 596 checkbox renderizados',()=>{
  assert.deepEqual(parsePilotExportOptions([
    '--start=2026-10-01','--end=2026-10-30',
    '--confirm-download','--confirm-rendered-users-only',
  ]),{window:{start:'2026-10-01',end:'2026-10-30'},
    expected:'01/10/2026 - 30/10/2026'});
});
test('piloto impede consentimento parcial, duplicado ou intervalo incorreto',()=>{
  const cases=[
    ['--start=2026-10-01','--end=2026-10-30','--confirm-download'],
    ['--start=2026-10-01','--end=2026-10-30','--confirm-rendered-users-only'],
    ['--start=2026-10-01','--end=2026-10-31','--confirm-download','--confirm-rendered-users-only'],
    ['--start=2026-10-01','--end=2026-10-30','--confirm-download','--confirm-download','--confirm-rendered-users-only'],
    ['--start=2026-10-01','--end=2026-10-30','--confirm-download','--confirm-rendered-users-only','--auto'],
  ];
  for(const args of cases)assert.throws(()=>parsePilotExportOptions(args));
});
