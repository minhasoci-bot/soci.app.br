// Faturas recorrentes e modelos de fatura (Pagamentos), following GoHighLevel's Recurring Invoices and
// Templates: a template holds the items, notes, terms and due days of an invoice used again and again; a
// recurring invoice issues one invoice per cycle (daily, weekly, monthly or yearly, every N), from a start
// date until never, a number of invoices or a date. Each issued invoice gets a number (FAT-0001) and a
// personal link (/fatura/<ws>#token) that the client uses to see and pay it through AbacatePay.
// Missed cycles (the server was off) are not billed backwards: one invoice is issued and the schedule jumps
// to the next date from today.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { itemsSummary, validItem } from './ui/document-data.js';
import { addDays, frequencies, indexFrom, localDay, MAX_INTERVAL, occurrence, paymentDefaults, scheduleOver } from './ui/invoice-data.js';
export { paymentDefaults } from './ui/invoice-data.js';
import { renderInvoice } from './ui/invoice-render.js';

export const invoiceCollections = ['invoiceTemplates', 'recurringInvoices'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const sha = value => createHash('sha256').update(value).digest('hex');
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const round2 = value => Math.round(Number(value) * 100) / 100;
const dmy = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
const total = items => itemsSummary(items).total;
const today = s => localDay(Date.now(), s.profile?.timezone);
const day = (value, label) => {
  const v = str(value, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T12:00:00Z`))) fail(`Use uma data válida em ${label}.`);
  return v;
};
const whole = (value, fallback, min, max, message) => {
  const n = Math.round(Number(value ?? fallback));
  if (!Number.isFinite(n) || n < min || n > max) fail(message);
  return n;
};
export const invoicePath = (workspace, token) => `/fatura/${workspace}#${token}`;
export const invoiceTokenHash = token => /^[0-9a-f]{48}$/.test(String(token || '')) ? sha(token) : '';

/** Items of an invoice: no optional lines (an invoice charges everything it lists). */
function items(s, list, max = 50) {
  const raw = Array.isArray(list) ? list : [];
  if (raw.length > max) fail(`Uma fatura aceita até ${max} itens.`);
  return raw.map(item => ({ ...validItem(s, { ...item, optional: false }), optional: false, selected: true }));
}
const common = (s, d) => {
  const clean = items(s, d.items);
  return { items: clean, total: total(clean), notes: str(d.notes, 2000), terms: str(d.terms, 4000),
    dueDays: whole(d.dueDays, 7, 0, 365, 'O vencimento vai de 0 a 365 dias depois da emissão.') };
};
const channelsOf = list => [...new Set(['email', ...(Array.isArray(list) ? list : []).filter(value => value === 'whatsapp')])];

function audit(rec, event, extra = {}) {
  rec.audit ||= [];
  if (rec.audit.length >= 200) rec.audit.splice(1, 1);
  rec.audit.push({ at: new Date().toISOString(), event, ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value)) });
}
const event = (run, s, rec, status, extra = {}) => run(s, 'recurring_invoice_status', { contactId: rec.contactId || '', recurringId: rec.id, status, total: rec.total, ...extra });

/** Where the schedule stands from `from` on: the next index and date, never before what was already issued. */
function reschedule(rec, from) {
  const after = rec.lastIssuedOn ? addDays(rec.lastIssuedOn, 1) : '';
  rec.nextIndex = indexFrom(rec, after > from ? after : from);
  rec.nextIssueOn = occurrence(rec.startDate, rec.frequency, rec.interval, rec.nextIndex);
}

export const invoiceFields = {
  invoiceTemplates: (s, d) => {
    const name = str(d.name, 160) || fail('Dê um nome ao modelo de fatura.');
    return { name, title: str(d.title, 160) || name, ...common(s, d) };
  },
  recurringInvoices: (s, d) => {
    const prior = d.id ? (s.recurringInvoices || []).find(row => row.id === d.id) : null;
    if (prior && ['completed', 'cancelled'].includes(prior.status)) fail('Esta fatura recorrente já terminou. Duplique para começar outra.', 409);
    const contactId = str(d.contactId, 60);
    if (contactId && !s.contacts.some(row => row.id === contactId)) fail('Escolha um contato desta subconta.');
    const templateId = str(d.templateId, 60);
    const frequency = frequencies.some(([key]) => key === d.frequency) ? d.frequency : 'monthly';
    const interval = whole(d.interval, 1, 1, MAX_INTERVAL, `Repita a cada 1 a ${MAX_INTERVAL} períodos.`);
    const startDate = day(d.startDate, 'Começa em') || today(s);
    const endMode = ['never', 'count', 'date'].includes(d.endMode) ? d.endMode : 'never';
    const endCount = endMode === 'count' ? whole(d.endCount, 12, 1, 240, 'O número de faturas vai de 1 a 240.') : 0;
    const endDate = endMode === 'date' ? day(d.endDate, 'Termina em') || fail('Escolha a data em que a cobrança termina.') : '';
    if (endDate && endDate < startDate) fail('A data de término precisa ser depois do início.');
    if (prior && endMode === 'count' && endCount < (prior.issuedCount || 0)) fail(`Já foram emitidas ${prior.issuedCount} faturas. Escolha um número maior.`);
    const row = {
      name: str(d.name, 160) || fail('Dê um nome à fatura recorrente.'), contactId, templateId: (s.invoiceTemplates || []).some(row => row.id === templateId) ? templateId : '',
      ...common(s, d), frequency, interval, startDate, endMode, endCount, endDate,
      send: d.send !== false, channels: channelsOf(d.channels),
      status: prior?.status || 'draft', issuedCount: prior?.issuedCount || 0, lastIssuedOn: prior?.lastIssuedOn || '', invoiceIds: prior?.invoiceIds || []
    };
    if (['active', 'paused'].includes(row.status)) {
      if (!row.contactId) fail('Uma fatura recorrente ativa precisa de cliente.');
      if (!(row.total > 0)) fail('Uma fatura recorrente ativa precisa ter valor.');
      reschedule(row, today(s));
      if (scheduleOver(row, row.issuedCount, row.nextIssueOn)) fail('Com esse término não sobra nenhuma fatura para emitir.');
    } else Object.assign(row, { nextIndex: 0, nextIssueOn: '' });
    return row;
  }
};

export function invoiceBeforeDelete(s, key, id) {
  if (key === 'contacts') s.recurringInvoices = (s.recurringInvoices || []).filter(row => row.contactId !== id);
  if (key === 'products') for (const row of [...(s.invoiceTemplates || []), ...(s.recurringInvoices || [])]) for (const item of row.items || []) if (item.productId === id) item.productId = '';
  if (key === 'invoiceTemplates') for (const row of s.recurringInvoices || []) if (row.templateId === id) row.templateId = '';
  if (key === 'recurringInvoices' && s.recurringInvoices.find(row => row.id === id)?.status === 'active') fail('Pause ou cancele a fatura recorrente antes de excluí-la.', 409);
}

function nextNumber(s) {
  s.invoiceSeq = Math.max(Number(s.invoiceSeq) || 0, ...(s.invoices || []).map(row => /^FAT-\d+$/.test(row.number || '') ? Number(row.number.slice(4)) : 0)) + 1;
  return `FAT-${String(s.invoiceSeq).padStart(4, '0')}`;
}

/** A numbered, open invoice with items (from a template, a recurring invoice or a workflow). */
function createInvoice(s, run, { title, contactId, source, issueDate = today(s), extra = {} }) {
  const row = { id: randomUUID(), created: new Date().toISOString(), number: nextNumber(s), title: str(title, 240), contactId,
    // Noon UTC: the same calendar day in every Brazilian time zone (other invoices keep ISO timestamps too).
    value: source.total, due: `${addDays(issueDate, source.dueDays ?? 7)}T12:00:00.000Z`, status: 'Open', issueDate,
    items: structuredClone(source.items || []), notes: source.notes || '', terms: source.terms || '', ...extra };
  s.invoices.push(row);
  run(s, 'invoice_status', { contactId, status: 'Open', total: row.value });
  return row;
}

/** A new personal link for the invoice (the old one stops working) and, when `queue`, the e-mail with it. */
function notify(s, workspace, invoice, channels, origin, queue = true) {
  const contact = s.contacts.find(row => row.id === invoice.contactId);
  const token = randomBytes(24).toString('hex');
  invoice.tokens = [sha(token)];
  if (!queue || !contact?.email) return { path: invoicePath(workspace, token), sent: false };
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', what: 'invoice', invoiceId: invoice.id, channels: channelsOf(channels), email: contact.email, phone: contact.phone || '',
    name: contact.name || '', title: invoice.number ? `${invoice.number} · ${invoice.title}` : invoice.title, sender: s.profile?.name || '',
    value: invoice.value, due: invoice.due, path: invoicePath(workspace, token), origin, final: false, role: 'signer' });
  return { path: invoicePath(workspace, token), sent: true };
}

function issue(s, rec, on, workspace, run) {
  if (!s.contacts.some(row => row.id === rec.contactId)) {
    rec.status = 'paused'; audit(rec, 'paused', { detail: 'O cliente não existe mais.' }); event(run, s, rec, 'paused');
    return null;
  }
  rec.issuedCount = (rec.issuedCount || 0) + 1;
  const invoice = createInvoice(s, run, { title: `${rec.name} · ${dmy(on)}`, contactId: rec.contactId, source: rec, issueDate: on, extra: { recurringId: rec.id, cycle: rec.issuedCount } });
  rec.invoiceIds = [...(rec.invoiceIds || []), invoice.id].slice(-500);
  rec.lastIssuedOn = on;
  reschedule(rec, addDays(on, 1));
  rec.updated = new Date().toISOString();
  audit(rec, 'issued', { detail: `${invoice.number} · ${brl(invoice.value)} · vence ${dmy(invoice.due)}` });
  if (rec.send) notify(s, workspace, invoice, rec.channels, '');
  event(run, s, rec, 'issued', { invoiceId: invoice.id });
  if (scheduleOver(rec, rec.issuedCount, rec.nextIssueOn)) {
    Object.assign(rec, { status: 'completed', nextIssueOn: '', completedAt: rec.updated });
    audit(rec, 'completed', { detail: `${rec.issuedCount} fatura${rec.issuedCount === 1 ? '' : 's'}` });
    event(run, s, rec, 'completed');
  }
  return invoice;
}

/** Per-minute tick: issues what is due today (in the workspace time zone). Returns the new invoice ids. */
export function invoiceTick(s, at, { workspace = 'demo', run }) {
  const on = localDay(at, s.profile?.timezone);
  const out = [];
  for (const rec of s.recurringInvoices || []) {
    if (rec.status !== 'active' || !rec.nextIssueOn || rec.nextIssueOn > on) continue;
    const invoice = issue(s, rec, on, workspace, run);
    if (invoice) out.push(invoice.id);
  }
  return out;
}

/** What the public page receives: this invoice only. */
export function invoiceView(s, invoice) {
  const contact = s.contacts.find(row => row.id === invoice.contactId) || null;
  const logo = s.profile?.logoFileId ? (s.files || []).find(row => row.id === s.profile.logoFileId)?.data || '' : '';
  return {
    number: invoice.number || '', title: invoice.title, status: invoice.status, sender: s.profile?.name || '', issueDate: invoice.issueDate || String(invoice.created || '').slice(0, 10),
    due: invoice.due, value: invoice.value, payable: invoice.status === 'Open',
    receipt: invoice.status === 'Paid' && invoice.receiptNumber ? { title: paymentSettingsOf(s).receipts.title, number: invoice.receiptNumber, paidAt: invoice.paidAt || '' } : null,
    html: renderInvoice(invoice, { company: s.profile?.name || '', contact: contact && { name: contact.name, company: contact.company, email: contact.email }, logo,
      receiptTitle: paymentSettingsOf(s).receipts.title })
  };
}

export function invoiceCommand(s, command, { workspace = 'demo', run }) {
  const { type, id, data: d = {} } = command;
  const origin = str(d.origin, 200), actor = str(command.actor, 120);
  const recurring = () => (s.recurringInvoices || []).find(row => row.id === id) || fail('Fatura recorrente não encontrada.', 404);

  if (type === 'invoice-from-template') {
    const tpl = (s.invoiceTemplates || []).find(row => row.id === id) || fail('Modelo de fatura não encontrado.', 404);
    const contactId = str(d.contactId, 60);
    if (!s.contacts.some(row => row.id === contactId)) fail('Escolha o cliente da fatura.');
    if (!(tpl.total > 0)) fail('O modelo não tem valor. Inclua itens antes de usar.');
    const invoice = createInvoice(s, run, { title: str(d.title, 240) || tpl.title, contactId, source: tpl, extra: { templateId: tpl.id } });
    return d.send ? { id: invoice.id, ...notify(s, workspace, invoice, d.channels, origin) } : { id: invoice.id };
  }
  if (type === 'invoice-send') {
    const invoice = s.invoices.find(row => row.id === id) || fail('Fatura não encontrada.', 404);
    if (invoice.status !== 'Open') fail(invoice.status === 'Paid' ? 'Esta fatura já está paga.' : 'Abra a fatura (status Em aberto) antes de enviar.', 409);
    if (!(invoice.value > 0)) fail('A fatura não tem valor.');
    const contact = s.contacts.find(row => row.id === invoice.contactId) || fail('Escolha o cliente da fatura.');
    if (d.notify !== false && !contact.email) fail(`O contato ${contact.name} não tem e-mail. Copie o link e mande por onde preferir.`);
    const result = notify(s, workspace, invoice, d.channels, origin, d.notify !== false);
    if (result.sent) invoice.sentAt = new Date().toISOString();
    return result;
  }
  if (type === 'invoice-recurring-start') {
    const rec = recurring();
    if (!['draft', 'paused'].includes(rec.status)) fail('Só rascunhos e faturas pausadas podem ser ativados.', 409);
    if (!rec.contactId || !s.contacts.some(row => row.id === rec.contactId)) fail('Escolha o cliente antes de ativar.');
    if (!(rec.total > 0)) fail('Inclua itens com valor antes de ativar.');
    const was = rec.status;
    reschedule(rec, today(s));
    if (scheduleOver(rec, rec.issuedCount || 0, rec.nextIssueOn)) fail('Com esse término não sobra nenhuma fatura para emitir. Ajuste o fim da cobrança.');
    Object.assign(rec, { status: 'active', updated: new Date().toISOString() });
    audit(rec, was === 'paused' ? 'resumed' : 'started', { detail: `próxima em ${dmy(rec.nextIssueOn)}`, by: actor });
    event(run, s, rec, was === 'paused' ? 'resumed' : 'started');
    return { nextIssueOn: rec.nextIssueOn };
  }
  if (type === 'invoice-recurring-pause') {
    const rec = recurring();
    if (rec.status !== 'active') fail('Só faturas recorrentes ativas podem ser pausadas.', 409);
    Object.assign(rec, { status: 'paused', updated: new Date().toISOString() });
    audit(rec, 'paused', { by: actor });
    event(run, s, rec, 'paused');
    return id;
  }
  if (type === 'invoice-recurring-cancel') {
    const rec = recurring();
    if (['completed', 'cancelled'].includes(rec.status)) fail('Esta fatura recorrente já terminou.', 409);
    Object.assign(rec, { status: 'cancelled', nextIssueOn: '', cancelledAt: new Date().toISOString(), updated: new Date().toISOString() });
    audit(rec, 'cancelled', { detail: str(d.reason, 200), by: actor });
    event(run, s, rec, 'cancelled');
    return id;
  }

  // Public: the client behind the personal link (the server checks the token and passes only its hash).
  if (!['invoice-open', 'invoice-payable'].includes(type)) fail('Ação inválida.');
  const hash = str(d.tokenHash, 64);
  const invoice = hash ? s.invoices.find(row => (row.tokens || []).includes(hash)) : null;
  if (!invoice) fail('Este link não é válido ou foi substituído por um mais novo.', 404);
  if (type === 'invoice-payable') {
    if (invoice.status !== 'Open') fail(invoice.status === 'Paid' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.', 409);
    return { invoiceId: invoice.id };
  }
  if (!invoice.viewedAt) invoice.viewedAt = new Date().toISOString();
  return invoiceView(s, invoice);
}

/** Workflow action “Enviar fatura”: an invoice from a template for the enrolled contact, sent at once. */
export function sendTemplateInvoice(s, workspace, contact, config, run) {
  const tpl = (s.invoiceTemplates || []).find(row => row.id === config.templateId) || fail('Modelo de fatura não encontrado.');
  if (!contact?.email) fail('O contato não tem e-mail.');
  if (!(tpl.total > 0)) fail('O modelo de fatura não tem valor.');
  const invoice = createInvoice(s, run, { title: tpl.title, contactId: contact.id, source: tpl, extra: { templateId: tpl.id } });
  notify(s, workspace, invoice, config.channel === 'email_whatsapp' ? ['email', 'whatsapp'] : ['email'], '');
  return invoice;
}

/** Workflow action “Iniciar fatura recorrente”: a recurring invoice from a template for the enrolled contact. */
export function startTemplateRecurring(s, contact, config, run) {
  const tpl = (s.invoiceTemplates || []).find(row => row.id === config.templateId) || fail('Modelo de fatura não encontrado.');
  if (!(tpl.total > 0)) fail('O modelo de fatura não tem valor.');
  const count = Math.round(Number(config.count) || 0);
  const details = invoiceFields.recurringInvoices(s, { name: tpl.title, contactId: contact.id, templateId: tpl.id, items: tpl.items.map(item => ({ ...item, id: undefined })),
    notes: tpl.notes, terms: tpl.terms, dueDays: tpl.dueDays, frequency: config.frequency, interval: config.interval || 1,
    endMode: count > 0 ? 'count' : 'never', endCount: count > 0 ? count : undefined, channels: config.channel === 'email_whatsapp' ? ['email', 'whatsapp'] : ['email'] });
  const rec = { id: randomUUID(), created: new Date().toISOString(), ...details };
  s.recurringInvoices.push(rec);
  invoiceCommand(s, { type: 'invoice-recurring-start', id: rec.id, actor: 'Automação' }, { run });
  return rec;
}

/* ───────── Configurações: recibos e impostos ───────── */

export const paymentSettingsOf = s => {
  const base = paymentDefaults();
  return { receipts: { ...base.receipts, ...(s.paymentSettings?.receipts || {}) }, taxes: s.paymentSettings?.taxes || [] };
};

/** Pagamentos → Configurações (GoHighLevel's /payments/settings/receipts, plus the tax list). */
export function savePaymentSettings(s, d) {
  const r = d.receipts && typeof d.receipts === 'object' ? d.receipts : {};
  const email = str(r.replyTo, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Use um e-mail válido em “Responder para”.');
  const prefix = str(r.prefix, 12);
  if (!prefix) fail('Informe o prefixo do recibo.');
  if (!/^[\p{L}\p{N}\-_/#.]+$/u.test(prefix)) fail('O prefixo aceita letras, números e - _ / # .');
  const receipts = {
    enabled: r.enabled !== false, title: str(r.title, 40) || fail('Informe o título do recibo.'), prefix,
    startNumber: whole(r.startNumber, 1, 1, 9999999, 'O número inicial vai de 1 a 9.999.999.'), fromName: str(r.fromName, 80), replyTo: email,
    subject: str(r.subject, 200) || fail('Informe o assunto do e-mail do recibo.'), message: (typeof r.message === 'string' ? r.message.trim().slice(0, 3000) : '') || fail('Escreva a mensagem do e-mail do recibo.')
  };
  const list = Array.isArray(d.taxes) ? d.taxes : [];
  if (list.length > 20) fail('Cadastre até 20 impostos.');
  const seen = new Set();
  const taxes = list.map(raw => {
    const name = str(raw?.name, 60) || fail('Dê um nome a cada imposto.');
    const rate = Number(raw?.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) fail(`A alíquota de “${name}” precisa ficar entre 0,01% e 100%.`);
    const key = `${name.toLocaleLowerCase('pt-BR')}|${round2(rate)}`;
    if (seen.has(key)) fail(`“${name}” com essa alíquota já está na lista.`);
    seen.add(key);
    const id = /^[\w-]{6,60}$/.test(String(raw?.id || '')) ? raw.id : randomUUID();
    return { id, name, rate: round2(rate), description: str(raw?.description, 200) };
  });
  s.paymentSettings = { ...(s.paymentSettings || {}), receipts, taxes };
  return s.paymentSettings;
}

const fill = (template, values) => String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);

/** Numbers the receipt of a paid invoice (once) and, when receipts are on, e-mails it with the invoice link. */
export function issueReceipt(s, invoice, workspace = 'demo', origin = '') {
  if (!invoice || invoice.status !== 'Paid' || invoice.receiptNumber) return null;
  const { receipts: r } = paymentSettingsOf(s);
  const seq = Math.max(Number(s.receiptSeq) || 0, (Number(r.startNumber) || 1) - 1) + 1;
  s.receiptSeq = seq;
  invoice.receiptNumber = `${r.prefix}${String(seq).padStart(4, '0')}`;
  invoice.paidAt ||= new Date().toISOString();
  const contact = s.contacts.find(row => row.id === invoice.contactId);
  if (!r.enabled || !contact?.email || !(invoice.value > 0)) return invoice.receiptNumber;
  const token = randomBytes(24).toString('hex');
  invoice.tokens = [...(invoice.tokens || []).slice(-2), sha(token)];
  const values = { numero_recibo: invoice.receiptNumber, titulo: r.title, fatura: invoice.number ? `${invoice.number} · ${invoice.title}` : invoice.title, valor: brl(invoice.value),
    cliente: contact.name || '', empresa: s.profile?.name || '', data_pagamento: dmy(localDay(Date.parse(invoice.paidAt), s.profile?.timezone)) };
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', what: 'receipt', invoiceId: invoice.id, channels: ['email'], email: contact.email, name: contact.name || '', title: values.fatura,
    sender: r.fromName || s.profile?.name || '', fromName: r.fromName, replyTo: r.replyTo, subject: fill(r.subject, values), message: fill(r.message, values),
    path: invoicePath(workspace, token), origin, final: false, event: 'receipt' });
  return invoice.receiptNumber;
}

/** A paid invoice gets its receipt: saved by hand, paid by AbacatePay or paid through a store order. */
export function invoiceAfterSave(s, key, prior, row, workspace) {
  if (row.status !== 'Paid' || prior?.status === 'Paid') return;
  if (key === 'invoices') issueReceipt(s, row, workspace);
  if (key === 'orders') issueReceipt(s, s.invoices.find(item => item.id === row.invoiceId), workspace);
}
