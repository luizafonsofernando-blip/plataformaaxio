// Parametros do ensaio sequencial de calendario: SEM exportacao nem sincronizacao.
import {buildMonthWindows} from './month-windows.mjs';
import {validateDateWindow} from './date-picker.mjs';

export function buildSequenceTestOptions(args) {
  const provided={};
  for(const arg of args){
    const matched=/^--(from|through|limit)=(.+)$/.exec(arg);
    if(!matched || Object.hasOwn(provided,matched[1])){
      throw new Error('Informe somente --from=AAAA-MM --through=AAAA-MM-DD --limit=3.');
    }
    provided[matched[1]]=matched[2];
  }
  if(!provided.from || !provided.through || !provided.limit ||
     !/^[1-3]$/.test(provided.limit)){
    throw new Error('O teste exige --from, --through e --limit=2 ou 3.');
  }
  const limit=Number(provided.limit);
  if(limit<2 || limit>3)throw new Error('Este teste exige entre 2 e 3 janelas.');
  const windows=buildMonthWindows({from:provided.from,through:provided.through});
  if(windows.length!==limit){
    throw new Error('Plano com '+windows.length+' janelas; use --limit='+
      windows.length+' somente se entre 2 e 3. Nada foi iniciado.');
  }
  if(new Set(windows.map(w=>w.month)).size<2){
    throw new Error('Para homologar a passagem mensal, selecione ao menos dois meses distintos.');
  }
  for(const window of windows) validateDateWindow(window);
  return {windows,limit};
}
