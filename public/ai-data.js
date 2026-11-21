// Shared by the server and the Agent Studio screens: knowledge bases, AI usage and cost.

export const kbLimits = {
  bases: 20, name: 60, description: 300, sources: 40, sourceTitle: 120, sourceText: 20000,
  agentBases: 5, retrievalChars: 6000, chunkChars: 900
};

export const sourceKinds = [
  ['text', 'Texto'],
  ['faq', 'Perguntas frequentes'],
  ['url', 'Página da web (conteúdo colado)']
];

export const usageKinds = [
  ['agent-test', 'Conversas com agentes'],
  ['agent-build', 'Construtor de agentes'],
  ['social', 'Redes sociais (legendas e textos)'],
  ['email', 'E-mail marketing'],
  ['blog', 'Blogs'],
  ['workflow', 'Automações (workflows)'],
  ['reputation', 'Respostas a avaliações'],
  ['brand', 'Marca (voz com IA)'],
  ['other', 'Outros usos de IA']
];

// Public list prices in US$ per 1 million tokens. The cost shown is an estimate:
// the OpenAI bill is the reference, and tool calls such as web search are charged apart.
export const modelPrices = [
  ['gpt-5-nano', 0.05, 0.40], ['gpt-5-mini', 0.25, 2.00], ['gpt-5', 1.25, 10.00],
  ['gpt-4.1-nano', 0.10, 0.40], ['gpt-4.1-mini', 0.40, 1.60], ['gpt-4.1', 2.00, 8.00],
  ['gpt-4o-mini', 0.15, 0.60], ['gpt-4o', 2.50, 10.00], ['o4-mini', 1.10, 4.40], ['o3', 2.00, 8.00]
];

// Longest matching prefix, so dated snapshots ("gpt-4.1-mini-2025-04-14") use their family price.
export function modelPrice(model = '') {
  const id = String(model).toLowerCase();
  const match = modelPrices.filter(([key]) => id === key || id.startsWith(`${key}-`))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match ? { input: match[1], output: match[2], known: true } : { input: 0, output: 0, known: false };
}

export function usageCost(model, inputTokens = 0, outputTokens = 0) {
  const price = modelPrice(model);
  return Math.round((inputTokens * price.input + outputTokens * price.output) / 1e6 * 1e6) / 1e6;
}

export const monthOf = iso => String(iso || new Date().toISOString()).slice(0, 7);

const emptyTotals = () => ({ calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
const addTo = (totals, entry) => {
  totals.calls += 1;
  if (entry.error) totals.errors += 1;
  totals.inputTokens += entry.inputTokens || 0;
  totals.outputTokens += entry.outputTokens || 0;
  totals.cost = Math.round((totals.cost + (entry.cost || 0)) * 1e6) / 1e6;
  return totals;
};

// Aggregates the usage ledger of one sub-account for a month.
export function usageSummary(ai = {}, month = monthOf()) {
  const entries = (ai.ledger || []).filter(entry => monthOf(entry.at) === month);
  const summary = { month, ...emptyTotals(), byKind: {}, byAgent: {}, byModel: {}, byDay: {} };
  for (const entry of entries) {
    addTo(summary, entry);
    addTo(summary.byKind[entry.kind || 'other'] ||= emptyTotals(), entry);
    if (entry.agent) addTo(summary.byAgent[entry.agent] ||= emptyTotals(), entry);
    addTo(summary.byModel[entry.model || '—'] ||= emptyTotals(), entry);
    addTo(summary.byDay[String(entry.at).slice(0, 10)] ||= emptyTotals(), entry);
  }
  const limit = Number(ai.limit) > 0 ? Number(ai.limit) : 0;
  summary.limit = limit;
  summary.remaining = limit ? Math.max(0, Math.round((limit - summary.cost) * 1e6) / 1e6) : null;
  summary.blocked = Boolean(limit && summary.cost >= limit);
  summary.warning = Boolean(limit && !summary.blocked && summary.cost >= limit * (ai.alertAt || 0.8));
  return summary;
}

export const usageMonths = (ai = {}) => [...new Set([monthOf(), ...(ai.ledger || []).map(entry => monthOf(entry.at))])].sort().reverse();

// Portuguese and Spanish function words that say nothing about the topic of a question.
const stopwords = new Set(('que para com por uma uns umas dos das nos nas num numa como mais mas sem sao ser esta este esse essa isso '
  + 'isto aqui voce voces vcs qual quais quando onde porque tem ter tenho pode posso seu sua seus suas meu minha nao sim ate '
  + 'pelo pela pelos pelas sobre entre tambem muito muita cual cuales cuando donde usted ustedes del los las por una unos unas '
  + 'pero sin como mas este esta eso esto aqui tiene tengo puede puedo hay quiero gostaria queria').split(' '));

// Light stemming: the first five letters, so "troca", "trocas" and "trocar" meet.
const words = value => (String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .match(/[\p{L}\p{N}]{3,}/gu) || []).filter(word => !stopwords.has(word)).map(word => word.slice(0, 5));

// Splits a source into passages of roughly `size` characters, on paragraph and sentence boundaries.
export function chunkText(text, size = kbLimits.chunkChars) {
  const parts = String(text || '').split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ¿¡])/u).map(part => part.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length + 1 > size) { chunks.push(current); current = ''; }
    if (part.length > size) {
      for (let i = 0; i < part.length; i += size) chunks.push(part.slice(i, i + size));
    } else current = current ? `${current}\n${part}` : part;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Lexical retrieval over the knowledge bases an agent uses: the passages that share the most
// distinct words with the question, within a character budget. No embeddings, no external calls.
export function retrieveKnowledge(bases, question, budget = kbLimits.retrievalChars) {
  const query = new Set(words(question));
  const passages = [];
  for (const base of bases) {
    for (const source of base.sources || []) {
      const header = source.kind === 'faq' && source.question ? `${source.question}\n` : '';
      chunkText(header + source.text).forEach((text, index) => {
        const terms = new Set(words(`${source.title} ${text}`));
        let score = 0;
        for (const term of query) if (terms.has(term)) score += 1;
        passages.push({ base: base.name, title: source.title, text, score, order: index });
      });
    }
  }
  const ranked = query.size
    ? passages.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.order - b.order)
    : [];
  // Small bases fit whole: with nothing matched, the first passages still give the agent context.
  const pool = ranked.length ? ranked : passages;
  const picked = [];
  let used = 0;
  for (const item of pool) {
    if (used + item.text.length > budget) continue;
    picked.push({ base: item.base, title: item.title, text: item.text });
    used += item.text.length;
  }
  return picked;
}

export const formatUsd = value => `US$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: value && value < 0.01 ? 4 : 2 })}`;
export const formatTokens = value => Number(value || 0).toLocaleString('pt-BR');
