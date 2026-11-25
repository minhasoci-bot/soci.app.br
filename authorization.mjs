import { accountLifecycle } from './agency-model.mjs';
import { eventSendsView, touchesDeliveries } from './event-send-model.mjs';
import { blank, metrics } from './model.mjs';
import { moduleOfRecord, subAccountModules } from './ui/agency-data.js';

const moduleKeys = new Set(subAccountModules.map(([key]) => key));
const readModules = {
  ...moduleOfRecord, fiscal: 'settings',
  messages: 'conversations', manualActions: 'conversations', threads: 'conversations',
  teamMessages: 'conversations', inboxViews: 'conversations', conversationSla: 'conversations',
  linkTickets: 'conversations', linkClicks: 'conversations',
  runs: 'automation', deletedWorkflows: 'automation', submissions: 'sites',
  eventSendSettings: 'marketing', socialAccounts: 'marketing', socialPosts: 'marketing', socialImports: 'marketing',
  dashboards: 'dashboard', defaultDashboard: 'dashboard', onboarding: 'dashboard',
  dashboardReports: 'reporting', customReports: 'reporting', integrations: 'settings',
  seo: 'reputation', seoAudits: 'reputation', visibility: 'reputation', visibilityRuns: 'reputation', wallet: 'settings', appLog: 'settings'
};

const writeModules = {
  ...moduleOfRecord,
  inboxViews: 'conversations'
};

const commandModules = {
  'ad-settings': 'marketing', 'tracking-settings': 'settings', fiscal: 'settings', 'tracking-google-lead-key': 'settings', 'phone-number-save': 'settings', 'dialer-queue-add': 'conversations', 'dialer-queue-remove': 'conversations', 'dialer-disposition': 'conversations', 'affiliate-settings': 'marketing', 'affiliate-portal-link': 'marketing', 'commission-review': 'marketing', 'affiliate-payout': 'marketing',
  'reputation-settings': 'reputation', 'review-request': 'reputation', 'review-visibility': 'reputation', 'listing-save': 'reputation',
  'dashboard-create': 'dashboard', 'dashboard-save': 'dashboard', 'dashboard-restore': 'dashboard',
  'dashboard-report': 'dashboard', 'dashboard-default': 'dashboard', 'dashboard-timezone': 'dashboard', 'dashboard-delete': 'dashboard',
  'report-create': 'reporting', 'report-save': 'reporting', 'report-delete': 'reporting',
  'report-share': 'reporting', 'report-schedule': 'reporting',
  'form-view': 'sites', submit: 'sites', 'link-click': 'conversations',
  'media-trash': 'media', 'media-restore': 'media', 'media-empty-trash': 'media',
  'social-post': 'marketing', 'social-reschedule': 'marketing', 'social-review': 'marketing',
  'social-duplicate': 'marketing', 'social-delete': 'marketing', 'social-bulk-delete': 'marketing',
  'social-retry': 'marketing', 'social-csv': 'marketing', 'social-account-remove': 'marketing',
  'prancheta-save': 'marketing', 'prancheta-delete': 'marketing', 'prancheta-duplicate': 'marketing',
  'email-campaign-schedule': 'marketing', 'email-campaign-cancel': 'marketing', 'email-campaign-duplicate': 'marketing',
  'event-plan-duplicate': 'marketing', 'event-plan-orchestrate': 'marketing',
  'event-message-preview': 'marketing', 'event-message-schedule': 'marketing', 'event-message-cancel': 'marketing', 'event-message-retry': 'marketing', 'event-groups-save': 'marketing', 'event-send-settings': 'marketing',
  'prancheta-export-media': 'marketing', 'prancheta-to-social': 'marketing', 'prancheta-template': 'marketing',
  message: 'conversations', thread: 'conversations', 'team-message': 'conversations',
  'manual-action': 'conversations', 'conversation-sla': 'conversations', 'dismiss-sla': 'conversations',
  pipeline: 'opportunities', stage: 'opportunities', import: 'contacts',
  'opportunity-import': 'opportunities', 'opportunity-move': 'opportunities',
  'opportunity-close': 'opportunities', 'pipeline-settings': 'opportunities', 'pipeline-order': 'opportunities',
  'pipeline-duplicate': 'opportunities', 'pipeline-delete': 'opportunities', 'stage-order': 'opportunities',
  'stage-delete': 'opportunities', 'smart-tag': 'opportunities', 'smart-tag-delete': 'opportunities',
  'studio-visit': 'sites', 'studio-star': 'sites', 'studio-meta': 'sites',
  'chat-start': 'sites', 'chat-send': 'sites', 'blog-view': 'sites',
  'store-checkout': 'payments', 'webinar-register': 'sites', 'webinar-attend': 'sites',
  'webinar-reminders': 'sites', 'qr-scan': 'sites',
  'community-event-ticket': 'memberships', 'community-event-joined': 'memberships', 'community-event-reminders': 'memberships',
  'community-plan-invoice': 'memberships', 'community-welcome': 'memberships', 'community-newsletter': 'memberships', 'community-activity': 'memberships', 'portal-login': 'memberships', 'course-activity': 'memberships', 'offer-access': 'memberships', 'credential-issue': 'memberships', 'credential-revoke': 'memberships',
  'ticket-create': 'conversations', 'ticket-update': 'conversations', 'ticket-note': 'conversations', 'ticket-reply': 'conversations', 'ticket-settings': 'conversations', 'sequence-enroll': 'marketing', 'sequence-remove': 'marketing', 'seo-settings': 'reputation', 'seo-audit': 'reputation', 'visibility-settings': 'reputation', 'visibility-run': 'reputation', 'meeting-transcript': 'calendars', 'meeting-summary': 'calendars', 'meeting-tasks': 'calendars', 'meeting-note': 'calendars', 'scheduling-settings': 'calendars', 'scheduling-book': 'calendars', 'field-status': 'calendars', 'loyalty-settings': 'marketing', 'loyalty-adjust': 'marketing', 'loyalty-redeem': 'marketing', 'preferences-settings': 'settings', 'preferences-link': 'contacts', 'preferences-save': 'contacts', 'contact-restore': 'contacts', 'contact-trash-purge': 'contacts', 'contact-trash-empty': 'contacts',
  onboarding: 'dashboard', profile: 'settings', 'labs-toggle': 'settings',
  'workflow-enroll': 'automation', 'workflow-restore': 'automation', 'workflow-move': 'automation',
  'document-send': 'payments', 'document-void': 'payments', 'document-link': 'payments',
  'estimate-send': 'payments', 'estimate-link': 'payments', 'estimate-revise': 'payments', 'estimate-status': 'payments', 'estimate-invoice': 'payments',
  'payment-settings': 'payments', 'catalog-inventory': 'payments', 'catalog-giftcard-products': 'payments', 'catalog-giftcard-send': 'payments', 'catalog-giftcard-adjust': 'payments', 'catalog-reviews': 'payments', 'checkout-settings': 'payments', 'checkout-remind': 'payments', 'invoice-from-template': 'payments', 'invoice-send': 'payments', 'invoice-recurring-start': 'payments', 'invoice-recurring-pause': 'payments', 'invoice-recurring-cancel': 'payments'
};

const agencySettingsCommands = new Set([
  'account-meta', 'account-reactivate', 'saas-mode', 'saas-rebilling', 'rebill-account', 'saas-account', 'workflow-builder',
  'sub-feature', 'email-domain', 'email-domain-accounts', 'email-domain-remove', 'affiliate-pixel', 'profile',
  'company', 'fiscal', 'billing-plan', 'wallet', 'auto-recharge', 'system-email', 'labs', 'ai-defaults', 'studio-app-save', 'studio-app-publish', 'studio-app-delete', 'studio-app-rotate', 'compliance',
  'api-key', 'api-key-delete', 'private-integration', 'private-integration-delete', 'resell',
  'addon-request', 'addon-cancel', 'affiliate-pay', 'mobile-app', 'mobile-app-store', 'mobile-app-publish', 'desktop-app', 'desktop-app-publish', 'integration',
  'app-install', 'app-uninstall', 'app-resell'
]);
const agencySettingsRecords = new Set(['users', 'plans', 'menuLinks', 'announcements']);
const snapshotSources = ['contacts', 'opportunities', 'conversations', 'calendars', 'automation', 'payments', 'marketing', 'reputation', 'sites', 'settings'];
const contactDirectory = ['conversations', 'opportunities', 'calendars', 'payments', 'automation', 'memberships'];

export const denies = (message, status = 403) => Object.assign(new Error(message), { status });
export const hasModule = (access, module) => access.modules === null || access.modules?.includes(module) === true;

export function requireModule(access, ...modules) {
  if (modules.some(module => !hasModule(access, module))) throw denies('Seu usuário não tem permissão para este módulo.');
}

export function requireCapability(access, capability, message) {
  if (!access[capability]) throw denies(message);
}

// Identity and membership come from the verified session. Only structured plan modules restrict legacy accounts.
// The AI Studio became part of Sites: users and plans saved with "studio" keep their access as "sites".
const merged = modules => Array.isArray(modules) ? [...new Set(modules.map(module => module === 'studio' ? 'sites' : module))] : modules;

export function effectiveAccess(agency, rawActor, workspaceId, personal = false) {
  const actor = { ...rawActor, modules: merged(rawActor.modules) };
  const account = personal ? { status: 'Active' } : accountLifecycle(agency, workspaceId);
  const plan = personal ? null : agency.plans?.find(row => row.id === agency.accounts?.[workspaceId]?.plan);
  const planModules = Array.isArray(plan?.modules) ? merged(plan.modules).filter(module => moduleKeys.has(module)) : null;
  const modules = planModules === null ? actor.modules : planModules.filter(module => hasModule(actor, module));
  return { ...actor, modules, account, support: account.status !== 'Active' && actor.settings === true };
}

export function requireAgencyCommand(actor, command, agency) {
  const record = command.type === 'save' || command.type === 'delete';
  if (['snapshot-share', 'snapshot-rename', 'snapshot-delete'].includes(command.type)) {
    const snapshot = agency.snapshots.find(row => row.id === command.id);
    if (snapshot) requireSetupModules(actor, Object.keys(snapshot.assets || {}));
  }
  if (!record && !agencySettingsCommands.has(command.type)) return;
  if (agencySettingsCommands.has(command.type) || agencySettingsRecords.has(command.key)) {
    requireCapability(actor, 'settings', 'Only agency owners and admins can change agency settings.');
  }
  if (record && command.key === 'users' && actor.role !== 'Agency Owner' &&
      (command.data?.role === 'Agency Owner' || agency.users.find(user => user.id === command.id)?.role === 'Agency Owner')) {
    throw denies('Somente o proprietário pode conceder ou alterar o papel de proprietário.');
  }
}

export function requireWorkspaceCommand(access, command) {
  const { type, key, data } = command;
  const module = type === 'save' || type === 'delete' ? (Object.hasOwn(writeModules, key) ? writeModules[key] : undefined)
    : type === 'bulk' ? (['contacts', 'opportunities'].includes(data?.object) ? data.object : undefined)
      : Object.hasOwn(commandModules, type) ? commandModules[type] : undefined;
  if (!module) throw denies('Unknown operation.', 400);
  requireModule(access, module);
  if (type === 'dashboard-report') requireModule(access, 'reporting', ...snapshotSources);
  if (type === 'event-plan-orchestrate') requireModule(access, 'contacts', 'calendars');
  // O envio sai pelo WhatsApp da subconta.
  if (/^event-(message|send|groups)-/.test(type)) requireModule(access, 'conversations');
}

export function requireSetupModules(access, keys) {
  requireModule(access, ...new Set(keys.map(key => readModules[key]).filter(Boolean)));
}

export function requireRecordEffects(access, state, command) {
  if (access.modules === null) return;
  const { type, key, id, data } = command;
  if (touchesDeliveries(state, command)) requireModule(access, 'conversations');
  const deletingContact = (type === 'delete' && key === 'contacts') ||
    (type === 'bulk' && data?.object === 'contacts' && data.operation === 'delete');
  if (deletingContact) {
    const requested = Array.isArray(data?.ids) ? data.ids.filter(value => typeof value === 'string') : [];
    const ids = new Set(type === 'delete' ? [id] : [...new Set(requested)].slice(0, 500));
    for (const collection of ['opportunities', 'messages', 'threads', 'linkTickets', 'linkClicks', 'appointments', 'invoices',
      'subscriptions', 'transactions', 'submissions', 'manualActions', 'runs', 'documents', 'estimates', 'recurringInvoices', 'abandonedCheckouts']) {
      if (state[collection]?.some(row => ids.has(row.contactId))) requireModule(access, readModules[collection]);
    }
  }
  if (type === 'delete' && ['forms', 'triggerLinks'].includes(key)) {
    const field = key === 'forms' ? 'formId' : 'linkId';
    if ([...state.workflows, ...state.deletedWorkflows].some(row => row[field] === id)) requireModule(access, 'automation');
  }
  if (type === 'delete' && key === 'files' && state.socialPosts.some(post => post.media?.some(item => item.fileId === id))) {
    requireModule(access, 'marketing');
  }
  if (type === 'media-empty-trash') {
    const trashed = new Set(state.files.filter(file => file.trashedAt).map(file => file.id));
    if (state.socialPosts.some(post => post.media?.some(item => trashed.has(item.fileId)))) requireModule(access, 'marketing');
  }
  if (type === 'delete' && key === 'customFields') {
    for (const collection of ['contacts', 'companies', 'opportunities']) {
      if (state[collection].some(row => Object.hasOwn(row.custom || {}, id))) requireModule(access, readModules[collection]);
    }
  }
  if (type === 'social-post' && Array.isArray(data?.media) && data.media.some(item => item?.fileId)) requireModule(access, 'media');
  if (['social-duplicate', 'social-retry', 'social-reschedule', 'social-review'].includes(type) &&
      state.socialPosts.find(post => post.id === id)?.media?.some(item => item.fileId)) {
    requireModule(access, 'media');
  }
  if (type === 'conversation-sla' && data?.automation && data.automation !== 'none') requireModule(access, 'automation');
  if (type === 'save' && key === 'workflows') {
    const actions = data?.actions ?? state.workflows.find(row => row.id === id)?.actions;
    const effects = { 'Add tag': 'contacts', 'Create task': 'contacts', 'Create opportunity': 'opportunities', 'Log message': 'conversations',
      'Manual Call': 'conversations', 'Manual SMS': 'conversations' };
    for (const action of (Array.isArray(actions) ? actions.slice(0, 10) : [])) {
      if (Object.hasOwn(effects, action?.type)) requireModule(access, effects[action.type]);
    }
  }
}

export function workspaceView(access, state) {
  // A fila de envios tem nome e telefone: só a parte que a tela usa, e só para quem planeja e conversa.
  const eventSends = hasModule(access, 'marketing') && hasModule(access, 'conversations') ? eventSendsView(state.eventSends) : [];
  // The ledger outbox is plumbing between the state and the ledger table; browsers never get it.
  if (access.modules === null) {
    const { ledgerOutbox: _outbox, ...visible } = state;
    return { state: state.eventSends?.length ? { ...visible, eventSends } : visible, metrics: metrics(state) };
  }
  const { ledgerOutbox: _empty, ...view } = blank();
  view.eventSends = eventSends;
  const { name, timezone, currency } = state.profile;
  view.profile = hasModule(access, 'settings') ? state.profile : { name, timezone, currency };
  for (const [key, module] of Object.entries(readModules)) {
    if (hasModule(access, module) && Object.hasOwn(state, key)) view[key] = state[key];
  }
  if (!hasModule(access, 'contacts') && contactDirectory.some(module => hasModule(access, module))) {
    const messaging = hasModule(access, 'conversations');
    view.contacts = state.contacts.map(({ id, name, email, phone, company, tags }) =>
      messaging ? { id, name, email, phone, company, tags: tags || [] } : { id, name });
  }
  if (!hasModule(access, 'settings')) {
    view.customFields = state.customFields.filter(field => field.object === 'Opportunity' ? hasModule(access, 'opportunities')
      : hasModule(access, 'contacts') || (field.object === 'Contact' && hasModule(access, 'sites')));
  }
  if (!snapshotSources.every(module => hasModule(access, module))) view.dashboardReports = [];
  // Every screen needs to know which Labs features are on (Conversas shows the AI buttons, for one).
  view.labs = state.labs || view.labs;
  // Installed apps feed the workflow builder (app actions and triggers) of anyone who builds flows.
  view.appInstalls = state.appInstalls || [];
  for (const key of ['bulkActions', 'imports']) {
    view[key] = state[key].filter(row => hasModule(access, row.object === 'opportunities' ? 'opportunities' : 'contacts'));
  }
  const counts = metrics(view);
  if (!hasModule(access, 'contacts')) counts.contacts = 0;
  return { state: view, metrics: counts };
}
