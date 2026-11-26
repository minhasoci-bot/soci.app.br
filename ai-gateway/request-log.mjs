// Log de requisições do gateway (tabela go_ai_requests): uma linha por pedido, com as tentativas, tokens,
// custo e decisão de rota. Só metadados: prompt e resposta NUNCA entram aqui. Só inclusão (imutável no banco).
// Local: SQLite (mesmo arquivo do store). Produção: Supabase pela chave do servidor, como o livro da cobrança.

export const LOG_COLUMNS = Object.freeze(['id', 'created_at', 'org_id', 'workspace_id', 'user_id', 'feature', 'mode', 'plan', 'requested_model', 'provider', 'model',
  'tier', 'status', 'error_kind', 'attempts', 'input_tokens', 'output_tokens', 'cached_tokens', 'reasoning_tokens', 'usage_source', 'cost_micros', 'provider_cost_micros',
  'cost_source', 'latency_ms', 'ttft_ms', 'cache_hit', 'stream', 'data_class', 'prompt_version', 'detail']);

export function logRow(entry) {
  const row = {};
  for (const column of LOG_COLUMNS) row[column] = entry[column] ?? null;
  row.detail = entry.detail || {};
  row.cache_hit = Boolean(entry.cache_hit);
  row.stream = Boolean(entry.stream);
  return row;
}

const sqliteSchema = `CREATE TABLE IF NOT EXISTS go_ai_requests (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, org_id TEXT NOT NULL, workspace_id TEXT, user_id TEXT,
  feature TEXT NOT NULL, mode TEXT, plan TEXT, requested_model TEXT, provider TEXT, model TEXT, tier TEXT, status TEXT NOT NULL, error_kind TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, reasoning_tokens INTEGER, usage_source TEXT, cost_micros INTEGER, provider_cost_micros INTEGER,
  cost_source TEXT, latency_ms INTEGER, ttft_ms INTEGER, cache_hit INTEGER NOT NULL DEFAULT 0, stream INTEGER NOT NULL DEFAULT 0, data_class TEXT, prompt_version TEXT,
  detail TEXT NOT NULL DEFAULT '{}') STRICT;
  CREATE INDEX IF NOT EXISTS go_ai_requests_time ON go_ai_requests (created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS go_ai_requests_org ON go_ai_requests (org_id, created_at DESC);
  CREATE TRIGGER IF NOT EXISTS go_ai_requests_no_update BEFORE UPDATE ON go_ai_requests BEGIN SELECT RAISE(ABORT, 'log imutável'); END;`;

const FILTERS = ['org_id', 'feature', 'provider', 'status', 'tier'];
function options(query = {}) {
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, 500));
  const filters = Object.fromEntries(FILTERS.filter(key => typeof query[key] === 'string' && query[key]).map(key => [key, query[key].slice(0, 120)]));
  let cursor = null;
  if (typeof query.after === 'string' && query.after.includes('|')) { const [at, id] = query.after.split('|'); cursor = { at, id }; }
  return { limit, filters, cursor, from: query.from || '', to: query.to || '' };
}
const pageOf = (rows, limit) => ({ rows: rows.slice(0, limit), next: rows.length > limit ? `${rows[limit - 1].created_at}|${rows[limit - 1].id}` : '' });

export function sqliteRequestLog(db) {
  db.exec(sqliteSchema);
  const insert = db.prepare(`INSERT INTO go_ai_requests (${LOG_COLUMNS.join(', ')}) VALUES (${LOG_COLUMNS.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING`);
  const decode = row => ({ ...row, cache_hit: Boolean(row.cache_hit), stream: Boolean(row.stream), detail: JSON.parse(row.detail || '{}') });
  return {
    async append(rows) {
      for (const row of rows.map(logRow)) insert.run(...LOG_COLUMNS.map(column => column === 'detail' ? JSON.stringify(row.detail) : typeof row[column] === 'boolean' ? Number(row[column]) : row[column]));
    },
    async page(query) {
      const { limit, filters, cursor, from, to } = options(query);
      const where = [], values = [];
      for (const [key, value] of Object.entries(filters)) { where.push(`${key} = ?`); values.push(value); }
      if (from) { where.push('created_at >= ?'); values.push(from); }
      if (to) { where.push('created_at < ?'); values.push(to); }
      if (cursor) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); values.push(cursor.at, cursor.at, cursor.id); }
      const rows = db.prepare(`SELECT * FROM go_ai_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...values, limit + 1);
      return pageOf(rows.map(decode), limit);
    },
    async summary(since) {
      return summarize(db.prepare('SELECT * FROM go_ai_requests WHERE created_at >= ?').all(since).map(decode), since);
    },
    async prune(before) { db.prepare('DELETE FROM go_ai_requests WHERE created_at < ?').run(before); }
  };
}

/** `call(path, query, options)` é o optionalTable do store do Supabase (falha com código quando a tabela não existe). */
export function supabaseRequestLog(call) {
  return {
    async append(rows) {
      const body = rows.map(logRow);
      for (let start = 0; start < body.length; start += 500) {
        await call('go_ai_requests', { on_conflict: 'id' }, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: body.slice(start, start + 500) });
      }
    },
    async page(query) {
      const { limit, filters, cursor, from, to } = options(query);
      const params = { select: '*', order: 'created_at.desc,id.desc', limit: String(limit + 1) };
      for (const [key, value] of Object.entries(filters)) params[key] = `eq.${value}`;
      const and = [];
      if (from) and.push(`created_at.gte.${from}`);
      if (to) and.push(`created_at.lt.${to}`);
      if (cursor) and.push(`or(created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt."${cursor.id}"))`);
      if (and.length) params.and = `(${and.join(',')})`;
      return pageOf(await (await call('go_ai_requests', params)).json(), limit);
    },
    async summary(since) {
      return (await call('rpc/go_ai_requests_summary', {}, { method: 'POST', body: { p_since: since } })).json();
    },
    async prune(before) { await call('go_ai_requests', { created_at: `lt.${before}` }, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
  };
}

/** Sem tabela (testes, store sem suporte): guarda as últimas linhas na memória desta instância. */
export function memoryRequestLog(max = 1000) {
  const rows = [];
  return {
    memory: true,
    async append(list) { rows.unshift(...list.map(logRow)); rows.splice(max); },
    async page(query) {
      const { limit, filters, cursor, from, to } = options(query);
      const list = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value) && (!from || row.created_at >= from) && (!to || row.created_at < to)
        && (!cursor || row.created_at < cursor.at || (row.created_at === cursor.at && row.id < cursor.id)));
      return pageOf(list.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, limit + 1), limit);
    },
    async summary(since) { return summarize(rows.filter(row => row.created_at >= since), since); },
    async prune(before) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].created_at < before) rows.splice(i, 1); }
  };
}

/** Agregação usada pelo painel (mesma forma que a função SQL go_ai_requests_summary devolve). */
export function summarize(rows, since) {
  const total = { requests: 0, ok: 0, failed: 0, fallback: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, freeRequests: 0, paidRequests: 0, byokRequests: 0,
    paidCostMicros: 0, latencySum: 0, latencyCount: 0, users: 0, orgs: 0, unknownCost: 0 };
  const users = new Set(), orgs = new Set();
  const byDay = {}, byProvider = {}, byFeature = {};
  const bump = (map, key, row) => {
    if (!map[key]) map[key] = { requests: 0, ok: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 };
    const entry = map[key];
    entry.requests++; if (row.status === 'ok') entry.ok++;
    entry.inputTokens += row.input_tokens || 0; entry.outputTokens += row.output_tokens || 0; entry.costMicros += row.cost_micros || 0;
  };
  for (const row of rows) {
    total.requests++;
    if (row.status === 'ok') total.ok++; else total.failed++;
    if ((row.attempts || 0) > 1) total.fallback++;
    if (row.cache_hit) total.cacheHits++;
    total.inputTokens += row.input_tokens || 0; total.outputTokens += row.output_tokens || 0; total.costMicros += row.cost_micros || 0;
    if (row.tier === 'free') total.freeRequests++;
    if (row.tier === 'paid') { total.paidRequests++; total.paidCostMicros += row.cost_micros || 0; }
    if (row.tier === 'byok') total.byokRequests++;
    if (row.cost_source === 'unknown' && row.status === 'ok') total.unknownCost++;
    if (Number.isFinite(row.latency_ms) && row.status === 'ok') { total.latencySum += row.latency_ms; total.latencyCount++; }
    if (row.user_id) users.add(row.user_id);
    if (row.org_id) orgs.add(row.org_id);
    bump(byDay, String(row.created_at).slice(0, 10), row);
    if (row.provider) bump(byProvider, row.provider, row);
    bump(byFeature, row.feature, row);
  }
  total.users = users.size; total.orgs = orgs.size;
  return { since, total, byDay, byProvider, byFeature };
}
