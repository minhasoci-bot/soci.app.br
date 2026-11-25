// O que mudou na caixa de entrada desde a última busca da tela (ui/inbox-live.js). A marca é um resumo de cada parte:
// sem mudança, a resposta leva só a marca; com mudança, só as partes novas. A leitura do documento pergunta a revisão
// ao banco e não o traz de novo se for a mesma (storage.mjs, D28).
import { createHash } from 'node:crypto';

const PARTS = { messages: [], contacts: [], threads: [], teamMessages: [], whatsappHealth: null };

/** view: o que a pessoa pode ver (workspaceView). */
export function inboxChanges({ state, metrics }, mark = '') {
  const seen = String(mark).split('.'), changed = {};
  const now = Object.entries(PARTS).map(([key, none], index) => {
    const value = state[key] ?? none;
    const sum = createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 16);
    if (sum !== seen[index]) changed[key] = value;
    return sum;
  }).join('.');
  return Object.keys(changed).length ? { mark: now, state: changed, metrics } : { mark: now };
}
