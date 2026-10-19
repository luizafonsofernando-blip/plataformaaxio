import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePilotExportOptions} from '../src/pilot-export-options.mjs';

test('piloto exige dois consentimentos, sem limitar quantidade exata de usuarios',()=>{
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

test('segunda janela somente com aceite explicito e intervalo 02-31',()=>{
  assert.deepEqual(parsePilotExportOptions([
    '--start=2026-10-02','--end=2026-10-31',
    '--confirm-download','--confirm-rendered-users-only',
    '--confirm-second-window',
  ]),{window:{start:'2026-10-02',end:'2026-10-31'},
    expected:'02/10/2026 - 31/10/2026'});
  for(const args of [
    ['--start=2026-10-02','--end=2026-10-31',
      '--confirm-download','--confirm-rendered-users-only'],
    ['--start=2026-10-01','--end=2026-10-30',
      '--confirm-download','--confirm-rendered-users-only','--confirm-second-window'],
    ['--start=2026-10-02','--end=2026-10-31',
      '--confirm-download','--confirm-rendered-users-only',
      '--confirm-second-window','--confirm-second-window'],
    ['--start=2026-10-02','--end=2026-10-31',
      '--confirm-rendered-users-only','--confirm-second-window'],
  ])assert.throws(()=>parsePilotExportOptions(args));
});
