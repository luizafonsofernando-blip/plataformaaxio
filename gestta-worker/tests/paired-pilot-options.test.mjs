import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePairedPilotOptions,PAIRED_MONTH}
  from '../src/paired-pilot-options.mjs';

const flags=['--confirm-two-downloads','--confirm-rendered-users-only','--confirm-no-sync'];

test('pareado requer tres consentimentos e gera exatamente duas janelas',()=>{
  const result=parsePairedPilotOptions(flags);
  assert.equal(PAIRED_MONTH,'2026-10');
  assert.deepEqual(result,[
    {window:{start:'2026-10-01',end:'2026-10-30'},
      expected:'01/10/2026 - 30/10/2026'},
    {window:{start:'2026-10-02',end:'2026-10-31'},
      expected:'02/10/2026 - 31/10/2026'},
  ]);
});
test('pareado recusa autorizacao parcial, duplicada e parametros inesperados',()=>{
  for(const args of [
    [],['--confirm-two-downloads'],
    flags.slice(0,2),
    [...flags,'--auto'],
    [...flags,flags[0]],
    [...flags,'--start=2026-09-01'],
    [...flags,'--sync'],
    ['--confirm-download',...flags],
  ])assert.throws(()=>parsePairedPilotOptions(args));
});
