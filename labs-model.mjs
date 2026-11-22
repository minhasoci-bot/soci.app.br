// Labs (7.2) inside a sub-account: what the agency offers, what the sub-account turned on,
// and the behaviour of the features that live in the data layer (duplicate contacts).
import { labCatalog, labKeys, labModes, labOffered, labOn } from './ui/labs-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const modes = labModes.map(([mode]) => mode);

export const labsDefaults = () => ({ offered: {}, on: {} });

// The agency's modes, copied into the sub-account. A feature the agency no longer leaves to the
// sub-account loses the sub-account's own switch, so turning it back to "optin" starts from off.
export function setLabsOffer(s, offered = {}) {
  const labs = s.labs = { ...labsDefaults(), ...(s.labs || {}) };
  labs.offered = Object.fromEntries(labKeys.map(key => [key, modes.includes(offered[key]) ? offered[key] : 'off']));
  labs.on = Object.fromEntries(Object.entries(labs.on || {}).filter(([key, on]) => on === true && labs.offered[key] === 'optin'));
  return labs;
}

export function toggleLab(s, { key, on } = {}) {
  const spec = labCatalog.find(([id]) => id === key) || fail('Recurso experimental não encontrado.', 404);
  const mode = labOffered(s, key);
  if (mode === 'off') fail(`A agência não liberou "${spec[1]}" para esta subconta.`, 403);
  if (mode === 'all') fail(`"${spec[1]}" foi ligado pela agência em todas as subcontas.`, 409);
  s.labs.on ||= {};
  if (on === true || on === 'on' || on === 'true') s.labs.on[key] = true;
  else delete s.labs.on[key];
  return labOn(s, key);
}

export const requireLab = (s, key, message) => {
  if (!labOn(s, key)) fail(message || `Ligue "${labCatalog.find(([id]) => id === key)?.[1] || key}" em Configurações → Labs.`, 403);
};

const digits = value => String(value || '').replace(/\D/g, '');
// Same number with or without the country code: "+55 11 91234-5678" and "(11) 91234-5678".
const samePhone = (a, b) => {
  if (a.length < 8 || b.length < 8) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 10 && long.endsWith(short);
};

// Labs "Bloquear contatos duplicados": refuses a contact whose e-mail or phone another contact already uses.
// On an edit only a changed e-mail or phone is checked, so duplicates from before the switch can still be edited.
export function rejectDuplicateContact(s, row, prior = null) {
  if (!labOn(s, 'contact-duplicates')) return;
  const lower = value => String(value || '').trim().toLowerCase();
  const email = lower(row.email) !== lower(prior?.email) ? lower(row.email) : '';
  const phone = digits(row.phone) !== digits(prior?.phone) ? digits(row.phone) : '';
  if (!email && !phone) return;
  for (const other of s.contacts || []) {
    if (other.id === prior?.id) continue;
    if (email && lower(other.email) === email) fail(`Já existe um contato com o e-mail ${email}: ${other.name || 'sem nome'}.`, 409);
    if (phone && samePhone(phone, digits(other.phone))) fail(`Já existe um contato com esse telefone: ${other.name || 'sem nome'}.`, 409);
  }
}
