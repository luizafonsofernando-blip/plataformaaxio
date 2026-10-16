// Executa uma operacao asincrona com limite de espera.
// Recebe uma FUNCAO que retorna Promise, nunca uma Promise ja iniciada.
// Promise.race observa a rejeicao da operacao, mesmo quando o temporizador
// termina antes dela. O tempo limite nao cancela a operacao Playwright.
export async function withDeadline(label, task, ms = 20000) {
  if (typeof task !== 'function') {
    throw new TypeError('withDeadline requer uma funcao assincrona para ' + label);
  }
  if (!Number.isFinite(ms) || ms < 1) {
    throw new RangeError('Tempo limite invalido para ' + label);
  }
  let timer;
  const work = Promise.resolve().then(task);
  const clock = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      label + ' excedeu ' + ms / 1000 + ' segundos; operacao nao confirmada.'
    )), ms);
  });
  try {
    return await Promise.race([work, clock]);
  } finally {
    clearTimeout(timer);
  }
}
