import { randomUUID } from 'node:crypto';
import { changeDashboard } from './dashboard-model.mjs';
import { validDesign } from './ui/studio-design.js';
import { formOpen, readAnswers, validFields, validTiers } from './ui/form-fields.js';
import { changeReport } from './report-model.mjs';
import { defaultDashboard, opportunityStatuses, salesPipeline } from './ui/dashboard-data.js';
import { studioTemplates, studioThemes } from './ui/studio-data.js';
import { afterSave, beforeDelete, bulk, crmCollections, crmFields, customData } from './crm-model.mjs';
import { inboxRule } from './ui/inbox-data.js';
import { saveTracking, trackingCollections, trackingDefaults, trackingEvent, trackingOf } from './tracking.mjs';
import { applyScoring, changeScore, scoringCollections, scoringFields } from './scoring-model.mjs';
import { adCollections, adDefaults, adSettingsOf, attributionSnapshot, recordAttribution, saveAdSettings } from './ads-model.mjs';
import { socialBeforeDelete, socialCollections, socialCommand, socialFields, workflowPost } from './social-model.mjs';
import { chatBeforeDelete, chatCollections, chatCommand, chatFields } from './chat-model.mjs';
import { blogBeforeDelete, blogCollections, blogFields, blogView } from './blog-model.mjs';
import { storeAfterSave, storeBeforeDelete, storeCheckout, storeCollections, storeFields } from './store-model.mjs';
import { webinarBeforeDelete, webinarCollections, webinarCommand, webinarFields } from './webinar-model.mjs';
import { qrCollections, qrFields, qrScan } from './qr-model.mjs';
import { courseFields } from './course-model.mjs';
import { communityCollections, communityFields } from './community.mjs';
import { communityEventBeforeDelete, communityEventCollections, communityEventCommand, communityEventFields } from './community-events.mjs';
import { communityCommand } from './community-config.mjs';
import { courseActivityCommand } from './course-learning.mjs';
import { courseOfferBeforeDelete, credentialCollections } from './course-credentials.mjs';
import { certificateBeforeDelete, certificateCollections, certificateFields, credentialCommand, issueFromTemplate } from './certificate-model.mjs';
import { offerBeforeDelete, offerCheckout, offerCollections, offerFields } from './offer-model.mjs';
import { pipelineCommand, stageColors } from './pipeline-model.mjs';
import { createEngine, workflowRecord } from './workflow-engine.mjs';
import { pranchetaFileRecord, createCanonicalTemplates } from './prancheta-model.mjs';
import { directories } from './ui/gbp-data.js';
import { brandCollections, brandFields } from './brand-model.mjs';
import { addAffiliateFromContact, affiliateClick, affiliateCollections, affiliateDefaults, affiliateFields, affiliateSettings, affiliateSignup, attributeContacts, issuePortalToken, recordPayout, reviewCommission, saveAffiliateSettings, settleAffiliates } from './affiliate-model.mjs';
import { acceptVideoChunk, finishVideoUpload, mediaCollections, mediaFields, startVideoUpload } from './reputation-media.mjs';
import { createReviewRequest, deliver as deliverReviewRequest, importGoogleReviews, openReviewRequest, reputationCollections, saveListing, reputationDefaults, reputationOf, saveReputation, sendReviewRequests, submitReview as submitWorkspaceReview } from './reputation-model.mjs';
import { documentAfterSave, documentBeforeDelete, documentCollections, documentCommand, documentFields, sendTemplateDocument } from './document-model.mjs';
import { catalogAfterSave, catalogBeforeDelete, catalogCollections, catalogCommand, catalogFields, submitReview, workflowInventory } from './catalog-model.mjs';
import { captureCart, checkoutBeforeDelete, checkoutCollections, checkoutCommand, checkoutConverted, checkoutFields, checkoutTick, restoreCart } from './checkout-model.mjs';
import { invoiceAfterSave, paymentDefaults, savePaymentSettings, invoiceBeforeDelete, invoiceCollections, invoiceCommand, invoiceFields, invoiceTick, sendTemplateInvoice, startTemplateRecurring } from './invoice-model.mjs';
import { emailBeforeDelete, emailCollections, emailCommand, emailFields } from './email-campaign-model.mjs';
import { estimateAfterSave, estimateBeforeDelete, estimateCollections, estimateCommand, estimateFields, sendEstimateCopy } from './estimate-model.mjs';

export const defaults = {
  profile: { name: 'Demo Workspace', email: 'hello@example.test', phone: '', timezone: 'America/Sao_Paulo', currency: 'BRL' },
  onboarding: { kind: '', goal: '', done: false },
  pipelines:[{ id:salesPipeline, name:'Sales Pipeline' }],
  stages: [{ id: 'new', name: 'New Lead' }, { id: 'qualified', name: 'Qualified' }, { id: 'proposal', name: 'Proposal' }, { id: 'won', name: 'Won', visible:false }].map(stage => ({ ...stage, pipelineId:salesPipeline })),
  contacts: [], tasks: [], opportunities: [], messages: [], appointments: [], workflows: [], runs: [], invoices: [],
  workflowFolders: [], workflowLists: [], deletedWorkflows: [],
  campaigns: [], pages: [], forms: [], submissions: [], courses: [], files: [], reviews: [], agents: [], agentRuns: [], knowledgeBases: [], agentTemplatesCustom: [], integrations: [],
  manualActions: [], snippetFolders: [], snippets: [], triggerLinks: [], linkTickets: [], linkClicks: [],
  threads: [], teamMessages: [], inboxViews: [],
  dashboards:[defaultDashboard()], dashboardReports:[], customReports:[], studioProjects:[], pranchetaFiles:[],
  ...Object.fromEntries([...crmCollections, ...socialCollections, ...chatCollections, ...blogCollections, ...storeCollections, ...webinarCollections, ...qrCollections, ...communityCollections, ...communityEventCollections, ...credentialCollections, ...certificateCollections, ...offerCollections, ...documentCollections, ...estimateCollections, ...invoiceCollections, ...emailCollections, ...checkoutCollections, ...catalogCollections].map(key => [key, []])),
  paymentSettings: paymentDefaults(),
  ai: { limit: 0, alertAt: 0.8, ledger: [] },
  adSettings: adDefaults(), adCampaigns: [], adStats: [], attributionEvents: [],
  tracking: trackingDefaults(), trackingEvents: [], scoringRules: [],
  brandBoards: [], affiliateSettings: affiliateDefaults(), affiliateCampaigns: [], affiliates: [], affiliateCommissions: [], affiliatePayouts: [],
  reputation: reputationDefaults(), listings: {}, reviewRequests: [], reviewWidgets: [], videoCollectors: [], videoTestimonials: [], videoUploads: [],
  conversationSla: { enabled: false, mode: 'common', common: { soon: 3, overdue: 5 }, channels: {}, automation: 'none', workflows: [], startedAt: '' }
};
export const blank = name => ({ ...structuredClone(defaults), profile: { ...defaults.profile, ...(name ? { name } : {}) } });
export function hydrateWorkspace(state) {
  const fresh = blank();
  state.customReports ??= [];
  state.paymentSettings ??= paymentDefaults();
  state.ai ??= { limit: 0, alertAt: 0.8, ledger: [] };
  state.ai.ledger ??= [];
  reputationOf(state);
  state.listings ??= {};
  affiliateSettings(state);
  adSettingsOf(state);
  trackingOf(state);
  state.profile.currency = defaults.profile.currency;
  const additions = ['threads','teamMessages','inboxViews','agents','agentRuns','knowledgeBases','agentTemplatesCustom','reviewRequests',...mediaCollections,...affiliateCollections,...adCollections,...trackingCollections,...scoringCollections,...brandCollections,'manualActions','snippetFolders','snippets','triggerLinks','linkTickets','linkClicks','pipelines','dashboards','dashboardReports','studioProjects','pranchetaFiles','workflowFolders','workflowLists','deletedWorkflows',...crmCollections,...socialCollections,...chatCollections,...blogCollections,...storeCollections,...webinarCollections,...qrCollections,...communityCollections,...communityEventCollections,...credentialCollections,...certificateCollections,...offerCollections,...documentCollections,...estimateCollections,...invoiceCollections,...emailCollections,...checkoutCollections,...catalogCollections];
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
const percent = value => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) fail('Probability must be between 0 and 100.');
  return Math.round(n * 100) / 100;
};
const tags = value => [...new Set((Array.isArray(value) ? value : str(value).split(',')).map(a => str(a, 48)).filter(Boolean))].slice(0, 20);
export const triggers = ['Contact created', 'Form submitted', 'Opportunity stage changed', 'Appointment booked', 'Trigger link clicked', 'Customer replied'];
const messageChannels = ['Note', 'Email', 'SMS', 'WhatsApp', 'Live chat', 'Instagram', 'Facebook'];
// Channels whose inbound messages start an SLA timer (every conversation channel except internal notes).
const slaChannels = messageChannels.filter(channel => channel !== 'Note');
export const find = (state, key, id) => state[key].find(a => a.id === id);
const webAddress = value => { const v = str(value, 600); if (v && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)) fail('Use um endereço que comece com https://'); return v; };
const when = (value, label) => { if (!value) return ''; const t = Date.parse(value); if (Number.isNaN(t)) fail(`Use uma data válida em ${label}.`); return new Date(t).toISOString(); };
// Forms: the builder sends fields and settings; older callers send only name, description and askPhone.
function formRecord(s, d) {
  const prior = d.id ? find(s,'forms',d.id) : null;
  const kind = d.kind !== undefined ? one(d.kind, ['form','survey','quiz'], 'tipo') : prior?.kind || 'form';
  const row = { name: req(d.name,'Form name'), description: str(d.description,1500), askPhone: Boolean(d.askPhone), active: Boolean(d.active), kind };
  if (d.fields !== undefined) row.fields = validFields(d.fields, s.customFields || [], kind);
  if (d.oneAtATime !== undefined) row.oneAtATime = kind !== 'form' && Boolean(d.oneAtATime);
  if (d.tiers !== undefined && kind === 'quiz') row.tiers = validTiers(d.tiers);
  if (d.button !== undefined) row.button = str(d.button, 60) || 'Enviar';
  if (d.accent !== undefined) row.accent = /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent.toLowerCase() : '#155eef';
  if (d.showTitle !== undefined) row.showTitle = Boolean(d.showTitle);
  if (d.addTags !== undefined) row.addTags = tags(d.addTags);
  if (d.onSubmit !== undefined) {
    const action = d.onSubmit?.action === 'redirect' ? 'redirect' : 'message';
    row.onSubmit = { action, message: str(d.onSubmit?.message, 500), url: action === 'redirect' ? req(webAddress(d.onSubmit?.url), 'Endereço de redirecionamento') : webAddress(d.onSubmit?.url) };
  }
  if (d.schedule !== undefined) {
    const start = when(d.schedule?.start, 'início'), end = when(d.schedule?.end, 'fim');
    if (start && end && end <= start) fail('O fim do período precisa ser depois do início.');
    row.schedule = { start, end, closedMessage: str(d.schedule?.closedMessage, 300) };
  }
  return row;
}
const digits = value => String(value || '').replace(/\D/g, '');
const exists = (state, key, value, label, optional = false) => (!value && optional) ? '' : find(state, key, value)?.id ?? fail(`Choose a valid ${label}.`);
function add(state, key, data) { const row = { id: uid(), created: now(), ...data }; state[key].push(row); return row; }
const contactId = (s,v,optional = false) => exists(s, 'contacts', v, 'contact', optional);
const fields = {
  contacts: (s, d) => ({ name: req(d.name, 'Name'), email: email(d.email), phone: str(d.phone, 48), company: str(d.company), tags: tags(d.tags), notes: str(d.notes, 5000), custom: customData(s, 'Contact', d), ...(d.dnd !== undefined ? { dnd: Boolean(d.dnd) } : {}) }),
  tasks: (s, d) => ({ title: req(d.title, 'Title'), contactId: contactId(s,d.contactId,true), due: d.due ? date(d.due) : '', done: Boolean(d.done), owner:str(d.owner,80), notes:str(d.notes,2500) }),
  opportunities: (s, d) => {
    const stage = find(s,'stages',d.stage);
    if (!stage) fail('Choose a valid stage.');
    return { title:req(d.title,'Name'), contactId:contactId(s,d.contactId), stage:stage.id, pipelineId:stage.pipelineId,
      value:amount(d.value ?? 0), status:one(d.status || 'Open',opportunityStatuses,'status'), source:str(d.source,80), owner:str(d.owner,80),
      closeDate:d.closeDate ? date(d.closeDate).slice(0,10) : '', probability:percent(d.probability), custom:customData(s,'Opportunity',d),
      company:str(d.company,160), tags:tags(d.tags), followers:tags(d.followers),
      lostReason:d.status === 'Lost' ? str(d.lostReason,250) : '' };
  },
  ...crmFields,
  ...socialFields,
  ...scoringFields,
  ...chatFields,
  ...blogFields,
  ...storeFields,
  ...webinarFields,
  ...qrFields,
  pranchetaFiles: pranchetaFileRecord,
  appointments: (s, d) => {
    const start = date(d.start), end = date(d.end);
    if (end <= start) fail('End time must be after start time.');
    if (s.appointments.some(a => a.id !== d.id && a.status !== 'Canceled' && d.status !== 'Canceled' && a.start < end && a.end > start)) fail('This time overlaps an existing appointment.');
    return { title: req(d.title, 'Title'), contactId: contactId(s,d.contactId,true), start, end, status: one(d.status || 'Confirmed',['Confirmed','Completed','Canceled'],'status'), notes: str(d.notes, 3000) };
  },
  workflows: (s, d) => {
    const record = workflowRecord(s, d);
    return { ...record, folderId: exists(s, 'workflowFolders', record.folderId, 'folder', true) };
  },
  workflowFolders: (s, d) => ({ name: req(d.name, 'Nome da pasta', 100) }),
  workflowLists: (s, d) => ({ name: req(d.name, 'Nome da lista', 100), query: str(d.query, 200),
    status: one(d.status || 'all', ['all', 'draft', 'published'], 'status'),
    folderId: exists(s, 'workflowFolders', d.folderId, 'folder', true) }),
  invoices: (s,d) => ({ title: req(d.title,'Invoice name'), contactId: contactId(s,d.contactId), value: amount(d.value), due: date(d.due), status: one(d.status || 'Draft',['Draft','Open','Paid','Void'],'status') }),
  campaigns: (s,d) => ({ name: req(d.name,'Campaign name'), channel: one(d.channel,['Email','Social'],'channel'), body: req(d.body,'Content',5000), date: d.date ? date(d.date) : '', status: one(d.status || 'Draft',['Draft','Planned','Archived'],'status') }),
  pages: (s,d) => ({ name: req(d.name,'Page name'), headline: req(d.headline,'Headline'), body: str(d.body,5000), button: str(d.button,80), formId: exists(s,'forms',d.formId,'form',true), kind: one(d.kind,['Website','Funnel'],'page type'), active: Boolean(d.active) }),
  forms: (s,d) => formRecord(s,d),
  ...courseFields,
  ...communityFields,
  ...communityEventFields,
  ...certificateFields,
  ...offerFields,
  ...documentFields,
  ...estimateFields,
  ...invoiceFields,
  ...emailFields,
  ...checkoutFields,
  ...catalogFields,
  reviews: (s,d) => ({ author: req(d.author,'Author'), score: one(Number(d.score),[1,2,3,4,5],'rating'), text: req(d.text,'Review',2500), reply: str(d.reply,2500) }),
  files: (s,d) => ({ name: req(d.name,'File name'), data: file(d.data) }),
  ...mediaFields,
  ...affiliateFields,
  ...brandFields,
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
  inboxViews: (s,d) => {
    if (!Array.isArray(d.rules) || !d.rules.length || d.rules.length > 10) fail('A view needs between 1 and 10 conditions.');
    const rules = d.rules.map(rule => inboxRule(rule) || fail('Choose a valid view condition.'));
    return { name: req(d.name, 'View name', 60), match: one(d.match || 'and', ['and','or'], 'match'), rules };
  },
  studioProjects: (s,d) => {
    const blocks = d.blocks === undefined ? [] : d.blocks;
    if (!Array.isArray(blocks) || blocks.length > 12) fail('A project can have up to 12 sections.');
    const name = req(d.name,'Project name',80);
    return { name, headline:str(d.headline,140) || name, summary:str(d.summary,1500),
      brief:req(d.brief,'Brief',4000), theme:one(d.theme,studioThemes,'theme'), template:one(d.template,studioTemplates.map(item => item[0]),'template'),
      blocks:blocks.map(block => ({ title:req(block?.title,'Section title',100),body:str(block?.body,2200) })),
      reference:str(d.reference,500), design:d.design ? validDesign(d.design) : find(s,'studioProjects',d.id)?.design || null, kind:one(d.kind || find(s,'studioProjects',d.id)?.kind || 'website',['website','funnel'],'site type') };
  }
};
// Metadata mirrored from the project's site row: page list, publication and the form that receives its leads.
function studioMeta(s, id, d) {
  const project = find(s,'studioProjects',id);
  if (!project) fail('Project not found.',404);
  if (d.name !== undefined) project.name = req(d.name,'Project name',80);
  if (d.kind !== undefined) project.kind = one(d.kind,['website','funnel'],'site type');
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

// Workflows run on workflow-engine.mjs. The old event names are still accepted here.
let engineWorkspace = 'demo';
const queue = (s, item) => { s.workflowOutbox ??= []; s.workflowOutbox.push({ id: uid(), created: now(), ...item }); if (s.workflowOutbox.length > 500) s.workflowOutbox.splice(0, s.workflowOutbox.length - 500); };
const engine = createEngine({ add, now,
  // "Pedir avaliação" in a workflow: a personal review link, the message in Conversations and the delivery.
  makeAffiliate: (state, contact, campaignId) => addAffiliateFromContact(state, contact, campaignId, { emit: (st, event, ctx) => engine.emit(st, event, ctx) }),
  requestReview: (state, contact, channel, run) => {
    const made = createReviewRequest(state, engineWorkspace, contact, channel, { source: 'workflow', runId: run.id });
    return deliverReviewRequest(state, made, contact, channel, reputationOf(state), { add, outbox: queue, runId: run.id, workflowId: run.workflowId });
  },
  sendDocument: (state, contact, config, depth = 0) =>
  sendTemplateDocument(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  sendEstimate: (state, contact, config, depth = 0) => sendEstimateCopy(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  sendInvoice: (state, contact, config, depth = 0) => sendTemplateInvoice(state, engineWorkspace, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })),
  updateInventory: state => (config) => workflowInventory(state, config),
  createSocialPost: (state, config, text) => workflowPost(state, config, text, { add }),
  // "Emitir certificado/badge": one credential from a template for the workflow's contact.
  issueCredential: (state, contact, templateId, subject, kind, depth = 0) => {
    const template = (state.certificateTemplates || []).find(row => row.id === templateId && row.kind === kind);
    if (!template) return null;
    return issueFromTemplate(state, template, contact, subject, { add, run: (st, event, ctx) => engine.emit(st, event, { ...ctx, depth: depth + 1 }), source: 'workflow' });
  },
  // Lead scoring: every event passes the scoring rules; workflows adjust the score through the same path.
  onEvent: (state, type, ctx, { matches }) => applyScoring(state, type, ctx, { matches, emit: (st, event, c) => engine.emit(st, event, c) }),
  adjustScore: (state, contact, delta, reason, depth = 0) => changeScore(state, contact, delta, reason, { emit: (st, event, c) => engine.emit(st, event, c), depth }),
  startRecurring: (state, contact, config, depth = 0) => startTemplateRecurring(state, contact, config, (st, event, ctx) => run(st, event, { ...ctx, depth: depth + 1 })) });
const legacyEvents = { 'Contact created': 'contact_created', 'Form submitted': 'form_submitted', 'Opportunity stage changed': 'pipeline_stage_changed',
  'Appointment booked': 'appointment_booked', 'Trigger link clicked': 'trigger_link_clicked', 'Customer replied': 'customer_replied' };
function run(state, event, context = {}) {
  const type = legacyEvents[event] || event;
  const ctx = { ...context, contactId: context.contactId || '' };
  if (type === 'pipeline_stage_changed') ctx.stageId = context.stageId || context.stage;
  if (type === 'appointment_booked') { engine.emit(state, type, { contactId: ctx.contactId }); return; }
  engine.emit(state, type, ctx);
  if (type === 'form_submitted') {
    const form = find(state, 'forms', ctx.formId);
    if (form?.kind === 'survey') engine.emit(state, 'survey_submitted', ctx);
    if (form?.kind === 'quiz') engine.emit(state, 'quiz_submitted', ctx);
  }
}
/** Workflow events from outside a command (the social scheduler, for one). */
export const emitWorkflow = (state, event, ctx = {}) => run(state, event, ctx);
const enroll = (state, workflow, event, contactId = '') => engine.enroll(state, workflow, { contactId, depth: 1 }, event);
const finishManualAction = (state, id, data) => engine.finishManual(state, id, data, one, str);

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
    channels: mode === 'channel' ? Object.fromEntries(slaChannels.map(channel => [channel, target(data.channels?.[channel] || data.common)])) : current.channels,
    startedAt: enabled ? current.enabled && current.startedAt ? current.startedAt : now() : current.startedAt
  };
  return enabled;
}
export function metrics(s) {
  const open = s.opportunities.filter(v=>v.status==='Open'), won = s.opportunities.filter(v=>v.status==='Won');
  return { contacts:s.contacts.length, open:open.length, openValue:open.reduce((n,r)=>n+r.value,0), won:won.length, wonValue:won.reduce((n,r)=>n+r.value,0), appointments:s.appointments.filter(a=>a.status!=='Canceled').length, invoicesPaid:s.invoices.filter(i=>i.status==='Paid').reduce((n,r)=>n+r.value,0), unread:s.messages.filter(m=>!m.read).length, reviews:s.reviews.length, average:s.reviews.length ? s.reviews.reduce((n,r)=>n+r.score,0)/s.reviews.length : 0 };
}
// Every command: contacts created by a referred visitor are attributed to the affiliate, then paid
// invoices become commissions (see affiliate-model.mjs).
export function execute(s, command, options = {}) {
  const before = options.affiliate ? new Set(s.contacts.map(row => row.id)) : null;
  // Public commands carry the visitor's first and last touch (an empty object for a direct visit).
  const sources = options.attribution ? attributionSnapshot(s) : null;
  const result = executeCommand(s, command, options);
  const emit = (st, event, ctx) => engine.emit(st, event, ctx);
  if (before) attributeContacts(s, before, options.affiliate, { emit });
  if (sources) recordAttribution(s, sources, options.attribution, { emit });
  settleAffiliates(s, { emit });
  return result;
}

function executeCommand(s, command, { workspace = 'demo', trackClick = true } = {}) {
  const { type, key, id, data:d = {} } = command;
  engineWorkspace = workspace;
  if (!d || typeof d!=='object' || Array.isArray(d)) fail('Invalid record data.');
  if (type === 'link-click') {
    const ticket = find(s, 'linkTickets', id);
    const link = find(s, 'triggerLinks', ticket?.linkId || id);
    if (!link) fail('Trigger link not found.', 404);
    if (!trackClick) return link.url;
    const firstClick = ticket && !ticket.clickedAt;
    add(s, 'linkClicks', { linkId: link.id, contactId: ticket?.contactId || '' });
    if (firstClick) {
      ticket.clickedAt = now();
      run(s, 'Trigger link clicked', { linkId: link.id, contactId: ticket.contactId });
    }
    return link.url;
  }
  if (type === 'workflow-enroll') {
    const workflow = find(s, 'workflows', id);
    if (!workflow?.active) fail('Publique o fluxo antes de inscrever contatos.', 409);
    return enroll(s, workflow, 'Inscrição manual', contactId(s, d.contactId))
      || fail('Este contato já foi inscrito neste fluxo.', 409);
  }
  // Server-internal (not accepted from /api/action): the per-minute tick, inbound webhooks and the delivery queue.
  if (type === 'workflow-test') {
    if (!d.workflow || typeof d.workflow !== 'object') fail('Envie o fluxo para testar.');
    return engine.test(s, d.workflow, contactId(s, d.contactId));
  }
  if (type === 'workflow-tick') return engine.tick(s, d.at ? Date.parse(d.at) : Date.now());
  if (type === 'payment-settings') return savePaymentSettings(s, d);
  if (type === 'invoice-tick') return invoiceTick(s, d.at ? Date.parse(d.at) : Date.now(), { workspace, run });
  if (type === 'workflow-hook') return engine.inbound(s, str(d.workflowId, 40), str(d.triggerId, 40), d.payload && typeof d.payload === 'object' ? d.payload : {});
  if (type === 'workflow-outbox-take') { const items = s.workflowOutbox || []; s.workflowOutbox = []; return items; }
  if (type === 'ad-settings') { saveAdSettings(s, d); return 'ok'; }
  if (type === 'tracking-settings') { saveTracking(s, d); return 'ok'; }
  if (type === 'tracking-event') return trackingEvent(s, d, { add, run, now });
  if (type === 'affiliate-settings') return saveAffiliateSettings(s, d);
  if (type === 'affiliate-portal-link') return issuePortalToken(s, str(id, 40));
  if (type === 'affiliate-signup') return affiliateSignup(s, d, { emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'affiliate-click') return affiliateClick(s, d);
  if (type === 'commission-review') return reviewCommission(s, str(id, 40), d);
  if (type === 'affiliate-payout') return recordPayout(s, d, { add });
  if (type === 'reputation-settings') return saveReputation(s, d);
  if (type === 'gbp-reviews-import') return importGoogleReviews(s, d, { add, emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'listing-save') return saveListing(s, d, directories);
  if (type === 'review-visibility') { const review = find(s, 'reviews', id) || fail('Avaliação não encontrada.', 404); review.hidden = d.hidden === true; review.updated = now(); return review.id; }
  if (type === 'video-start') return startVideoUpload(s, str(id, 40), d);
  if (type === 'video-chunk') return acceptVideoChunk(s, str(id, 40), d);
  if (type === 'video-finish') return finishVideoUpload(s, str(id, 40), d, { emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'review-request') return sendReviewRequests(s, workspace, d, { add, outbox: queue });
  if (type === 'review-open') return Boolean(openReviewRequest(s, str(d.tokenHash, 64)));
  if (type === 'review-submit') return submitWorkspaceReview(s, { ...d, tokenHash: str(d.tokenHash, 64) }, { add, emit: (st, event, ctx) => engine.emit(st, event, ctx) });
  if (type === 'workflow-ai-result') return (Array.isArray(d.results) ? d.results.slice(0, 200) : []).filter(item => engine.aiResult(s, item)).length;
  if (type === 'workflow-outbox-result') {
    for (const item of Array.isArray(d.results) ? d.results.slice(0, 500) : []) {
      const target = find(s, 'runs', item?.runId);
      if (target) target.results.push(`${({ whatsapp: 'WhatsApp', email: 'E-mail' })[item.kind] || 'Webhook'}: ${str(item.text, 120)}`);
      const doc = item?.docId ? find(s, 'documents', item.docId) : item?.estimateId ? find(s, 'estimates', item.estimateId) : item?.invoiceId ? find(s, 'invoices', item.invoiceId) : item?.checkoutId ? (s.abandonedCheckouts || []).find(row => row.id === item.checkoutId) : item?.giftCardId ? (s.giftCards || []).find(row => row.id === item.giftCardId) : null;
      if (doc) (doc.audit ||= []).push({ at: now(), event: 'delivered', detail: str(item.text, 200) });
    }
    return true;
  }
  if (type === 'workflow-restore') {
    const workflow = find(s, 'deletedWorkflows', id);
    if (!workflow) fail('Fluxo excluído não encontrado.', 404);
    const { deletedAt, ...draft } = workflow;
    s.workflows.push({ ...draft, active: false, updated: now() });
    s.deletedWorkflows = s.deletedWorkflows.filter(row => row.id !== id);
    return id;
  }
  if (type === 'workflow-move') {
    const workflow = find(s, 'workflows', id);
    if (!workflow) fail('Fluxo não encontrado.', 404);
    workflow.folderId = exists(s, 'workflowFolders', d.folderId, 'folder', true);
    workflow.updated = now();
    return id;
  }
  if (['dashboard-create','dashboard-save','dashboard-restore','dashboard-report','dashboard-default','dashboard-timezone','dashboard-delete'].includes(type)) {
    return changeDashboard(s,{ ...command,data:d },uid,now());
  }
  if (['report-create','report-save','report-delete','report-share','report-schedule','report-sent'].includes(type)) return changeReport(s,{ ...command,data:d },uid,now());
  if (typeof type === 'string' && type.startsWith('social-')) {
    if (type === 'social-interaction-trigger') {
      const channel = d.network === 'facebook' ? 'Facebook' : 'Instagram';
      let contact = d.contactId ? find(s, 'contacts', d.contactId) : null;
      if (!contact && (d.authorName || d.handle)) {
        const query = (d.handle || d.authorName).toLowerCase().replace(/^@/, '');
        contact = s.contacts.find(c => (c.name || '').toLowerCase() === query || (c.company || '').toLowerCase() === query);
        if (!contact) {
          contact = add(s, 'contacts', {
            name: d.authorName || (d.handle ? `@${d.handle.replace(/^@/, '')}` : 'Seguidor Social'),
            tags: [channel],
            source: channel
          });
        }
      }
      let msgId = '';
      if (contact && d.body) {
        msgId = add(s, 'messages', {
          contactId: contact.id,
          body: str(d.body, 5000),
          channel,
          direction: 'Inbound',
          read: false,
          starred: false,
          origin: 'human'
        }).id;
        run(s, 'Customer replied', { contactId: contact.id, channel, body: d.body });
      }
      const event = d.kind === 'comment' ? 'social_comment_received' : 'social_dm_received';
      run(s, event, { ...d, contactId: contact?.id || d.contactId || '' });
      return { ok: true, contactId: contact?.id || '', msgId };
    }
    return socialCommand(s, { ...command, data:d }, { add, now });
  }
  if (type === 'chat-start' || type === 'chat-send') return chatCommand(s, { ...command, data:d }, { add, now, run });
  if (type === 'blog-view') return blogView(s, id);
  if (type === 'offer-checkout') return offerCheckout(s, id, d, { add, run });
  if (typeof type === 'string' && type.startsWith('community-event-')) return communityEventCommand(s, { ...command, data:d }, { add, run, now });
  if (['community-plan-invoice', 'community-welcome', 'community-newsletter'].includes(type)) return communityCommand(s, { ...command, data:d }, { add, run, now });
  if (type === 'course-activity') return courseActivityCommand(s, { ...command, data:d }, { add, run });
  if (type === 'credential-issue' || type === 'credential-revoke') return credentialCommand(s, { ...command, data:d }, { add, run });
  if (typeof type === 'string' && type.startsWith('document-')) return documentCommand(s, { ...command, data:d }, { workspace, run });
  if (typeof type === 'string' && type.startsWith('estimate-')) return estimateCommand(s, { ...command, data:d }, { workspace, run });
  if (typeof type === 'string' && type.startsWith('email-')) return emailCommand(s, { ...command, data:d }, { run, add });
  if (typeof type === 'string' && type.startsWith('invoice-')) return invoiceCommand(s, { ...command, data:d }, { workspace, run });
  if (type === 'store-checkout') { const orderId = storeCheckout(s, { ...command, data:d }, { add, run }); checkoutConverted(s, d.session, find(s, 'orders', orderId), run); return orderId; }
  if (type === 'store-cart') return captureCart(s, id, d);
  if (type === 'store-review') return submitReview(s, id, d, run);
  if (typeof type === 'string' && type.startsWith('catalog-')) return catalogCommand(s, { ...command, data:d }, { workspace });
  if (type === 'store-cart-restore') return restoreCart(s, id, str(d.tokenHash, 64));
  if (type === 'checkout-tick') return checkoutTick(s, d.at ? Date.parse(d.at) : Date.now(), { workspace, run, add });
  if (typeof type === 'string' && type.startsWith('checkout-')) return checkoutCommand(s, { ...command, data:d }, { workspace });
  if (['webinar-register','webinar-attend','webinar-reminders'].includes(type)) return webinarCommand(s, { ...command, data:d }, { add, run, now });
  if (type === 'qr-scan') return qrScan(s, id, d);
  if (type === 'studio-meta') return studioMeta(s, id, d);
  if (type === 'studio-visit' || type === 'studio-star') {
    const project = find(s,'studioProjects',id);
    if (!project) fail('Project not found.',404);
    if (type === 'studio-visit') project.viewedAt=now();
    else project.starred=Boolean(d.starred);
    return id;
  }
  if (type === 'prancheta-save') {
    const record = pranchetaFileRecord(s, d);
    const existing = id ? find(s, 'pranchetaFiles', id) : null;
    if (existing) {
      Object.assign(existing, record, { updated: now() });
      return existing.id;
    }
    const created = add(s, 'pranchetaFiles', { ...record, id: id || uid(), created: now(), updated: now() });
    return created.id;
  }
  if (type === 'prancheta-delete') {
    const existing = find(s, 'pranchetaFiles', id);
    if (!existing) fail('Design não encontrado.', 404);
    s.pranchetaFiles = s.pranchetaFiles.filter(item => item.id !== id);
    return id;
  }
  if (type === 'prancheta-duplicate') {
    const existing = find(s, 'pranchetaFiles', id);
    if (!existing) fail('Design não encontrado.', 404);
    const copy = structuredClone(existing);
    copy.id = uid();
    copy.name = `${existing.name} (Cópia)`.slice(0, 150);
    copy.created = now();
    copy.updated = now();
    s.pranchetaFiles.unshift(copy);
    return copy.id;
  }
  if (type === 'prancheta-export-media') {
    const existing = id ? find(s, 'pranchetaFiles', id) : null;
    const dataUri = d.data || existing?.thumbnail;
    if (!dataUri || typeof dataUri !== 'string') fail('Imagem inválida para exportação.');
    const fileName = str(d.name || existing?.name || 'Arte Prancheta', 120);
    const savedFile = add(s, 'files', {
      name: `${fileName.replace(/\.png$/i, '')}.png`,
      data: dataUri,
      size: Math.round(dataUri.length * 0.75),
      type: 'image/png'
    });
    return savedFile.id;
  }
  if (type === 'prancheta-to-social') {
    const existing = id ? find(s, 'pranchetaFiles', id) : null;
    const dataUri = d.data || existing?.thumbnail;
    if (!dataUri || typeof dataUri !== 'string') fail('Imagem inválida para o post.');
    const fileName = str(d.name || existing?.name || 'Arte Prancheta', 120);
    const file = add(s, 'files', {
      name: `${fileName.replace(/\.png$/i, '')}.png`,
      data: dataUri,
      size: Math.round(dataUri.length * 0.75),
      type: 'image/png'
    });
    // A draft in the Social Planner's own shape, ready to pick accounts and schedule.
    const post = add(s, 'socialPosts', {
      type: 'post', summary: str(d.body || existing?.name || 'Arte criada na Prancheta soci', 2000), overrides: {}, accountIds: [],
      media: [{ fileId: file.id, name: file.name, type: 'image' }], link: '', firstComment: '', location: '', userTags: '', categoryId: '', tags: [],
      needsApproval: false, source: 'post', scheduleDate: '', recurrence: null, status: 'draft', approval: '', results: [], createdBy: 'Prancheta', error: ''
    });
    return { fileId: file.id, postId: post.id };
  }
  if (type === 'prancheta-template') {
    const templates = createCanonicalTemplates();
    const tpl = templates.find(t => t.id === d.templateId) || templates[0];
    const created = add(s, 'pranchetaFiles', {
      name: tpl.name,
      format: tpl.format,
      width: tpl.width,
      height: tpl.height,
      pages: structuredClone(tpl.pages),
      thumbnail: '',
      tags: ['Template', tpl.format],
      created: now(),
      updated: now()
    });
    return created.id;
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
    add(s,'imports',{ source:'CSV', file:str(d.file,120), user:str(command.actor,120), found:d.rows.length, added, skipped:d.rows.length-added, status:'Completed' });
    if (s.imports.length > 100) s.imports.splice(0, s.imports.length - 100);
    return added;
  }
  if (type === 'opportunity-import') {
    if (!Array.isArray(d.rows) || !d.rows.length || d.rows.length > 500) fail('Importe de 1 a 500 oportunidades por arquivo.');
    const defaultPipeline = exists(s,'pipelines',d.pipelineId,'pipeline');
    const choices = (records, value, label) => {
      const key = str(value).toLowerCase();
      const direct = records.find(row => row.id === key);
      if (direct) return direct;
      const matches = records.filter(row => row.name.toLowerCase() === key);
      if (matches.length !== 1) fail(`Selecione um(a) ${label} com nome ou ID único.`);
      return matches[0];
    };
    const rows = d.rows.map((input,index) => {
      try {
        if (!input || typeof input !== 'object') fail('Linha inválida.');
        const address = email(input.email);
        const found = address ? s.contacts.filter(contact => contact.email?.toLowerCase() === address) : [];
        const contact = find(s,'contacts',input.contactid) || (found.length === 1 ? found[0] : null);
        if (!contact) fail('Informe o e-mail único ou o ID de um contato existente.');
        const pipeline = input.pipeline ? choices(s.pipelines,input.pipeline,'pipeline').id : defaultPipeline;
        const stages = s.stages.filter(stage => stage.pipelineId === pipeline);
        const stage = input.stage ? choices(stages,input.stage,'etapa') : stages[0];
        const status = input.status ? opportunityStatuses.find(value => value.toLowerCase() === str(input.status).toLowerCase()) : 'Open';
        if (!status) fail('Use Open, Won, Lost ou Abandoned no status.');
        const value = str(input.value).replace(',', '.') || 0;
        return fields.opportunities(s,{...input,contactId:contact.id,stage:stage?.id,status,value,
          closeDate:input.closedate,lostReason:input.lostreason});
      } catch (error) {
        fail(`Linha ${index + 2}: ${error.message}`);
      }
    });
    const created = now();
    for (const details of rows) add(s,'opportunities',{ ...details, slips:0, statusChangedAt:created });
    add(s,'imports',{ object:'opportunities', source:'CSV', file:str(d.file,120), user:str(command.actor,120),
      found:rows.length, added:rows.length, skipped:0, status:'Completed' });
    if (s.imports.length > 100) s.imports.splice(0,s.imports.length - 100);
    return rows.length;
  }
  if (type === 'opportunity-move') {
    const record = find(s,'opportunities',id);
    if (!record) fail('Oportunidade não encontrada.',404);
    const stage = find(s,'stages',d.stage);
    if (!stage) fail('Selecione uma etapa válida.');
    if (record.stage !== stage.id) {
      Object.assign(record,{ stage:stage.id, pipelineId:stage.pipelineId, updated:now(), stageChangedAt:now() });
      run(s,'Opportunity stage changed',record);
    }
    return id;
  }
  if (type === 'save') {
    if (!Object.hasOwn(fields,key)) fail('Unknown record type.');
    const prior = id ? find(s,key,id) : null;
    if (id && !prior) fail('Record not found.',404);
    if (key==='files' && !prior && s.files.length>=60) fail('The local drive holds up to 60 files.');
    if (key==='studioProjects' && !prior && s.studioProjects.length>=60) fail('A workspace can have up to 60 Studio projects.');
    const details = fields[key](s, key === 'workflows' ? { ...prior, ...d, id } : { ...d, id });
    const row = prior ? { ...prior, ...details, updated: now() } : add(s,key,details);
    if (key==='agents' && prior) {
      row.revision = uid();
      if (prior.published) row.active = true;
    }
    if (key === 'opportunities') {
      row.statusChangedAt = !prior || row.status !== prior.status ? now() : prior.statusChangedAt || prior.created;
      row.stageChangedAt = !prior || row.stage !== prior.stage ? now() : prior.stageChangedAt || prior.created;
    }
    if (key === 'studioProjects' && !prior) row.viewedAt = row.created;
    if (['bulkActions','imports'].includes(key)) fail('Unknown record type.');
    afterSave(s, key, prior, row, add);
    storeAfterSave(s, key, prior, row, add);
    catalogAfterSave(s, key, prior, row, workspace);
    documentAfterSave(s, key, prior, row, run);
    estimateAfterSave(s, key, prior, row, run);
    invoiceAfterSave(s, key, prior, row, workspace);
    if (prior) s[key] = s[key].map(r=>r.id===id ? row : r);
    engine.recordChange(s, key, prior, row);
    return row.id;
  }
  if (type === 'delete') {
    if (!Object.hasOwn(fields,key) || !find(s,key,id)) fail('Record not found.',404);
    return remove(s, key, id);
  }
  if (type === 'bulk') {
    return bulk(s, d, { add, remove, actor: command.actor, tags, stageOf: stageId => find(s,'stages',stageId),
      moved: row => run(s,'Opportunity stage changed',row) });
  }
  return other(s, command, type, key, id, d, workspace);
}

// Deletes one record and everything that only made sense with it. Shared by single and bulk deletes.
function remove(s, key, id) {
    beforeDelete(s, key, id);
    socialBeforeDelete(s, key, id);
    chatBeforeDelete(s, key, id);
    blogBeforeDelete(s, key, id);
    storeBeforeDelete(s, key, id);
    webinarBeforeDelete(s, key, id);
    offerBeforeDelete(s, key, id);
    communityEventBeforeDelete(s, key, id);
    courseOfferBeforeDelete(s, key, id);
    certificateBeforeDelete(s, key, id);
    documentBeforeDelete(s, key, id);
    estimateBeforeDelete(s, key, id);
    invoiceBeforeDelete(s, key, id);
    emailBeforeDelete(s, key, id);
    checkoutBeforeDelete(s, key, id);
    catalogBeforeDelete(s, key, id);
    if (key==='contacts') {
      for (const related of ['tasks','opportunities','messages','appointments','invoices','threads']) s[related] = s[related].filter(r=>r.contactId!==id);
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
    for (const [collection, reference] of [['forms', 'formId'], ['triggerLinks', 'linkId']]) {
      if (key !== collection) continue;
      for (const workflow of [...s.workflows, ...s.deletedWorkflows]) {
        if (workflow[reference] === id) workflow.active = false;
      }
    }
    if (key === 'snippetFolders') s.snippets.forEach(snippet => { if (snippet.folderId === id) snippet.folderId = ''; });
    if (key === 'triggerLinks') {
      s.linkTickets = s.linkTickets.filter(ticket => ticket.linkId !== id);
      s.linkClicks = s.linkClicks.filter(click => click.linkId !== id);
    }
    if (key === 'workflowFolders') {
      for (const row of [...s.workflows, ...s.deletedWorkflows, ...s.workflowLists]) {
        if (row.folderId === id) row.folderId = '';
      }
    }
    if (key === 'workflows') {
      s.deletedWorkflows.push({ ...find(s, key, id), active: false, deletedAt: now() });
      const sla = s.conversationSla;
      sla.workflows = sla.workflows.filter(item => item !== id);
      if (sla.automation === 'selected' && !sla.workflows.length) sla.automation = 'none';
    }
    s[key] = s[key].filter(r=>r.id!==id);
    return id;
}

function other(s, command, type, key, id, d, workspace) {
  if (type === 'message') {
    const c = contactId(s, d.contactId);
    const channel = one(d.channel, messageChannels, 'channel');
    const direction = one(d.direction, ['Outbound','Inbound'], 'direction');
    let body = req(d.body, 'Message', 5000);
    if (direction === 'Outbound') {
      // Each trigger link becomes a per-contact ticket. The server passes its public origin so the link
      // also works outside the app (WhatsApp, e-mail); without it the path stays relative.
      const tickets = new Map();
      let base = '';
      try { const url = new URL(String(d.origin || '')); if (['https:', 'http:'].includes(url.protocol)) base = url.origin; } catch { base = ''; }
      body = body.replace(/\{\{trigger_link\.([a-f0-9-]{36})\}\}/g, (_, linkId) => {
        exists(s, 'triggerLinks', linkId, 'trigger link');
        if (!tickets.has(linkId)) tickets.set(linkId, add(s, 'linkTickets', { linkId, contactId: c, channel }).id);
        return `${base}/r/${workspace}/${tickets.get(linkId)}`;
      });
    }
    const msgId = add(s, 'messages', { contactId: c, body, subject: channel === 'Email' ? str(d.subject, 240) : '',
      channel, direction, read: direction !== 'Inbound', starred: false, origin: 'human' }).id;
    if (direction === 'Inbound') run(s, 'Customer replied', { contactId: c, channel, body });
    if (channel === 'Note') run(s, 'note_added', { contactId: c, body });
    return msgId;
  }
  if (type === 'manual-action') return finishManualAction(s, id, d);
  if (type === 'conversation-sla') return saveSla(s, d);
  if (type === 'dismiss-sla') {
    const message = find(s, 'messages', id);
    if (!s.conversationSla.enabled || message?.direction !== 'Inbound' || !slaChannels.includes(message.channel)) fail('SLA timer not found.', 404);
    message.slaDismissedAt ??= now();
    return id;
  }
  if (type === 'thread') {
    const ids = Array.isArray(d.contactIds) ? d.contactIds : [d.contactId];
    if (!ids.length || ids.length > 200) fail('Choose between 1 and 200 conversations.');
    const me = str(command.actor, 80) || 'Owner';
    for (const c of new Set(ids.map(value => contactId(s, value)))) {
      const rows=s.messages.filter(r=>r.contactId===c);
      if (Object.hasOwn(d,'read')) rows.forEach(r=>{r.read=Boolean(d.read);});
      if (Object.hasOwn(d,'starred')) rows.forEach(r=>{r.starred=Boolean(d.starred);});
      if (!Object.hasOwn(d,'assignee') && !Object.hasOwn(d,'follow')) continue;
      let meta = s.threads.find(r => r.contactId === c);
      if (!meta) meta = add(s, 'threads', { contactId: c, assignee: '', followers: [] });
      if (Object.hasOwn(d,'assignee')) meta.assignee = str(d.assignee, 80);
      if (Object.hasOwn(d,'follow')) meta.followers = d.follow ? [...new Set([...meta.followers, me])] : meta.followers.filter(name => name !== me);
      meta.updated = now();
    }
    return ids.length === 1 ? ids[0] : ids.length;
  }
  if (type === 'team-message') {
    const row = add(s, 'teamMessages', { author: str(command.actor, 80) || 'Owner', body: req(d.body, 'Message', 2000) });
    if (s.teamMessages.length > 500) s.teamMessages.splice(0, s.teamMessages.length - 500);
    return row.id;
  }
  if (type === 'submit') {
    const form = find(s,'forms',id);
    if (!form?.active) fail('Form not found.',404);
    if (!formOpen(form)) fail(form.schedule?.closedMessage || 'Este formulário não está recebendo respostas agora.',403);
    const read = readAnswers(form, d, s.customFields || []);
    if (!read.ok) fail(Object.entries(read.errors).map(([key, text]) => key === '_form' ? text : `${form.fields?.find(f => f.key === key)?.label || key}: ${text}`)[0]);
    const info = read.contact, addTags = tags([...(form.addTags || []), ...(read.result?.tierDetail?.tag ? [read.result.tierDetail.tag] : [])]);
    let c = (info.email && s.contacts.find(r=>r.email===info.email)) || (info.phone && s.contacts.find(r=>digits(r.phone) && digits(r.phone)===digits(info.phone)));
    if (!c) {
      c=add(s,'contacts',{ name:info.name || 'Contato do formulário', email:info.email, phone:info.phone, tags:addTags, company:info.company, notes:'', custom:customData(s,'Contact',{ custom:read.custom }) });
      run(s,'Contact created',{contactId:c.id});
    } else {
      if (!c.phone && info.phone) c.phone = info.phone;
      if (!c.email && info.email) c.email = info.email;
      if (!c.company && info.company) c.company = info.company;
      if (Object.keys(read.custom).length) c.custom = customData(s,'Contact',{ custom:{ ...(c.custom || {}), ...read.custom } });
      if (addTags.length) c.tags = tags([...(c.tags || []), ...addTags]);
      c.updated = now();
    }
    const submission=add(s,'submissions',{ formId:id, contactId:c.id, name:info.name || c.name, email:info.email, phone:info.phone, answers:read.answers, source:str(d._source,40) || 'Link', ...(read.result ? { result:{ score:read.result.score, max:read.result.max, percent:read.result.percent, tier:read.result.tier, categories:read.result.categories } } : {}) });
    if (s.submissions.length > 5000) s.submissions.splice(0, s.submissions.length - 5000);
    run(s,'Form submitted',{contactId:c.id,formId:id,tier:read.result?.tier || ''});
    return submission.id;
  }
  if (type === 'form-view') {
    const form = find(s,'forms',id);
    if (!form?.active) fail('Form not found.',404);
    const day = now().slice(0,10), byDay = { ...(form.viewsByDay || {}) };
    byDay[day] = (byDay[day] || 0) + 1;
    form.viewsByDay = Object.fromEntries(Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).slice(-120));
    form.views = (form.views || 0) + 1;
    return form.views;
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
    s.profile={name:req(d.name,'Workspace name'),email:email(d.email),phone:str(d.phone,48),timezone,currency:defaults.profile.currency}; return s.profile.name;
  }
  if (type === 'stage') {
    const previous = id && find(s,'stages',id);
    if (id && !previous) fail('Stage not found.',404);
    const name = req(d.name,'Stage name',50), probability = percent(d.probability);
    const color = stageColors.includes(d.color) ? d.color : '';
    if (previous) { Object.assign(previous,{ name, visible:d.visible !== false, probability, ...('color' in d ? { color } : {}) }); return previous.id; }
    const pipelineId = exists(s,'pipelines',d.pipelineId || salesPipeline,'pipeline');
    return add(s,'stages',{ name, pipelineId, visible:d.visible !== false, probability, color }).id;
  }
  const piped = pipelineCommand(s, type, id, d, { add, uid, now });
  if (piped !== undefined) return piped;
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
