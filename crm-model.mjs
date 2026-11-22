// CRM records added for the sub-account: custom fields and values, tags, companies,
// products and payments, and bulk actions. model.mjs wires these into save, delete and import.
import {
  couponKinds, customObjects, fieldTypes, intervals, paymentMethods, productKinds, slug,
  subscriptionStatuses, transactionSources, transactionStatuses
} from './ui/crm-data.js';

export const crmCollections = ['customFields', 'customValues', 'tags', 'companies', 'products', 'paymentLinks', 'subscriptions', 'transactions', 'coupons', 'bulkActions', 'imports'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Choose a valid ${label}.`);
const flag = value => value === true || value === 'on' || value === 'true';
const money = (value, label = 'amount') => {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) fail(`Enter a valid ${label}.`);
  return Math.round(Number(value) * 100) / 100;
};
const day = (value, label) => {
  const v = str(value, 30);
  if (!v) return '';
  const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  if (!Number.isFinite(+d)) fail(`Enter a valid ${label}.`);
  return d.toISOString().slice(0, 10);
};
const mail = value => { const v = str(value).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Enter a valid email address.'); return v; };
const web = value => {
  const v = str(value, 500);
  if (!v) return '';
  try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); return u.href; }
  catch { return fail('Enter a valid website.'); }
};
const ref = (s, key, id, label, optional = false) => (!id && optional) ? '' : s[key].find(r => r.id === id)?.id ?? fail(`Choose a valid ${label}.`);
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const unique = (rows, id, test, message) => { if (rows.some(r => r.id !== id && test(r))) fail(message); };

/** Values of the custom fields of one object, read from `cf_<fieldId>` form keys or a `custom` map. */
export function customData(s, object, d) {
  const out = {};
  for (const f of (s.customFields || []).filter(x => x.object === object)) {
    const raw = d[`cf_${f.id}`] ?? d.custom?.[f.id];
    if (raw === undefined || raw === null || raw === '') { if (f.type === 'Checkbox') out[f.id] = false; continue; }
    switch (f.type) {
      case 'Number': case 'Monetary': {
        const n = Number(raw);
        if (!Number.isFinite(n) || Math.abs(n) > 1e12) fail(`${f.name} must be a number.`);
        out[f.id] = f.type === 'Monetary' ? Math.round(n * 100) / 100 : n; break;
      }
      case 'Date': out[f.id] = day(raw, f.name.toLowerCase()); break;
      case 'Checkbox': out[f.id] = flag(raw); break;
      case 'Email': out[f.id] = mail(raw); break;
      case 'Dropdown (single)': out[f.id] = one(str(raw, 120), f.options, f.name.toLowerCase()); break;
      case 'Multi line': out[f.id] = str(raw, 5000); break;
      default: out[f.id] = str(raw, f.type === 'Phone' ? 48 : 500);
    }
  }
  return out;
}

export const crmFields = {
  customFields: (s, d) => {
    const name = req(d.name, 'Field name', 80), object = one(d.object, customObjects, 'object'), type = one(d.type, fieldTypes, 'field type');
    const options = type === 'Dropdown (single)' ? [...new Set(str(d.options, 2000).split(/\n|,/).map(v => v.trim().slice(0, 120)).filter(Boolean))].slice(0, 50) : [];
    if (type === 'Dropdown (single)' && !options.length) fail('Add at least one option to the dropdown.');
    const key = `${object === 'Company' ? 'business' : object.toLowerCase()}.${slug(name)}`;
    unique(s.customFields, d.id, f => f.key === key, `A ${object.toLowerCase()} field named “${name}” already exists.`);
    return { name, object, type, options, folder: str(d.folder, 60), placeholder: str(d.placeholder, 120), key };
  },
  customValues: (s, d) => {
    const name = req(d.name, 'Name', 80), key = `custom_values.${slug(name)}`;
    unique(s.customValues, d.id, v => v.key === key, `A custom value named “${name}” already exists.`);
    return { name, folder: str(d.folder, 60), value: str(d.value, 5000), key };
  },
  tags: (s, d) => {
    const name = req(d.name, 'Tag name', 48);
    unique(s.tags, d.id, t => same(t.name, name), `The tag “${name}” already exists.`);
    return { name, description: str(d.description, 300), category: str(d.category, 60) };
  },
  companies: (s, d) => {
    const name = req(d.name, 'Company name', 120);
    unique(s.companies, d.id, x => same(x.name, name), `The company “${name}” already exists.`);
    return { name, phone: str(d.phone, 48), email: mail(d.email), website: web(d.website), address: str(d.address, 200), city: str(d.city, 80),
      state: str(d.state, 80), postal: str(d.postal, 20), country: str(d.country, 80), description: str(d.description, 2000), custom: customData(s, 'Company', d) };
  },
  products: (s, d) => {
    const kind = one(d.kind || 'One time', productKinds, 'price type');
    return { name: req(d.name, 'Product name', 120), description: str(d.description, 2000), price: money(d.price, 'price'), kind,
      interval: kind === 'Recurring' ? one(d.interval, intervals, 'billing interval') : '', active: flag(d.active) };
  },
  paymentLinks: (s, d) => ({ name: req(d.name, 'Link name', 120), productId: ref(s, 'products', d.productId, 'product'), active: flag(d.active) }),
  subscriptions: (s, d) => {
    const productId = ref(s, 'products', d.productId, 'product');
    if (s.products.find(p => p.id === productId).kind !== 'Recurring') fail('Choose a recurring product for a subscription.');
    return { contactId: ref(s, 'contacts', d.contactId, 'contact'), productId, start: day(d.start, 'start date') || fail('Start date is required.'),
      status: one(d.status || 'Active', subscriptionStatuses, 'status'), provider: 'Manual' };
  },
  transactions: (s, d) => ({
    contactId: ref(s, 'contacts', d.contactId, 'contact'), amount: money(d.amount), date: day(d.date, 'date') || fail('Date is required.'),
    method: one(d.method || 'Manual', paymentMethods, 'payment method'), source: one(d.source || 'Manual', transactionSources, 'source'),
    status: one(d.status || 'Succeeded', transactionStatuses, 'status'), note: str(d.note, 500), invoiceId: str(d.invoiceId, 40)
  }),
  coupons: (s, d) => {
    const code = req(d.code, 'Coupon code', 30).toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail('Use 3 to 30 letters, numbers, - or _ in the coupon code.');
    unique(s.coupons, d.id, x => x.code === code, `The code ${code} is already in use.`);
    const kind = one(d.kind || 'Percent', couponKinds, 'discount type'), amount = money(d.amount, 'discount');
    if (kind === 'Percent' && (amount <= 0 || amount > 100)) fail('A percent discount must be between 1 and 100.');
    const start = day(d.start, 'start date'), end = day(d.end, 'end date');
    if (start && end && end < start) fail('The end date must be after the start date.');
    const limit = d.limit === '' || d.limit == null ? 0 : Number(d.limit);
    if (!Number.isInteger(limit) || limit < 0 || limit > 1e6) fail('Enter a whole number of redemptions (0 = no limit).');
    return { name: req(d.name, 'Coupon name', 120), code, kind, amount, start, end, limit, active: flag(d.active), redemptions: 0 };
  }
};

/** Side effects of saving a CRM record or a record that CRM data depends on. */
export function afterSave(s, key, prior, row, add) {
  if (key === 'tags' && prior && prior.name !== row.name)
    for (const contact of s.contacts) contact.tags = contact.tags.map(t => same(t, prior.name) ? row.name : t);
  if (key === 'companies' && prior && prior.name !== row.name)
    for (const contact of s.contacts) if (contact.company && same(contact.company, prior.name)) contact.company = row.name;
  if (key === 'customFields' && prior && prior.type !== row.type)
    for (const list of ['contacts', 'opportunities', 'companies']) for (const r of s[list]) if (r.custom) delete r.custom[row.id];
  if (key === 'coupons' && prior) { row.redemptions = prior.redemptions || 0; if (prior.expiredFor) row.expiredFor = prior.expiredFor; }
  // A paid invoice books its payment once, the way a gateway would record the charge.
  if (key === 'invoices' && row.status === 'Paid' && prior?.status !== 'Paid' && !s.transactions.some(t => t.invoiceId === row.id))
    add(s, 'transactions', { contactId: row.contactId, amount: row.value, date: new Date().toISOString().slice(0, 10), method: row.paidMethod || 'Manual', source: 'Invoice', status: 'Succeeded', note: row.title, invoiceId: row.id });
  if (key === 'opportunities') {
    row.slips = prior?.slips || 0;
    if (prior?.closeDate && row.closeDate && row.closeDate > prior.closeDate && row.status === 'Open') row.slips++;
  }
}

/** Checks and cleanup before a delete. Returns nothing; throws when the record is still in use. */
export function beforeDelete(s, key, id) {
  if (key === 'products' && (s.paymentLinks.some(l => l.productId === id) || s.subscriptions.some(x => x.productId === id)))
    fail('Remove the payment links and subscriptions of this product first.', 409);
  if (key === 'tags') { const tag = s.tags.find(t => t.id === id); for (const contact of s.contacts) contact.tags = contact.tags.filter(t => !same(t, tag.name)); }
  if (key === 'customFields') for (const list of ['contacts', 'opportunities', 'companies']) for (const r of s[list]) if (r.custom) delete r.custom[id];
  if (key === 'contacts') { s.subscriptions = s.subscriptions.filter(x => x.contactId !== id); for (const t of s.transactions.filter(x => x.contactId === id)) t.contactId = ''; }
}

/**
 * Bulk action over contacts or opportunities. Each record is applied on its own; a failure is counted, not fatal.
 * `remove` deletes one record with the same cascade as a single delete.
 */
export function bulk(s, d, { add, remove, actor = '', tags, stageOf, moved }) {
  const object = one(d.object, ['contacts', 'opportunities'], 'object');
  const ids = Array.isArray(d.ids) ? [...new Set(d.ids.filter(id => typeof id === 'string'))].slice(0, 500) : [];
  if (!ids.length) fail('Select at least one record.');
  const operation = str(d.operation, 30);
  let value = '', label = '';
  if (object === 'contacts') {
    one(operation, ['add-tag', 'remove-tag', 'delete'], 'bulk operation');
    if (operation !== 'delete') { value = req(d.value, 'Tag', 48); label = `${operation === 'add-tag' ? 'Add' : 'Remove'} tag “${value}”`; }
  } else {
    one(operation, ['move-stage', 'status', 'delete'], 'bulk operation');
    if (operation === 'move-stage') { const stage = stageOf(d.value) || fail('Choose a valid stage.'); value = stage.id; label = `Move to ${stage.name}`; }
    if (operation === 'status') { value = one(d.value, ['Open', 'Won', 'Lost', 'Abandoned'], 'status'); label = `Set status ${value}`; }
  }
  if (operation === 'delete') label = `Delete ${object}`;
  let done = 0, failed = 0;
  const started = new Date().toISOString();
  for (const id of ids) {
    const row = s[object].find(r => r.id === id);
    if (!row) { failed++; continue; }
    if (operation === 'delete') remove(s, object, id);
    else if (operation === 'add-tag') row.tags = tags([...row.tags, value]);
    else if (operation === 'remove-tag') row.tags = row.tags.filter(t => !same(t, value));
    else if (operation === 'move-stage' && row.stage !== value) { const stage = stageOf(value); row.stage = stage.id; row.pipelineId = stage.pipelineId; row.updated = started; row.stageChangedAt = started; moved?.(row); }
    else if (operation === 'status' && row.status !== value) { row.status = value; row.statusChangedAt = started; row.updated = started; }
    done++;
  }
  const entry = add(s, 'bulkActions', { object, operation, label: str(d.label, 120) || label, status: failed ? (done ? 'Partially completed' : 'Failed') : 'Completed',
    user: str(actor, 120), total: ids.length, done, failed, completed: new Date().toISOString() });
  if (s.bulkActions.length > 200) s.bulkActions.splice(0, s.bulkActions.length - 200);
  return entry.id;
}
