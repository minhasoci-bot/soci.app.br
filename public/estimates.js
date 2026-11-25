// Pagamentos → Orçamentos: list (status tabs with counts, period, search), the draft editor with a live
// preview, and the read-only view of a sent estimate (link, answers, invoice and audit trail).
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { crmTabs } from './crm.js';
import { invoicePaymentState, invoiceStateLabels } from './invoice-data.js';
import { estimateStatuses, estimateTabs, renderEstimate } from './estimate-render.js';
import { lineItemAction, lineItemInput, lineItemsEditor, itemsTotal } from './line-items.js';

const es = { status: 'all', period: 'all', id: '', rev: '', draft: null, dirty: false };
let env = null;
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const statusBadge = est => { const [, name, tone] = estimateStatuses.find(([key]) => key === est.status) || estimateStatuses[0]; return badge(name, tone); };
const option = (value, text, chosen) => `<option value="${h(value)}"${value === chosen ? ' selected' : ''}>${h(text)}</option>`;
const contactOf = (c, id) => c.s.contacts.find(row => row.id === id) || null;
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const periods = [['all', 'Qualquer data'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']];
const inStatus = (est, status) => status === 'all' || est.status === status;
const trailNames = { sent: 'Enviado', viewed: 'Visualizado', accepted: 'Aceito', declined: 'Recusado', invoiced: 'Faturado', paid: 'Pago', expired: 'Vencido', link: 'Novo link gerado', revised: 'Voltou a rascunho', delivered: 'Entrega' };

/* ───────── Lista ───────── */

function listView(c) {
  const q = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const all = c.s.estimates || [];
  const rows = all.filter(est => inStatus(est, es.status) && (es.period === 'all' || Date.parse(est.updated || est.created) >= Date.now() - Number(es.period) * 864e5)
    && (!q || [est.title, est.number, contactOf(c, est.contactId)?.name].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(q))))
    .sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''));
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Nome</th><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col">Emissão</th><th scope="col" class="right">Valor</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows.map(est => `<tr><td><a class="dc-title" data-no-translate="1" href="#payments/estimate/${h(est.id)}">${h(est.title)}</a></td><td>${h(est.number)}</td>
      <td>${h(contactOf(c, est.contactId)?.name || '—')}</td><td>${h(day(est.issueDate))}</td><td class="right"><b>${money(est.total)}</b></td><td>${statusBadge(est)}</td>
      <td class="right dc-actions"><a class="icon-btn" href="#payments/estimate/${h(est.id)}" aria-label="Abrir ${h(est.number)}" title="Abrir">${icon('edit', 16)}</a>
        <button type="button" class="icon-btn" data-es-act="duplicate" data-id="${h(est.id)}" aria-label="Duplicar ${h(est.number)}" title="Duplicar">${icon('copy', 16)}</button>
        ${est.status === 'sent' ? '' : `<button type="button" class="icon-btn" data-es-act="delete" data-id="${h(est.id)}" aria-label="Excluir ${h(est.number)}" title="Excluir">${icon('trash', 16)}</button>`}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('pay', 26)}<strong>${all.length ? 'Nenhum orçamento aqui' : 'Crie seu primeiro orçamento'}</strong>
      <p>${all.length ? 'Tente outra situação, período ou busca.' : 'Monte os itens a partir dos produtos, envie o link e receba a aprovação do cliente. Ao aprovar, a fatura nasce sozinha.'}</p>
      ${all.length ? '' : '<button type="button" class="primary" data-es-act="new">Novo orçamento</button>'}</div>`;
  return pageShell({ title: 'Pagamentos', desc: 'Orçamentos numerados que o cliente aprova online e viram fatura.',
    cta: `<button type="button" class="primary" data-es-act="new">${icon('plus', 16)} Novo orçamento</button>`,
    tabs: { key: 'payments', items: crmTabs.payments, current: 'estimates', label: 'Seções de pagamentos' },
    content: `<div class="dc-page"><div class="dc-segment" role="group" aria-label="Situação dos orçamentos">${estimateTabs.map(([value, text]) =>
      `<button type="button" data-es-status="${value}" aria-pressed="${es.status === value}">${text} <span>${all.filter(est => inStatus(est, value)).length}</span></button>`).join('')}</div>
      <div class="toolbar dc-toolbar">${search(c.query, 'Buscar por nome, número ou cliente…')}<label class="dc-period"><span class="sr-only">Período</span><select data-es-period>${periods.map(([value, text]) => option(value, text, es.period)).join('')}</select></label></div>
      ${table}</div>` });
}

/* ───────── Editor e acompanhamento ───────── */

function load(c) {
  const id = c.studio?.project || '';
  const row = (c.s.estimates || []).find(item => item.id === id);
  if (!row) return null;
  const rev = row.updated || row.created;
  if (es.id !== id || (!es.dirty && es.rev !== rev)) Object.assign(es, { id, rev, draft: structuredClone(row), dirty: false });
  return row;
}
const preview = (c, est) => renderEstimate({ ...est, total: itemsTotal(est.items) }, { company: c.s.profile.name, contact: contactOf(c, est.contactId) });

function draftView(c, row) {
  const d = es.draft;
  const opportunities = c.s.opportunities.filter(item => !d.contactId || item.contactId === d.contactId);
  const field = (label, control, hint = '') => `<label class="es-field">${h(label)}${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
  return `<div class="page es-page">
    <header class="page-head"><div><a class="secondary fb-back" href="#payments/estimates">${icon('left', 15)} Orçamentos</a>
      <h1>${h(d.number)} · <span data-no-translate="1" data-es-title>${h(d.title)}</span></h1><p>${statusBadge(row)} <b data-es-sum>${money(itemsTotal(d.items))}</b> ${es.dirty ? badge('Alterações não salvas', 'blue') : ''}</p></div>
      <div class="head-actions"><button type="button" class="secondary" data-es-save${es.dirty ? '' : ' disabled'}>Salvar</button>
        <button type="button" class="primary" data-es-act="send" data-id="${h(row.id)}">${icon('send', 15)} Enviar</button>
        <button type="button" class="icon-btn" data-es-act="delete" data-id="${h(row.id)}" aria-label="Excluir" title="Excluir">${icon('trash', 16)}</button></div></header>
    <div class="es-grid"><form class="surface es-form" data-es-form="edit" novalidate>
      ${field('Nome do orçamento', `<input data-es="title" maxlength="160" value="${h(d.title)}">`)}
      <div class="es-two">${field('Cliente', `<select data-es="contactId"><option value="">Escolha…</option>${c.s.contacts.map(row => option(row.id, row.name, d.contactId)).join('')}</select>`)}
        ${field('Oportunidade', `<select data-es="opportunityId"><option value="">Nenhuma</option>${opportunities.map(row => option(row.id, row.title, d.opportunityId)).join('')}</select>`)}</div>
      <div class="es-two">${field('Emissão', `<input type="date" data-es="issueDate" value="${h(d.issueDate)}">`)}${field('Válido até', `<input type="date" data-es="expiresAt" value="${h(d.expiresAt || '')}">`, 'Depois disso o cliente não consegue mais aprovar.')}</div>
      <h2>Itens</h2>${lineItemsEditor(d.items, c.s.products, { taxes: c.s.paymentSettings?.taxes || [] })}
      ${field('Observações', `<textarea data-es="notes" rows="3" maxlength="2000">${h(d.notes)}</textarea>`)}
      ${field('Condições', `<textarea data-es="terms" rows="3" maxlength="4000" placeholder="Ex.: pagamento em até 7 dias após a aprovação.">${h(d.terms)}</textarea>`)}
      <fieldset class="dc-channels"><legend>Ao aprovar</legend><label><input type="checkbox" data-es="autoInvoice" ${d.autoInvoice !== false ? 'checked' : ''}><span><b>Criar a fatura automaticamente</b><small>O cliente vê o botão de pagar logo depois de aprovar.</small></span></label>
        ${d.autoInvoice !== false ? field('Vencimento da fatura (dias)', `<input type="number" data-es="invoiceDueDays" min="0" max="365" value="${h(d.invoiceDueDays ?? 7)}">`) : ''}</fieldset>
    </form><div class="es-preview" data-no-translate="1" data-es-preview>${preview(c, d)}</div></div></div>`;
}

function sentView(c, row) {
  const zone = c.s.profile.timezone;
  const invoice = row.invoiceId ? c.s.invoices.find(item => item.id === row.invoiceId) : null;
  const actions = {
    sent: `<button type="button" class="secondary" data-es-act="link" data-id="${h(row.id)}">Copiar novo link</button><button type="button" class="secondary" data-es-act="resend" data-id="${h(row.id)}">Reenviar</button>
      <button type="button" class="secondary" data-es-act="accepted" data-id="${h(row.id)}">Marcar como aceito</button><button type="button" class="secondary" data-es-act="declined" data-id="${h(row.id)}">Marcar como recusado</button>
      <button type="button" class="secondary" data-es-act="revise" data-id="${h(row.id)}">Revisar</button>`,
    accepted: `<button type="button" class="primary" data-es-act="invoice" data-id="${h(row.id)}">Faturar</button>`,
    declined: `<button type="button" class="secondary" data-es-act="revise" data-id="${h(row.id)}">Revisar</button>`,
    expired: `<button type="button" class="secondary" data-es-act="revise" data-id="${h(row.id)}">Revisar</button>`,
    invoiced: ''
  }[row.status] || '';
  const notes = { sent: `Enviado em ${fmt(row.sentAt, zone, true)}. O cliente aprova ou recusa pelo link${row.viewedAt ? ' (já abriu)' : ''}.`, accepted: `Aceito por ${row.acceptedBy || 'cliente'}. Fature para cobrar.`,
    invoiced: `Aceito por ${row.acceptedBy || 'cliente'} e faturado.`, declined: `Recusado${row.declineReason ? `: “${row.declineReason}”` : '.'} Revise para mandar outra versão.`, expired: 'A validade terminou. Revise para mandar de novo.' };
  return `<div class="page es-page">
    <header class="page-head"><div><a class="secondary fb-back" href="#payments/estimates">${icon('left', 15)} Orçamentos</a>
      <h1>${h(row.number)} · <span data-no-translate="1">${h(row.title)}</span></h1><p>${statusBadge(row)} <b>${money(row.total)}</b></p></div>
      <div class="head-actions">${actions}<button type="button" class="secondary" data-es-act="duplicate" data-id="${h(row.id)}">Duplicar</button></div></header>
    <p class="dc-locked surface" role="status">${h(notes[row.status] || '')}</p>
    <div class="es-grid sent"><div class="es-preview" data-no-translate="1">${preview(c, row)}</div>
      <aside class="dc-sent-side">${invoice ? `<section><h2>Fatura</h2><ul class="dc-pay-list"><li><span data-no-translate="1">${h(invoice.title)}</span><small>${money(invoice.value)} · vence ${h(fmt(invoice.due, zone))}</small>
          ${badge(...invoiceStateLabels[invoicePaymentState(invoice)])}</li></ul><a class="secondary" href="#payments/invoices">Ver em Faturas</a></section>` : ''}
        <section><h2>Trilha</h2><ol class="dc-trail">${[...(row.audit || [])].reverse().map(entry => `<li><b>${h(trailNames[entry.event] || entry.event)}</b> · ${h(fmt(entry.at, zone, true))}${entry.detail ? ` · <span data-no-translate="1">${h(entry.detail)}</span>` : ''}${entry.ip ? ` · IP ${h(entry.ip)}` : ''}</li>`).join('')}</ol></section></aside></div></div>`;
}

export function estimatesScreen(c) {
  if (c.tab !== 'estimate') return listView(c);
  const row = load(c);
  if (!row) return `<div class="page"><div class="surface empty">${icon('pay', 26)}<strong>Orçamento não encontrado</strong><p>Pode ter sido excluído.</p><a class="primary" href="#payments/estimates">Voltar aos orçamentos</a></div></div>`;
  return row.status === 'draft' ? draftView(c, row) : sentView(c, row);
}

/* ───────── Ações ───────── */

const linkDialog = path => `<div class="co-form"><p>Se o e-mail estiver configurado, o cliente já recebeu o link. Você também pode copiar e mandar por onde preferir:</p>
  <div class="dc-link-row"><input readonly value="${h(location.origin + path)}" aria-label="Link do orçamento"><button type="button" class="secondary" data-dc-copy="${h(location.origin + path)}">Copiar</button></div>
  <p class="dim">O link é pessoal: quem abre aprova em nome do cliente.</p><div class="co-form-actions"><button type="button" class="primary" data-act="close">Fechar</button></div></div>`;
const payload = d => ({ title: d.title, contactId: d.contactId, opportunityId: d.opportunityId, issueDate: d.issueDate, expiresAt: d.expiresAt, items: d.items, notes: d.notes, terms: d.terms,
  autoInvoice: d.autoInvoice !== false, invoiceDueDays: d.invoiceDueDays ?? 7 });

export function installEstimates(environment) {
  env = environment;
  const { c, mutate, flash, dialog, close } = env;
  const here = () => c.view === 'payments' && ['estimates', 'estimate'].includes(c.tab);
  const editing = () => c.view === 'payments' && c.tab === 'estimate' && es.draft?.status === 'draft';
  const render = () => { const top = document.querySelector('#screen')?.scrollTop || 0; env.render(); const screen = document.querySelector('#screen'); if (screen) screen.scrollTop = top; };
  const touch = () => {
    if (!es.dirty) { es.dirty = true; const save = document.querySelector('[data-es-save]'); if (save) save.disabled = false; }
    const preview = document.querySelector('[data-es-preview]'); if (preview) preview.innerHTML = renderEstimate({ ...es.draft, total: itemsTotal(es.draft.items) }, { company: c.s.profile.name, contact: contactOf(c, es.draft.contactId) });
    const sum = document.querySelector('[data-es-sum]'); if (sum) sum.textContent = money(itemsTotal(es.draft.items));
    const title = document.querySelector('[data-es-title]'); if (title) title.textContent = es.draft.title;
  };
  async function save() {
    await mutate({ type: 'save', key: 'estimates', id: es.id, data: payload(es.draft) });
    es.dirty = false; es.id = '';
    render(); flash('Orçamento salvo.');
  }

  window.addEventListener('beforeunload', event => { if (es.dirty && editing()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('input', event => {
    if (!editing()) return;
    const el = event.target;
    if (el.matches('[data-li]') && lineItemInput(es.draft.items, el)) { touch(); return; }
    if (el.matches('input[data-es], textarea[data-es]') && el.type !== 'checkbox') { es.draft[el.dataset.es] = el.type === 'number' ? Number(el.value) : el.value; touch(); }
  });
  document.addEventListener('change', event => {
    const el = event.target;
    if (here() && el.matches('[data-es-period]')) { es.period = el.value; render(); return; }
    if (!editing()) return;
    if (el.matches('[data-li], [data-li-add]')) { if (lineItemAction(es.draft.items, el, c.s.products, c.s.paymentSettings?.taxes || [])) { es.dirty = true; render(); } return; }
    if (el.matches('select[data-es], input[type=checkbox][data-es]')) {
      es.draft[el.dataset.es] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.es === 'contactId' && es.draft.opportunityId && c.s.opportunities.find(row => row.id === es.draft.opportunityId)?.contactId !== el.value) es.draft.opportunityId = '';
      es.dirty = true; render();
    }
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-es-act],[data-es-status],[data-es-save],[data-li-blank],[data-li-del],[data-li-move]');
    if (!el || !(here() || el.closest('#overlay'))) return;
    const ds = el.dataset;
    try {
      if (ds.esStatus) { es.status = ds.esStatus; render(); return; }
      if ('esSave' in ds) { el.disabled = true; await save(); return; }
      if (el.matches('[data-li-blank],[data-li-del],[data-li-move]')) { if (editing() && lineItemAction(es.draft.items, el, c.s.products, c.s.paymentSettings?.taxes || [])) { es.dirty = true; render(); } return; }
      const row = (c.s.estimates || []).find(item => item.id === ds.id);
      switch (ds.esAct) {
        case 'new':
          dialog('Novo orçamento', `<form class="co-form" data-es-form="new"><label>Nome<input name="title" required maxlength="160" placeholder="Ex.: Gestão de redes sociais"></label>
            <label>Cliente<select name="contactId"><option value="">Escolher depois</option>${c.s.contacts.map(item => option(item.id, item.name, '')).join('')}</select></label>
            <p class="form-status" role="alert" data-es-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Criar orçamento</button></div></form>`);
          return;
        case 'duplicate': {
          const id = await mutate({ type: 'save', key: 'estimates', data: { ...payload(row), title: `${row.title} (cópia)`, issueDate: '', expiresAt: '', items: row.items.map(item => ({ ...item, id: undefined })) } });
          flash('Orçamento duplicado.'); location.hash = `#payments/estimate/${id}`; return;
        }
        case 'delete':
          dialog('Excluir orçamento', `<form class="co-form" data-es-form="delete" data-id="${h(row.id)}"><p>O orçamento ${h(row.number)} será excluído. A fatura criada a partir dele, se houver, continua em Faturas.</p>
            <p class="form-status" role="alert" data-es-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir</button></div></form>`);
          return;
        case 'send':
          if (es.dirty) await save();
          dialog('Enviar orçamento', `<form class="co-form" data-es-form="send" data-id="${h(ds.id)}"><p>O cliente recebe um link para ver, escolher os itens opcionais e aprovar ou recusar. Depois de enviado, para mudar algo use “Revisar”.</p>
            <fieldset class="dc-channels"><legend>Enviar por</legend><label><input type="checkbox" checked disabled><span><b>E-mail</b></span></label><label><input type="checkbox" name="whatsapp"><span><b>WhatsApp também</b><small>Se o contato tiver telefone.</small></span></label></fieldset>
            <label>Assunto (opcional)<input name="subject" maxlength="160"></label><label>Mensagem (opcional)<textarea name="message" rows="3" maxlength="2000"></textarea></label>
            <p class="form-status" role="alert" data-es-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Enviar agora</button></div></form>`);
          return;
        case 'link': case 'resend': {
          const result = await mutate({ type: 'estimate-link', id: row.id, data: { notify: ds.esAct === 'resend' } });
          render();
          if (ds.esAct === 'resend') { flash('Link novo enviado. O anterior deixou de funcionar.'); return; }
          try { await navigator.clipboard.writeText(location.origin + result.path); flash('Link novo copiado. O anterior deixou de funcionar.'); } catch { dialog('Novo link', linkDialog(result.path)); }
          return;
        }
        case 'accepted': await mutate({ type: 'estimate-status', id: row.id, data: { status: 'accepted' } }); render(); flash(row.autoInvoice ? 'Orçamento aceito e faturado.' : 'Orçamento marcado como aceito.'); return;
        case 'declined':
          dialog('Marcar como recusado', `<form class="co-form" data-es-form="declined" data-id="${h(row.id)}"><label>Motivo (opcional)<input name="reason" maxlength="500"></label>
            <p class="form-status" role="alert" data-es-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Voltar</button><button class="danger" type="submit">Marcar como recusado</button></div></form>`);
          return;
        case 'revise': await mutate({ type: 'estimate-revise', id: row.id }); es.id = ''; render(); flash('Orçamento de volta a rascunho. O link anterior deixou de funcionar.'); return;
        case 'invoice': await mutate({ type: 'estimate-invoice', id: row.id }); render(); flash('Fatura criada em Pagamentos → Faturas.'); return;
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-es-form]');
    if (!form || form.dataset.esForm === 'edit') { if (form) event.preventDefault(); return; }
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-es-error]');
    submit.disabled = true; error.textContent = '';
    try {
      const kind = form.dataset.esForm, id = form.dataset.id;
      if (kind === 'new') { const created = await mutate({ type: 'save', key: 'estimates', data: { title: fields.get('title'), contactId: fields.get('contactId'), items: [] } }); close(); flash('Orçamento criado.'); location.hash = `#payments/estimate/${created}`; return; }
      if (kind === 'delete') { await mutate({ type: 'delete', key: 'estimates', id }); close(); flash('Orçamento excluído.'); if (c.tab === 'estimate') location.hash = '#payments/estimates'; else render(); return; }
      if (kind === 'declined') { await mutate({ type: 'estimate-status', id, data: { status: 'declined', reason: fields.get('reason') } }); close(); render(); flash('Orçamento marcado como recusado.'); return; }
      if (kind === 'send') {
        const result = await mutate({ type: 'estimate-send', id, data: { channels: fields.has('whatsapp') ? ['email', 'whatsapp'] : ['email'], subject: fields.get('subject'), message: fields.get('message') } });
        es.id = ''; render(); dialog('Orçamento enviado', linkDialog(result.path));
      }
    } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
  });
}
