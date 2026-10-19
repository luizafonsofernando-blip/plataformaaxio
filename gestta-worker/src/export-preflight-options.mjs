// Opcoes de preflight sem download e sem sincronizacao.
// Primeira janela preservada; segunda exige opt-in adicional.
import {parsePeriodTestOptions} from './period-test-options.mjs';

export function parseApplyPreflightOptions(args) {
  if(args.length===0) return {verifyUsers:false,preflight:null};
  if(args.length===1 && args[0]==='--confirm-users-select-all') {
    return {verifyUsers:true,preflight:null};
  }
  const flags=['--confirm-users-select-all','--preflight-export'];
  const secondFlag='--confirm-second-window';
  const second=args.filter(arg=>arg===secondFlag).length;
  if((args.length!==4 && args.length!==5) ||
     flags.some(flag=>args.filter(x=>x===flag).length!==1) ||
     second>1 || args.length!==4+second) {
    throw new Error('Preflight exige selecao explicita de Usuarios, --preflight-export, periodo e autorizacao da segunda janela quando aplicavel.');
  }
  const {window,expected}=parsePeriodTestOptions(
    args.filter(arg=>!flags.includes(arg) && arg!==secondFlag)
  );
  const start=second?'2026-10-02':'2026-10-01';
  const end=second?'2026-10-31':'2026-10-30';
  if(window.start!==start || window.end!==end){
    throw new Error('Preflight limitado a janela de outubro autorizada.');
  }
  return {verifyUsers:true,preflight:{window,expected}};
}
