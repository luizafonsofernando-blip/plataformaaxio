// Opcoes de preflight sem download e sem sincronizacao.
import {parsePeriodTestOptions} from './period-test-options.mjs';

export function parseApplyPreflightOptions(args) {
  if(args.length===0) return {verifyUsers:false,preflight:null};
  if(args.length===1 && args[0]==='--confirm-users-select-all') {
    return {verifyUsers:true,preflight:null};
  }
  const flags=['--confirm-users-select-all','--preflight-export'];
  if(args.length!==4 || flags.some(flag=>args.filter(x=>x===flag).length!==1)) {
    throw new Error('Use apenas --confirm-users-select-all --preflight-export --start=2026-10-01 --end=2026-10-30.');
  }
  const {window,expected}=parsePeriodTestOptions(args.filter(arg=>!flags.includes(arg)));
  if(window.start!=='2026-10-01'||window.end!=='2026-10-30'){
    throw new Error('Preflight restrito a 01/10/2026 - 30/10/2026.');
  }
  return {verifyUsers:true,preflight:{window,expected}};
}
