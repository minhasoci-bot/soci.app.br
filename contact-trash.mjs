// Lixeira de contatos (6b.5): a deleted contact goes to `contactTrash` with what was deleted along with it
// (tasks, opportunities, messages, appointments, invoices, threads) for 60 days; it can be restored with all of
// it, deleted forever, or the whole trash emptied. Older entries leave the trash on their own.
export const TRASH_DAYS = 60;
const DAY = 86400000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const related = ['tasks', 'opportunities', 'messages', 'appointments', 'invoices', 'threads'];

/** Drops entries older than 60 days. */
export function purgeExpired(s, at = Date.now()) {
  s.contactTrash = (s.contactTrash || []).filter(row => at - Date.parse(row.deletedAt) < TRASH_DAYS * DAY);
}

/** Called before a contact's records are removed: keeps a copy of all of them. */
export function trashContact(s, id, at = Date.now()) {
  const contact = s.contacts.find(row => row.id === id);
  if (!contact) return;
  purgeExpired(s, at);
  const copy = Object.fromEntries(related.map(key => [key, structuredClone((s[key] || []).filter(row => row.contactId === id)).slice(-(key === 'messages' ? 500 : 200))]));
  s.contactTrash.push({ id, contact: structuredClone(contact), related: copy, deletedAt: new Date(at).toISOString() });
  if (s.contactTrash.length > 1000) s.contactTrash.splice(0, s.contactTrash.length - 1000);
}

export function trashCommand(s, command) {
  const { type, id } = command;
  purgeExpired(s);
  if (type === 'contact-trash-empty') { const n = s.contactTrash.length; s.contactTrash = []; return n; }
  const index = s.contactTrash.findIndex(row => row.id === id);
  if (index < 0) fail('Contato não está na lixeira.', 404);
  const entry = s.contactTrash[index];
  if (type === 'contact-trash-purge') { s.contactTrash.splice(index, 1); return id; }
  if (type === 'contact-restore') {
    if (s.contacts.some(row => row.id === id)) fail('Este contato já existe.', 409);
    const email = String(entry.contact.email || '').toLowerCase();
    const twin = email && s.contacts.find(row => String(row.email || '').toLowerCase() === email);
    if (twin) fail(`Já existe outro contato com o e-mail ${email} (${twin.name}). Exclua ou mude o e-mail dele antes de restaurar.`, 409);
    s.contacts.push({ ...entry.contact, updated: new Date().toISOString() });
    for (const key of related) {
      const taken = new Set((s[key] || []).map(row => row.id));
      for (const row of entry.related?.[key] || []) if (!taken.has(row.id)) (s[key] ||= []).push(row);
    }
    s.contactTrash.splice(index, 1);
    return id;
  }
  fail('Comando da lixeira desconhecido.');
}
