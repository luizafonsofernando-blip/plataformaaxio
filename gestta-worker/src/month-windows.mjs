// Janela inclusiva; maximo 30 dias corridos para respeitar o limite do exportador Gestta.
// Em meses de 31 dias, divide em 01-30 e 02-31. Ha sobreposicao intencional,
// reconciliada pelo ID de cada tarefa, para evitar uma exportacao de dia unico.
function pad(n) { return String(n).padStart(2, '0'); }
function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function brazilToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + '-' + values.month + '-' + values.day;
}
export function buildMonthWindows({ from = '2026-01', through = brazilToday(), recentMonths } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) throw new Error('Mes inicial invalido (AAAA-MM).');
  if (!isValidDate(through)) throw new Error('Data final invalida (AAAA-MM-DD).');
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = through.split('-').map(Number);
  const startIndex = fromYear * 12 + fromMonth - 1;
  const endIndex = toYear * 12 + toMonth - 1;
  if (startIndex > endIndex) throw new Error('Mes inicial posterior a data final.');
  if (endIndex - startIndex > 119) throw new Error('Intervalo maior que 120 meses.');
  if (recentMonths !== undefined && (!Number.isInteger(recentMonths) || recentMonths < 1 || recentMonths > 24)) {
    throw new Error('recentMonths deve ser um inteiro de 1 a 24.');
  }
  const begin = recentMonths === undefined ? startIndex : Math.max(startIndex, endIndex - recentMonths + 1);
  const windows = [];
  for (let index = begin; index <= endIndex; index++) {
    const year = Math.floor(index / 12);
    const month = index % 12 + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Mes vigente inteiro: inclui vencimentos futuros ja cadastrados no Gestta.
    const available = last;
    for (let day = 1; day <= available; day += 30) {
      const endDay = Math.min(available, day + 29);
      const startDay = available === 31 && day === 31 ? 2 : day;
      const start = iso(year, month, startDay);
      const end = iso(year, month, endDay);
      windows.push({ start, end, month: iso(year, month, 1).slice(0, 7) });
    }
  }
  return windows;
}
export function brazilRange(window) {
  function fmt(s) { return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4); }
  return fmt(window.start) + ' - ' + fmt(window.end);
}
