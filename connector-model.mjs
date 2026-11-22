// T.2 — Conectores na subconta: which apps are connected (credentials sealed by the server), the webhook token of
// each one, the cursors of the 5-minute checks, and the events that fire the "Apps · <nome>" triggers.
import { connectorById, connectorType } from './ui/connectors-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';

/** What the browser may see of a connection (never the sealed credentials). */
export const connectorPublic = row => row ? { connected: true, account: row.account || '', connectedAt: row.connectedAt, hook: row.hook ? true : false } : { connected: false };

export function connectorCommand(s, type, d, { add, run, now }) {
  s.connectors ||= {};
  if (type === 'connector-save') {
    // Server only: the credentials arrive sealed; the webhook token is kept when reconnecting.
    const def = connectorById(d.id);
    if (!def) fail('Conector não encontrado.', 404);
    const prior = s.connectors[def.id] || {};
    s.connectors[def.id] = { sealed: str(d.sealed, 20000), account: str(d.account, 120), hook: prior.hook || str(d.hook, 80), connectedAt: now(), cursors: prior.cursors || {}, polledAt: prior.polledAt || '' };
    return def.id;
  }
  if (type === 'connector-remove') {
    if (!s.connectors[d.id]) fail('Conector não conectado.', 404);
    delete s.connectors[d.id];
    return d.id;
  }
  if (type === 'connector-cursor') {
    const row = s.connectors[d.id];
    if (!row) return '';
    row.cursors ||= {};
    for (const [scope, cursor] of Object.entries(d.cursors || {}).slice(0, 50)) row.cursors[str(scope, 300)] = str(String(cursor ?? ''), 2000);
    row.polledAt = now();
    return d.id;
  }
  if (type === 'connector-event') {
    // Server only: an app event. Lead-like events find (or create) the contact by e-mail or phone.
    const def = connectorById(d.connector), spec = def?.triggers.find(row => row.key === d.key);
    if (!spec) fail('Gatilho de conector não encontrado.', 404);
    const ctx = Object.fromEntries(Object.entries(d.ctx || {}).slice(0, 60).map(([key, value]) => [str(key, 80), str(String(value ?? ''), 4000)]));
    let contact = null;
    const email = str(d.contact?.email, 254).toLowerCase(), phone = str(d.contact?.phone, 40), digits = phone.replace(/\D/g, '').slice(-10);
    if (spec.contact && (email || digits.length >= 8)) {
      contact = (email && s.contacts.find(row => (row.email || '').toLowerCase() === email)) || (digits.length >= 8 && s.contacts.find(row => String(row.phone || '').replace(/\D/g, '').slice(-10) === digits)) || null;
      if (!contact) {
        contact = add(s, 'contacts', { name: str(d.contact?.name, 120) || email || phone, email, phone, tags: [def.name], company: '', notes: '', custom: {} });
        run(s, 'Contact created', { contactId: contact.id });
      }
    }
    run(s, connectorType(def.id, spec.key), { ...ctx, ...(contact ? { contactId: contact.id } : {}), connector: def.id });
    return contact?.id || 'ok';
  }
  return undefined;
}

/** The poll triggers the active workflows use: one check per app, trigger and configuration. */
export function pollJobs(s) {
  const jobs = new Map();
  for (const workflow of (s.workflows || []).filter(row => row.active)) {
    for (const trigger of workflow.triggers || []) {
      const match = String(trigger.type || '').match(/^conn_([a-z_]+?)__([a-z_]+)$/);
      const def = match && connectorById(match[1]), spec = def?.triggers.find(row => row.key === match[2]);
      if (!spec?.poll || !s.connectors?.[def.id]) continue;
      const config = Object.fromEntries(spec.fields.map(field => [field.key, str(String(trigger.config?.[field.key] ?? field.value ?? ''), 200)]));
      const scope = `${spec.key}:${JSON.stringify(config)}`;
      jobs.set(`${def.id}|${scope}`, { id: def.id, key: spec.key, config, scope });
    }
  }
  return [...jobs.values()];
}
