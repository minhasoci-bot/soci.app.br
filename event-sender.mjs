// Executor dos envios do Planejador de eventos: reserva uma mensagem, envia e grava o resultado, uma por vez por subconta.
// Roda ao lado do cron, fora da fila das outras tarefas, porque espera de verdade entre as mensagens privadas.
import { eventSendDue } from './event-send-model.mjs';

/**
 * load(workspace) → estado · change(workspace, comando) → { id, state } · send(workspace, { to, part }, estado) → { outcome, id, error }
 * active(estado, workspace) → a conta pode enviar? · changed(workspace, estado) avisa quem entrega os fluxos.
 */
export function createEventSender({ load, change, send, active, changed = () => {}, now = Date.now, sleep = ms => new Promise(done => setTimeout(done, ms)), budgetMs = 45_000 }) {
  const running = new Map(); // subconta → acorda quem está esperando

  // A mensagem já saiu: perder o resultado a deixaria "não confirmada". Um soluço do banco merece outra tentativa.
  async function record(workspace, data) {
    for (let attempt = 1; ; attempt++) {
      try { return await change(workspace, { type: 'event-send-result', data: { ...data, at: new Date(now()).toISOString() } }); }
      catch (error) { if (attempt === 3) throw error; await sleep(300 * attempt); }
    }
  }

  async function run(workspace) {
    // Já rodando: só acorda a espera, para o que acabou de ser agendado não aguardar o intervalo dos outros.
    if (running.has(workspace)) { running.get(workspace)(); return 0; }
    running.set(workspace, () => {});
    const rest = ms => Promise.race([sleep(ms), new Promise(wake => { running.set(workspace, wake); })]);
    try {
      const state = await load(workspace);
      if (!eventSendDue(state, now()) || !await active(state, workspace)) return 0;
      const begin = now();
      let sent = 0;
      while (now() - begin < budgetMs) {
        const { row, waitMs } = (await change(workspace, { type: 'event-send-take', data: { at: new Date(now()).toISOString() } })).id;
        if (!row) {
          if (waitMs === null || now() - begin + waitMs > budgetMs) break;
          await rest(Math.max(250, waitMs));
          continue;
        }
        let result;
        try { result = await send(workspace, { to: row.to, part: row.part }, state); }
        catch (error) { result = { outcome: 'unconfirmed', id: '', error: error?.message || '' }; }
        const saved = await record(workspace, { id: row.id, outcome: result.outcome, providerId: result.id, error: result.error });
        changed(workspace, saved.state);
        if (result.outcome === 'sent') sent++;
        if (result.outcome === 'waiting') break;
      }
      return sent;
    } finally { running.delete(workspace); }
  }
  return { run };
}
