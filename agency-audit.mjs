// Log de auditoria da agência fora do documento dela (plano de melhoria P2.5, fatia 2). Cada gravação numa subconta
// regravava o documento inteiro da agência só para anotar quem fez o quê; agora a anotação avulsa vai direto para a tabela
// `agency_audit` (SQLite) ou `go_agency_audit` (Supabase). O que é anotado junto com outra mudança da agência continua
// entrando no documento, na mesma gravação (nada se perde), e passa para a tabela em lotes.
// Enquanto o banco não tem a tabela (store.audit ausente ou código 'audit_unavailable'), tudo segue no documento, como antes.
import { createHash } from 'node:crypto';

/** How long an entry is kept in the table. */
export const AUDIT_DAYS = 730;
export const AUDIT_PAGE = 50;
/** The document as it was: the last 1,000 entries, while there is no table. */
export const AUDIT_IN_DOCUMENT = 1000;
/** Entries waiting in the document before a batch goes to the table. */
export const AUDIT_BATCH = 50;
const MAX_PAGE = 500, DAY = 86400000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const isMissing = error => error?.code === 'audit_unavailable';
const text = value => typeof value === 'string' ? value : '';

/** The id of an entry, the same every time even for an old one that was stored without it. */
export const entryId = row => /^[\w-]{1,64}$/.test(text(row.id)) ? row.id : createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 32);
const searchable = row => [row.actor, row.action, row.target, row.details].map(text).join('\n').toLowerCase();

/** The entry as it is stored in a table: an id, a valid date and the text the search looks into. */
export function storedEntry(row) {
  const at = Date.parse(row.at);
  return { entry: { id: entryId(row), at: new Date(Number.isFinite(at) ? at : 0).toISOString(), actor: text(row.actor), action: text(row.action), target: text(row.target), details: text(row.details) },
    search: searchable(row) };
}

function parseCursor(value) {
  if (!value) return null;
  const found = String(value).match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)_([\w-]{1,64})$/);
  if (!found) fail('Página inválida.');
  return { at: found[1], id: found[2] };
}
/** The query of a page, checked. `targets` (a list) keeps only the entries about one sub-account. */
export function auditOptions({ q = '', targets = null, before = '', limit = AUDIT_PAGE } = {}) {
  return { q: text(q).trim().slice(0, 100).toLowerCase(), targets: targets ? [...new Set(targets.filter(Boolean).map(String))] : null,
    cursor: parseCursor(before), limit: Math.min(Math.max(Math.trunc(Number(limit)) || AUDIT_PAGE, 1), MAX_PAGE) };
}
/** One extra row was asked for: it only says that there is a next page. */
export function auditPage(rows, limit) {
  const entries = rows.slice(0, limit), tail = entries[limit - 1];
  return { entries, next: rows.length > limit ? `${tail.at}_${tail.id}` : '' };
}

/** The same answer, from the entries kept in the document. */
export function entriesPage(rows, query) {
  const { q, targets, cursor, limit } = auditOptions(query);
  const found = (rows || []).map(storedEntry).filter(({ entry, search }) => (!q || search.includes(q)) && (!targets || targets.includes(entry.target))
    && (!cursor || entry.at < cursor.at || (entry.at === cursor.at && entry.id < cursor.id))).map(({ entry }) => entry);
  return auditPage(found.sort((a, b) => b.at.localeCompare(a.at) || (a.id < b.id ? 1 : -1)).slice(0, limit + 1), limit);
}

export function createAuditLog({ store }) {
  let sweptOn = '';
  const note = (where, error) => { if (!isMissing(error)) console.error(`Auditoria (${where}): ${error.message}`); };

  /** Copies the entries waiting in the document to the table and only then takes them out of the document. */
  async function drain(agencyId, rows) {
    if (!rows?.length) return;
    await store.audit.append(agencyId, rows);
    const moved = new Set(rows.map(entryId));
    await store.change(agencyId, state => { state.audit = (state.audit || []).filter(row => !moved.has(entryId(row))); });
  }

  /** A loose entry (nothing else in the agency changes). False when it has to go to the document. */
  async function append(agencyId, entry) {
    if (!store.audit) return false;
    try { await store.audit.append(agencyId, [entry]); return true; }
    catch (error) { note(agencyId, error); return false; }
  }

  /** After a change of the agency that left `waiting` entries in the document. Never undoes the change. */
  async function settle(agencyId, waiting) {
    if (!store.audit || waiting < AUDIT_BATCH) return;
    try { await drain(agencyId, (await store.load(agencyId)).audit); }
    catch (error) { note(agencyId, error); }
  }

  /** A page, newest first. */
  async function read(agencyId, query = {}) {
    const { audit: waiting = [] } = await store.load(agencyId);
    if (store.audit) {
      try {
        // Copied before the page is read; if only taking them out of the document fails, the page is already complete.
        if (waiting.length) await store.audit.append(agencyId, waiting);
        const page = await store.audit.page(agencyId, query);
        if (waiting.length >= AUDIT_BATCH) await settle(agencyId, waiting.length);
        return page;
      } catch (error) { if (!isMissing(error)) throw error; }
    }
    return entriesPage(waiting, query);
  }

  /** Once per day (and per server), from the cron: drops what is past the retention. */
  async function sweep(at = Date.now()) {
    const today = new Date(at).toISOString().slice(0, 10);
    if (!store.audit || sweptOn === today) return;
    sweptOn = today;
    try { await store.audit.prune(new Date(at - AUDIT_DAYS * DAY).toISOString()); }
    catch (error) { note('limpeza', error); }
  }
  return { append, settle, read, sweep };
}
