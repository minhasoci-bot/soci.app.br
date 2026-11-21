import { icon } from './icons.js';
import { tr } from './i18n.js';
import { badge, date, empty, h, name, pageShell, primary, row, search, table, utabs } from './screens.js';
import { conversationStats, duration, volumeChart } from './conversation-analytics.js';
import { ticketsPanel } from './tickets.js';

export const SLA_CHANNELS = ['WhatsApp', 'Email', 'SMS', 'Live chat', 'Instagram', 'Facebook'];
export const conversationSections = ['tickets', 'manual-actions', 'snippets', 'folders', 'trigger-links', 'link-analysis', 'analytics', 'analytics-sla', 'settings'];
const sections = [
  ['','Conversas'], ['tickets','Tickets'], ['manual-actions','Ações manuais'], ['snippets','Respostas rápidas'],
  ['trigger-links','Links de rastreamento'], ['analytics','Análises'], ['settings','Configurações']
];

export function conversationPage(c, inbox) {
  const selected = { folders: 'snippets', 'link-analysis': 'trigger-links', 'analytics-sla': 'analytics' }[c.tab] || c.tab;
  const activeKey = conversationSections.includes(c.tab) ? selected : '';
  const panel = panels[c.tab];
  const isInbox = !panel;
  return pageShell({
    title: 'Conversas',
    desc: 'Gerencie atendimentos, ações manuais, respostas rápidas, links de rastreamento e metas de SLA.',
    className: isInbox ? 'conversations-page is-inbox' : 'conversations-page',
    tabs: {
      key: 'conversations',
      label: 'Seções de conversas',
      current: activeKey,
      flush: isInbox,
      fill: isInbox,
      items: sections.map(([id, label]) => ({ value: id, label, href: `#conversations${id ? `/${id}` : ''}` }))
    },
    content: panel ? panel(c) : inbox(c)
  });
}

const headline = (title, details, action = '') => `<div class="page-head"><div><h2>${title}</h2><p>${details}</p></div><div class="head-actions">${action}</div></div>`;
const findLabel = (items, id) => items.find(item => item.id === id)?.name || '—';
const matches = (q, ...values) => values.some(value => String(value || '').toLowerCase().includes(q.toLowerCase()));
const secondary = (label, attrs, ico = '') => `<button type="button" class="secondary" ${attrs}>${ico ? icon(ico, 16) : ''}${label}</button>`;

/** Label of a manual action type (the workflow stores the English key). */
export const manualType = type => type === 'Manual WhatsApp' ? 'WhatsApp manual' : tr(type);

export function manualQueue(c) {
  const { assignment = '', workflow = '', status = 'Pending', manualType = '' } = c.conversationFilters;
  return c.s.manualActions.filter(item => (!assignment || item.assignee === assignment) &&
    (!workflow || item.workflowId === workflow) && (!status || item.status === status) && (!manualType || item.type === manualType));
}

function selectFilter(id, label, value, choices) {
  return `<label class="conversation-filter">${label}<select data-conv-filter="${id}">${choices.map(choice => {
    const [key, text] = Array.isArray(choice) ? choice : [choice, choice];
    return `<option value="${h(key)}" ${key === value ? 'selected' : ''}>${h(text)}</option>`;
  }).join('')}</select></label>`;
}

function manualActions(c) {
  const filters = c.conversationFilters;
  const queue = manualQueue(c);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(queue.length / pageSize));
  const page = Math.min(pages - 1, Number(filters.manualPage || 0));
  const items = queue.slice(page * pageSize, (page + 1) * pageSize);
  const workflows = new Map(c.s.workflows.map(item => [item.id, item.name]));
  for (const item of c.s.manualActions) if (!workflows.has(item.workflowId)) workflows.set(item.workflowId, item.workflowName);
  const assignees = [...new Set(c.s.manualActions.map(item => item.assignee).filter(Boolean))].sort();
  const start = `<button class="primary" data-act="start-manual" ${queue.some(item => item.status === 'Pending') ? '' : 'disabled'}>Começar</button>`;

  return headline('Ações manuais', 'Ligações, mensagens de WhatsApp e SMS que os fluxos deixaram para a equipe fazer.', start) +
    `<div class="surface padded"><div class="toolbar conversation-filters">
      ${selectFilter('workflow','Fluxo de trabalho',filters.workflow || '',[['','Todos os fluxos'], ...workflows])}
      ${selectFilter('assignment','Atribuído a',filters.assignment || '',[['','Todos os responsáveis'], ...assignees])}
      ${selectFilter('manualType','Tipo',filters.manualType || '',[['','Qualquer tipo'], ['Manual Call', 'Ligação manual'], ['Manual WhatsApp', 'WhatsApp manual'], ['Manual SMS', 'SMS manual']])}
      ${selectFilter('status','Status',filters.status ?? 'Pending',[['','Todos os status'], ['Pending', 'Pendente'], ['Completed', 'Concluído'], ['Skipped', 'Ignorada'], ['Canceled', 'Cancelada']])}
    </div>${table(['Contatos','Fluxo de trabalho','Atribuído a','Tipo','Status','Data de adição',''], items.map(item => `<tr>
      <td><b>${h(name(item.contactId,c))}</b></td><td>${h(item.workflowName)}</td><td>${h(item.assignee || 'Não atribuído')}</td>
      <td>${h(manualType(item.type))}</td><td>${badge(item.status, item.status === 'Completed' ? 'green' : item.status === 'Pending' ? 'blue' : '')}</td>
      <td>${date(item.created,c,true)}</td><td class="right">${secondary(item.status === 'Pending' ? 'Abrir' : 'Detalhes', `data-manual="${item.id}"`)}</td>
    </tr>`), empty((filters.status ?? 'Pending') === 'Pending' ? 'Bom trabalho!' : 'Nenhuma ação encontrada',
      (filters.status ?? 'Pending') === 'Pending' ? 'Você não tem tarefas pendentes correspondentes a esses filtros.' : 'Tente um filtro diferente.', 'check'))}
      <div class="conversation-pagination"><span>${queue.length ? `${page * pageSize + 1}–${page * pageSize + items.length}` : '0'} de ${queue.length}</span>
        ${secondary('Anterior', `data-manual-page="${page - 1}" ${page === 0 ? 'disabled' : ''}`)}
        ${secondary('Próximo', `data-manual-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''}`)}
      </div>
    </div>`;
}

function snippets(c) {
  const isFolders = c.tab === 'folders';
  const folder = c.conversationFilters.folder || '';
  const create = primary('Nova pasta','snippetFolders') + `<button class="primary" data-act="new-snippet">${icon('plus',16)} Nova resposta rápida</button>`;
  const folders = c.s.snippetFolders.filter(item => matches(c.query, item.name));
  const list = c.s.snippets.filter(item => (!folder || item.folderId === folder) && matches(c.query, item.name, item.body, item.subject));
  const subBody = `<div class="toolbar">${search(c.query, isFolders ? 'Buscar pastas…' : 'Buscar respostas rápidas…')}
    ${isFolders ? '' : selectFilter('folder','Pasta',folder,[['','Todas as pastas'], ...c.s.snippetFolders.map(item => [item.id,item.name])])}</div>` +
    (isFolders ? table(['Pasta','Respostas rápidas','Data de atualização',''], folders.map(item => row([
      `<button class="identity" data-open-folder="${item.id}">${icon('folder',16)}<strong>${h(item.name)}</strong></button>`,
      String(c.s.snippets.filter(snippet => snippet.folderId === item.id).length), date(item.updated || item.created,c,true)
    ], 'snippetFolders', item.id)), empty('Nenhuma pasta encontrada','Crie uma pasta para organizar respostas rápidas.','folder')) :
      table(['Nome','Conteúdo','Pasta','Tipo','Data de atualização',''], list.map(item => row([
        `<b>${h(item.name)}</b>`, `<span class="ellipsis">${h(item.body)}</span>`, h(findLabel(c.s.snippetFolders,item.folderId)),
        badge(item.type,'blue'), date(item.updated || item.created,c,true)
      ], 'snippets', item.id)), empty('Nenhuma resposta rápida encontrada','Crie uma resposta de texto ou e-mail para usar na caixa de entrada.','chat')));
  return headline('Respostas rápidas', 'Salve respostas reutilizáveis de texto e e-mail.', create) +
    utabs({ key: 'conversations-snippets', nested: true, items: [['snippets','Todas as respostas'],['folders','Pastas']], current: c.tab, label: 'Respostas rápidas', content: subBody });
}

function triggerLinks(c) {
  const analyzing = c.tab === 'link-analysis';
  const period = c.conversationFilters.linkPeriod || '30';
  const since = period === 'all' ? '' : new Date(Date.now() - Number(period) * 86400000).toISOString();
  const clickCounts = new Map(), sentCounts = new Map();
  for (const click of c.s.linkClicks) {
    if (click.created < since) continue;
    const count = clickCounts.get(click.linkId) || { total:0, contacts:new Map(), recent:'' };
    count.total++;
    if (click.contactId) count.contacts.set(click.contactId, click.created);
    if (click.created > count.recent) count.recent = click.created;
    clickCounts.set(click.linkId, count);
  }
  // A ticket is one link sent to one contact in a message: the base for the click rate.
  for (const ticket of c.s.linkTickets) {
    if (ticket.created < since) continue;
    const sent = sentCounts.get(ticket.linkId) || { total:0, clicked:0 };
    sent.total++;
    if (ticket.clickedAt) sent.clicked++;
    sentCounts.set(ticket.linkId, sent);
  }
  const links = c.s.triggerLinks.filter(item => matches(c.query,item.name,item.url));
  const who = count => count?.contacts.size ? `<details class="link-who"><summary>${count.contacts.size} contato${count.contacts.size === 1 ? '' : 's'}</summary><ul>${[...count.contacts]
    .sort((a, b) => b[1].localeCompare(a[1])).slice(0, 50).map(([id, at]) => `<li><button class="identity" data-start-thread="${id}"><strong>${h(name(id,c))}</strong></button> <small class="dim">${date(at,c,true)}</small></li>`).join('')}</ul></details>` : '0';
  const content = analyzing ? `<div class="toolbar">${search(c.query,'Buscar links…')}${selectFilter('linkPeriod','Período',period,[['7','Últimos 7 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias'],['all','Todo o período']])}</div>` +
    table(['Nome','Enviados','Cliques','Quem clicou','Taxa de clique','Último clique'],links.map(item => {
    const count = clickCounts.get(item.id), sent = sentCounts.get(item.id);
    const rate = sent?.total ? `${Math.round(sent.clicked / sent.total * 100)}%` : '—';
    return `<tr><td><b>${h(item.name)}</b><br><small class="dim ellipsis">${h(item.url)}</small></td><td>${sent?.total || 0}</td><td>${count?.total || 0}</td><td>${who(count)}</td><td>${rate}</td><td>${count?.recent ? date(count.recent,c,true) : '—'}</td></tr>`;
  }),empty('Nenhum link disponível','Adicione um link de rastreamento para ver seus cliques.','external')) : table(['Nome','URL do link','Chave do link','Data de adição',''],links.map(item => row([
    `<b>${h(item.name)}</b>`, `<span class="ellipsis" title="${h(item.url)}">${h(item.url)}</span>`,
    secondary('Copiar link', `data-copy-path="/r/${c.workspace}/${item.id}"`, 'external'), date(item.created,c,true)
  ],'triggerLinks',item.id)),empty('Nenhum link disponível','Crie um link e insira na mensagem pelo botão “Inserir link” da conversa: cada contato recebe um endereço próprio.','external'));
  return headline('Links de rastreamento','Rastreie cliques em links e use para iniciar automações.',primary('Adicionar link','triggerLinks')) +
    utabs({ key: 'conversations-links', nested: true, items: [['trigger-links','Links'],['link-analysis','Análise']], current: c.tab, label: 'Links de rastreamento', content: analyzing ? content : `<div class="toolbar">${search(c.query,'Buscar links…')}</div>${content}` });
}

export function slaRecords(state, clock = Date.now()) {
  const settings = state.conversationSla;
  if (!settings.enabled || !settings.startedAt) return [];
  const pending = new Map();
  const dismissedUntil = new Map();
  const records = [];
  for (const message of state.messages) {
    if (message.created < settings.startedAt || !SLA_CHANNELS.includes(message.channel)) continue;
    const key = `${message.contactId}:${message.channel}`;
    if (message.direction === 'Inbound') {
      if (message.created <= (dismissedUntil.get(key) || '')) continue;
      if (message.slaDismissedAt) {
        dismissedUntil.set(key,message.slaDismissedAt);
        const record = makeSlaRecord(settings, pending.get(key) || message, +new Date(message.slaDismissedAt), false);
        records.push({ ...record, state:'Dismissed' });
        pending.delete(key);
        continue;
      }
      if (!pending.has(key)) pending.set(key, message);
      continue;
    }
    const inbound = pending.get(key);
    if (!inbound || message.origin === 'internal') continue;
    if (message.origin === 'workflow' && (settings.automation === 'none' ||
      (settings.automation === 'selected' && !settings.workflows.includes(message.workflowId)))) continue;
    records.push(makeSlaRecord(settings,inbound,new Date(message.created).getTime(),true));
    pending.delete(key);
  }
  for (const inbound of pending.values()) records.push(makeSlaRecord(settings,inbound,clock,false));
  return records;
}

function makeSlaRecord(settings, inbound, until, answered) {
  const targets = settings.mode === 'channel' ? settings.channels?.[inbound.channel] || settings.common : settings.common;
  const elapsed = Math.max(0, (until - new Date(inbound.created).getTime()) / 60000);
  const state = answered ? (elapsed >= targets.overdue ? 'Breached' : 'Met') :
    elapsed >= targets.overdue ? 'Overdue' : elapsed >= targets.soon ? 'Due soon' : 'Waiting';
  return { id: inbound.id, contactId: inbound.contactId, channel: inbound.channel, started: inbound.created, elapsed, answered, state };
}

function overview(c) {
  const f = c.conversationFilters, period = f.period || '30', channel = f.channel || '';
  const st = conversationStats(c.s, { days: period === 'all' ? 'all' : Number(period), channel, timeZone: c.s.profile?.timezone });
  const channels = [...new Set((c.s.messages || []).map(m => m.channel).filter(ch => ch && ch !== 'Note'))];
  const kpi = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
  const filters = `<div class="toolbar conversation-filters">${selectFilter('period', 'Período', period, [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['all', 'Todo o período']])}
    ${selectFilter('channel', 'Canal', channel, [['', 'Todos os canais'], ...channels.map(ch => [ch, tr(ch)])])}</div>`;
  if (!st.received && !st.sent) return filters + empty('Nenhuma mensagem neste período', 'As conversas de WhatsApp, e-mail, chat do site e redes sociais aparecem aqui.', 'chart');
  const waiting = st.waiting.slice(0, 8);
  const top = Math.max(1, ...st.origins.map(o => o.count));
  return filters + `<div class="metrics">${kpi('Conversas', st.conversations, `${st.newConversations} ${st.newConversations === 1 ? 'nova' : 'novas'}`)}${kpi('Recebidas', st.received, 'mensagens de clientes')}${kpi('Enviadas', st.sent, 'equipe, automações e IA')}
      ${kpi('Primeira resposta (mediana)', duration(st.medianResponse), st.responses ? `média ${duration(st.averageResponse)}` : 'sem respostas no período')}${kpi('Respondidas em até 1 h', pct(st.withinHour), `${st.responses} ${st.responses === 1 ? 'resposta' : 'respostas'}`)}${kpi('Aguardando resposta', st.waiting.length, st.waiting.length === 1 ? 'conversa' : 'conversas')}</div>
    <section class="surface padded ca-card"><div class="ca-head"><h3>Mensagens por dia</h3><span class="ca-legend"><i class="ca-in"></i>Recebidas <i class="ca-out"></i>Enviadas</span></div>${volumeChart(st.series)}</section>
    <div class="ca-grid"><section class="surface padded ca-card"><h3>Por canal</h3>${table(['Canal', 'Recebidas', 'Enviadas', '1ª resposta (mediana)'], st.channels.map(item => `<tr><td><b>${h(tr(item.channel))}</b></td><td>${item.received}</td><td>${item.sent}</td><td>${duration(item.median)}</td></tr>`), '')}</section>
      <section class="surface padded ca-card"><h3>Quem respondeu</h3>${st.origins.length ? `<ul class="ca-bars">${st.origins.map(item => `<li><span>${h(item.origin)}</span><b>${item.count}</b><i style="width:${Math.round(item.count / top * 100)}%"></i></li>`).join('')}</ul>` : '<p class="dim">Nenhuma mensagem enviada no período.</p>'}</section></div>
    <section class="surface padded ca-card"><h3>Aguardando resposta</h3>${waiting.length ? table(['Contato', 'Canal', 'Última mensagem', 'Esperando há'], waiting.map(item => `<tr><td><button class="identity" data-start-thread="${item.contactId}"><strong>${h(name(item.contactId, c))}</strong></button></td><td>${h(tr(item.channel))}</td><td><span class="ellipsis">${h(item.body)}</span></td><td>${badge(duration(item.minutes), item.minutes > 60 ? 'red' : 'blue')}</td></tr>`), '')
      + (st.waiting.length > waiting.length ? `<p class="dim">E mais ${st.waiting.length - waiting.length} conversas.</p>` : '') : '<p class="dim">Ninguém esperando: todas as mensagens recebidas foram respondidas.</p>'}</section>`;
}

function analytics(c) {
  const sla = c.tab === 'analytics-sla';
  return headline('Análises', 'Volume de mensagens, tempo da primeira resposta e metas de SLA.') +
    utabs({ key: 'conversations-analytics', nested: true, items: [['analytics', 'Visão geral'], ['analytics-sla', 'Desempenho de SLA']], current: c.tab, label: 'Análises', content: sla ? slaAnalytics(c) : overview(c) });
}

function slaAnalytics(c) {
  const records = slaRecords(c.s);
  const channel = c.conversationFilters.slaChannel || '';
  const period = c.conversationFilters.period || '30';
  const start = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
  const filtered = records.filter(item => (!channel || item.channel === channel) && +new Date(item.started) >= start);
  const met = filtered.filter(item => item.state === 'Met').length;
  const missed = filtered.filter(item => item.state === 'Breached').length;
  const waiting = filtered.filter(item => ['Waiting','Due soon','Overdue'].includes(item.state)).length;
  const answered = filtered.filter(item => item.answered);
  const average = answered.length ? `${(answered.reduce((sum,item) => sum + item.elapsed,0) / answered.length).toFixed(1)} min` : '—';
  let body = empty('Rastreamento de respostas desativado','Ative o rastreamento de SLA para medir a rapidez com que você responde.', 'chart',
    '<a href="#conversations/settings" class="primary">Ativar configurações de SLA</a>');
  if (c.s.conversationSla.enabled) {
    body = `<div class="toolbar conversation-filters">${selectFilter('period','Período',period,[['7','Últimos 7 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias'],['all','Todo o período']])}
      ${selectFilter('slaChannel','Canal',channel,[['','Todos os canais'],...SLA_CHANNELS.map(ch => [ch, tr(ch)])])}</div>
      <div class="metrics">${[['Cumprido',met],['Estourado',missed],['Aguardando resposta',waiting],['Tempo médio de resposta',average]].map(([label,value]) =>
        `<div class="surface metric"><span>${label}</span><b>${value}</b></div>`).join('')}</div>` +
      table(['Contato','Canal','Primeira mensagem','Tempo decorrido','Resultado'],[...filtered].reverse().map(item => `<tr>
        <td><button class="identity" data-start-thread="${item.contactId}"><strong>${h(name(item.contactId,c))}</strong></button></td>
        <td>${h(tr(item.channel))}</td><td>${date(item.started,c,true)}</td><td>${item.elapsed.toFixed(1)} min</td>
        <td>${badge(item.state,item.state === 'Met' ? 'green' : ['Breached','Overdue'].includes(item.state) ? 'red' : 'blue')}</td></tr>`),
      empty('Nenhuma atividade de SLA neste período','Quando chegar uma mensagem de um cliente, o tempo até a resposta começa a contar.','chart'));
  }
  return body;
}

function targetInputs(group, values) {
  return `<div class="field-grid"><label>Vence em breve (minutos)<input type="number" min="1" max="10079" name="${group}Soon" value="${values.soon}" required></label>
    <label>Atrasado (minutos)<input type="number" min="2" max="10080" name="${group}Overdue" value="${values.overdue}" required></label></div>`;
}

function slaSettings(c) {
  const settings = c.s.conversationSla;
  return headline('Configurações de SLA','Defina metas de tempo de resposta para as mensagens recebidas no WhatsApp, e-mail, SMS, chat do site e redes sociais.') +
    `<form class="surface padded settings-form sla-form" data-form="conversation-sla">
      <label class="check"><input type="checkbox" name="enabled" role="switch" ${settings.enabled ? 'checked' : ''}> Ativar rastreamento de SLA</label>
      <fieldset><legend>Metas por canais</legend>
        <label class="check"><input type="radio" name="mode" value="common" ${settings.mode === 'common' ? 'checked' : ''}> SLA comum</label>
        <label class="check"><input type="radio" name="mode" value="channel" ${settings.mode === 'channel' ? 'checked' : ''}> SLA específico por canal</label>
      </fieldset>
      <fieldset data-sla-mode="common" ${settings.mode !== 'common' ? 'hidden disabled' : ''}><legend>Metas gerais</legend>${targetInputs('common',settings.common)}</fieldset>
      <fieldset data-sla-mode="channel" ${settings.mode !== 'channel' ? 'hidden disabled' : ''}><legend>Metas por canal</legend>
        ${SLA_CHANNELS.map(channel => `<b>${h(tr(channel))}</b>${targetInputs(channel,settings.channels[channel] || settings.common)}`).join('')}
      </fieldset>
      <fieldset><legend>Quais mensagens de automação contam como resposta?</legend>
        ${[['none','Nenhuma'],['all','Todas as mensagens de fluxos de trabalho'],['selected','Apenas fluxos de trabalho selecionados']].map(([value,label]) =>
          `<label class="check"><input type="radio" name="automation" value="${value}" ${settings.automation === value ? 'checked' : ''}> ${label}</label>`).join('')}
        <label data-sla-workflows ${settings.automation !== 'selected' ? 'hidden' : ''}>Fluxos de trabalho
          <select name="workflows" multiple ${settings.automation !== 'selected' ? 'disabled' : ''}>${c.s.workflows.map(workflow =>
            `<option value="${workflow.id}" ${settings.workflows.includes(workflow.id) ? 'selected' : ''}>${h(workflow.name)}</option>`).join('')}</select>
        </label>
      </fieldset>
      <p class="form-status" role="alert"></p><button class="primary">Salvar</button>
    </form>`;
}

const panels = { tickets: ticketsPanel, 'manual-actions': manualActions, snippets, folders: snippets, 'trigger-links': triggerLinks,
  'link-analysis': triggerLinks, analytics, 'analytics-sla': analytics, settings: slaSettings };
