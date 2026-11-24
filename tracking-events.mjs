// Eventos do rastreamento externo fora do documento da subconta (plano de melhoria P2.5). Cada visita do site do
// cliente regravava o documento inteiro; agora o evento vai para a tabela `tracking_events` (SQLite) ou
// `go_tracking_events` (Supabase) e o documento só muda quando há contato envolvido.
// Enquanto o banco não tem a tabela (store.tracking ausente ou código 'tracking_unavailable'), os eventos continuam no
// documento, como antes; quando ela aparece, os que estavam lá são movidos na próxima gravação ou leitura.
import { execute } from './model.mjs';
import { newTrackingEvent, originAllowed, touchesFrom, trackingOf } from './tracking.mjs';

/** How long an event is kept in the table. */
export const TRACKING_DAYS = 365;
export const TRACKING_PAGE = 100;
const DAY = 86400000, SUMMARY_DAYS = 7;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const isMissing = error => error?.code === 'tracking_unavailable';
const types = ['pageview', 'form', 'video'];

const pagePath = url => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname}`; } catch { return url || '—'; } };
const formKey = row => row.form || pagePath(row.url);

/** The event as it is stored in a table: a valid date, and the key that groups the sends of one form. */
export function storedEvent(row) {
  const at = Date.parse(row.created);
  return { ...row, created: new Date(Number.isFinite(at) ? at : Date.now()).toISOString(), ...(row.type === 'form' ? { formKey: formKey(row) } : {}) };
}
/** The event as the screen receives it: without the answers of the form. */
export function listedEvent(row) {
  const { fields, formKey: key, ...rest } = row;
  return rest;
}

function parseCursor(value) {
  if (!value) return null;
  const found = String(value).match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)_([\w-]{1,64})$/);
  if (!found) fail('Página inválida.');
  return { created: found[1], id: found[2] };
}
/** The query of a page, checked: { type, cursor, limit }. */
export function pageOptions({ type = '', before = '', limit = TRACKING_PAGE } = {}) {
  return { type: types.includes(type) ? type : '', cursor: parseCursor(before), limit: Math.min(Math.max(Math.trunc(Number(limit)) || TRACKING_PAGE, 1), TRACKING_PAGE) };
}
/** One extra row was asked for: it only says that there is a next page. */
export function pageOf(rows, limit) {
  const events = rows.slice(0, limit).map(listedEvent), tail = events[limit - 1];
  return { events, next: rows.length > limit ? `${tail.created}_${tail.id}` : '' };
}

// ---- The same answers, from the events still kept in the document ----------------------------------
const newest = (a, b) => b.created.localeCompare(a.created) || (a.id < b.id ? 1 : -1);
export function eventsPage(rows, query) {
  const { type, cursor, limit } = pageOptions(query);
  const found = (rows || []).filter(row => (!type || row.type === type)
    && (!cursor || row.created < cursor.created || (row.created === cursor.created && row.id < cursor.id)));
  return pageOf(found.sort(newest).slice(0, limit + 1), limit);
}
export function eventsSummary(rows, since) {
  const all = [...(rows || [])].sort(newest), recent = all.filter(row => row.created >= since), forms = new Map();
  for (const row of all) if (row.type === 'form') {
    const name = formKey(row), form = forms.get(name) || { name, url: row.url, total: 0, contacts: new Set(), last: row.created };
    form.total++;
    if (row.contactId) form.contacts.add(row.contactId);
    forms.set(name, form);
  }
  return {
    last: all.length ? listedEvent(all[0]) : null,
    views: recent.filter(row => row.type === 'pageview').length,
    forms: recent.filter(row => row.type === 'form').length,
    known: new Set(recent.map(row => row.contactId).filter(Boolean)).size,
    visitors: new Set(recent.map(row => row.vid)).size,
    byForm: [...forms.values()].slice(0, 200).map(form => ({ ...form, contacts: form.contacts.size }))
  };
}

export function createTrackingLog({ store }) {
  let sweptOn = '', missingUntil = 0;
  // A database still without the table: public events skip it for five minutes (the reading screen always tries).
  const note = (where, error) => {
    if (isMissing(error)) missingUntil = Date.now() + 5 * 60_000;
    else console.error(`Rastreamento (${where}): ${error.message}`);
  };

  /** Copies the events kept in the document to the table and only then takes them out of the document. */
  async function drain(workspace, state) {
    const rows = state.trackingEvents || [];
    if (!rows.length) return;
    await store.tracking.append(workspace, rows);
    const moved = new Set(rows.map(row => row.id));
    await store.change(workspace, s => { s.trackingEvents = (s.trackingEvents || []).filter(row => !moved.has(row.id)); });
  }

  /** A public event. Says whether the workflow queue has something to send. */
  async function record(workspace, data, origin) {
    const checkOrigin = s => { if (!originAllowed(trackingOf(s), origin || data.url || '')) fail('Este domínio não pode enviar eventos para esta subconta.', 403); };
    let table = Boolean(store.tracking) && Date.now() >= missingUntil;
    if (table) {
      const state = await store.load(workspace);
      checkOrigin(state);
      const event = newTrackingEvent(state, data);
      if (!event) return false;
      try {
        await drain(workspace, state);
        // A browser nobody knows yet and no contact details: nothing else in the sub-account changes.
        if (!event.row.contactId && !event.contact) { await store.tracking.append(workspace, [event.row]); return false; }
      } catch (error) { note(workspace, error); table = false; }
    }
    let row = null;
    const outbox = await store.change(workspace, s => {
      row = null;
      checkOrigin(s);
      const id = execute(s, { type: 'tracking-event', data }, { workspace, attribution: touchesFrom(data) });
      if (table && id && s.trackingEvents.at(-1)?.id === id) row = s.trackingEvents.pop();
      return s.workflowOutbox?.length || 0;
    });
    if (row) {
      try { await store.tracking.append(workspace, [row]); }
      catch (error) { note(workspace, error); await store.change(workspace, s => { s.trackingEvents = [...(s.trackingEvents || []), row]; }); }
    }
    return outbox > 0;
  }

  /** A page of events, newest first; the first page also brings the numbers of the screen. */
  async function read(workspace, query = {}) {
    const state = await store.load(workspace), since = new Date(Date.now() - SUMMARY_DAYS * DAY).toISOString();
    if (store.tracking) {
      try {
        await drain(workspace, state);
        missingUntil = 0;
        const page = await store.tracking.page(workspace, query);
        return query.before ? page : { ...page, summary: await store.tracking.summary(workspace, since) };
      } catch (error) { if (!isMissing(error)) throw error; }
    }
    const page = eventsPage(state.trackingEvents, query);
    return query.before ? page : { ...page, summary: eventsSummary(state.trackingEvents, since) };
  }

  /** Once per day (and per server), from the cron: drops what is past the retention. */
  async function sweep(at = Date.now()) {
    const today = new Date(at).toISOString().slice(0, 10);
    if (!store.tracking || sweptOn === today) return;
    sweptOn = today;
    try { await store.tracking.prune(new Date(at - TRACKING_DAYS * DAY).toISOString()); }
    catch (error) { note('limpeza', error); }
  }
  return { record, read, sweep };
}
