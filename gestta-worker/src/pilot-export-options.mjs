// Pilotos XLSX estritamente restritos as duas janelas de outubro de 2026.
// Nenhum deles comprova a abrangencia global de usuarios ou autoriza sync.
import {parseSingleExportOptions} from './export-test-guards.mjs';
import {parsePeriodTestOptions} from './period-test-options.mjs';

export function parsePilotExportOptions(args){
  const renderFlag='--confirm-rendered-users-only';
  const downloadFlag='--confirm-download';
  const secondFlag='--confirm-second-window';
  if(!Array.isArray(args) ||
     args.filter(x=>x===renderFlag).length!==1 ||
     args.filter(x=>x===downloadFlag).length!==1 ||
     args.filter(x=>x===secondFlag).length>1){
    throw new Error('Piloto exige --confirm-download, --confirm-rendered-users-only e autorizacao da segunda janela quando aplicavel.');
  }
  if(!args.includes(secondFlag)){
    // Mantem a primeira janela e seus guardas originais INALTERADOS.
    return parseSingleExportOptions(args.filter(x=>x!==renderFlag));
  }
  const raw=args.filter(x=>![renderFlag,downloadFlag,secondFlag].includes(x));
  const options=parsePeriodTestOptions(raw);
  if(options.window.start!=='2026-10-02'||options.window.end!=='2026-10-31'){
    throw new Error('Segunda janela autorizada exclusivamente para 02/10/2026 a 31/10/2026.');
  }
  return options;
}
