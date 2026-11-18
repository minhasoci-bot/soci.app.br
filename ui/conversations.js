import { icon } from './icons.js';
import { badge, date, empty, h, name, pageShell, primary, row, search, table, utabs } from './screens.js';

export const conversationSections = ['manual-actions', 'snippets', 'folders', 'trigger-links', 'link-analysis', 'analytics', 'settings'];
const sections = [
  ['','Conversas'], ['manual-actions','Ações manuais'], ['snippets','Snippets'],
  ['trigger-links','Links de rastreamento'], ['analytics','Análises'], ['settings','Configurações']
];

export function conversationPage(c, inbox) {
  const selected = { folders: 'snippets', 'link-analysis': 'trigger-links' }[c.tab] || c.tab;
  const activeKey = conversationSections.includes(c.tab) ? selected : '';
  const panel = panels[c.tab];
  const isInbox = !panel;
  return pageShell({
    title: 'Conversas',
    desc: 'Gerencie atendimentos, ações manuais, snippets, links de rastreamento e metas de SLA.',
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
  const start = `<button class="primary" data-act="start-manual" ${queue.some(item => item.status === 'Pending') ? '' : 'disabled'}>Let's Start</button>`;

  return headline('Manual Actions', 'Work through calls and SMS follow-ups queued by workflows.', start) +
    `<div class="surface padded"><div class="toolbar conversation-filters">
      ${selectFilter('workflow','Workflow',filters.workflow || '',[['','All workflows'], ...workflows])}
      ${selectFilter('assignment','Assigned to',filters.assignment || '',[['','All assignees'], ...assignees])}
      ${selectFilter('manualType','Type',filters.manualType || '',[['','Any type'], 'Manual Call', 'Manual SMS'])}
      ${selectFilter('status','Status',filters.status ?? 'Pending',[['','All statuses'], 'Pending', 'Completed', 'Skipped', 'Canceled'])}
    </div>${table(['Contacts','Workflow','Assigned To','Type','Status','Date Added',''], items.map(item => `<tr>
      <td><b>${h(name(item.contactId,c))}</b></td><td>${h(item.workflowName)}</td><td>${h(item.assignee || 'Unassigned')}</td>
      <td>${h(item.type)}</td><td>${badge(item.status, item.status === 'Completed' ? 'green' : item.status === 'Pending' ? 'blue' : '')}</td>
      <td>${date(item.created,c,true)}</td><td class="right">${secondary(item.status === 'Pending' ? 'Open' : 'Details', `data-manual="${item.id}"`)}</td>
    </tr>`), empty((filters.status ?? 'Pending') === 'Pending' ? 'Good Work!' : 'No matching actions',
      (filters.status ?? 'Pending') === 'Pending' ? 'You have no pending tasks matching these filters.' : 'Try a different filter.', 'check'))}
      <div class="conversation-pagination"><span>${queue.length ? `${page * pageSize + 1}–${page * pageSize + items.length}` : '0'} of ${queue.length}</span>
        ${secondary('Previous', `data-manual-page="${page - 1}" ${page === 0 ? 'disabled' : ''}`)}
        ${secondary('Next', `data-manual-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''}`)}
      </div>
    </div>`;
}

function snippets(c) {
  const isFolders = c.tab === 'folders';
  const folder = c.conversationFilters.folder || '';
  const create = primary('New Folder','snippetFolders') + `<button class="primary" data-act="new-snippet">${icon('plus',16)} New Snippet</button>`;
  const folders = c.s.snippetFolders.filter(item => matches(c.query, item.name));
  const list = c.s.snippets.filter(item => (!folder || item.folderId === folder) && matches(c.query, item.name, item.body, item.subject));
  const subBody = `<div class="toolbar">${search(c.query, isFolders ? 'Search folders…' : 'Search snippets…')}
    ${isFolders ? '' : selectFilter('folder','Folder',folder,[['','All folders'], ...c.s.snippetFolders.map(item => [item.id,item.name])])}</div>` +
    (isFolders ? table(['Folder','Snippets','Date Updated',''], folders.map(item => row([
      `<button class="identity" data-open-folder="${item.id}">${icon('folder',16)}<strong>${h(item.name)}</strong></button>`,
      String(c.s.snippets.filter(snippet => snippet.folderId === item.id).length), date(item.updated || item.created,c,true)
    ], 'snippetFolders', item.id)), empty('No folders','Create a folder to organize snippets.','folder')) :
      table(['Name','Body','Folder','Type','Date Updated',''], list.map(item => row([
        `<b>${h(item.name)}</b>`, `<span class="ellipsis">${h(item.body)}</span>`, h(findLabel(c.s.snippetFolders,item.folderId)),
        badge(item.type,'blue'), date(item.updated || item.created,c,true)
      ], 'snippets', item.id)), empty('No snippets','Create a text or email snippet to use in the inbox.','chat')));
  return headline('Snippets', 'Save reusable text and email replies.', create) +
    utabs({ key: 'conversations-snippets', nested: true, items: [['snippets','All Snippets'],['folders','Folders']], current: c.tab, label: 'Snippets', content: subBody });
}

function triggerLinks(c) {
  const analyzing = c.tab === 'link-analysis';
  const clickCounts = new Map();
  for (const click of c.s.linkClicks) {
    const count = clickCounts.get(click.linkId) || { total:0, contacts:new Set(), recent:'' };
    count.total++;
    if (click.contactId) count.contacts.add(click.contactId);
    count.recent = click.created;
    clickCounts.set(click.linkId, count);
  }
  const links = c.s.triggerLinks.filter(item => matches(c.query,item.name,item.url));
  const content = analyzing ? table(['Name','Total clicks','Identified contacts','Last click'],links.map(item => {
    const count = clickCounts.get(item.id);
    return `<tr><td><b>${h(item.name)}</b></td><td>${count?.total || 0}</td><td>${count?.contacts.size || 0}</td><td>${date(count?.recent,c,true)}</td></tr>`;
  }),empty('No links available','Add a trigger link to view its clicks.','external')) : table(['Name','Link URL','Link Key','Date Added',''],links.map(item => row([
    `<b>${h(item.name)}</b>`, `<span class="ellipsis" title="${h(item.url)}">${h(item.url)}</span>`,
    secondary('Copy link', `data-copy-path="/r/${c.workspace}/${item.id}"`, 'external'), date(item.created,c,true)
  ],'triggerLinks',item.id)),empty('No links available','Create a link to track clicks on local messages.','external'));
  return headline('Trigger Links','Track link clicks and use them to start workflows.',primary('Add Link','triggerLinks')) +
    utabs({ key: 'conversations-links', nested: true, items: [['trigger-links','Link'],['link-analysis','Analyze']], current: c.tab, label: 'Trigger Links', content: `<div class="toolbar">${search(c.query,'Search links…')}</div>${content}` });
}

export function slaRecords(state, clock = Date.now()) {
  const settings = state.conversationSla;
  if (!settings.enabled || !settings.startedAt) return [];
  const pending = new Map();
  const dismissedUntil = new Map();
  const records = [];
  for (const message of state.messages) {
    if (message.created < settings.startedAt || !['Email','SMS'].includes(message.channel)) continue;
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
  const targets = settings.mode === 'channel' ? settings.channels[inbound.channel] : settings.common;
  const elapsed = Math.max(0, (until - new Date(inbound.created).getTime()) / 60000);
  const state = answered ? (elapsed >= targets.overdue ? 'Breached' : 'Met') :
    elapsed >= targets.overdue ? 'Overdue' : elapsed >= targets.soon ? 'Due soon' : 'Waiting';
  return { id: inbound.id, contactId: inbound.contactId, channel: inbound.channel, started: inbound.created, elapsed, answered, state };
}

function analytics(c) {
  const records = slaRecords(c.s);
  const channel = c.conversationFilters.slaChannel || '';
  const period = c.conversationFilters.period || '7';
  const start = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
  const filtered = records.filter(item => (!channel || item.channel === channel) && +new Date(item.started) >= start);
  const met = filtered.filter(item => item.state === 'Met').length;
  const missed = filtered.filter(item => item.state === 'Breached').length;
  const waiting = filtered.filter(item => ['Waiting','Due soon','Overdue'].includes(item.state)).length;
  const answered = filtered.filter(item => item.answered);
  const average = answered.length ? `${(answered.reduce((sum,item) => sum + item.elapsed,0) / answered.length).toFixed(1)} min` : '—';
  let body = empty('Response tracking is off','Turn on SLA tracking to measure how quickly you reply.', 'chart',
    '<a href="#conversations/settings" class="primary">Turn on SLA settings</a>');
  if (c.s.conversationSla.enabled) {
    body = `<div class="toolbar conversation-filters">${selectFilter('period','Period',period,[['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['all','All time']])}
      ${selectFilter('slaChannel','Channel',channel,[['','All channels'],'Email','SMS'])}</div>
      <div class="metrics">${[['Met',met],['Breached',missed],['Waiting for reply',waiting],['Average response',average]].map(([label,value]) =>
        `<div class="surface metric"><span>${label}</span><b>${value}</b></div>`).join('')}</div>` +
      table(['Contact','Channel','First message','Time elapsed','Result'],[...filtered].reverse().map(item => `<tr>
        <td><button class="identity" data-start-thread="${item.contactId}"><strong>${h(name(item.contactId,c))}</strong></button></td>
        <td>${item.channel}</td><td>${date(item.started,c,true)}</td><td>${item.elapsed.toFixed(1)} min</td>
        <td>${badge(item.state,item.state === 'Met' ? 'green' : ['Breached','Overdue'].includes(item.state) ? 'red' : 'blue')}</td></tr>`),
      empty('No SLA activity in this period','Log an incoming SMS or email to start timing a response.','chart'));
  }
  return headline('SLA overview','Monitor response times and see which conversations meet your targets.') + body;
}

function targetInputs(group, values) {
  return `<div class="field-grid"><label>Due soon (minutes)<input type="number" min="1" max="10079" name="${group}Soon" value="${values.soon}" required></label>
    <label>Overdue (minutes)<input type="number" min="2" max="10080" name="${group}Overdue" value="${values.overdue}" required></label></div>`;
}

function slaSettings(c) {
  const settings = c.s.conversationSla;
  return headline('SLA Settings','Set response time targets for incoming emails and SMS.') +
    `<form class="surface padded settings-form sla-form" data-form="conversation-sla">
      <label class="check"><input type="checkbox" name="enabled" role="switch" ${settings.enabled ? 'checked' : ''}> Enable SLA tracking</label>
      <fieldset><legend>Targets across channels</legend>
        <label class="check"><input type="radio" name="mode" value="common" ${settings.mode === 'common' ? 'checked' : ''}> Common SLA</label>
        <label class="check"><input type="radio" name="mode" value="channel" ${settings.mode === 'channel' ? 'checked' : ''}> Channel-specific SLA</label>
      </fieldset>
      <fieldset data-sla-mode="common" ${settings.mode !== 'common' ? 'hidden disabled' : ''}><legend>Common targets</legend>${targetInputs('common',settings.common)}</fieldset>
      <fieldset data-sla-mode="channel" ${settings.mode !== 'channel' ? 'hidden disabled' : ''}><legend>Targets by channel</legend>
        ${['SMS','Email'].map(channel => `<b>${channel}</b>${targetInputs(channel,settings.channels[channel] || settings.common)}`).join('')}
      </fieldset>
      <fieldset><legend>Which automation messages count as a reply?</legend>
        ${[['none','None'],['all','All workflow messages'],['selected','Only selected workflows']].map(([value,label]) =>
          `<label class="check"><input type="radio" name="automation" value="${value}" ${settings.automation === value ? 'checked' : ''}> ${label}</label>`).join('')}
        <label data-sla-workflows ${settings.automation !== 'selected' ? 'hidden' : ''}>Workflows
          <select name="workflows" multiple ${settings.automation !== 'selected' ? 'disabled' : ''}>${c.s.workflows.map(workflow =>
            `<option value="${workflow.id}" ${settings.workflows.includes(workflow.id) ? 'selected' : ''}>${h(workflow.name)}</option>`).join('')}</select>
        </label>
      </fieldset>
      <p class="form-status" role="alert"></p><button class="primary">Save</button>
    </form>`;
}

const panels = { 'manual-actions': manualActions, snippets, folders: snippets, 'trigger-links': triggerLinks,
  'link-analysis': triggerLinks, analytics, settings: slaSettings };
