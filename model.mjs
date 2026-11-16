import { randomUUID } from 'node:crypto';
import { changeDashboard } from './dashboard-model.mjs';
import { defaultDashboard, opportunityStatuses, salesPipeline } from './ui/dashboard-data.js';
import { studioTemplates, studioThemes } from './ui/studio-data.js';

export const defaults = {
  profile: { name: 'Demo Workspace', email: 'hello@example.test', phone: '', timezone: 'America/Sao_Paulo', currency: 'BRL' },
  onboarding: { kind: '', goal: '', done: false },
  pipelines:[{ id:salesPipeline, name:'Sales Pipeline' }],
  stages: [{ id: 'new', name: 'New Lead' }, { id: 'qualified', name: 'Qualified' }, { id: 'proposal', name: 'Proposal' }, { id: 'won', name: 'Won', visible:false }].map(stage => ({ ...stage, pipelineId:salesPipeline })),
  contacts: [], tasks: [], opportunities: [], messages: [], appointments: [], workflows: [], runs: [], invoices: [],
  campaigns: [], pages: [], forms: [], submissions: [], courses: [], files: [], reviews: [], agents: [], integrations: [],
  manualActions: [], snippetFolders: [], snippets: [], triggerLinks: [], linkTickets: [], linkClicks: [],
  dashboards:[defaultDashboard()], dashboardReports:[], studioProjects:[],
  conversationSla: { enabled: false, mode: 'common', common: { soon: 3, overdue: 5 }, channels: {}, automation: 'none', workflows: [], startedAt: '' }
};
export const blank = name => ({ ...structuredClone(defaults), profile: { ...defaults.profile, ...(name ? { name } : {}) } });
export function hydrateWorkspace(state) {
  const fresh = blank();
  const additions = ['manualActions','snippetFolders','snippets','triggerLinks','linkTickets','linkClicks','pipelines','dashboards','dashboardReports','studioProjects'];
  for (const key of additions) state[key] ??= fresh[key];
  for (const stage of state.stages) {
    stage.pipelineId ||= salesPipeline;
    if (stage.id === 'won') stage.visible ??= false;
  }
  const pipelineByStage = new Map(state.stages.map(stage => [stage.id,stage.pipelineId]));
  for (const deal of state.opportunities) {
    deal.pipelineId ||= pipelineByStage.get(deal.stage) || salesPipeline;
    deal.statusChangedAt ||= deal.created;
  }
  state.conversationSla = { ...fresh.conversationSla, ...state.conversationSla };
  return state;
}
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Choose a valid ${label}.`);
const amount = value => {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) fail('Enter a valid amount.');
  return Math.round(Number(value) * 100) / 100;
};
const date = value => { const d = new Date(req(value, 'Date')); if (!Number.isFinite(+d)) fail('Enter a valid date.'); return d.toISOString(); };
const email = value => { const v = str(value).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Enter a valid email address.'); return v; };
const file = value => { if (typeof value !== 'string' || value.length > 1000000 || !/^data:(?:image\/(?:png|jpeg|gif|webp)|application\/pdf);base64,[A-Za-z0-9+/]+=*$/.test(value)) fail('Choose a PNG, JPEG, GIF, WebP or PDF under 700 KB.'); return value; };
const tags = value => [...new Set((Array.isArray(value) ? value : str(value).split(',')).map(a => str(a, 48)).filter(Boolean))].slice(0, 20);
export const triggers = ['Contact created', 'Form submitted', 'Opportunity stage changed', 'Appointment booked', 'Trigger link clicked'];
export const manualTypes = ['Manual Call', 'Manual SMS'];
export const actionTypes = ['Add tag', 'Create task', 'Create opportunity', 'Log message', ...manualTypes];
export const messageChannels = ['Note', 'Email', 'SMS'];
export const find = (state, key, id) => state[key].find(a => a.id === id);
const exists = (state, key, value, label, optional = false) => (!value && optional) ? '' : find(state, key, value)?.id ?? fail(`Choose a valid ${label}.`);
function add(state, key, data) { const row = { id: uid(), created: now(), ...data }; state[key].push(row); return row; }
const contactId = (s,v,optional = false) => exists(s, 'contacts', v, 'contact', optional);
const fields = {
  contacts: (s, d) => ({ name: req(d.name, 'Name'), email: email(d.email), phone: str(d.phone, 48), company: str(d.company), tags: tags(d.tags), notes: str(d.notes, 5000) }),
  tasks: (s, d) => ({ title: req(d.title, 'Title'), contactId: contactId(s,d.contactId,true), due: d.due ? date(d.due) : '', done: Boolean(d.done), owner:str(d.owner,80), notes:str(d.notes,2500) }),
  opportunities: (s, d) => {
    const stage = find(s,'stages',d.stage);
    if (!stage) fail('Choose a valid stage.');
    return { title:req(d.title,'Name'), contactId:contactId(s,d.contactId), stage:stage.id, pipelineId:stage.pipelineId,
      value:amount(d.value ?? 0), status:one(d.status || 'Open',opportunityStatuses,'status'), source:str(d.source,80), owner:str(d.owner,80) };
  },
  appointments: (s, d) => {
    const start = date(d.start), end = date(d.end);
    if (end <= start) fail('End time must be after start time.');
    if (s.appointments.some(a => a.id !== d.id && a.status !== 'Canceled' && d.status !== 'Canceled' && a.start < end && a.end > start)) fail('This time overlaps an existing appointment.');
    return { title: req(d.title, 'Title'), contactId: contactId(s,d.contactId,true), start, end, status: one(d.status || 'Confirmed',['Confirmed','Completed','Canceled'],'status'), notes: str(d.notes, 3000) };
  },
  workflows: (s, d) => {
    const actions = Array.isArray(d.actions) ? d.actions.slice(0,10).map(a => {
      const type = one(a?.type, actionTypes, 'action');
      const action = { type, value: req(a.value, 'Action value', 500) };
      if (manualTypes.includes(type)) action.assignee = str(a.assignee, 80);
      if (type === 'Log message') action.channel = one(a.channel || 'Note', messageChannels, 'channel');
      return action;
    }) : [];
    if (!actions.length) fail('Add at least one workflow action.');
    const trigger = one(d.trigger,triggers,'trigger');
    const linkId = trigger === 'Trigger link clicked' ? exists(s, 'triggerLinks', d.linkId, 'trigger link', true) : '';
    return { name: req(d.name,'Name'), trigger, linkId, actions, active: Boolean(d.active) };
  },
  invoices: (s,d) => ({ title: req(d.title,'Invoice name'), contactId: contactId(s,d.contactId), value: amount(d.value), due: date(d.due), status: one(d.status || 'Draft',['Draft','Open','Paid','Void'],'status') }),
  campaigns: (s,d) => ({ name: req(d.name,'Campaign name'), channel: one(d.channel,['Email','Social'],'channel'), body: req(d.body,'Content',5000), date: d.date ? date(d.date) : '', status: one(d.status || 'Draft',['Draft','Planned','Archived'],'status') }),
  pages: (s,d) => ({ name: req(d.name,'Page name'), headline: req(d.headline,'Headline'), body: str(d.body,5000), button: str(d.button,80), formId: exists(s,'forms',d.formId,'form',true), kind: one(d.kind,['Website','Funnel'],'page type'), active: Boolean(d.active) }),
  forms: (s,d) => ({ name: req(d.name,'Form name'), description: str(d.description,1500), askPhone: Boolean(d.askPhone), active: Boolean(d.active) }),
  courses: (s,d) => ({ name: req(d.name,'Course name'), description: str(d.description,2500), lesson: req(d.lesson,'Lesson title'), body: str(d.body,5000), active: Boolean(d.active) }),
  reviews: (s,d) => ({ author: req(d.author,'Author'), score: one(Number(d.score),[1,2,3,4,5],'rating'), text: req(d.text,'Review',2500), reply: str(d.reply,2500) }),
  files: (s,d) => ({ name: req(d.name,'File name'), data: file(d.data) }),
  agents: (s,d) => ({ name: req(d.name,'Agent name'), role: one(d.role,['Support','Sales','Scheduling'],'role'), instructions: str(d.instructions,5000), active: Boolean(d.active) }),
  snippetFolders: (s,d) => ({ name: req(d.name, 'Folder name', 100) }),
  snippets: (s,d) => {
    const type = one(d.type, ['Text', 'Email'], 'snippet type');
    return {
      name: req(d.name, 'Snippet name', 100), type,
      subject: type === 'Email' ? req(d.subject, 'Subject', 240) : '',
      body: req(d.body, 'Message', 5000), folderId: exists(s, 'snippetFolders', d.folderId, 'folder', true)
    };
  },
  triggerLinks: (s,d) => ({ name: req(d.name, 'Link name', 100), url: linkDestination(d.url) }),
  studioProjects: (s,d) => {
    const blocks = d.blocks === undefined ? [] : d.blocks;
    if (!Array.isArray(blocks) || blocks.length > 12) fail('A project can have up to 12 sections.');
    const name = req(d.name,'Project name',80);
    return { name, headline:str(d.headline,140) || name, summary:str(d.summary,1500),
      brief:req(d.brief,'Brief',4000), theme:one(d.theme,studioThemes,'theme'), template:one(d.template,studioTemplates.map(item => item[0]),'template'),
      blocks:blocks.map(block => ({ title:req(block?.title,'Section title',100),body:str(block?.body,2200) })),
      reference:str(d.reference,500) };
  }
};
// Metadata mirrored from the project's site row: page list, publication and the form that receives its leads.
function studioMeta(s, id, d) {
  const project = find(s,'studioProjects',id);
  if (!project) fail('Project not found.',404);
  if (d.name !== undefined) project.name = req(d.name,'Project name',80);
  if (Array.isArray(d.pages)) project.pages = d.pages.slice(0,8).map(p => ({ id:str(p?.id,40), name:str(p?.name,60), slug:str(p?.slug,48) }));
  if (d.publishedAt !== undefined) project.publishedAt = d.publishedAt ? date(d.publishedAt) : '';
  if (d.formId !== undefined) project.formId = exists(s,'forms',d.formId,'form',true);
  if (d.rev !== undefined) project.rev = Number.isInteger(d.rev) ? d.rev : project.rev;
  if (d.publishedRev !== undefined) project.publishedRev = Number.isInteger(d.publishedRev) ? d.publishedRev : 0;
  project.updated = now();
  return id;
}
function linkDestination(value) {
  const input = req(value, 'Link URL', 2000);
  try {
    const target = new URL(input);
    if (['https:', 'http:'].includes(target.protocol) && !target.username && !target.password) return target.href;
  } catch { /* Report the field error below. */ }
  fail('Enter an HTTP or HTTPS URL without credentials.');
}

function continueRun(state, run) {
  const contact = find(state, 'contacts', run.contactId);
  for (; run.nextAction < run.actions.length; run.nextAction++) {
    const action = run.actions[run.nextAction];
    if (!contact && action.type !== 'Create task') {
      run.results.push(`${action.type}: no linked contact`);
      continue;
    }
    if (manualTypes.includes(action.type)) {
      add(state, 'manualActions', {
        runId: run.id, workflowId: run.workflowId, workflowName: run.name, contactId: contact.id,
        type: action.type, instructions: action.value, assignee: action.assignee || '', status: 'Pending'
      });
      run.status = 'Waiting';
      run.results.push(`${action.type}: waiting for a manual action`);
      run.nextAction++;
      return;
    }
    if (action.type === 'Add tag') contact.tags = tags([...contact.tags, action.value]);
    if (action.type === 'Create task') add(state, 'tasks', { title: action.value, contactId: contact?.id || '', done: false, due: '' });
    if (action.type === 'Create opportunity') {
      const firstStage = state.stages[0];
      add(state,'opportunities',{ title:action.value, contactId:contact.id, stage:firstStage.id, pipelineId:firstStage.pipelineId,
        value:0, status:'Open', statusChangedAt:now(), source:'Workflow', owner:'' });
    }
    if (action.type === 'Log message') {
      add(state, 'messages', {
        contactId: contact.id, body: action.value, direction: 'Outbound', channel: action.channel || 'Note', read: true,
        starred: false, origin: 'workflow', workflowId: run.workflowId
      });
    }
    run.results.push(`${action.type}: done`);
  }
  run.status = 'Completed';
}

function run(state, event, context) {
  for (const workflow of state.workflows) {
    if (!workflow.active || workflow.trigger !== event || (workflow.linkId && workflow.linkId !== context.linkId)) continue;
    const execution = add(state, 'runs', {
      name: workflow.name, workflowId: workflow.id, event, contactId: context.contactId || '',
      actions: structuredClone(workflow.actions), nextAction: 0, results: [], status: 'Running'
    });
    continueRun(state, execution);
  }
}

function finishManualAction(state, id, data) {
  const item = find(state, 'manualActions', id);
  if (!item) fail('Manual action not found.', 404);
  if (item.status === data.status && ['Completed','Skipped'].includes(item.status)) return id;
  if (item.status !== 'Pending') fail('Manual action is no longer pending.', 409);
  const execution = find(state, 'runs', item.runId);
  if (execution?.status !== 'Waiting') fail('This workflow is no longer waiting.', 409);

  item.status = one(data.status, ['Completed', 'Skipped'], 'outcome');
  item.finished = now();
  item.note = str(data.note, 2500);
  if (item.status === 'Completed' && item.note) {
    add(state, 'messages', { contactId: item.contactId, direction: 'Outbound', channel: 'Note', read: true,
      starred: false, origin: 'internal', body: `${item.type}: ${item.note}` });
  }
  execution.results.push(`${item.type}: ${item.status.toLowerCase()}`);
  continueRun(state, execution);
  return id;
}

function saveSla(state, data) {
  function target(settings) {
    const soon = Number(settings?.soon);
    const overdue = Number(settings?.overdue);
    if (![soon, overdue].every(n => Number.isInteger(n) && n >= 1 && n <= 10080) || overdue <= soon) {
      fail('Use response targets between 1 and 10,080 minutes. Overdue must be greater than due soon.');
    }
    return { soon, overdue };
  }
  const current = state.conversationSla;
  const enabled = Boolean(data.enabled);
  const mode = one(data.mode, ['common', 'channel'], 'SLA mode');
  const automation = one(data.automation, ['none', 'all', 'selected'], 'automation rule');
  const workflows = automation === 'selected' && Array.isArray(data.workflows)
    ? [...new Set(data.workflows.map(id => exists(state, 'workflows', id, 'workflow')))] : [];
  if (automation === 'selected' && !workflows.length) fail('Select at least one workflow.');
  state.conversationSla = {
    enabled, mode, automation, workflows,
    common: mode === 'common' ? target(data.common) : current.common,
    channels: mode === 'channel' ? Object.fromEntries(['Email','SMS'].map(channel => [channel, target(data.channels?.[channel])])) : current.channels,
    startedAt: enabled ? current.enabled && current.startedAt ? current.startedAt : now() : current.startedAt
  };
  return enabled;
}
export function metrics(s) {
  const open = s.opportunities.filter(v=>v.status==='Open'), won = s.opportunities.filter(v=>v.status==='Won');
  return { contacts:s.contacts.length, open:open.length, openValue:open.reduce((n,r)=>n+r.value,0), won:won.length, wonValue:won.reduce((n,r)=>n+r.value,0), appointments:s.appointments.filter(a=>a.status!=='Canceled').length, invoicesPaid:s.invoices.filter(i=>i.status==='Paid').reduce((n,r)=>n+r.value,0), unread:s.messages.filter(m=>!m.read).length, reviews:s.reviews.length, average:s.reviews.length ? s.reviews.reduce((n,r)=>n+r.score,0)/s.reviews.length : 0 };
}
export function execute(s, command, { workspace = 'demo' } = {}) {
  const { type, key, id, data:d = {} } = command;
  if (!d || typeof d!=='object' || Array.isArray(d)) fail('Invalid record data.');
  if (['dashboard-create','dashboard-save','dashboard-restore','dashboard-report'].includes(type)) {
    return changeDashboard(s,{ ...command,data:d },uid,now());
  }
  if (type === 'studio-meta') return studioMeta(s, id, d);
  if (type === 'studio-visit' || type === 'studio-star') {
    const project = find(s,'studioProjects',id);
    if (!project) fail('Project not found.',404);
    if (type === 'studio-visit') project.viewedAt=now();
    else project.starred=Boolean(d.starred);
    return id;
  }
  if (type === 'pipeline') {
    const name = req(d.name,'Pipeline name',80);
    const previous = id && find(s,'pipelines',id);
    if (id && !previous) fail('Pipeline not found.',404);
    if (previous) { previous.name = name; return previous.id; }
    if (s.pipelines.length >= 30) fail('A workspace can have up to 30 pipelines.');
    const pipeline = add(s,'pipelines',{ name });
    for (const label of ['New Lead','Qualified','Proposal']) add(s,'stages',{ name:label, pipelineId:pipeline.id });
    return pipeline.id;
  }
  if (type === 'import') {
    if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length>500) fail('Import between 1 and 500 contacts at a time.');
    let added=0;
    for (const input of d.rows) {
      if (!input || typeof input!=='object') fail('Invalid contact in import.');
      const row=fields.contacts(s,input);
      if (row.email && s.contacts.some(c=>c.email===row.email)) continue;
      const contact=add(s,'contacts',row); run(s,'Contact created',{contactId:contact.id}); added++;
    }
    return added;
  }
  if (type === 'save') {
    if (!Object.hasOwn(fields,key)) fail('Unknown record type.');
    const prior = id ? find(s,key,id) : null;
    if (id && !prior) fail('Record not found.',404);
    if (key==='files' && !prior && s.files.length>=60) fail('The local drive holds up to 60 files.');
    if (key==='studioProjects' && !prior && s.studioProjects.length>=60) fail('A workspace can have up to 60 Studio projects.');
    const details = fields[key](s,{ ...d, id });
    const row = prior ? { ...prior, ...details, updated: now() } : add(s,key,details);
    if (key === 'opportunities') row.statusChangedAt = !prior || row.status !== prior.status ? now() : prior.statusChangedAt || prior.created;
    if (key === 'studioProjects' && !prior) row.viewedAt = row.created;
    if (prior) s[key] = s[key].map(r=>r.id===id ? row : r);
    if (!prior && key==='contacts') run(s,'Contact created',{ contactId:row.id });
    if (!prior && key==='appointments') run(s,'Appointment booked',row);
    if (prior && key==='opportunities' && row.stage!==prior.stage) run(s,'Opportunity stage changed',row);
    return row.id;
  }
  if (type === 'delete') {
    if (!Object.hasOwn(fields,key) || !find(s,key,id)) fail('Record not found.',404);
    if (key==='contacts') {
      for (const related of ['tasks','opportunities','messages','appointments','invoices']) s[related] = s[related].filter(r=>r.contactId!==id);
      for (const row of s.submissions.filter(r=>r.contactId===id)) { row.contactId=''; row.name=''; row.email=''; }
      for (const pending of s.manualActions.filter(item => item.contactId === id)) {
        pending.contactId = '';
        if (pending.status === 'Pending') pending.status = 'Canceled';
      }
      for (const execution of s.runs.filter(item => item.contactId === id)) {
        execution.contactId = '';
        if (execution.status === 'Waiting') {
          execution.status = 'Canceled';
          execution.results.push('Contact deleted.');
        }
      }
      s.linkTickets = s.linkTickets.filter(ticket => ticket.contactId !== id);
      for (const click of s.linkClicks.filter(click => click.contactId === id)) click.contactId = '';
    }
    if (key==='forms') s.pages.forEach(p=>{ if (p.formId===id) p.formId=''; });
    if (key === 'snippetFolders') s.snippets.forEach(snippet => { if (snippet.folderId === id) snippet.folderId = ''; });
    if (key === 'triggerLinks') {
      s.linkTickets = s.linkTickets.filter(ticket => ticket.linkId !== id);
      s.linkClicks = s.linkClicks.filter(click => click.linkId !== id);
      for (const workflow of s.workflows.filter(item => item.linkId === id)) workflow.active = false;
    }
    if (key === 'workflows') {
      const sla = s.conversationSla;
      sla.workflows = sla.workflows.filter(item => item !== id);
      if (sla.automation === 'selected' && !sla.workflows.length) sla.automation = 'none';
    }
    s[key] = s[key].filter(r=>r.id!==id);
    return id;
  }
  if (type === 'message') {
    const c = contactId(s, d.contactId);
    const channel = one(d.channel, messageChannels, 'channel');
    const direction = one(d.direction, ['Outbound','Inbound'], 'direction');
    let body = req(d.body, 'Message', 5000);
    if (direction === 'Outbound') {
      const tickets = new Map();
      body = body.replace(/\{\{trigger_link\.([a-f0-9-]{36})\}\}/g, (_, linkId) => {
        exists(s, 'triggerLinks', linkId, 'trigger link');
        if (!tickets.has(linkId)) tickets.set(linkId, add(s, 'linkTickets', { linkId, contactId: c }).id);
        return `/r/${workspace}/${tickets.get(linkId)}`;
      });
    }
    return add(s, 'messages', { contactId: c, body, subject: channel === 'Email' ? str(d.subject, 240) : '',
      channel, direction, read: direction !== 'Inbound', starred: false, origin: 'human' }).id;
  }
  if (type === 'manual-action') return finishManualAction(s, id, d);
  if (type === 'conversation-sla') return saveSla(s, d);
  if (type === 'dismiss-sla') {
    const message = find(s, 'messages', id);
    if (!s.conversationSla.enabled || message?.direction !== 'Inbound' || !['Email','SMS'].includes(message.channel)) fail('SLA timer not found.', 404);
    message.slaDismissedAt ??= now();
    return id;
  }
  if (type === 'link-click') {
    const ticket = find(s, 'linkTickets', id);
    const link = find(s, 'triggerLinks', ticket?.linkId || id);
    if (!link) fail('Trigger link not found.', 404);
    const firstClick = ticket && !ticket.clickedAt;
    add(s, 'linkClicks', { linkId: link.id, contactId: ticket?.contactId || '' });
    if (firstClick) {
      ticket.clickedAt = now();
      run(s, 'Trigger link clicked', { linkId: link.id, contactId: ticket.contactId });
    }
    return link.url;
  }
  if (type === 'thread') {
    const c = contactId(s,d.contactId);
    const rows=s.messages.filter(r=>r.contactId===c);
    if (Object.hasOwn(d,'read')) rows.forEach(r=>{r.read=Boolean(d.read);});
    if (Object.hasOwn(d,'starred')) rows.forEach(r=>{r.starred=Boolean(d.starred);});
    return c;
  }
  if (type === 'submit') {
    const form = find(s,'forms',id);
    if (!form?.active) fail('Form not found.',404);
    const mail = req(email(d.email),'Email');
    const name = req(d.name,'Name'), phone = form.askPhone ? str(d.phone,48) : '';
    let c = s.contacts.find(r=>r.email===mail);
    if (!c) { c=add(s,'contacts',{ name,email:mail,phone,tags:[],company:'',notes:'' }); run(s,'Contact created',{contactId:c.id}); }
    const submission=add(s,'submissions',{ formId:id, contactId:c.id, name, email:mail });
    run(s,'Form submitted',{contactId:c.id});
    return submission.id;
  }
  if (type === 'onboarding') {
    const kind=one(d.kind,['small','agency','saas','other'],'business type');
    const goal=d.goal ? one(d.goal,['contacts','opportunities','calendars','sites','automation'],'goal') : '';
    if (d.done && !goal) fail('Choose a goal.');
    s.onboarding={kind,goal,done:Boolean(d.done)}; return kind;
  }
  if (type === 'profile') {
    const timezone=req(d.timezone,'Time zone');
    try { new Intl.DateTimeFormat('en',{timeZone:timezone}); } catch { fail('Use an IANA time zone, for example America/Sao_Paulo.'); }
    s.profile={name:req(d.name,'Workspace name'),email:email(d.email),phone:str(d.phone,48),timezone,currency:one(d.currency,['BRL','USD','EUR'],'currency')}; return s.profile.name;
  }
  if (type === 'stage') {
    const previous = id && find(s,'stages',id);
    if (id && !previous) fail('Stage not found.',404);
    const name = req(d.name,'Stage name',50);
    if (previous) { previous.name = name; previous.visible = d.visible !== false; return previous.id; }
    const pipelineId = exists(s,'pipelines',d.pipelineId || salesPipeline,'pipeline');
    return add(s,'stages',{ name, pipelineId, visible:d.visible !== false }).id;
  }
  fail('Unknown operation.');
}
export function seed() {
  const s=blank();
  const ana=add(s,'contacts',{name:'Ana Martins',email:'ana@example.test',phone:'+55 11 5555-0101',company:'Studio Norte',tags:['Lead'],notes:'Interested in the onboarding package.'});
  const rafa=add(s,'contacts',{name:'Rafa Lima',email:'rafa@example.test',phone:'',company:'Ateliê Azul',tags:['Client'],notes:''});
  const lia=add(s,'contacts',{name:'Lia Costa',email:'lia@example.test',phone:'',company:'Casa Porto',tags:['Referral'],notes:''});
  add(s,'opportunities',{title:'Studio Norte · CRM setup',contactId:ana.id,stage:'new',value:1800,status:'Open'});
  add(s,'opportunities',{title:'Casa Porto · Growth plan',contactId:lia.id,stage:'proposal',value:3200,status:'Open'});
  add(s,'opportunities',{title:'Ateliê Azul · Starter plan',contactId:rafa.id,stage:'won',value:1250,status:'Won'});
  add(s,'messages',{contactId:ana.id,body:'Hi! I’d like to learn how the onboarding works.',direction:'Inbound',channel:'Note',read:false,starred:false});
  add(s,'messages',{contactId:rafa.id,body:'Welcome aboard, Rafa! Your project is ready to start.',direction:'Outbound',channel:'Note',read:true,starred:false});
  add(s,'tasks',{title:'Follow up on the growth proposal',contactId:lia.id,due:'',done:false});
  return s;
}
