// Argumentos estritos para EXIBIR somente o plano de consultas mensais.
// Nao recebe credenciais, arquivos ou habilita exportacao.
import { buildMonthWindows, brazilToday } from './month-windows.mjs';

export function parseMonthPlanOptions(args, today = brazilToday()) {
  const options={from:'2026-01', through:today};
  const allowed=new Set(['from','through','recent']);
  const seen=new Set();
  for(const arg of args) {
    const match=/^--([a-z]+)=(.*)$/.exec(arg);
    if(!match || !allowed.has(match[1]) || !match[2] || seen.has(match[1])){
      throw new Error('Parametros aceitos: --from=AAAA-MM --through=AAAA-MM-DD --recent=N (opcionais).');
    }
    seen.add(match[1]);
    if(match[1]==='recent'){
      if(!/^\d{1,2}$/.test(match[2]))throw new Error('--recent deve conter um inteiro entre 1 e 24.');
      options.recentMonths=Number(match[2]);
    } else {
      options[match[1]]=match[2];
    }
  }
  return options;
}

export function buildMonthPlan(args, today=brazilToday()) {
  const options=parseMonthPlanOptions(args,today);
  const windows=buildMonthWindows(options);
  const byMonth=new Map();
  for(const window of windows) {
    if(!byMonth.has(window.month))byMonth.set(window.month,[]);
    byMonth.get(window.month).push(window);
  }
  return {
    options,
    windows,
    months:[...byMonth].map(([month,periods])=>({month,periods})),
  };
}
