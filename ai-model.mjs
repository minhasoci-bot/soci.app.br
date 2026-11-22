import { requireCredit, walletCharge } from './wallet-model.mjs';
import { randomUUID } from 'node:crypto';
import { kbLimits, monthOf, retrieveKnowledge, sourceKinds, usageCost, usageKinds, usageSummary } from './ui/ai-data.js';
import { agentDraft } from './ui/agents-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = value => (typeof value === 'string' ? value.trim() : '');
const limited = n => n.toLocaleString('pt-BR');

function required(value, limit, label) {
  const result = text(value);
  if (!result || result.length > limit) fail(`Preencha ${label} com até ${limited(limit)} caracteres.`);
  return result;
}
function optional(value, limit, label) {
  const result = text(value);
  if (result.length > limit) fail(`Use até ${limited(limit)} caracteres em ${label}.`);
  return result;
}

/* ───────────── Knowledge bases ───────────── */

function validSources(list, previous = []) {
  if (!Array.isArray(list) || list.length > kbLimits.sources) fail(`Adicione até ${kbLimits.sources} fontes por base.`);
  const at = new Date().toISOString();
  return list.map(source => {
    const kind = sourceKinds.some(([id]) => id === source?.kind) ? source.kind : 'text';
    const item = {
      id: text(source?.id) || randomUUID(), kind,
      title: required(source?.title, kbLimits.sourceTitle, 'o título da fonte'),
      text: required(source?.text, kbLimits.sourceText, kind === 'faq' ? 'a resposta' : 'o conteúdo da fonte')
    };
    if (kind === 'faq') item.question = required(source?.question, kbLimits.sourceTitle * 2, 'a pergunta');
    if (kind === 'url') {
      const url = text(source?.url);
      if (url && !/^https?:\/\/\S+$/i.test(url)) fail('Informe o endereço da página começando com http:// ou https://.');
      item.url = url;
    }
    const old = previous.find(entry => entry.id === item.id);
    item.updated = old && JSON.stringify({ ...old, updated: undefined }) === JSON.stringify({ ...item, updated: undefined }) ? old.updated : at;
    return item;
  });
}

function findBase(state, id) {
  const base = state.knowledgeBases.find(item => item.id === id);
  if (!base) fail('Base de conhecimento não encontrada nesta subconta.', 404);
  return base;
}

export function editKnowledgeBase(state, operation, input) {
  state.knowledgeBases ||= [];
  const at = new Date().toISOString();
  if (operation === 'create') {
    if (state.knowledgeBases.length >= kbLimits.bases) fail(`A subconta guarda até ${kbLimits.bases} bases de conhecimento.`);
    const base = {
      id: randomUUID(), created: at, updated: at,
      name: required(input.name || 'Nova base / Nueva base', kbLimits.name, 'o nome da base'),
      description: optional(input.description, kbLimits.description, 'a descrição'),
      sources: validSources(input.sources || [])
    };
    state.knowledgeBases.push(base);
    return base;
  }
  const base = findBase(state, input.id);
  if (operation === 'delete') {
    state.knowledgeBases = state.knowledgeBases.filter(item => item.id !== base.id);
    for (const agent of state.agents) {
      if (agent.bases?.includes(base.id)) agent.bases = agent.bases.filter(id => id !== base.id);
      if (agent.published?.bases?.includes(base.id)) agent.published.bases = agent.published.bases.filter(id => id !== base.id);
    }
    return null;
  }
  if (operation !== 'save') fail('Operação desconhecida.', 404);
  Object.assign(base, {
    name: required(input.name, kbLimits.name, 'o nome da base'),
    description: optional(input.description, kbLimits.description, 'a descrição'),
    sources: validSources(input.sources || [], base.sources),
    updated: at
  });
  return base;
}

// The bases an agent may use, validated against this sub-account.
export function validBases(state, list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > kbLimits.agentBases) fail(`Conecte até ${kbLimits.agentBases} bases de conhecimento ao agente.`);
  const known = new Set((state.knowledgeBases || []).map(base => base.id));
  return [...new Set(list.filter(id => typeof id === 'string'))].map(id => {
    if (!known.has(id)) fail('Uma das bases de conhecimento escolhidas não existe mais. Recarregue a página.', 409);
    return id;
  });
}

export function agentKnowledge(state, baseIds, question) {
  const bases = (state.knowledgeBases || []).filter(base => baseIds.includes(base.id));
  return bases.length ? retrieveKnowledge(bases, question) : [];
}

/* ───────────── Workspace templates ───────────── */

export function editAgentTemplate(state, operation, input) {
  state.agentTemplatesCustom ||= [];
  if (operation === 'template-delete') {
    const before = state.agentTemplatesCustom.length;
    state.agentTemplatesCustom = state.agentTemplatesCustom.filter(item => item.id !== input.id);
    if (before === state.agentTemplatesCustom.length) fail('Modelo não encontrado nesta subconta.', 404);
    return null;
  }
  const agent = state.agents.find(item => item.id === input.agent);
  if (!agent) fail('Agente não encontrado nesta subconta.', 404);
  if (state.agentTemplatesCustom.length >= 30) fail('A subconta guarda até 30 modelos. Exclua um para salvar outro.');
  // Configuration only: never versions, memory or anything the agent learned about people.
  const template = {
    ...agentDraft(agent), bases: [...(agent.bases || [])],
    id: randomUUID(), created: new Date().toISOString(),
    name: required(input.name || agent.name, 50, 'o nome do modelo'),
    description: optional(input.description ?? agent.description, 400, 'a descrição')
  };
  state.agentTemplatesCustom.unshift(template);
  return template;
}

/* ───────────── Usage, cost and limits ───────────── */

export function setAiLimit(state, input) {
  const limit = Number(input.limit);
  if (!Number.isFinite(limit) || limit < 0 || limit > 100000) fail('Informe um limite mensal entre US$ 0 e US$ 100.000. Use 0 para não limitar.');
  const alertAt = input.alertAt === undefined ? (state.ai?.alertAt ?? 0.8) : Number(input.alertAt);
  if (!Number.isFinite(alertAt) || alertAt < 0.5 || alertAt > 0.95) fail('O alerta deve ficar entre 50% e 95% do limite.');
  state.ai ||= { ledger: [] };
  state.ai.limit = Math.round(limit * 10000) / 10000;
  state.ai.alertAt = alertAt;
  return usageSummary(state.ai);
}

// The agency's switch for one sub-account (Central de IA → Planos e limites).
export function setAiAccess(state, on) {
  state.ai ||= { limit: 0, alertAt: 0.8, ledger: [] };
  if (on) delete state.ai.disabled;
  else state.ai.disabled = true;
  return !state.ai.disabled;
}

export function checkAiBudget(state) {
  if (state.ai?.disabled) fail('A IA desta subconta foi desligada pela agência. Fale com a sua agência para religar.', 403);
  requireCredit(state, 'ai');
  const summary = usageSummary(state.ai);
  if (summary.blocked) {
    fail(`O limite mensal de IA desta subconta (US$ ${summary.limit.toFixed(2)}) foi atingido. A agência pode aumentar o limite na Central de IA.`, 402);
  }
  return summary;
}

const ledgerMax = 1500;

// Workflows hear about the month's spend crossing the alert line or the limit ("Uso de IA chegou ao alerta").
// model.mjs registers the emitter, so this module stays free of the workflow engine.
let alertHook = null;
export const onAiAlert = fn => { alertHook = fn; };

function crossings(state, before, after) {
  const limit = Number(state.ai?.limit) || 0;
  if (!limit || after <= before) return [];
  const alertLine = limit * (state.ai.alertAt || 0.8);
  const levels = [];
  if (before < alertLine && after >= alertLine && after < limit) levels.push('alert');
  if (before < limit && after >= limit) levels.push('blocked');
  return levels;
}

export function recordAiUsage(state, { kind, agent = '', model = '', usage = {}, ms = 0, error = '' }) {
  state.ai ||= { limit: 0, alertAt: 0.8, ledger: [] };
  state.ai.ledger ||= [];
  const inputTokens = Math.max(0, Number(usage.input_tokens ?? usage.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(usage.output_tokens ?? usage.outputTokens) || 0);
  const entry = {
    id: randomUUID(), at: new Date().toISOString(),
    kind: usageKinds.some(([id]) => id === kind) ? kind : 'other',
    agent, model: String(model || '').slice(0, 80), inputTokens, outputTokens,
    cost: usageCost(model, inputTokens, outputTokens), ms: Math.max(0, Math.round(ms) || 0),
    ...(error && { error: String(error).slice(0, 200) })
  };
  const before = entry.cost > 0 ? usageSummary(state.ai).cost : 0;
  state.ai.ledger.unshift(entry);
  if (entry.cost > 0) walletCharge(state, 'ai', entry.cost, entry.at);
  if (entry.cost > 0 && alertHook) {
    const limit = Number(state.ai.limit) || 0;
    const after = Math.round((before + entry.cost) * 1e6) / 1e6;
    for (const level of crossings(state, before, after)) {
      try { alertHook(state, { level, cost: after, limit, month: monthOf(entry.at), title: level === 'blocked' ? 'Limite de IA atingido' : 'Alerta de uso de IA' }); }
      catch { /* A failing workflow never undoes the usage record. */ }
    }
  }
  // Keep the current month whole; trim only older entries past the cap.
  if (state.ai.ledger.length > ledgerMax) {
    const month = monthOf();
    state.ai.ledger = state.ai.ledger.filter((item, index) => index < ledgerMax || monthOf(item.at) === month);
  }
  return entry;
}

// Central de IA → Painel de uso: the agency's AI usage over a period, summed from every sub-account ledger.
// `period` is 7, 30 or 90 days ending today, or "month" for the current calendar month.
export const usagePeriods = ['7', '30', '90', 'month'];
export function agencyAiUsage(accounts, period = '30', today = new Date().toISOString().slice(0, 10)) {
  const span = usagePeriods.includes(String(period)) ? String(period) : '30';
  const end = Date.parse(`${today}T00:00:00Z`);
  const from = span === 'month' ? `${today.slice(0, 7)}-01` : new Date(end - (Number(span) - 1) * 864e5).toISOString().slice(0, 10);
  const blank = () => ({ calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
  const add = (totals, entry) => {
    totals.calls += 1;
    if (entry.error) totals.errors += 1;
    totals.inputTokens += entry.inputTokens || 0;
    totals.outputTokens += entry.outputTokens || 0;
    totals.cost = Math.round((totals.cost + (entry.cost || 0)) * 1e6) / 1e6;
  };
  const result = { period: span, from, to: today, totals: blank(), byDay: {}, byKind: {}, byModel: {}, byAccount: [], partial: false };
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 864e5) result.byDay[new Date(at).toISOString().slice(0, 10)] = blank();
  for (const account of accounts) {
    const ledger = account.ai?.ledger || [];
    const mine = blank();
    for (const entry of ledger) {
      const day = String(entry.at).slice(0, 10);
      if (day < from || day > today) continue;
      add(result.totals, entry); add(mine, entry);
      add(result.byDay[day] ||= blank(), entry);
      add(result.byKind[entry.kind || 'other'] ||= blank(), entry);
      add(result.byModel[entry.model || '—'] ||= blank(), entry);
    }
    // A full ledger keeps only the current month whole; older days of a busy sub-account may be missing.
    const oldest = ledger.length ? String(ledger.at(-1).at).slice(0, 10) : '';
    if (ledger.length >= ledgerMax && oldest > from) result.partial = true;
    if (mine.calls) result.byAccount.push({ id: account.id, name: account.name, ...mine });
  }
  result.byAccount.sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  return result;
}

// Monthly AI spend of a sub-account, for the agency overview.
export const aiMonthCost = state => usageSummary(state.ai).cost;

// Collects the OpenAI calls of one request, then books them in the sub-account ledger.
export function usageMeter() {
  const calls = [];
  return {
    onUsage: call => { calls.push(call); },
    charge(state, kind, agent, error = '') {
      const list = calls.length ? calls : [{ model: '', usage: {}, ms: 0 }];
      const total = { inputTokens: 0, outputTokens: 0, cost: 0 };
      let model = '', ms = 0;
      for (const call of list) {
        const entry = recordAiUsage(state, { kind, agent, model: call.model, usage: call.usage, ms: call.ms, error: call.error || error });
        total.inputTokens += entry.inputTokens;
        total.outputTokens += entry.outputTokens;
        total.cost = Math.round((total.cost + entry.cost) * 1e6) / 1e6;
        model ||= entry.model;
        ms += entry.ms;
      }
      return { model, usage: total, ms };
    }
  };
}
