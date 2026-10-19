import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApplyPreflightOptions} from '../src/export-preflight-options.mjs';

test('mantem teste antigo inalterado e opt-in somente usuarios',()=>{
  assert.deepEqual(parseApplyPreflightOptions([]),{verifyUsers:false,preflight:null});
  assert.deepEqual(parseApplyPreflightOptions(['--confirm-users-select-all']),
    {verifyUsers:true,preflight:null});
});
test('preflight limita intervalo, exige consentimento e nunca aceita download',()=>{
  assert.deepEqual(parseApplyPreflightOptions([
    '--confirm-users-select-all','--preflight-export',
    '--start=2026-10-01','--end=2026-10-30',
  ]),{verifyUsers:true,preflight:{
    window:{start:'2026-10-01',end:'2026-10-30'},
    expected:'01/10/2026 - 30/10/2026',
  }});
  for(const args of [
    ['--preflight-export','--start=2026-10-01','--end=2026-10-30'],
    ['--confirm-users-select-all','--preflight-export','--start=2026-10-01','--end=2026-10-31'],
    ['--confirm-users-select-all','--preflight-export','--start=2026-10-01','--end=2026-10-30','--confirm-download'],
    ['--confirm-users-select-all','--confirm-users-select-all','--preflight-export','--end=2026-10-30'],
  ])assert.throws(()=>parseApplyPreflightOptions(args));
});
