// Dois downloads XLSX de outubro de 2026: autorizacao explicita,
// sem API LUCE/Supabase. Nenhuma janela arbitraria e aceita.
import {expectedEbefMonthWindows} from './monthly-ebef-audit.mjs';
import {parsePeriodTestOptions} from './period-test-options.mjs';

export const PAIRED_MONTH='2026-10';
const REQUIRED_FLAGS=Object.freeze([
  '--confirm-two-downloads',
  '--confirm-rendered-users-only',
  '--confirm-no-sync',
]);
export function parsePairedPilotOptions(args){
  if(!Array.isArray(args) || args.length!==REQUIRED_FLAGS.length ||
     REQUIRED_FLAGS.some(flag=>args.filter(value=>value===flag).length!==1)){
    throw new Error('Pareado exige autorizacao expressa de dois downloads, '+
      'Usuarios renderizados e ausencia de sincronizacao.');
  }
  const windows=expectedEbefMonthWindows(PAIRED_MONTH);
  if(windows.length!==2){
    throw new Error('Quantidade de janelas mensais inesperada; cancelar.');
  }
  const expected=['2026-10-01|2026-10-30','2026-10-02|2026-10-31'];
  const actual=windows.map(w=>w.start+'|'+w.end);
  if(actual.some((item,i)=>item!==expected[i])){
    throw new Error('Janelas outubro divergentes; cancelar.');
  }
  return windows.map(window=>{
    const result=parsePeriodTestOptions([
      '--start='+window.start,'--end='+window.end
    ]);
    return {window:result.window,expected:result.expected};
  });
}
