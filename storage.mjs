import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { hydrateWorkspace, uid } from './model.mjs';

export function workspaceMissing() {
  return Object.assign(new Error('Workspace not found.'), { status: 404 });
}

export const isDocument = id => id === 'agency' || /^(agency|studio|social|openai|chat|portal|community|waha|whatsapp|abacatepay|marketplace|google|ads|email|media)-/.test(id);

// Livro da cobrança: só inclusão, com chave única por fato (ledger-model.mjs monta as linhas).
const ledgerLayers = ['platform', 'agency', 'account'];
const ledgerKinds = ['sale', 'manual_sale', 'refund', 'dispute_opened', 'dispute_won', 'dispute_lost', 'adjustment', 'plan_payment', 'wallet_topup', 'wallet_credit', 'wallet_debit', 'wallet_usage'];
const ledgerJson = ['source', 'seller', 'payer', 'detail'], ledgerText = ['method', 'provider', 'provider_ref'];
const ledgerColumns = ['key', 'layer', 'agency_id', 'workspace_id', 'kind', 'amount_cents', 'fee_cents', 'usage_micros', ...ledgerText, ...ledgerJson, 'occurred_at'];
const ledgerValue = (row, column) => row[column] ?? (ledgerJson.includes(column) ? {} : ledgerText.includes(column) ? '' : null);
const quoted = list => list.map(item => `'${item}'`).join(', ');
const ledgerSchema = `CREATE TABLE IF NOT EXISTS go_billing_ledger (key TEXT PRIMARY KEY, layer TEXT NOT NULL CHECK (layer IN (${quoted(ledgerLayers)})),
  agency_id TEXT NOT NULL, workspace_id TEXT, kind TEXT NOT NULL CHECK (kind IN (${quoted(ledgerKinds)})), amount_cents INTEGER NOT NULL, fee_cents INTEGER, usage_micros INTEGER,
  method TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '{}', seller TEXT NOT NULL DEFAULT '{}',
  payer TEXT NOT NULL DEFAULT '{}', detail TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) STRICT;
  CREATE INDEX IF NOT EXISTS go_billing_ledger_agency ON go_billing_ledger (agency_id, layer, occurred_at DESC, key DESC);
  CREATE INDEX IF NOT EXISTS go_billing_ledger_workspace ON go_billing_ledger (workspace_id, layer, occurred_at DESC, key DESC);
  CREATE TRIGGER IF NOT EXISTS go_billing_ledger_no_update BEFORE UPDATE ON go_billing_ledger BEGIN SELECT RAISE(ABORT, 'livro imutável'); END;
  CREATE TRIGGER IF NOT EXISTS go_billing_ledger_no_delete BEFORE DELETE ON go_billing_ledger BEGIN SELECT RAISE(ABORT, 'livro imutável'); END;`;
const readCursor = after => { const cut = String(after).indexOf('|'); return { at: String(after).slice(0, cut), key: String(after).slice(cut + 1) }; };
const page = (rows, limit) => ({ rows: rows.slice(0, limit), next: rows.length > limit ? `${rows[limit - 1].occurred_at}|${rows[limit - 1].key}` : '' });

function containsJson(value, expected) {
  if (Array.isArray(expected)) return Array.isArray(value) && expected.every(item => value.some(entry => containsJson(entry, item)));
  if (expected && typeof expected === 'object') {
    return Boolean(value) && Object.entries(expected).every(([key, item]) => containsJson(value[key], item));
  }
  return value === expected;
}

export function createSqliteStore(path) {
  if (path !== ':memory:') {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch (err) {
      path = resolve(tmpdir(), 'go.sqlite');
      mkdirSync(dirname(path), { recursive: true });
    }
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT;');
  db.exec(ledgerSchema);
  let ledgerInsert = null;
  const get = db.prepare('SELECT state FROM workspaces WHERE id = ?');
  const list = db.prepare("SELECT id, json_extract(state, '$.profile.name') AS name FROM workspaces ORDER BY rowid");
  const listByAgency = db.prepare("SELECT id, json_extract(state, '$.profile.name') AS name FROM workspaces WHERE json_extract(state, '$.agencyId') IS ? ORDER BY rowid");
  const owned = db.prepare("SELECT 1 FROM workspaces WHERE id = ? AND json_extract(state, '$.agencyId') IS ?");
  const agencies = db.prepare("SELECT id, state FROM workspaces WHERE id = 'agency' OR id LIKE 'agency-%' ORDER BY rowid");
  const insert = db.prepare('INSERT INTO workspaces (id, state) VALUES (?, ?) ON CONFLICT(id) DO NOTHING');
  const update = db.prepare('UPDATE workspaces SET state = ? WHERE id = ?');

  function load(id) {
    const row = get.get(id);
    if (!row) throw workspaceMissing();
    const state = JSON.parse(row.state);
    return isDocument(id) ? state : hydrateWorkspace(state);
  }

  return {
    kind: 'SQLite',
    load,
    list: agencyId => agencyId === undefined ? list.all() : listByAgency.all(agencyId),
    belongsToAgency: (id, agencyId) => Boolean(owned.get(id, agencyId)),
    findAgency(filter) {
      for (const row of agencies.iterate()) {
        const state = JSON.parse(row.state);
        if (containsJson(state, filter)) return { id: row.id, state };
      }
      return null;
    },
    insert: (id, state) => Boolean(insert.run(id, JSON.stringify(state)).changes),
    change(id, mutate) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = load(id);
        const result = mutate(state);
        update.run(JSON.stringify(state), id);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async ledgerAppend(rows) {
      if (!rows.length) return;
      ledgerInsert ??= db.prepare(`INSERT INTO go_billing_ledger (${ledgerColumns.join(', ')}) VALUES (${ledgerColumns.map(() => '?').join(', ')}) ON CONFLICT(key) DO NOTHING`);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) ledgerInsert.run(...ledgerColumns.map(column => ledgerJson.includes(column) ? JSON.stringify(ledgerValue(row, column)) : ledgerValue(row, column)));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async ledgerList({ layer, agencyId, workspaceId, kind, from, to, limit = 200, after = '' }) {
      const where = ['layer = ?', 'agency_id = ?', 'occurred_at >= ?', 'occurred_at < ?'], values = [layer, agencyId, from, to];
      if (workspaceId !== undefined) { where.push('workspace_id = ?'); values.push(workspaceId); }
      if (kind) { where.push('kind = ?'); values.push(kind); }
      if (after) { const c = readCursor(after); where.push('(occurred_at < ? OR (occurred_at = ? AND key < ?))'); values.push(c.at, c.at, c.key); }
      const rows = db.prepare(`SELECT * FROM go_billing_ledger WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, key DESC LIMIT ?`).all(...values, limit + 1);
      return page(rows.map(row => ({ ...row, ...Object.fromEntries(ledgerJson.map(column => [column, JSON.parse(row[column])])) })), limit);
    },
    close: () => db.close()
  };
}

export function createSupabaseStore({ projectUrl, publishableKey, storageKey, request = fetch }) {
  const base = new URL(projectUrl);
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) || base.username || base.password || base.port || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('SUPABASE_URL must be an HTTPS Supabase project URL.');
  }
  if (!publishableKey || !/^[a-f0-9]{64}$/.test(storageKey || '')) {
    throw new Error('Set SUPABASE_PUBLISHABLE_KEY and the provisioned GO_STORAGE_KEY.');
  }

  async function table(query, options = {}) {
    const endpoint = new URL(`/rest/v1/${options.table || 'go_workspaces'}`, base);
    endpoint.search = new URLSearchParams(query);
    const headers = {
      apikey: publishableKey,
      'X-Go-Storage-Key': storageKey,
      Accept: 'application/json',
      ...options.headers
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await request(endpoint, {
        method: options.method || 'GET',
        headers,
        body: options.body && JSON.stringify(options.body),
        redirect: 'error',
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw new Error('Could not connect to the Supabase Data API.');
    }
    if (!response.ok) throw new Error(`Supabase Data API request failed (${response.status}).`);
    return response.json();
  }

  async function read(id) {
    const [row] = await table({ select: 'state,revision', id: `eq.${id}` });
    if (!row) throw workspaceMissing();
    return { ...row, state: isDocument(id) ? row.state : hydrateWorkspace(row.state) };
  }

  const agencyFilter = agencyId => agencyId === null ? 'is.null' : `eq.${agencyId}`;
  return {
    kind: 'Supabase',
    load: async id => (await read(id)).state,
    list: agencyId => table({ select: 'id,name', order: 'created_at.asc,id.asc',
      ...(agencyId !== undefined && { 'state->>agencyId': agencyFilter(agencyId) }) }),
    async belongsToAgency(id, agencyId) {
      const rows = await table({ select: 'id', id: `eq.${id}`, 'state->>agencyId': agencyFilter(agencyId) });
      return rows.length !== 0;
    },
    async findAgency(filter) {
      const [row] = await table({ select: 'id,state', or: '(id.eq.agency,id.like.agency-*)',
        state: 'cs.' + JSON.stringify(filter), order: 'created_at.asc,id.asc', limit: 1 });
      return row || null;
    },
    async insert(id, state) {
      const rows = await table({ on_conflict: 'id', select: 'id' }, {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: { id, state }
      });
      return rows.length === 1;
    },
    async change(id, mutate) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { state, revision } = await read(id);
        const result = mutate(state);
        const saved = await table({ select: 'id', id: `eq.${id}`, revision: `eq.${revision}` }, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { state, revision: uid() }
        });
        if (saved.length === 1) return result;
      }
      throw Object.assign(new Error('The workspace changed concurrently. Please retry.'), { status: 409 });
    },
    async ledgerAppend(rows) {
      if (!rows.length) return;
      await table({ on_conflict: 'key', select: 'key' }, { table: 'go_billing_ledger', method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: rows.map(row => Object.fromEntries(ledgerColumns.map(column => [column, ledgerValue(row, column)]))) });
    },
    async ledgerList({ layer, agencyId, workspaceId, kind, from, to, limit = 200, after = '' }) {
      const literal = value => `"${String(value).replace(/["\\]/g, char => `\\${char}`)}"`;
      const both = [`occurred_at.gte.${from}`, `occurred_at.lt.${to}`];
      if (after) { const c = readCursor(after); both.push(`or(occurred_at.lt.${c.at},and(occurred_at.eq.${c.at},key.lt.${literal(c.key)}))`); }
      const rows = await table({ select: '*', layer: `eq.${layer}`, agency_id: `eq.${agencyId}`, ...(workspaceId !== undefined && { workspace_id: `eq.${workspaceId}` }),
        ...(kind && { kind: `eq.${kind}` }), and: `(${both.join(',')})`, order: 'occurred_at.desc,key.desc', limit: limit + 1 }, { table: 'go_billing_ledger' });
      return page(rows.map(row => ({ ...row, occurred_at: new Date(row.occurred_at).toISOString() })), limit);
    },
    close() {}
  };
}

export function supabaseFromEnv(env = process.env) {
  const projectUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  const storageKey = env.GO_STORAGE_KEY;
  if (!projectUrl && !publishableKey && !storageKey) return null;
  if (!projectUrl) throw new Error('Set SUPABASE_URL to the project URL.');
  return createSupabaseStore({ projectUrl, publishableKey, storageKey });
}
