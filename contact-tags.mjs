// O gatilho "Tag do contato" para as tags que entram ou saem de um contato fora do salvar da tela
// (ação em massa, formulário, chat, loja, webinar, leads de anúncio): quem mexe nas tags chama isto depois.
const lower = value => String(value || '').toLowerCase();

/** Fires "contact_tag" (added/removed) for each tag that differs between `before` and the contact's tags now. */
export function tagsChanged(s, contact, before, run) {
  const had = (before || []).map(lower), has = (contact.tags || []).map(lower);
  for (const tag of contact.tags || []) if (!had.includes(lower(tag))) run(s, 'contact_tag', { contactId: contact.id, change: 'added', tag });
  for (const tag of before || []) if (!has.includes(lower(tag))) run(s, 'contact_tag', { contactId: contact.id, change: 'removed', tag });
}
