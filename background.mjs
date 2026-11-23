// Tarefas que continuam depois da resposta (entrega de workflows, campanhas de e-mail, auditorias).
// Na Vercel a função pode ser congelada quando a resposta termina; registrar a promessa no waitUntil
// do contexto da requisição mantém a função viva até ela acabar. É o mesmo contexto que o pacote
// @vercel/functions lê, sem trazer a dependência. Fora da Vercel (servidor local, testes) não há
// contexto e a tarefa só roda solta, como antes.
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

export function waitUntil(promise) {
  try {
    globalThis[REQUEST_CONTEXT]?.get?.()?.waitUntil?.(promise);
  } catch {
    // Sem contexto utilizável: a tarefa segue sem garantia extra, nunca derruba a requisição.
  }
  return promise;
}

/** Roda `task` sem bloquear a resposta; erros vão para o log com `label`. Devolve a promessa (já tratada). */
export function inBackground(label, task) {
  const promise = Promise.resolve().then(task).catch(error => console.error(`${label}: ${error?.message || error}`));
  return waitUntil(promise);
}
