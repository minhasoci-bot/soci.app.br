// Conversas → Tickets (6b.1): the helpdesk list (filters, SLA), one ticket (customer messages and team events
// in one timeline, reply through the conversation's channel, internal notes, status, priority, owner) and the
// settings (categories, SLA hours per priority, auto-create from new conversations).
import { icon } from './icons.js';
import { badge, date, h } from './screens.js';
import { slaState, ticketPriorities, ticketStatuses } from './ticket-data.js';

const ui = { status: 'active', priority: '', assignee: '', query: '', open: '', settings: false };
const label = (list, key) => list.find(([k]) => k === key)?.[1] || key;
const tone = (list, key) => list.find(([k]) => k === key)?.[2] || '';
const channels = ['Email', 'WhatsApp', 'SMS', 'Live chat', 'Note'];

function list(c) {
  const contact = id => c.s.contacts.find(row => row.id === id);
  const q = ui.query.toLowerCase();
  const rows = (c.s.tickets || []).filter(t => (ui.status === 'all' || (ui.status === 'active' ? !['resolved', 'closed'].includes(t.status) : t.status === ui.status))
    && (!ui.priority || t.priority === ui.priority) && (!ui.assignee || t.assignee === ui.assignee)
    && (!q || `#${t.number} ${t.subject} ${contact(t.contactId)?.name || ''} ${contact(t.contactId)?.email || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => ticketPriorities.findIndex(([k]) => k === b.priority) - ticketPriorities.findIndex(([k]) => k === a.priority) || String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const assignees = [...new Set((c.s.tickets || []).map(t => t.assignee).filter(Boolean))].sort();
  const select = (key, options, all) => `<select data-tk-filter="${key}" aria-label="${all}"><option value="">${all}</option>${options.map(([value, text]) => `<option value="${h(value)}"${ui[key] === value ? ' selected' : ''}>${h(text)}</option>`).join('')}</select>`;
  return `<div class="tx-filters"><label class="search">${icon('search', 15)}<input data-tk-query value="${h(ui.query)}" placeholder="Buscar ticket, contato ou número" aria-label="Buscar tickets"></label>
      <select data-tk-filter="status" aria-label="Situação">${[['active', 'Em aberto'], ['all', 'Todos'], ...ticketStatuses.map(([k, l]) => [k, l])].map(([value, text]) => `<option value="${value}"${ui.status === value ? ' selected' : ''}>${text}</option>`).join('')}</select>
      ${select('priority', ticketPriorities.map(([k, l]) => [k, l]), 'Todas as prioridades')}${select('assignee', assignees.map(name => [name, name]), 'Todos os responsáveis')}</div>
    ${rows.length ? `<ul class="tx-list">${rows.map(t => { const who = contact(t.contactId), sla = slaState(t);
      return `<li><button type="button" class="tx-row${ui.open === t.id ? ' active' : ''}" data-tk="open" data-id="${h(t.id)}">
        <span class="tx-num">#${t.number}</span><span class="tx-main"><b>${h(t.subject)}</b><small>${h(who?.name || 'Contato excluído')}${t.category ? ` · ${h(t.category)}` : ''}${t.assignee ? ` · ${h(t.assignee)}` : ''}</small></span>
        <span class="tx-tags">${badge(label(ticketPriorities, t.priority), tone(ticketPriorities, t.priority))}${badge(label(ticketStatuses, t.status), tone(ticketStatuses, t.status))}${sla === 'late' ? badge('SLA vencido', 'red') : sla === 'soon' ? badge('SLA perto', 'gold') : ''}</span></button></li>`; }).join('')}</ul>`
      : `<div class="empty">${icon('inbox', 26)}<strong>Nenhum ticket aqui</strong><p>Crie um ticket a partir de uma conversa, aqui ou por uma automação.</p></div>`}`;
}

function detail(c, t) {
  const who = c.s.contacts.find(row => row.id === t.contactId);
  const messages = c.s.messages.filter(m => m.contactId === t.contactId && m.channel !== 'Note' && Date.parse(m.created) >= Date.parse(t.created) - 3600000 && !m.ticketId)
    .map(m => ({ at: m.created, kind: m.direction === 'Inbound' ? 'customer' : 'message', text: m.body, by: m.direction === 'Inbound' ? who?.name || 'Cliente' : 'Equipe', channel: m.channel }));
  const events = [...(t.events || []).filter(e => e.kind !== 'customer').map(e => ({ ...e })), ...messages].sort((a, b) => a.at.localeCompare(b.at));
  const kindLabel = { created: 'Abriu o ticket', note: 'Nota interna', reply: 'Respondeu', status: 'Situação', priority: 'Prioridade', assign: 'Responsável', customer: 'Cliente', message: 'Mensagem enviada' };
  const users = (c.agency?.users || []).map(u => u.name).filter(Boolean);
  const due = iso => iso ? date(iso, c, true) : '—';
  return `<article class="surface tx-detail"><header><div><small class="dim">Ticket #${t.number} · ${h({ manual: 'Criado pela equipe', inbound: 'De uma conversa nova', workflow: 'Por automação', portal: 'Pelo portal' }[t.source] || '')}</small>
      <h2>${h(t.subject)}</h2><p><button type="button" class="text-link" data-edit="contacts" data-id="${h(t.contactId)}">${h(who?.name || 'Contato')}</button>${who?.email ? ` · ${h(who.email)}` : ''}${who?.phone ? ` · ${h(who.phone)}` : ''}</p></div>
      <button type="button" class="icon-btn" data-tk="close" aria-label="Fechar detalhe">${icon('close', 16)}</button></header>
    <div class="tx-fields">
      <label>Situação<select data-tk-set="status">${ticketStatuses.map(([k, l]) => `<option value="${k}"${t.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Prioridade<select data-tk-set="priority">${ticketPriorities.map(([k, l]) => `<option value="${k}"${t.priority === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Responsável<input data-tk-set="assignee" list="tx-users" value="${h(t.assignee)}" placeholder="Ninguém"><datalist id="tx-users">${users.map(name => `<option value="${h(name)}">`).join('')}</datalist></label>
      <label>Categoria<select data-tk-set="category"><option value="">Sem categoria</option>${(c.s.ticketSettings?.categories || []).map(cat => `<option${t.category === cat ? ' selected' : ''}>${h(cat)}</option>`).join('')}</select></label></div>
    <p class="tx-sla"><span>1ª resposta: ${t.firstResponseAt ? `${badge('feita', 'green')} ${h(date(t.firstResponseAt, c, true))}` : `até ${h(due(t.dueFirstResponse))}`}</span><span>Resolução: ${t.resolvedAt ? `${badge('feita', 'green')} ${h(date(t.resolvedAt, c, true))}` : `até ${h(due(t.dueResolution))}`}</span>
      ${slaState(t) === 'late' ? badge('SLA vencido', 'red') : ''}</p>
    <ol class="tx-timeline">${events.map(e => `<li class="tx-${e.kind}"><div><b>${h(kindLabel[e.kind] || e.kind)}</b>${e.by ? ` · ${h(e.by)}` : ''}${e.channel ? ` · ${h(e.channel)}` : ''}<small>${h(date(e.at, c, true))}</small></div>${e.text ? `<p>${h(e.text)}</p>` : ''}</li>`).join('')}</ol>
    <form class="tx-reply" data-tk-form="reply" data-id="${h(t.id)}">
      <div class="tx-mode" role="tablist"><label><input type="radio" name="mode" value="reply" checked> Responder ao cliente</label><label><input type="radio" name="mode" value="note"> Nota interna</label></div>
      <textarea name="body" rows="4" maxlength="5000" required placeholder="Escreva aqui…"></textarea>
      <div class="tx-actions"><label>Canal<select name="channel">${channels.filter(ch => ch !== 'Note').map(ch => `<option${(t.channel || (who?.email ? 'Email' : 'WhatsApp')) === ch ? ' selected' : ''}>${ch}</option>`).join('')}</select></label>
        <label>Depois<select name="status"><option value="">Aguardar cliente</option><option value="pending">Manter em andamento</option><option value="resolved">Marcar como resolvido</option></select></label>
        <button class="primary">${icon('send', 15)} Enviar</button></div><p class="form-status" role="alert"></p></form></article>`;
}

function settingsView(c) {
  const t = { categories: [], autoFromInbound: false, sla: {}, ...(c.s.ticketSettings || {}) };
  return `<form class="surface settings-form set-form tx-settings" data-tk-form="settings"><section class="set-section"><header class="set-head"><h2>Categorias e abertura</h2><p class="dim">Como os tickets são organizados e quando um abre sozinho.</p></header><div class="set-body">
    <label>Categorias (uma por linha)<textarea name="categories" rows="4">${h((t.categories || []).join('\n'))}</textarea></label>
    <label class="switch-row"><span><b>Criar ticket para cada conversa nova</b><br><small class="dim">Quando um contato sem ticket aberto manda mensagem, abre um ticket com a mensagem. Uma mensagem num ticket resolvido reabre o mesmo ticket.</small></span><input type="checkbox" name="autoFromInbound"${t.autoFromInbound ? ' checked' : ''}></label></div></section><section class="set-section"><header class="set-head"><h2>Prazos de SLA (horas)</h2><p class="dim">Primeira resposta e resolução, por prioridade.</p></header><div class="set-body"><div class="tx-sla-grid"><b></b><b>1ª resposta</b><b>Resolução</b>${ticketPriorities.map(([k, l]) => `<span>${l}</span><input type="number" min="1" max="720" name="first.${k}" value="${h(t.sla[k]?.first ?? '')}"><input type="number" min="1" max="2160" name="resolve.${k}" value="${h(t.sla[k]?.resolve ?? '')}">`).join('')}</div>
</div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button type="button" class="secondary" data-tk="settings-close">Voltar</button><button class="primary">Salvar</button></footer></form>`;
}

export function ticketsPanel(c) {
  const open = ui.open && (c.s.tickets || []).find(t => t.id === ui.open);
  const counts = { open: 0, late: 0 }; for (const t of c.s.tickets || []) { if (!['resolved', 'closed'].includes(t.status)) counts.open++; if (slaState(t) === 'late') counts.late++; }
  return `<div class="page-head"><div><h2>Tickets</h2><p>${counts.open} em aberto${counts.late ? ` · ${counts.late} com SLA vencido` : ''}. Cada ticket fica ligado à conversa do contato; as respostas saem pelo canal escolhido.</p></div>
      <div class="head-actions"><button type="button" class="secondary" data-tk="settings">${icon('gear', 15)} Configurações</button><button type="button" class="primary" data-tk="new">${icon('plus', 15)} Novo ticket</button></div></div>
    ${ui.settings ? settingsView(c) : `<div class="tx-layout${open ? ' has-detail' : ''}"><section>${list(c)}</section>${open ? detail(c, open) : ''}</div>`}`;
}

export function newTicketForm(c, contactId = '') {
  const contacts = c.s.contacts.slice(0, 500);
  return `<form class="settings-form" data-tk-form="new"><label>Contato<select name="contactId" required><option value="">Escolha…</option>${contacts.map(row => `<option value="${h(row.id)}"${row.id === contactId ? ' selected' : ''}>${h(row.name || row.email)}</option>`).join('')}</select></label>
    <label>Assunto<input name="subject" required maxlength="160"></label><label>Descrição<textarea name="description" rows="4" maxlength="5000"></textarea></label>
    <div class="field-grid"><label>Prioridade<select name="priority">${ticketPriorities.map(([k, l]) => `<option value="${k}"${k === 'medium' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Categoria<select name="category"><option value="">Sem categoria</option>${(c.s.ticketSettings?.categories || ['Dúvida', 'Problema técnico', 'Financeiro', 'Pedido']).map(cat => `<option>${h(cat)}</option>`).join('')}</select></label></div>
    <div class="tx-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Criar ticket</button></div><p class="form-status" role="alert"></p></form>`;
}

export function installTickets({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'conversations' && c.tab === 'tickets';
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-tk]');
    if (!el) return;
    const act = el.dataset.tk;
    if (act === 'new-from-thread') { dialog('Novo ticket', newTicketForm(c, el.dataset.contact)); return; }
    if (!here()) return;
    if (act === 'open') { ui.open = el.dataset.id; render(); document.querySelector('.tx-detail')?.scrollIntoView({ block: 'nearest' }); }
    if (act === 'close') { ui.open = ''; render(); }
    if (act === 'new') dialog('Novo ticket', newTicketForm(c));
    if (act === 'settings') { ui.settings = true; render(); }
    if (act === 'settings-close') { ui.settings = false; render(); }
  });
  document.addEventListener('change', async event => {
    if (!here()) return;
    const el = event.target;
    if (el.matches('[data-tk-filter]')) { ui[el.dataset.tkFilter] = el.value; render(); return; }
    if (el.matches('[data-tk-set]')) {
      try { await mutate({ type: 'ticket-update', id: ui.open, data: { [el.dataset.tkSet]: el.value } }); render(); flash('Ticket atualizado.'); }
      catch (error) { flash(error.message, true); render(); }
    }
  });
  document.addEventListener('input', event => {
    if (here() && event.target.matches('[data-tk-query]')) { ui.query = event.target.value; render(); const box = document.querySelector('[data-tk-query]'); box?.focus(); box?.setSelectionRange(ui.query.length, ui.query.length); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-tk-form]');
    // Rastreamento and Pontuação also use data-tk-form: outside the tickets tab only "Novo ticket" (opened from a
    // conversation) is ours, or saving those screens would also send an empty ticket-settings.
    if (!form || !(here() || form.dataset.tkForm === 'new')) return;
    event.preventDefault();
    const f = new FormData(form), status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try {
      if (form.dataset.tkForm === 'new') {
        const id = await mutate({ type: 'ticket-create', data: Object.fromEntries(f) });
        close(); ui.open = id; ui.status = 'active';
        if (c.view === 'conversations' && c.tab === 'tickets') render(); else location.hash = '#conversations/tickets';
        flash('Ticket criado.');
      } else if (form.dataset.tkForm === 'reply') {
        const note = f.get('mode') === 'note';
        await mutate(note ? { type: 'ticket-note', id: form.dataset.id, data: { text: f.get('body') } } : { type: 'ticket-reply', id: form.dataset.id, data: { body: f.get('body'), channel: f.get('channel'), status: f.get('status') } });
        render(); flash(note ? 'Nota adicionada.' : 'Resposta enviada.');
      } else {
        const sla = Object.fromEntries(['low', 'medium', 'high', 'urgent'].map(k => [k, { first: Number(f.get(`first.${k}`)), resolve: Number(f.get(`resolve.${k}`)) }]));
        await mutate({ type: 'ticket-settings', data: { categories: f.get('categories'), autoFromInbound: f.has('autoFromInbound'), sla } });
        ui.settings = false; render(); flash('Configurações salvas.');
      }
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
