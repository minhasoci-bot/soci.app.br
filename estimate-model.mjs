// Orçamentos (Pagamentos): numbered quotes with a price list, sent to the client by a personal link, accepted
// (choosing optional items) or declined online or by hand, and turned into an invoice that AbacatePay charges.
// Statuses follow GoHighLevel's estimates: draft, sent, accepted, declined, invoiced (plus expired).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { itemsSummary, validItem } from './ui/document-data.js';
import { renderEstimate } from './ui/estimate-render.js';

export const estimateCollections = ['estimates'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const sha = value => createHash('sha256').update(value).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const round2 = value => Math.round(Number(value) * 100) / 100;
const day = (value, label) => {
  const v = str(value, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T12:00:00Z`))) fail(`Use uma data válida em ${label}.`);
  return v;
};
export const estimateTotal = items => itemsSummary(items).total;
export const estimatePath = (workspace, token) => `/orcamento/${workspace}#${token}`;
export const estimateTokenHash = token => /^[0-9a-f]{48}$/.test(String(token || '')) ? sha(token) : '';

function nextNumber(s) {
  s.estimateSeq = Math.max(Number(s.estimateSeq) || 0, ...(s.estimates || []).map(row => Number(String(row.number || '').replace(/\D/g, '')) || 0)) + 1;
  return `ORC-${String(s.estimateSeq).padStart(4, '0')}`;
}

export const estimateFields = {
  estimates: (s, d) => {
    const prior = d.id ? s.estimates.find(row => row.id === d.id) : null;
    if (prior && prior.status !== 'draft') fail('Este orçamento já foi enviado. Use “Revisar” para voltar a editar.', 409);
    const contactId = str(d.contactId, 60);
    if (contactId && !s.contacts.some(row => row.id === contactId)) fail('Escolha um contato desta subconta.');
    const opportunityId = str(d.opportunityId, 60);
    if (opportunityId && !s.opportunities.some(row => row.id === opportunityId)) fail('Escolha uma oportunidade desta subconta.');
    const items = Array.isArray(d.items) ? d.items : [];
    if (items.length > 50) fail('Um orçamento aceita até 50 itens.');
    const clean = items.map(item => validItem(s, item));
    const issueDate = day(d.issueDate, 'Emissão') || today();
    const expiresAt = day(d.expiresAt, 'Válido até');
    if (expiresAt && expiresAt < issueDate) fail('A validade precisa ser depois da emissão.');
    const dueDays = Math.round(Number(d.invoiceDueDays ?? 7));
    if (!Number.isFinite(dueDays) || dueDays < 0 || dueDays > 365) fail('O prazo da fatura vai de 0 a 365 dias.');
    return {
      title: str(d.title, 160) || fail('Dê um nome ao orçamento.'), number: prior?.number || nextNumber(s), contactId, opportunityId, issueDate, expiresAt,
      items: clean, total: estimateTotal(clean), notes: str(d.notes, 2000), terms: str(d.terms, 4000),
      autoInvoice: d.autoInvoice !== false, invoiceDueDays: dueDays, status: 'draft'
    };
  }
};

export function estimateBeforeDelete(s, key, id) {
  if (key === 'contacts') for (const est of s.estimates || []) if (est.contactId === id) est.contactId = '';
  if (key === 'opportunities') for (const est of s.estimates || []) if (est.opportunityId === id) est.opportunityId = '';
  if (key === 'products') for (const est of (s.estimates || []).filter(row => row.status === 'draft')) for (const item of est.items) if (item.productId === id) item.productId = '';
  if (key === 'estimates' && s.estimates.find(row => row.id === id)?.status === 'sent') fail('Revise ou responda o orçamento antes de excluí-lo.', 409);
}

function audit(est, event, extra = {}) {
  est.audit ||= [];
  if (est.audit.length >= 200) est.audit.splice(1, 1);
  est.audit.push({ at: new Date().toISOString(), event, ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value)) });
}
const event = (run, s, est, status) => run(s, 'estimate_status', { contactId: est.contactId || '', estimateId: est.id, status, total: est.total });
function issueToken(est) {
  const token = randomBytes(24).toString('hex');
  est.tokens = [sha(token)];
  return token;
}
function notify(s, workspace, est, token, origin) {
  const contact = s.contacts.find(row => row.id === est.contactId);
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', what: 'estimate', estimateId: est.id, channels: est.sending?.channels || ['email'], email: contact?.email || '', phone: contact?.phone || '',
    name: contact?.name || '', title: `${est.number} · ${est.title}`, sender: s.profile?.name || '', subject: est.sending?.subject || '', message: est.sending?.message || '',
    path: estimatePath(workspace, token), origin, final: false, role: 'signer' });
}
function notifyOwner(s, est, kind, origin) {
  const email = String(s.profile?.email || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@example\.test$/.test(email)) return;
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document-owner', what: 'estimate', estimateId: est.id, email, title: `${est.number} · ${est.title}`, event: kind, origin, sender: s.profile?.name || '' });
}
const expired = est => est.status === 'sent' && Boolean(est.expiresAt) && today() > est.expiresAt;

function invoice(s, est, run) {
  if (est.invoiceId) return s.invoices.find(row => row.id === est.invoiceId);
  if (!est.contactId) fail('Escolha o cliente do orçamento antes de faturar.');
  if (!(est.total > 0)) fail('O orçamento não tem valor para faturar.');
  const row = { id: randomUUID(), created: new Date().toISOString(), title: `${est.number} · ${est.title}`, contactId: est.contactId, value: est.total,
    due: new Date(Date.now() + (est.invoiceDueDays ?? 7) * 864e5).toISOString(), status: 'Open', estimateId: est.id };
  s.invoices.push(row);
  Object.assign(est, { status: 'invoiced', invoiceId: row.id, invoicedAt: row.created, updated: row.created });
  audit(est, 'invoiced', { detail: `${brl(row.value)} · vence ${row.due.slice(0, 10).split('-').reverse().join('/')}` });
  run(s, 'invoice_status', { contactId: row.contactId, status: 'Open', total: row.value });
  event(run, s, est, 'invoiced');
  return row;
}

function accept(s, est, run, { by = '', items, meta = {}, origin = '' } = {}) {
  if (Array.isArray(items)) {
    const chosen = new Set(items.map(String));
    for (const item of est.items) if (item.optional) item.selected = chosen.has(item.id);
    est.total = estimateTotal(est.items);
  }
  Object.assign(est, { status: 'accepted', acceptedAt: new Date().toISOString(), acceptedBy: by, updated: new Date().toISOString() });
  audit(est, 'accepted', { detail: by, ...meta });
  event(run, s, est, 'accepted');
  notifyOwner(s, est, 'accepted', origin);
  if (est.autoInvoice && est.total > 0 && est.contactId) invoice(s, est, run);
}

/** What the public page receives: this estimate only. */
export function estimateView(s, est) {
  const contact = s.contacts.find(row => row.id === est.contactId) || null;
  const bill = est.invoiceId ? s.invoices.find(row => row.id === est.invoiceId) : null;
  const canAnswer = est.status === 'sent';
  const logo = s.profile?.logoFileId ? (s.files || []).find(row => row.id === s.profile.logoFileId)?.data || '' : '';
  return {
    number: est.number, title: est.title, status: est.status, sender: s.profile?.name || '', issueDate: est.issueDate, expiresAt: est.expiresAt || '', total: est.total,
    canAnswer, acceptedBy: est.acceptedBy || '', declinedReason: est.status === 'declined' ? est.declineReason || '' : '',
    html: renderEstimate(est, { company: s.profile?.name || '', contact: contact && { name: contact.name, company: contact.company, email: contact.email }, logo, selectable: canAnswer }),
    invoice: bill ? { status: bill.status, value: bill.value, due: bill.due } : null,
    payable: bill?.status === 'Open'
  };
}

export function estimateCommand(s, command, { workspace = 'demo', run }) {
  const { type, id, data: d = {} } = command;
  const origin = str(d.origin, 200), actor = str(command.actor, 120);
  const meta = { ip: str(d.ip, 64), userAgent: str(d.userAgent, 300) };
  const mine = () => s.estimates.find(row => row.id === id) || fail('Orçamento não encontrado.', 404);

  if (type === 'estimate-send') {
    const est = mine();
    if (!['draft', 'expired'].includes(est.status)) fail('Este orçamento já foi enviado.', 409);
    const contact = s.contacts.find(row => row.id === est.contactId);
    if (!contact) fail('Escolha o cliente do orçamento.');
    if (!contact.email) fail(`O contato ${contact.name} não tem e-mail. Ele recebe o link do orçamento por e-mail.`);
    if (!est.items.length) fail('Inclua pelo menos um item no orçamento.');
    if (est.expiresAt && today() > est.expiresAt) fail('A validade do orçamento já passou. Ajuste a data em “Válido até”.');
    const channels = [...new Set(['email', ...(Array.isArray(d.channels) ? d.channels : []).filter(value => value === 'whatsapp')])];
    est.sending = { channels, subject: str(d.subject, 160), message: str(d.message, 2000) };
    Object.assign(est, { status: 'sent', sentAt: new Date().toISOString(), updated: new Date().toISOString() });
    const token = issueToken(est);
    audit(est, 'sent', { detail: `${contact.name} · ${channels.map(value => value === 'email' ? 'e-mail' : 'WhatsApp').join(' e ')}`, by: actor });
    notify(s, workspace, est, token, origin);
    event(run, s, est, 'sent');
    return { path: estimatePath(workspace, token) };
  }
  if (type === 'estimate-link') {
    const est = mine();
    if (est.status === 'draft') fail('Envie o orçamento antes de gerar um link.', 409);
    const token = issueToken(est);
    audit(est, 'link', { by: actor });
    if (d.notify) notify(s, workspace, est, token, origin);
    return { path: estimatePath(workspace, token) };
  }
  if (type === 'estimate-revise') {
    const est = mine();
    if (!['sent', 'declined', 'expired'].includes(est.status)) fail('Só orçamentos enviados, recusados ou vencidos voltam a rascunho.', 409);
    Object.assign(est, { status: 'draft', tokens: [], updated: new Date().toISOString() });
    audit(est, 'revised', { by: actor });
    return id;
  }
  if (type === 'estimate-status') {
    const est = mine();
    if (est.status !== 'sent') fail('Só orçamentos enviados podem ser marcados como aceitos ou recusados.', 409);
    if (d.status === 'accepted') accept(s, est, run, { by: `${actor} (registrado no app)` });
    else if (d.status === 'declined') {
      Object.assign(est, { status: 'declined', declinedAt: new Date().toISOString(), declineReason: str(d.reason, 500), updated: new Date().toISOString() });
      audit(est, 'declined', { detail: str(d.reason, 200), by: actor });
      event(run, s, est, 'declined');
    } else fail('Escolha aceito ou recusado.');
    return id;
  }
  if (type === 'estimate-invoice') {
    const est = mine();
    if (!['accepted', 'sent'].includes(est.status)) fail('Fature um orçamento enviado ou aceito.', 409);
    if (est.status === 'sent') accept(s, est, run, { by: `${actor} (registrado no app)` });
    return invoice(s, est, run).id;
  }

  // Public: the client behind the personal link (the server checks the token and passes only its hash).
  if (!['estimate-open', 'estimate-accept', 'estimate-decline', 'estimate-payable'].includes(type)) fail('Ação inválida.');
  const hash = str(d.tokenHash, 64);
  const est = hash ? (s.estimates || []).find(row => (row.tokens || []).includes(hash) && row.status !== 'draft') : null;
  if (!est) fail('Este link não é válido ou foi substituído por um mais novo.', 404);
  if (expired(est)) { est.status = 'expired'; audit(est, 'expired'); event(run, s, est, 'expired'); }
  if (type === 'estimate-open') {
    if (est.status === 'sent' && !est.viewedAt) { est.viewedAt = new Date().toISOString(); audit(est, 'viewed', meta); event(run, s, est, 'viewed'); }
    return estimateView(s, est);
  }
  if (type === 'estimate-payable') {
    if (est.invoiceId && s.invoices.find(row => row.id === est.invoiceId)?.status === 'Open') return { invoiceId: est.invoiceId };
    fail('Este orçamento não tem fatura em aberto.', 409);
  }
  if (est.status !== 'sent') return estimateView(s, est);
  if (type === 'estimate-decline') {
    Object.assign(est, { status: 'declined', declinedAt: new Date().toISOString(), declineReason: str(d.reason, 500), updated: new Date().toISOString() });
    audit(est, 'declined', { detail: str(d.reason, 200), ...meta });
    event(run, s, est, 'declined');
    notifyOwner(s, est, 'declined', origin);
    return estimateView(s, est);
  }
  const by = str(d.name, 120);
  if (!by) fail('Informe seu nome para aprovar o orçamento.');
  accept(s, est, run, { by, items: d.items, meta, origin });
  return estimateView(s, est);
}

/** Paying the invoice of an estimate is recorded on it (the invoice itself keeps its own status). */
export function estimateAfterSave(s, key, prior, row, run) {
  if (key !== 'invoices' || !row.estimateId || row.status === prior?.status || row.status !== 'Paid') return;
  const est = (s.estimates || []).find(item => item.id === row.estimateId);
  if (!est) return;
  est.paidAt = new Date().toISOString();
  audit(est, 'paid', { detail: brl(row.value) });
  event(run, s, est, 'paid');
}

/** Workflow action “Enviar orçamento”: a copy of an estimate, for the enrolled contact, sent at once. */
export function sendEstimateCopy(s, workspace, contact, config, run) {
  const model = (s.estimates || []).find(row => row.id === config.estimateId) || fail('Orçamento modelo não encontrado.');
  if (!contact?.email) fail('O contato não tem e-mail.');
  const days = Number(config.expiresDays) || 0;
  const details = estimateFields.estimates(s, { title: model.title, contactId: contact.id, items: model.items.map(item => ({ ...item, id: undefined })), notes: model.notes, terms: model.terms,
    autoInvoice: model.autoInvoice, invoiceDueDays: model.invoiceDueDays, expiresAt: days ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) : '' });
  const est = { id: randomUUID(), created: new Date().toISOString(), ...details };
  s.estimates.push(est);
  try {
    estimateCommand(s, { type: 'estimate-send', id: est.id, actor: 'Automação', data: { channels: config.channel === 'email_whatsapp' ? ['email', 'whatsapp'] : ['email'] } }, { workspace, run });
  } catch (error) {
    s.estimates = s.estimates.filter(row => row.id !== est.id);
    throw error;
  }
  return est;
}
