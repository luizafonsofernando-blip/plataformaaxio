// Argumentos estritos do teste mensal SOMENTE de filtro visual.
// Uma execução manipula exclusivamente um intervalo de no máximo 30 dias.
import { validateDateWindow } from './date-picker.mjs';

export function parsePeriodTestOptions(argv) {
  const params = {};
  for (const arg of argv) {
    const match = /^--(start|end)=(\d{4}-\d{2}-\d{2})$/.exec(arg);
    if (!match) throw new Error('Use somente --start=AAAA-MM-DD e --end=AAAA-MM-DD.');
    const key = match[1];
    if (Object.hasOwn(params,key)) throw new Error('Argumento repetido: '+key);
    params[key]=match[2];
  }
  if (!params.start || !params.end) {
    throw new Error('Informe --start=AAAA-MM-DD e --end=AAAA-MM-DD.');
  }
  const window={start:params.start,end:params.end};
  const expected=validateDateWindow(window);
  return { window, expected };
}
