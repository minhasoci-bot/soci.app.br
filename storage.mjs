import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { hydrateWorkspace, uid } from './model.mjs';

export function workspaceMissing() {
  return Object.assign(new Error('Workspace not found.'), { status: 404 });
}

export const isDocument = id => id === 'agency' || /^(agency|studio|social|openai|chat|portal|waha|whatsapp)-/.test(id);

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
    const endpoint = new URL('/rest/v1/go_workspaces', base);
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
