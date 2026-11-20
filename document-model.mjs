// Documentos e contratos (Pagamentos): documents, templates and the content library. The editor saves
// whole records through the generic save command; this module validates them, keeps sent documents
// frozen and computes the price list total on the server. It also runs the signing flow (item 1.3):
// send, open by personal link, sign or decline, void, new link and completion with a SHA-256 hash.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { buildWorkflowContext, resolveTemplate } from './ui/expressions.js';
import { documentContext, documentKinds, documentTotal, libraryCategories, paymentParts, signatureValid, validBlocks, validPayment, validRecipients, validTheme, validVariables } from './ui/document-data.js';
import { renderCertificate, renderDocument } from './ui/document-render.js';

export const documentCollections = ['documents', 'documentTemplates', 'contentBlocks'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const kindOf = value => documentKinds.some(([kind]) => kind === value) ? value : 'proposal';
const ref = (s, key, value, label) => {
  const id = str(value, 60);
  if (!id) return '';
  return s[key].some(row => row.id === id) ? id : fail(`Escolha ${label} desta subconta.`);
};
const day = value => {
  const v = str(value, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T12:00:00Z`))) fail('Use uma data de validade válida.');
  return v;
};

// The content shared by documents and templates: blocks reference the recipients by id.
function content(s, d) {
  const recipients = validRecipients(s, d.recipients);
  const blocks = validBlocks(s, d.blocks, recipients);
  return { kind: kindOf(d.kind), theme: validTheme(s, d.theme), recipients, ordered: Boolean(d.ordered),
    variables: validVariables(d.variables), blocks, total: documentTotal(blocks), payment: validPayment(d.payment) };
}

export const documentFields = {
  documents: (s, d) => {
    const prior = d.id ? s.documents.find(row => row.id === d.id) : null;
    // Once sent, the content is frozen: only archiving changes. To alter it, void and duplicate (1.3).
    if (prior && prior.status !== 'draft') return { archived: Boolean(d.archived) };
    const contactId = ref(s, 'contacts', d.contactId, 'um contato');
    const opportunityId = ref(s, 'opportunities', d.opportunityId, 'uma oportunidade');
    return { title: str(d.title, 160) || fail('Dê um título ao documento.'), ...content(s, d), status: 'draft', archived: Boolean(d.archived),
      contactId, opportunityId, templateId: str(d.templateId, 60), expiresAt: day(d.expiresAt) };
  },
  documentTemplates: (s, d) => ({ title: str(d.title, 160) || fail('Dê um título ao modelo.'), ...content(s, d) }),
  contentBlocks: (s, d) => {
    const blocks = validBlocks(s, d.blocks, []);
    if (!blocks.length) fail('Inclua pelo menos um bloco no item da biblioteca.');
    return { name: str(d.name, 120) || fail('Dê um nome ao item da biblioteca.'),
      category: libraryCategories.some(([value]) => value === d.category) ? d.category : 'other', blocks };
  }
};

// Removing something a document points to keeps the document and drops the reference.
export function documentBeforeDelete(s, key, id) {
  const all = [...(s.documents || []), ...(s.documentTemplates || [])];
  const eachBlock = (blocks, visit) => { for (const block of blocks || []) { visit(block); if (block.type === 'columns') { eachBlock(block.left, visit); eachBlock(block.right, visit); } } };
  if (key === 'contacts') for (const doc of s.documents || []) {
    if (doc.contactId === id) doc.contactId = '';
    for (const recipient of doc.recipients || []) if (recipient.contactId === id) recipient.contactId = '';
  }
  if (key === 'opportunities') for (const doc of s.documents || []) if (doc.opportunityId === id) doc.opportunityId = '';
  const drafts = all.filter(doc => !doc.status || doc.status === 'draft');
  if (key === 'products') for (const doc of drafts) eachBlock(doc.blocks, block => { for (const item of block.items || []) if (item.productId === id) item.productId = ''; });
  if (key === 'files') {
    for (const doc of [...drafts, ...(s.contentBlocks || [])]) {
      if (doc.theme?.logoFileId === id) doc.theme.logoFileId = '';
      eachBlock(doc.blocks, block => { if (block.fileId === id) block.fileId = ''; });
    }
  }
  if (key === 'documentTemplates') for (const doc of s.documents || []) if (doc.templateId === id) doc.templateId = '';
  if (key === 'documents' && s.documents.find(row => row.id === id)?.status === 'sent') fail('Anule o documento antes de excluí-lo.', 409);
}

/* ───────── Assinatura eletrônica (item 1.3) ───────── */

const sha = value => createHash('sha256').update(value).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const isActive = recipient => recipient.role !== 'cc';
const allBlocks = blocks => (blocks || []).flatMap(block => block.type === 'columns' ? [block, ...allBlocks(block.left), ...allBlocks(block.right)] : [block]);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const signPath = (workspace, token) => `/assinar/${workspace}#${token}`;
export const tokenHash = token => /^[0-9a-f]{48}$/.test(String(token || '')) ? sha(token) : '';

function audit(doc, event, extra = {}) {
  doc.audit ||= [];
  if (doc.audit.length >= 300) doc.audit.splice(1, 1);
  doc.audit.push({ at: new Date().toISOString(), event, ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value)) });
}
function issueToken(recipient, keep = true) {
  const token = randomBytes(24).toString('hex');
  recipient.tokens = [...(keep ? recipient.tokens || [] : []), sha(token)].slice(-3);
  return token;
}
function findByToken(s, hash) {
  if (!hash) fail('Este link não é válido.', 404);
  for (const doc of s.documents || []) {
    const recipient = (doc.recipients || []).find(row => (row.tokens || []).includes(hash));
    if (recipient && doc.status !== 'draft') return { doc, recipient };
  }
  fail('Este link não é válido ou foi substituído por um mais novo.', 404);
}

// Variables are resolved once, when the document is sent, and the result is frozen as escaped text.
function freeze(s, doc) {
  const contact = s.contacts.find(row => row.id === doc.contactId) || null;
  const context = { ...buildWorkflowContext(s, {}, contact), ...documentContext(doc) };
  const value = match => { try { const out = resolveTemplate(match.replace(/&amp;/g, '&'), context); return out == null ? '' : String(out); } catch { return ''; } };
  const walk = blocks => structuredClone(blocks || []).map(block => {
    if (block.type === 'text') block.html = String(block.html || '').replace(/\{\{[^{}<>]+\}\}/g, match => escapeHtml(value(match)));
    if (block.type === 'table') block.rows = block.rows.map(row => row.map(cell => String(cell).replace(/\{\{[^{}<>]+\}\}/g, value)));
    if (block.type === 'columns') { block.left = walk(block.left); block.right = walk(block.right); }
    return block;
  });
  return walk(doc.blocks);
}

function notify(s, workspace, doc, recipient, token, { final = false, origin = '' } = {}) {
  const phone = recipient.contactId ? s.contacts.find(row => row.id === recipient.contactId)?.phone || '' : '';
  const channels = final ? ['email'] : doc.sending?.channels || ['email'];
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document', docId: doc.id, recipientId: recipient.id, channels, email: recipient.email, phone, name: recipient.name || recipient.label,
    title: doc.title, sender: s.profile?.name || '', subject: final ? '' : doc.sending?.subject || '', message: final ? '' : doc.sending?.message || '',
    path: signPath(workspace, token), origin, final, role: recipient.role, pays: final && Boolean(doc.payment?.status === 'pending') && recipient.role === 'signer' });
}
function notifyOwner(s, doc, kind, origin) {
  const email = String(s.profile?.email || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@example\.test$/.test(email)) return;
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'document-owner', docId: doc.id, email, title: doc.title, event: kind, origin, sender: s.profile?.name || '' });
}

const event = (run, s, doc, status, extra = {}) => run(s, 'document_status', { contactId: doc.contactId || '', documentId: doc.id, templateId: doc.templateId || '', status, total: doc.total, ...extra });

// Gives the next people their links: everyone at once, or the lowest order still waiting.
function activate(s, workspace, doc, origin) {
  const waiting = doc.recipients.filter(row => isActive(row) && row.status === 'waiting');
  if (!waiting.length) return [];
  const level = doc.ordered ? Math.min(...waiting.map(row => row.order)) : null;
  return waiting.filter(row => level === null || row.order === level).map(recipient => {
    const token = issueToken(recipient, false);
    Object.assign(recipient, { status: 'sent', sentAt: new Date().toISOString() });
    notify(s, workspace, doc, recipient, token, { origin });
    return { recipientId: recipient.id, name: recipient.name || recipient.label, path: signPath(workspace, token) };
  });
}

const expired = doc => doc.status === 'sent' && Boolean(doc.expiresAt) && today() > doc.expiresAt;
function expire(s, doc, run) {
  doc.status = 'expired';
  audit(doc, 'expired');
  event(run, s, doc, 'expired');
}

export const documentBody = (s, doc) => renderDocument(doc, { files: s.files || [], print: true, zone: s.profile?.timezone });

function complete(s, workspace, doc, { run, origin }) {
  doc.status = 'completed';
  doc.completedAt = new Date().toISOString();
  doc.hash = sha(documentBody(s, doc));
  audit(doc, 'completed', { detail: `SHA-256 ${doc.hash.slice(0, 16)}…` });
  if (doc.payment) createCharges(s, doc, run);
  for (const recipient of doc.recipients) if (recipient.email) notify(s, workspace, doc, recipient, issueToken(recipient), { final: true, origin });
  notifyOwner(s, doc, 'completed', origin);
  event(run, s, doc, 'completed');
}

/** What the public signing page receives: this document only, rendered on the server. */
export function signingView(s, doc, recipient) {
  const canSign = doc.status === 'sent' && ['sent', 'viewed'].includes(recipient.status) && isActive(recipient);
  const selectable = canSign && recipient.role === 'signer' && !doc.recipients.some(row => row.status === 'signed');
  const zone = s.profile?.timezone;
  const mine = allBlocks(doc.sentBlocks).filter(block => block.type === 'field' && block.recipientId === recipient.id)
    .map(block => ({ id: block.id, kind: block.kind, label: block.label, required: block.required, mode: block.dateMode }));
  const waitingFor = doc.status === 'sent' && recipient.status === 'signed'
    ? doc.recipients.filter(row => isActive(row) && row.status !== 'signed').map(row => row.name || row.label) : [];
  return {
    title: doc.title, kind: doc.kind, status: doc.status, sender: s.profile?.name || '', accent: doc.theme?.accent || '#155eef', expiresAt: doc.expiresAt || '',
    me: { id: recipient.id, name: recipient.name || recipient.label, role: recipient.role, status: recipient.status }, canSign, selectable, fields: mine, waitingFor,
    total: doc.total, recipients: doc.recipients.filter(isActive).map(row => ({ name: row.name || row.label, role: row.role, status: row.status })),
    html: renderDocument(doc, { files: s.files || [], me: recipient.id, interactive: canSign, selectable, zone }),
    certificate: doc.status === 'completed' ? renderCertificate(doc, { zone }) : '',
    intact: doc.status === 'completed' ? sha(documentBody(s, doc)) === doc.hash : null,
    declinedReason: doc.status === 'declined' ? doc.declineReason || '' : '',
    payment: paymentView(s, doc)
  };
}

function readValue(block, raw) {
  const label = block.label || 'campo';
  switch (block.kind) {
    case 'signature': case 'initials':
      if (raw && !signatureValid(raw)) fail(`A ${block.kind === 'signature' ? 'assinatura' : 'rubrica'} em “${label}” não é válida. Desenhe de novo.`);
      return raw || '';
    case 'text': return str(raw, 500);
    case 'date':
      if (block.dateMode !== 'pick') return today();
      if (raw && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(`${raw}T12:00:00Z`)))) fail(`Use uma data válida em “${label}”.`);
      return raw || '';
    case 'checkbox': return raw === true;
    default: return '';
  }
}

export function documentCommand(s, command, { workspace = 'demo', run }) {
  const { type, id, data: d = {} } = command;
  const origin = str(d.origin, 200);
  const meta = { ip: str(d.ip, 64), userAgent: str(d.userAgent, 300) };

  if (type === 'document-send') {
    const doc = s.documents.find(row => row.id === id) || fail('Documento não encontrado.', 404);
    if (doc.status !== 'draft') fail('Este documento já foi enviado.', 409);
    const people = doc.recipients.filter(isActive);
    if (!people.length) fail('Inclua pelo menos um destinatário que assina ou aprova.');
    for (const recipient of doc.recipients) {
      if (!recipient.name) fail(`Informe o nome de “${recipient.label}” em Destinatários.`);
      if (!recipient.email) fail(`Informe o e-mail de ${recipient.name}. Ele recebe o link pessoal e a cópia final.`);
    }
    const blocks = allBlocks(doc.blocks);
    for (const recipient of people) {
      if (recipient.role === 'signer' && !blocks.some(block => block.type === 'field' && block.kind === 'signature' && block.recipientId === recipient.id)) {
        fail(`Adicione um campo de assinatura para ${recipient.name}.`);
      }
    }
    if (doc.expiresAt && today() > doc.expiresAt) fail('A validade do documento já passou. Ajuste em Documento → Válido até.');
    const channels = [...new Set((Array.isArray(d.channels) ? d.channels : ['email']).filter(value => ['email', 'whatsapp'].includes(value)))];
    if (!channels.includes('email')) channels.unshift('email');
    doc.sending = { channels, subject: str(d.subject, 160), message: str(d.message, 2000) };
    doc.sentBlocks = freeze(s, doc);
    doc.total = documentTotal(doc.sentBlocks);
    doc.values = {};
    Object.assign(doc, { status: 'sent', sentAt: new Date().toISOString(), updated: new Date().toISOString() });
    for (const recipient of doc.recipients) {
      for (const key of ['tokens', 'sentAt', 'viewedAt', 'signedAt', 'declinedAt', 'ip', 'userAgent']) delete recipient[key];
      recipient.status = isActive(recipient) ? 'waiting' : 'cc';
    }
    audit(doc, 'sent', { detail: `${people.map(row => row.name).join(', ')} · ${channels.map(value => value === 'email' ? 'e-mail' : 'WhatsApp').join(' e ')}`, by: str(command.actor, 120) });
    const links = activate(s, workspace, doc, origin);
    event(run, s, doc, 'sent');
    return { links };
  }

  if (type === 'document-void') {
    const doc = s.documents.find(row => row.id === id) || fail('Documento não encontrado.', 404);
    if (!['sent', 'expired', 'declined'].includes(doc.status)) fail('Só documentos enviados podem ser anulados.', 409);
    Object.assign(doc, { status: 'void', voidedAt: new Date().toISOString(), updated: new Date().toISOString() });
    audit(doc, 'void', { detail: str(d.reason, 300), by: str(command.actor, 120) });
    event(run, s, doc, 'void');
    return id;
  }

  if (type === 'document-link') {
    const doc = s.documents.find(row => row.id === id) || fail('Documento não encontrado.', 404);
    const recipient = doc.recipients.find(row => row.id === d.recipientId) || fail('Destinatário não encontrado.', 404);
    const final = doc.status === 'completed';
    if (!final && !(doc.status === 'sent' && ['sent', 'viewed'].includes(recipient.status))) fail('Este destinatário não tem um link ativo agora.', 409);
    const token = issueToken(recipient, false);
    audit(doc, 'link', { recipientId: recipient.id, detail: recipient.name, by: str(command.actor, 120) });
    if (d.notify) notify(s, workspace, doc, recipient, token, { final, origin });
    doc.updated = new Date().toISOString();
    return { path: signPath(workspace, token) };
  }

  if (type === 'document-subscription-checkout') {
    const doc = s.documents.find(row => row.id === d.docId);
    if (doc?.payment?.subscription) doc.payment.subscription.checkout = d.checkout;
    return Boolean(doc);
  }
  if (type === 'document-subscription') return subscriptionEvent(s, d, run);
  if (type === 'document-payable') {
    const { doc } = findByToken(s, str(d.tokenHash, 64));
    if (doc.status !== 'completed' || !doc.payment) fail('Este documento não tem cobrança pendente.', 409);
    if (doc.payment.mode === 'recurring') {
      const sub = doc.payment.subscription;
      if (!sub || sub.status === 'active') fail('A assinatura deste documento já está ativa.', 409);
      return { kind: 'subscription', docId: doc.id, title: doc.title, amount: sub.amount, checkout: sub.checkout?.status === 'PENDING' ? sub.checkout : null };
    }
    const next = (doc.payment.invoiceIds || []).map(invoiceId => s.invoices.find(row => row.id === invoiceId)).filter(row => row?.status === 'Open')
      .sort((a, b) => a.due.localeCompare(b.due))[0];
    if (!next) fail('Não há faturas em aberto neste documento.', 409);
    return { kind: 'invoice', invoiceId: next.id };
  }
  if (!['document-open', 'document-sign', 'document-decline'].includes(type)) fail('Ação inválida.');
  // Public: the person behind a personal link (the server checks the token and passes only its hash).
  const { doc, recipient } = findByToken(s, str(d.tokenHash, 64));
  if (type === 'document-open') {
    if (expired(doc)) expire(s, doc, run);
    if (doc.status === 'sent' && recipient.status === 'sent') {
      Object.assign(recipient, { status: 'viewed', viewedAt: new Date().toISOString() });
      audit(doc, 'viewed', { recipientId: recipient.id, detail: recipient.name, ...meta });
      event(run, s, doc, 'viewed', { recipientId: recipient.id });
    }
    return signingView(s, doc, recipient);
  }
  if (expired(doc)) { expire(s, doc, run); return signingView(s, doc, recipient); }
  if (!(doc.status === 'sent' && ['sent', 'viewed'].includes(recipient.status) && isActive(recipient))) fail('Este documento não está mais aguardando a sua assinatura.', 409);

  if (type === 'document-decline') {
    Object.assign(recipient, { status: 'declined', declinedAt: new Date().toISOString(), ...meta });
    Object.assign(doc, { status: 'declined', declinedAt: new Date().toISOString(), declineReason: str(d.reason, 500), updated: new Date().toISOString() });
    audit(doc, 'declined', { recipientId: recipient.id, detail: [recipient.name, str(d.reason, 200)].filter(Boolean).join(': '), ...meta });
    notifyOwner(s, doc, 'declined', origin);
    event(run, s, doc, 'declined', { recipientId: recipient.id });
    return signingView(s, doc, recipient);
  }

  if (d.accept !== true) fail('Confirme que concorda em assinar este documento eletronicamente.');
  const selectable = recipient.role === 'signer' && !doc.recipients.some(row => row.status === 'signed');
  const values = d.values && typeof d.values === 'object' && !Array.isArray(d.values) ? d.values : {};
  const at = new Date().toISOString();
  const filled = {};
  for (const block of allBlocks(doc.sentBlocks).filter(row => row.type === 'field' && row.recipientId === recipient.id)) {
    const value = readValue(block, values[block.id]);
    if (block.required && (value === '' || value === false)) {
      fail(block.kind === 'checkbox' ? `Marque “${block.label}” para continuar.` : ['signature', 'initials'].includes(block.kind) ? `Assine no campo “${block.label}”.` : `Preencha “${block.label}”.`);
    }
    if (value !== '' && value !== false) filled[block.id] = { value, at, by: recipient.id };
  }
  if (selectable && Array.isArray(d.items)) {
    const chosen = new Set(d.items.map(String));
    for (const block of allBlocks(doc.sentBlocks).filter(row => row.type === 'products')) for (const item of block.items) if (item.optional) item.selected = chosen.has(item.id);
    doc.total = documentTotal(doc.sentBlocks);
  }
  doc.values = { ...(doc.values || {}), ...filled };
  Object.assign(recipient, { status: 'signed', signedAt: at, ...meta });
  doc.updated = at;
  audit(doc, recipient.role === 'approver' ? 'approved' : 'signed', { recipientId: recipient.id, detail: `${recipient.name} <${recipient.email}>`, ...meta });
  event(run, s, doc, 'signed', { recipientId: recipient.id });
  const pending = doc.recipients.filter(row => isActive(row) && row.status !== 'signed');
  if (!pending.length) complete(s, workspace, doc, { run, origin });
  else if (!pending.some(row => ['sent', 'viewed'].includes(row.status))) activate(s, workspace, doc, origin);
  return signingView(s, doc, recipient);
}

/** Workflow action "Enviar documento ou contrato": a document from a template, for the enrolled contact. */
export function sendTemplateDocument(s, workspace, contact, config, run) {
  const tpl = (s.documentTemplates || []).find(row => row.id === config.templateId) || fail('Modelo de documento não encontrado.');
  if (!contact?.email) fail('O contato não tem e-mail.');
  const recipients = structuredClone(tpl.recipients?.length ? tpl.recipients : [{ id: 'role-client', label: 'Cliente', role: 'signer', order: 1 }]);
  const first = recipients.find(isActive) || recipients[0];
  Object.assign(first, { contactId: contact.id, name: contact.name, email: contact.email });
  const days = Number(config.expiresDays) || 0;
  const details = documentFields.documents(s, {
    title: config.title || `${tpl.title} · ${contact.name}`, kind: tpl.kind, contactId: contact.id, templateId: tpl.id, theme: tpl.theme, recipients,
    ordered: tpl.ordered, variables: tpl.variables, blocks: tpl.blocks, payment: tpl.payment, expiresAt: days ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) : ''
  });
  const doc = { id: randomUUID(), created: new Date().toISOString(), ...details };
  s.documents.push(doc);
  try {
    documentCommand(s, { type: 'document-send', id: doc.id, actor: 'Automação', data: { channels: config.channel === 'email_whatsapp' ? ['email', 'whatsapp'] : ['email'] } }, { workspace, run });
  } catch (error) {
    s.documents = s.documents.filter(row => row.id !== doc.id);
    throw error;
  }
  return doc;
}

/* ───────── Cobrança após assinar (item 1.4) ───────── */

const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const inDays = days => new Date(Date.now() + days * 864e5).toISOString();

// Who pays: the document's client, else the first signer (found or created as a contact by e-mail).
function payer(s, doc) {
  const signer = doc.recipients.find(row => row.role === 'signer') || doc.recipients[0];
  let contact = s.contacts.find(row => row.id === doc.contactId) || s.contacts.find(row => row.id === signer?.contactId)
    || s.contacts.find(row => signer?.email && (row.email || '').toLowerCase() === signer.email);
  if (!contact) {
    contact = { id: randomUUID(), created: new Date().toISOString(), name: signer?.name || 'Cliente', email: signer?.email || '', phone: '', company: '', tags: ['documento'], notes: '', custom: {} };
    s.contacts.push(contact);
  }
  return contact;
}

function createCharges(s, doc, run) {
  const parts = paymentParts(doc.payment, doc.total);
  if (!parts.length) { doc.payment.status = 'none'; return; }
  const contact = payer(s, doc);
  doc.contactId ||= contact.id;
  if (doc.payment.mode === 'recurring') {
    doc.payment.subscription = { status: 'pending', amount: parts[0].value, contactId: contact.id, payments: [] };
    doc.payment.status = 'pending';
    audit(doc, 'charge', { detail: `Assinatura mensal de ${brl(parts[0].value)}` });
    return;
  }
  s.invoices ||= [];
  doc.payment.invoiceIds = parts.map(part => {
    const invoice = { id: randomUUID(), created: new Date().toISOString(), title: part.of > 1 ? `${doc.title} (${part.index}/${part.of})` : doc.title,
      contactId: contact.id, value: part.value, due: inDays(part.dueDays), status: 'Open', documentId: doc.id };
    s.invoices.push(invoice);
    run(s, 'invoice_status', { contactId: contact.id, status: 'Open', total: invoice.value });
    return invoice.id;
  });
  doc.payment.status = 'pending';
  audit(doc, 'charge', { detail: `${parts.length === 1 ? '1 fatura' : `${parts.length} faturas`} · ${brl(doc.total)}` });
}

function paymentView(s, doc) {
  if (!doc.payment) return null;
  const invoices = (doc.payment.invoiceIds || []).map(id => s.invoices.find(row => row.id === id)).filter(Boolean);
  const sub = doc.payment.subscription;
  return {
    mode: doc.payment.mode, timing: doc.payment.timing, status: doc.payment.status || 'configured', total: doc.total, installments: doc.payment.schedule?.length || 1,
    parts: invoices.map(row => ({ title: row.title, value: row.value, due: row.due, status: row.status })),
    subscription: sub ? { status: sub.status, amount: sub.amount } : null,
    payable: doc.status === 'completed' && (invoices.some(row => row.status === 'Open') || Boolean(sub && sub.status !== 'active' && sub.status !== 'cancelled'))
  };
}

function markPaid(s, doc, run, detail) {
  doc.payment.status = 'paid';
  doc.payment.paidAt = new Date().toISOString();
  audit(doc, 'paid', { detail });
  run(s, 'document_paid', { contactId: doc.contactId || '', documentId: doc.id, templateId: doc.templateId || '', total: doc.total });
}

/** An invoice of a document changed: partial or full payment of the document. */
export function documentAfterSave(s, key, prior, row, run) {
  if (key !== 'invoices' || !row.documentId || row.status === prior?.status) return;
  const doc = (s.documents || []).find(item => item.id === row.documentId);
  if (!doc?.payment || doc.payment.mode !== 'one_time' || doc.payment.status === 'paid') return;
  const invoices = (doc.payment.invoiceIds || []).map(id => id === row.id ? row : s.invoices.find(item => item.id === id)).filter(item => item && item.status !== 'Void');
  const paid = invoices.filter(item => item.status === 'Paid');
  if (row.status === 'Paid') audit(doc, 'payment', { detail: `${row.title} · ${brl(row.value)}${row.paidMethod ? ` · ${row.paidMethod}` : ''}` });
  if (invoices.length && paid.length === invoices.length) markPaid(s, doc, run, brl(paid.reduce((n, item) => n + item.value, 0)));
  else doc.payment.status = paid.length ? 'partial' : 'pending';
}

// AbacatePay subscription events for a document's monthly charge (webhook of the sub-account).
function subscriptionEvent(s, d, run) {
  const checkoutId = str(d.checkoutId, 80), subscriptionId = str(d.subscriptionId, 80);
  const doc = (s.documents || []).find(row => {
    const sub = row.payment?.subscription;
    return sub && ((checkoutId && sub.checkout?.checkoutId === checkoutId) || (subscriptionId && sub.subscriptionId === subscriptionId));
  });
  if (!doc) return false;
  const sub = doc.payment.subscription, at = new Date().toISOString();
  if (subscriptionId) sub.subscriptionId = subscriptionId;
  if (d.event === 'subscription.cancelled') {
    sub.status = 'cancelled'; sub.cancelledAt = at;
    audit(doc, 'payment', { detail: 'Assinatura cancelada' });
    return true;
  }
  if (['subscription.completed', 'subscription.renewed'].includes(d.event)) {
    const amount = Number(d.amount) > 0 ? Math.round(Number(d.amount) * 100) / 100 : sub.amount;
    sub.payments = [...(sub.payments || []), { at, amount, receiptUrl: str(d.receiptUrl, 500) }].slice(-36);
    s.transactions ||= [];
    s.transactions.push({ id: randomUUID(), created: at, contactId: sub.contactId || doc.contactId || '', amount, date: at.slice(0, 10), method: str(d.method, 20) || 'Card',
      source: 'Subscription', status: 'Succeeded', note: doc.title, invoiceId: '' });
    if (sub.status !== 'active') { sub.status = 'active'; sub.startedAt = at; markPaid(s, doc, run, `Assinatura mensal ativa · ${brl(amount)}`); }
    else audit(doc, 'payment', { detail: `Mensalidade · ${brl(amount)}` });
    return true;
  }
  return false;
}
