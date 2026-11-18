import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { blank, seed, uid, execute, find } from './model.mjs';
import { createSqliteStore, supabaseFromEnv } from './storage.mjs';
import { accountProfile, afterLogin, authFromEnv } from './auth.mjs';
import { discoverDesign, generatePage, generateSite, planSite, revisePage, suggestSeo } from './studio-ai.mjs';
import { localPlan, questionsFor, validDesign, validPlan } from './ui/studio-design.js';
import { designAgent, replyAsAgent } from './agent-ai.mjs';
import { createOpenAI, openAIModel } from './openai.mjs';
import { agentBuildRequest, agentPreview, applyAgentDesign, editAgent, recordAgentRun } from './agent-model.mjs';
import { addPage, chatEntry, countVisit, designedPage, deletePage, duplicatePage, findPage, movePage, resetStats, setSeo, setSlug, thankYouPage, newSiteDoc, pageFromStructure, previewHeaders, publicDoc, publicHeaders, publish, readReference, renamePage, renderPublic, restoreVersion, savePage, siteRowId } from './studio-site.mjs';
import { starterProject, studioTemplates } from './ui/studio-data.js';
import { formOpen, formPage, readAnswers } from './ui/form-fields.js';
import { AGENCY_ID, agencyForWorkspace, agencyOverview, applySnapshot, blankAgency, catalogTemplate, executeAgency, extractSnapshot, hash, hydrateAgency, installTemplate, userAccess } from './agency-model.mjs';
import { MARKETPLACE_DOC_ID, emptyMarketplace, findMarketplaceSetup, hydrateMarketplace, publicMarketplaceList, publishToMarketplace, recordMarketplaceInstall, unpublishFromMarketplace } from './setup-marketplace.mjs';
import { captureProspectWidget, runProspectingAction } from './prospecting-model.mjs';
import { collectProspectAudit } from './prospect-audit.mjs';
import { mapsEmbedKey, placesConfigured, placesSearch } from './prospecting-places.mjs';
import { folded, prospectSearchText } from './ui/prospecting-data.js';
import { shareReportHtml, widgetHtml } from './ui/prospect-report.js';
import { snapshotAssets } from './ui/agency-data.js';
import { effectiveAccess, hasModule, requireAgencyCommand, requireCapability, requireModule, requireRecordEffects, requireSetupModules, requireWorkspaceCommand, workspaceView } from './authorization.mjs';
import { attachAccounts, claimDue, evergreenDue, reviewSocialCsv, settle } from './social-model.mjs';
import { authUrl, availability, blueskyLogin, exchange as socialExchange, publish as socialPublish, seal, unseal } from './social-providers.mjs';
import { network } from './ui/social-data.js';
import { createAskHandler } from './soci-chat.mjs';
import { createWahaHandler } from './waha.mjs';
import { createWhatsAppHandler } from './whatsapp.mjs';
import { makeClientPortal, portalCookie } from './client-portal.mjs';
import { randomBytes } from 'node:crypto';
import { chatHistory } from './chat-model.mjs';
import { chatPage, demoPage, loaderScript } from './ui/chat-widget-data.js';
import { blogHome, blogPost, blogRss, isLive } from './ui/blog-data.js';
import { localDraft, postSeo, writePost } from './blog-ai.mjs';
import { catalog, methodLabel, storeCart, storeHome, storeProduct } from './ui/store-data.js';
import { quoteOrder } from './store-model.mjs';
import { calendarFile, registrationPage, roomPage } from './ui/webinar-data.js';
import { deviceOf, qrTarget } from './qr-model.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const staticFiles = new Map([
  ['/app.js','text/javascript; charset=utf-8'], ['/icons.js','text/javascript; charset=utf-8'],
  ['/screens.js','text/javascript; charset=utf-8'], ['/conversations.js','text/javascript; charset=utf-8'],
  ['/dashboard.js','text/javascript; charset=utf-8'], ['/dashboard-data.js','text/javascript; charset=utf-8'],
  ['/dashboard-controls.js','text/javascript; charset=utf-8'], ['/dashboard-metrics.js','text/javascript; charset=utf-8'], ['/dashboard.css','text/css; charset=utf-8'],
  ['/studio.js','text/javascript; charset=utf-8'], ['/sites.js','text/javascript; charset=utf-8'], ['/forms.js','text/javascript; charset=utf-8'], ['/form-fields.js','text/javascript; charset=utf-8'], ['/forms.css','text/css; charset=utf-8'], ['/blogs.js','text/javascript; charset=utf-8'], ['/stores.js','text/javascript; charset=utf-8'], ['/webinars.js','text/javascript; charset=utf-8'], ['/webinar-data.js','text/javascript; charset=utf-8'], ['/qr.js','text/javascript; charset=utf-8'], ['/qr-codes.js','text/javascript; charset=utf-8'], ['/sites-analytics.js','text/javascript; charset=utf-8'], ['/marketing-sites.css','text/css; charset=utf-8'], ['/stores.css','text/css; charset=utf-8'], ['/store-data.js','text/javascript; charset=utf-8'], ['/blogs.css','text/css; charset=utf-8'], ['/blog-data.js','text/javascript; charset=utf-8'], ['/chat-widgets.js','text/javascript; charset=utf-8'], ['/chat-widgets.css','text/css; charset=utf-8'], ['/chat-widget-data.js','text/javascript; charset=utf-8'], ['/studio-builder.js','text/javascript; charset=utf-8'], ['/studio-design.js','text/javascript; charset=utf-8'], ['/studio-builder.css','text/css; charset=utf-8'], ['/sites.css','text/css; charset=utf-8'], ['/studio-data.js','text/javascript; charset=utf-8'], ['/studio.css','text/css; charset=utf-8'],
  ['/design-workspace.js','text/javascript; charset=utf-8'], ['/design-workspace.css','text/css; charset=utf-8'],
  ['/automation.js','text/javascript; charset=utf-8'], ['/automation.css','text/css; charset=utf-8'],
  ['/client-portal.js','text/javascript; charset=utf-8'], ['/portal-page.js','text/javascript; charset=utf-8'], ['/client-portal.css','text/css; charset=utf-8'],
  ['/agents.js','text/javascript; charset=utf-8'], ['/agents-data.js','text/javascript; charset=utf-8'], ['/agents.css','text/css; charset=utf-8'],
  ['/agency.js','text/javascript; charset=utf-8'], ['/agency-data.js','text/javascript; charset=utf-8'], ['/agency.css','text/css; charset=utf-8'],
  ['/soci-chat.js','text/javascript; charset=utf-8'], ['/soci-chat.css','text/css; charset=utf-8'],
  ['/highlight.js','text/javascript; charset=utf-8'],
  ['/vendor/marked.js','text/javascript; charset=utf-8'], ['/vendor/purify.js','text/javascript; charset=utf-8'],
  ['/color-picker.js','text/javascript; charset=utf-8'],
  ['/prospecting.js','text/javascript; charset=utf-8'], ['/prospecting-data.js','text/javascript; charset=utf-8'],
  ['/prospect-report.js','text/javascript; charset=utf-8'], ['/prospecting.css','text/css; charset=utf-8'],
  ['/crm.js','text/javascript; charset=utf-8'], ['/crm-data.js','text/javascript; charset=utf-8'],
  ['/opportunity-data.js','text/javascript; charset=utf-8'], ['/opportunities.css','text/css; charset=utf-8'],
  ['/social.js','text/javascript; charset=utf-8'], ['/social-data.js','text/javascript; charset=utf-8'], ['/social.css','text/css; charset=utf-8'],
  ['/social-connect.js','text/javascript; charset=utf-8'],
  ['/style.css','text/css; charset=utf-8'], ['/index.html','text/html; charset=utf-8'],
  ['/graao.css','text/css; charset=utf-8'], ['/lucide-animated.css','text/css; charset=utf-8'], ['/inbox.css','text/css; charset=utf-8'], ['/inbox.js','text/javascript; charset=utf-8'], ['/inbox-data.js','text/javascript; charset=utf-8'], ['/graao-dark.css','text/css; charset=utf-8'], ['/graao.js','text/javascript; charset=utf-8'], ['/sidebar.js','text/javascript; charset=utf-8'],
  ['/topbar.js','text/javascript; charset=utf-8'], ['/i18n.js','text/javascript; charset=utf-8'],
  ['/fonts/plus-jakarta-sans.woff2','font/woff2'], ['/favicon.svg','image/svg+xml'],
  ['/landing.html','text/html; charset=utf-8'], ['/landing.css','text/css; charset=utf-8'], ['/landing.js','text/javascript; charset=utf-8'],
  ['/privacidade.html','text/html; charset=utf-8'], ['/skull_flame.svg','image/svg+xml'], ['/skull_flame_animated.svg','image/svg+xml']
]);
const host = '127.0.0.1';
const defaultPort = Number(process.env.GO_PORT || 4317);
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://accounts.google.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com; frame-src 'self' https: https://accounts.google.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
const error = (message,status) => Object.assign(new Error(message),{status});
const spaceId = /^[0-9a-f-]{36}$|^demo$/;
const privateSpace = /^user-[0-9a-f-]{36}$/;
const personalId = session => `user-${session.id}`;
const workspaceSegment = '(demo|(?:user-)?[0-9a-f-]{36})';
const portalPage = new RegExp(`^/portal/${workspaceSegment}/?$`);
const portalApi = new RegExp(`^/api/client-portal/${workspaceSegment}/(admin|home|exchange|logout|course)(?:/([0-9a-f-]{36}))?$`);
const paths = new RegExp(`^/(p|f|course)/${workspaceSegment}/([0-9a-f-]{36})$`);
const chatPath = new RegExp(`^/chat/${workspaceSegment}/([0-9a-f-]{36})(?:/(widget\\.js|demo))?/?$`);
const chatApi = new RegExp(`^/api/chat/${workspaceSegment}/([0-9a-f-]{36})/(start|send|messages)$`);
const webinarPath = new RegExp(`^/w/${workspaceSegment}/([0-9a-f-]{36})(?:/(sala|agenda\\.ics))?/?$`);
const webinarApi = new RegExp(`^/api/webinar/${workspaceSegment}/([0-9a-f-]{36})/register$`);
const qrPath = new RegExp(`^/q/${workspaceSegment}/([0-9a-f-]{36})$`);
const storePath = new RegExp(`^/loja/${workspaceSegment}/([0-9a-f-]{36})(?:/(carrinho)|/p/([a-z0-9-]{1,80}))?/?$`);
const storeApi = new RegExp(`^/api/store/${workspaceSegment}/([0-9a-f-]{36})/(quote|checkout)$`);
const blogPath = new RegExp(`^/b/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,80}|rss\\.xml))?/?$`);
const formPath = new RegExp(`^/form/${workspaceSegment}/([0-9a-f-]{36})/?$`);
const redirectPath = new RegExp(`^/r/${workspaceSegment}/([0-9a-f-]{36})$`);
const socialFilePath = new RegExp(`^/m/${workspaceSegment}/([0-9a-f-]{36})$`);
const socialInvitePath = new RegExp(`^/social-connect/${workspaceSegment}/?$`);
const previewPath = new RegExp(`^/studio-preview/${workspaceSegment}/([0-9a-f-]{36})/([0-9a-f-]{36})$`);
const sitePath = new RegExp(`^/s/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,48}))?$`);
const prospectPublicPath = /^\/prospecting\/(report|widget)\/([0-9a-f-]{36})$/;
const apiPath = /^\/api\/v1\/subaccounts(?:\/(demo|[0-9a-f-]{36})\/contacts)?$/;
function publicAgency(agency, who) {
  const view = { ...agency,
    snapshots: agency.snapshots.map(({ studioSites: _studioSites, ...rest }) => rest),
    apiKeys: agency.apiKeys.map(({ hash: _hash, ...rest }) => rest),
    privateIntegrations: agency.privateIntegrations.map(({ hash: _hash, ...rest }) => rest)
  };
  if (!who.settings) {
    const empty = blankAgency();
    for (const key of ['profile', 'users', 'billing', 'apiKeys', 'privateIntegrations', 'audit', 'emailServices', 'systemEmails', 'compliance']) {
      if (Object.hasOwn(empty, key)) view[key] = empty[key];
    }
    view.accounts = Object.fromEntries(Object.entries(agency.accounts).map(([id, { statusHistory, ignoredWebhooks, suspendedReason, ...meta }]) => [id, meta]));
  }
  if (who.modules !== null || !who.settings) view.snapshots = view.snapshots.map(({ assets, shareCode, ...snap }) => snap);
  return view;
}
const stamp = () => new Date().toISOString();

const defaultDbPath = process.env.GO_DB_PATH ? resolve(process.env.GO_DB_PATH) : (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? resolve(tmpdir(), 'go.sqlite')
  : resolve(root, '.data', 'go.sqlite');

export function makeServer({
  dbPath=defaultDbPath, port=defaultPort, store=createSqliteStore(dbPath), socialScheduler=!process.env.VERCEL,
  auth=authFromEnv(), agencyOwnerId=process.env.GO_AGENCY_OWNER_ID, agentModel=openAIModel, generateAgentReply=replyAsAgent, designAgentConfig=designAgent,
  openAISecret=process.env.GO_STORAGE_KEY, openAIRequest=fetch, wahaRequest=fetch, whatsappRequest=fetch,
  uazapiBaseUrl=process.env.UAZAPI_BASE_URL || '', uazapiAdminToken=process.env.UAZAPI_ADMIN_TOKEN || '',
  portalOptions={}, prospectAudit=collectProspectAudit,
  allowLocalAccess=process.env.GO_DEV_NO_AUTH === '1'
}={}) {
  const localAccess = !auth && !process.env.VERCEL && allowLocalAccess;
  const openAI = createOpenAI({ store, model: agentModel, secret: openAISecret, request: openAIRequest });
  const handleAsk = createAskHandler({ store, openAI, openAIRequest });
  const waha = createWahaHandler({ store, secret: openAISecret, request: wahaRequest });
  const whatsapp = createWhatsAppHandler({
    store, secret: openAISecret, request: whatsappRequest, envBaseUrl: uazapiBaseUrl, envAdminToken: uazapiAdminToken
  });
  const clientPortal = makeClientPortal({ ...portalOptions, store });
  const ready = Promise.all([store.insert('demo', seed()), store.insert(AGENCY_ID, blankAgency())]);
  ready.catch(() => {});
  const workspaceOwner = id => id === AGENCY_ID ? null : id;
  const listWorkspaces = async agencyId => (await store.list(workspaceOwner(agencyId))).filter(w => spaceId.test(w.id));
  const loadAgency = async id => hydrateAgency(await store.load(id));
  const changeAgency = (id, mutate) => store.change(id, state => mutate(hydrateAgency(state)));
  async function loadMarketplace() {
    try { return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID)); }
    catch (e) {
      if (e.status !== 404) throw e;
      await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
      return hydrateMarketplace(await store.load(MARKETPLACE_DOC_ID));
    }
  }
  async function changeMarketplace(mutate) {
    await store.insert(MARKETPLACE_DOC_ID, emptyMarketplace());
    return store.change(MARKETPLACE_DOC_ID, doc => mutate(hydrateMarketplace(doc)));
  }
  async function extractStudioSites(assets) {
    const sites = {};
    for (const project of assets.studioProjects || []) {
      try {
        const doc = await store.load(siteRowId(project.id));
        const copy = structuredClone(doc);
        copy.published = false;
        if (copy.stats) copy.stats = { visits: 0, leads: 0 };
        sites[project.id] = copy;
      } catch (e) { if (e.status !== 404) throw e; }
    }
    return sites;
  }
  async function applyStudioSites(snap, studioMap, targetWorkspaceId) {
    if (!snap.studioSites || !studioMap?.size) return;
    for (const [oldId, newId] of studioMap.entries()) {
      const sourceDoc = snap.studioSites[oldId];
      if (!sourceDoc) continue;
      const copy = structuredClone(sourceDoc);
      copy.profile = { name: copy.profile?.name || 'Studio Site' };
      copy.workspace = targetWorkspaceId;
      copy.projectId = newId;
      copy.published = null;
      copy.updatedAt = stamp();
      if (Array.isArray(copy.pages)) copy.pages = copy.pages.map(pg => ({ ...pg, id: uid() }));
      const rowId = siteRowId(newId);
      const inserted = await store.insert(rowId, copy);
      if (!inserted) await store.change(rowId, state => Object.assign(state, copy));
    }
  }
  const logTo = (agency, who, action, target = '', details = '') => {
    agency.audit.push({ id: uid(), at: stamp(), actor: who.name, action, target, details });
    if (agency.audit.length > 1000) agency.audit.splice(0, agency.audit.length - 1000);
  };
  const ensureAccounts = (agency, workspaces) => {
    for (const w of workspaces) {
      agency.accounts[w.id] ??= { status: 'Active', created: w.id === 'demo' ? '' : stamp(), lastLogin: '', plan: '', address: '', phone: '', website: '' };
      if (w.name) agency.accounts[w.id].name = w.name;
    }
  };
  const requestUsers = new WeakMap();
  function verifiedUser(req, res) {
    if (!auth) return null;
    if (!requestUsers.has(req)) {
      requestUsers.set(req, auth.user(req,res).then(user => {
        if (!user) throw error('Entre na sua conta para continuar.',401);
        return accountProfile(user);
      }));
    }
    return requestUsers.get(req);
  }
  async function accessContext(req,session) {
    if (!session && !localAccess) throw error('O login do Supabase ainda não foi configurado.',503);
    const agencyId = !session || session.id === agencyOwnerId ? AGENCY_ID : `agency-${session.id}`;
    let agency;
    try { agency = await loadAgency(agencyId); }
    catch (e) { if (e.status !== 404 || agencyId === AGENCY_ID) throw e; }
    if (!agency) {
      const email = session.email.toLowerCase();
      const invite = await store.findAgency({ users: [{ email, loginEnabled: true }] });
      if (invite) {
        agency = hydrateAgency(invite.state);
        const member = agency.users.find(user => user.loginEnabled && user.email === email);
        const who = { ...userAccess(agency,member.id), agencyId: invite.id, userId: member.id, session, owner: member.role === 'Agency Owner' };
        return { agency, who };
      }
      const initial = blankAgency();
      Object.assign(initial.profile, { name: session.name, email: session.email });
      const [first, ...last] = (session.name === session.email ? '' : session.name).split(/\s+/);
      initial.profile.first = first || 'Responsável';
      initial.profile.last = last.join(' ');
      initial.company.name = 'Minha agência';
      await store.insert(agencyId,initial);
      agency = await loadAgency(agencyId);
    }
    const userId = localAccess ? String(req.headers['x-go-user'] || req.localSocialUser || '') : '';
    const result = userAccess(agency,userId);
    if (!result) throw error('The selected user no longer exists. Choose another user.',403);
    const who = { ...result, agencyId, userId, session, ...(session ? { name: session.name, owner: true } : {}) };
    return { agency, who };
  }
  const access = async (req,res) => (await accessContext(req,await verifiedUser(req,res))).who;
  const canOpenPersonal = (who,id) => Boolean(who.owner && who.session && personalId(who.session) === id);
  async function canOpen(who,id) {
    if (privateSpace.test(id)) return canOpenPersonal(who,id);
    if (who.accounts && !who.accounts.includes(id)) return false;
    return store.belongsToAgency(id,workspaceOwner(who.agencyId));
  }
  const pausedError = (lifecycle, showReason = false) => Object.assign(
    error(lifecycle.status === 'Closed' ? 'Esta subconta foi encerrada.' : 'Esta subconta está pausada.', 403),
    { code: 'ACCOUNT_SUSPENDED', account: showReason ? lifecycle : { status: lifecycle.status } }
  );
  async function systemWorkspaceAccess(id, agencyId) {
    const actor = { modules: null };
    if (privateSpace.test(id)) return effectiveAccess({}, actor, id, true);
    const owner = agencyId || (await store.load(id)).agencyId || AGENCY_ID;
    return effectiveAccess(await store.load(owner), actor, id);
  }
  const accountIsActive = async (agencyId, id, module) => {
    const access = await systemWorkspaceAccess(id, agencyId);
    return access.account.status === 'Active' && (!module || hasModule(access, module));
  };
  async function requireActiveAccount(agencyId, id, showReason = false, module) {
    const access = await systemWorkspaceAccess(id, agencyId);
    const lifecycle = access.account;
    if (lifecycle.status !== 'Active') throw pausedError(lifecycle, showReason);
    if (module) requireModule(access, module);
  }
  async function webhookBlockReason(agencyId, id, provider) {
    const access = await systemWorkspaceAccess(id, agencyId);
    if (access.account.status === 'Active') return hasModule(access, 'conversations') ? null : 'MODULE_DISABLED';
    await changeAgency(agencyId, agency => {
      const meta = agency.accounts[id];
      meta.ignoredWebhooks ??= {};
      const prior = meta.ignoredWebhooks[provider];
      meta.ignoredWebhooks[provider] = { count: (prior?.count || 0) + 1, lastAt: stamp() };
    });
    return 'ACCOUNT_SUSPENDED';
  }
  async function publicAccountPolicy(id, write = false, module) {
    const access = await systemWorkspaceAccess(id);
    const lifecycle = access.account;
    if (lifecycle.status === 'Closed') throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (module && !hasModule(access, module)) throw Object.assign(error('Este conteúdo está indisponível.', 404), { publicAccount: true });
    if (write && lifecycle.status !== 'Active') throw Object.assign(pausedError(lifecycle), { publicAccount: true });
    return lifecycle.status === 'Active';
  }
  async function requireWorkspaceAccess(agency, actor, id, { modules = [], support = false, hide = false, reason = true } = {}) {
    if ((!spaceId.test(id) && !privateSpace.test(id)) || !await canOpen(actor, id)) {
      throw error('Your user cannot open this sub-account.', hide ? 404 : 403);
    }
    const who = effectiveAccess(agency, actor, id, privateSpace.test(id));
    requireModule(who, ...modules);
    if (who.account.status !== 'Active' && !(support && who.support)) throw pausedError(who.account, reason);
    return who;
  }
  async function workspaceAccess(req, res, id, options) {
    const { agency, who } = await accessContext(req, await verifiedUser(req, res));
    return requireWorkspaceAccess(agency, who, id, options);
  }
  async function existingPersonalWorkspace(who) {
    if (!who.owner || !who.session) return;
    const id = personalId(who.session);
    try { return { id, name: (await store.load(id)).profile.name }; }
    catch (e) { if (e.status !== 404) throw e; }
  }
  async function visibleWorkspaces(who) {
    const [workspaces, personalWorkspace] = await Promise.all([listWorkspaces(who.agencyId), existingPersonalWorkspace(who)]);
    const visible = workspaces.filter(w => !who.accounts || who.accounts.includes(w.id));
    return personalWorkspace ? [...visible, personalWorkspace] : visible;
  }
  async function agencyPayload(req, res, extra = {}) {
    const { agency, who } = await accessContext(req,await verifiedUser(req,res));
    requireCapability(who, 'agency', 'Your user cannot open the agency view.');
    const [workspaces, personalWorkspace, marketplaceDoc] = await Promise.all([
      listWorkspaces(who.agencyId),
      existingPersonalWorkspace(who),
      loadMarketplace()
    ]);
    ensureAccounts(agency, workspaces);
    const states = await agencyWorkspaceViews(agency, who, workspaces);
    return { agency: publicAgency(agency, who), overview: agencyOverview(agency, states), marketplace: publicMarketplaceList(marketplaceDoc, who.agencyId), workspaces, personalWorkspace, access: who,
      features:{prospectingMaps:placesConfigured,prospectingMapsEmbed:mapsEmbedKey}, ...extra };
  }
  const agencyWorkspaceViews = (agency, who, workspaces) => Promise.all(workspaces.map(async w => ({
    ...w, ...workspaceView(effectiveAccess(agency, who, w.id), await store.load(w.id))
  })));
  async function recordAudit(who, action, target, details = '') {
    try { await changeAgency(who.agencyId, agency => logTo(agency, who, action, target, details)); }
    catch { /* Audit entries are best effort and never undo the action itself. */ }
  }
  async function createAccount(who, input) {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0,70) : '';
    if (!name) throw error('Sub-account name is required.',400);
    const state = blank(name);
    if (who.agencyId !== AGENCY_ID) state.agencyId = who.agencyId;
    const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0,240) : '';
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw error('Enter a valid email address.',400);
    Object.assign(state.profile, { email: mail, phone: String(input.phone || '').slice(0,48) });
    if (['America/Sao_Paulo','America/New_York','Europe/London','UTC'].includes(input.timezone)) state.profile.timezone = input.timezone;
    const agency = await loadAgency(who.agencyId);
    if (input.plan) {
      requireCapability(who, 'settings', 'Somente administradores podem atribuir um plano à subconta.');
      if (!agency.plans.some(p => p.id === input.plan)) throw error('Choose a valid plan.',400);
    }
    const newId = uid();
    let loaded = null;
    const studioMap = new Map();
    if (input.snapshotId) {
      const snap = agency.snapshots.find(item => item.id === input.snapshotId);
      if (!snap) throw error('Choose a valid snapshot.',400);
      const planned = { ...agency, accounts: { [newId]: { plan: input.plan } } };
      requireSetupModules(effectiveAccess(planned, who, newId), Object.keys(snap.assets || {}));
      loaded = { snap, report: applySnapshot(state, snap, 'skip', studioMap) };
    }
    await store.insert(newId, state);
    if (loaded) await applyStudioSites(loaded.snap, studioMap, newId);
    await changeAgency(who.agencyId, a => {
      a.accounts[newId] = { name, status: 'Active', created: stamp(), lastLogin: '', plan: input.plan || '', address: String(input.address || '').slice(0,240), phone: state.profile.phone, website: '' };
      logTo(a, who, 'Sub-account created', name, loaded ? `Snapshot ${loaded.snap.name}` : '');
      if (loaded) a.snapshotLoads.push({ id: uid(), snapshotId: loaded.snap.id, snapshot: loaded.snap.name, workspace: newId, account: name, at: stamp(), mode: 'skip', ...loaded.report });
    });
    return newId;
  }
  async function bearer(req, scope) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    if (!token) throw error('Send an API key in the Authorization header.',401);
    const digest = hash(token);
    const matches = await Promise.all([store.findAgency({ apiKeys: [{ hash: digest }] }), store.findAgency({ privateIntegrations: [{ hash: digest }] })]);
    const match = matches.find(Boolean);
    if (!match) throw error('This key is invalid or lacks the required scope.',401);
    const allowed = await changeAgency(match.id, agency => {
      const key = agency.apiKeys.find(k => k.hash === digest) || agency.privateIntegrations.find(k => k.hash === digest);
      if (!key) return false;
      key.lastUsed = stamp();
      return !key.scopes || key.scopes.includes(scope);
    });
    if (!allowed) throw error('This key is invalid or lacks the required scope.',401);
    return match.id;
  }
  // ---- AI Studio sites ----
  async function studioGuard(req, res, workspace) {
    if (!spaceId.test(workspace) && !privateSpace.test(workspace)) throw error('Workspace not found.',404);
    return workspaceAccess(req, res, workspace, { modules: ['sites'] });
  }
  async function siteDoc(workspace, projectId, create = true) {
    if (!/^[0-9a-f-]{36}$/.test(String(projectId))) throw error('Project not found.',404);
    let doc = await Promise.resolve().then(() => store.load(siteRowId(projectId))).catch(e => { if (e.status === 404) return null; throw e; });
    if (doc && doc.workspace !== workspace) throw error('Project not found.',404);
    if (doc || !create) return doc;
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
    if (!project) throw error('Project not found.',404);
    doc = newSiteDoc({ workspace, project, pages:[{ name:'Home', slug:'index', html:pageFromStructure(project) }] });
    await store.insert(siteRowId(projectId), doc);
    return store.load(siteRowId(projectId));
  }
  const changeSite = (projectId, mutate) => store.change(siteRowId(projectId), mutate);
  const syncMeta = (workspace, projectId, doc) => change(workspace,{ type:'studio-meta', id:projectId, data:{
    pages:doc.pages.map(({ id:pageId, name, slug }) => ({ id:pageId, name, slug })), rev:doc.rev,
    publishedAt:doc.published?.at || '', publishedRev:doc.published?.rev || 0 } });
  async function studioRequest(workspace, op, input, session) {
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === input.id);
    if (!project) throw error('Project not found.',404);
    const doc = await siteDoc(workspace, project.id);
    const text = (value, label, limit) => { const v = typeof value === 'string' ? value.trim() : ''; if (!v) throw error(`${label} is required.`,400); if (v.length > limit) throw error(`${label} can have up to ${limit} characters.`,400); return v; };
    if (op === 'save') return changeSite(project.id, d => savePage(d, input.pageId, input.html, typeof input.label === 'string' ? input.label : 'Saved'));
    if (op === 'revise') {
      const instruction = text(input.instruction,'Request',2000);
      const selection = typeof input.selection === 'string' ? input.selection.slice(0,8000) : '';
      const page = findPage(doc, input.pageId);
      const revised = await revisePage(await openAI.requireConnection(session), { html:page.html, instruction, selection });
      const before = doc.versions.at(-1)?.id || '';
      await changeSite(project.id, d => { savePage(d, page.id, revised.html, `AI: ${instruction}`); return chatEntry(d, { ask:instruction, reply:revised.change, before, page:page.name }); });
      return { change: revised.change };
    }
    if (op === 'page') {
      if (input.action === 'add') {
        const name = text(input.name,'Page name',60);
        const description = typeof input.description === 'string' ? input.description.trim().slice(0,1500) : '';
        const home = doc.pages.find(item => item.slug === 'index') || doc.pages[0];
        const design = project.design ? validDesign(project.design) : null;
        const role = /obrigad|thank/i.test(`${name} ${input.slug || ''}`) ? 'thanks' : /contato|contact/i.test(name) ? 'contact' : 'page';
        const html = input.ai ? (await generatePage(await openAI.requireConnection(session), { name, description, home:home.html, slugs:doc.pages.map(item => item.slug), design })).html
          : design ? designedPage({ siteName:project.name, page:{ name, slug:input.slug || '', purpose:description }, design, role, summary:project.summary })
          : pageFromStructure({ ...project, blocks:[], summary:description }, name);
        const pageId = await changeSite(project.id, d => addPage(d, name, html));
        if (typeof input.slug === 'string' && input.slug.trim()) await changeSite(project.id, d => setSlug(d, pageId, input.slug));
        return pageId;
      }
      if (input.action === 'rename') return changeSite(project.id, d => renamePage(d, input.pageId, input.name));
      if (input.action === 'duplicate') return changeSite(project.id, d => duplicatePage(d, input.pageId));
      if (input.action === 'move') return changeSite(project.id, d => movePage(d, input.pageId, input.direction === 'up' ? 'up' : 'down'));
      if (input.action === 'slug') return changeSite(project.id, d => setSlug(d, input.pageId, input.slug));
      if (input.action === 'delete') return changeSite(project.id, d => deletePage(d, input.pageId));
      throw error('Choose a valid page action.',400);
    }
    if (op === 'restore') return changeSite(project.id, d => restoreVersion(d, input.versionId));
    if (op === 'note') return changeSite(project.id, d => chatEntry(d, { ask:text(input.ask,'Pedido',4000), reply:text(input.reply,'Resposta',4000), before:'' }));
    if (op === 'chat-undo') {
      return changeSite(project.id, d => {
        const entry = (d.chat || []).find(item => item.id === input.entryId);
        if (!entry?.before) throw error('Esta mensagem não tem uma alteração para desfazer.',400);
        if (entry.undone) throw error('Esta alteração já foi desfeita.',409);
        restoreVersion(d, entry.before);
        entry.undone = new Date().toISOString();
        return entry.id;
      });
    }
    if (op === 'seo') return changeSite(project.id, d => setSeo(d, input.pageId, input));
    if (op === 'seo-ai') {
      const page = findPage(doc, input.pageId);
      const seo = await suggestSeo(await openAI.requireConnection(session), { name:page.name, html:page.html });
      await changeSite(project.id, d => setSeo(d, page.id, seo));
      return seo;
    }
    if (op === 'stats-reset') return changeSite(project.id, d => resetStats(d));
    if (op === 'publish') {
      if (input.publish) {
        const state = await store.load(workspace);
        const form = project.formId && state.forms.find(item => item.id === project.formId);
        if (form) { if (!form.active) await change(workspace,{ type:'save', key:'forms', id:form.id, data:{ ...form, active:true } }); }
        else {
          const created = await change(workspace,{ type:'save', key:'forms', data:{ name:`${project.name} · AI Studio`, description:'Leads from the published AI Studio site.', askPhone:true, active:true } });
          await change(workspace,{ type:'studio-meta', id:project.id, data:{ formId:created.id } });
        }
      }
      return changeSite(project.id, d => publish(d, Boolean(input.publish)));
    }
    throw error('Unknown AI Studio request.',404);
  }
  // Every field of a public form post, keeping repeated keys (checkboxes, multiple choice) as lists.
  async function formBody(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 60000) throw error('Formulário muito longo.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8')), out = {};
    for (const key of new Set(params.keys())) { if (key.length > 60) continue; const all = params.getAll(key).slice(0,50).map(v => v.slice(0,5000)); out[key] = all.length > 1 ? all : all[0]; }
    return out;
  }
  async function formFields(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Send the form fields.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 20000) throw error('Request is too large.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    return Object.fromEntries(['name','email','phone','_page'].map(key => [key, (params.get(key) || '').slice(0,240)]));
  }
  async function findProspects(who,input) {
    const agency = await loadAgency(who.agencyId);
    const agent = input.agent ? agency.prospecting.agents.find(row => row.id === input.agent) : null;
    if (input.agent && !agent) throw error('Agente não encontrado.',404);
    const term = typeof input.keyword === 'string' ? input.keyword.trim().slice(0,120) : '';
    const keywords = agent?.niches || (term ? [term] : []);
    const location = agent?.location || (typeof input.location === 'string' ? input.location.trim().slice(0,140) : '');
    const radius = agent?.radius || ([2,5,10,20,30].includes(Number(input.radius)) ? Number(input.radius) : 5);
    if (!keywords.length || !location) throw error('Informe a empresa ou nicho e a região.',400);
    if (!placesConfigured) {
      const matches = agency.prospects.filter(row => !row.archived && folded(prospectSearchText(row)).includes(folded(location)) &&
        keywords.some(word => folded(prospectSearchText(row)).includes(folded(word))));
      return { provider:'local', rows:matches.slice(0,20).map(row => ({...row,saved:row.id})) };
    }
    const results = await placesSearch(keywords,location,radius);
    const items = new Map(results.map(row => [row.placeId,row]));
    const saved = new Map(agency.prospects.filter(row => row.placeId).map(row => [row.placeId,row.id]));
    return { provider:'maps',rows:[...items.values()].slice(0,20).map(row => ({...row,saved:saved.get(row.placeId) || ''})) };
  }

  async function transferProspects(who,input) {
    const workspace = typeof input.workspace === 'string' ? input.workspace : '';
    if (!spaceId.test(workspace)) throw error('Escolha uma subconta à qual você tem acesso.',400);
    await requireWorkspaceAccess(await loadAgency(who.agencyId), who, workspace, {
      modules: input.opportunity === true ? ['contacts', 'opportunities'] : ['contacts']
    });
    const ids = Array.isArray(input.ids) ? [...new Set(input.ids.slice(0,100))] : [];
    if (!ids.length) throw error('Selecione pelo menos um prospect.',400);
    const agency = await loadAgency(who.agencyId);
    const prospects = ids.map(id => agency.prospects.find(row => row.id === id && !row.archived));
    if (prospects.some(row => !row)) throw error('Um dos prospects não está disponível para envio.',404);
    const imported = await store.change(workspace,state => {
      state.prospectImports ??= {};
      const stage = state.stages[0];
      return prospects.map(row => {
        const previous = state.prospectImports[row.id] || {};
        const phone = row.contactPhone || row.phone || '';
        const digits = value => String(value || '').replace(/\D/g,'');
        const email = String(row.email || '').toLowerCase();
        const dedupPhone = digits(phone);
        const reused = state.contacts.find(contact => contact.id === previous.contact || (email && contact.email === email) ||
          (dedupPhone.length >= 7 && digits(contact.phone) === dedupPhone));
        const notes = [row.website,row.address,[row.city,row.region,row.country].filter(Boolean).join(', ')].filter(Boolean).join('\n');
        const contact = reused?.id || execute(state,{type:'save',key:'contacts',data:{name:row.owner || row.name,email,phone,company:row.name,
          notes,tags:['New Prospect Received']}});
        if (reused && !reused.tags.includes('New Prospect Received')) reused.tags.push('New Prospect Received');
        let opportunity = state.opportunities.some(item => item.id === previous.opportunity && item.contactId === contact) ? previous.opportunity : '';
        if (input.opportunity === true && !opportunity && stage) opportunity = execute(state,{type:'save',key:'opportunities',data:{title:row.name,
          contactId:contact,stage:stage.id,value:0,status:'Open',source:'Prospecting'}});
        state.prospectImports[row.id] = {contact,opportunity};
        return {id:row.id,contact,opportunity};
      });
    });
    const at = stamp();
    await changeAgency(who.agencyId, current => {
      for (const item of imported) {
        const row = current.prospects.find(prospect => prospect.id === item.id);
        if (row) row.transfers[workspace] = { contact:item.contact,opportunity:item.opportunity,at:row.transfers[workspace]?.at || at };
      }
      logTo(current,who,'Prospects sent to CRM',workspace,`${imported.length} prospect(s)`);
    });
    return imported;
  }

  async function agencyRequest(op, who, input) {
    if (op === 'prospecting-search') return findProspects(who,input);
    if (op === 'prospecting-transfer') return transferProspects(who,input);
    if (op === 'prospecting-action') {
      if (['brand','sections','widget'].includes(input.op)) requireCapability(who, 'settings', 'Somente administradores podem alterar essas configurações.');
      const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
      const apply = (command,trusted) => changeAgency(who.agencyId, agency => {
        const result = runProspectingAction(agency,command,trusted);
        logTo(agency,who,`Prospecting: ${command.op}`,typeof command.id === 'string' ? command.id : '');
        return result;
      });
      // The automated audit reaches the network, so it runs outside the agency write and is applied afterwards.
      const audited = async (id,manual = {}) => {
        const row = (await loadAgency(who.agencyId)).prospects.find(item => item.id === id);
        if (!row) throw error('Registro não encontrado.',404);
        const audit = await prospectAudit({ ...row }).catch(() => null);
        return apply({ op:'audit',id,data:manual },{ audit });
      };
      if (input.op === 'audit' && typeof input.id === 'string') return audited(input.id,data);
      if (input.op === 'save' && !input.id && [true,'true','on'].includes(data.audit)) {
        const id = await apply({ ...input,data:{ ...data,audit:false } });
        await audited(id);
        return id;
      }
      return apply({ ...input,data });
    }
    if (op === 'action') {
      const workspaces = await listWorkspaces(who.agencyId);
      const shareCode = input.type === 'snapshot-import' && typeof input.data?.code === 'string' ? input.data.code.trim().toLowerCase() : '';
      const shared = /^[0-9a-f]{12}$/.test(shareCode) ? await store.findAgency({ snapshots: [{ shareCode, shared: true }] }) : null;
      const sharedSnapshot = shared?.state.snapshots.find(item => item.shareCode === shareCode && item.shared);
      return changeAgency(who.agencyId, agency => {
        const currentActor = userAccess(agency, who.userId);
        if (!currentActor) throw error('The selected user no longer exists.',403);
        requireCapability(currentActor, 'agency', 'Your user cannot open the agency view.');
        requireAgencyCommand(currentActor, input, agency);
        if (sharedSnapshot) requireSetupModules(currentActor, Object.keys(sharedSnapshot.assets || {}));
        ensureAccounts(agency, workspaces);
        const result = executeAgency(agency, input, { accountIds: workspaces.map(w => w.id), actor: who.name, sharedSnapshot });
        if (who.session && input.type === 'save' && input.key === 'users') {
          agency.users.find(user => user.id === result).loginEnabled = true;
        }
        return result;
      });
    }
    if (op === 'accounts') return createAccount(who, input);
    if (op === 'snapshot-create' || op === 'snapshot-refresh') {
      const agency = await loadAgency(who.agencyId);
      const prior = op === 'snapshot-refresh' ? agency.snapshots.find(s => s.id === input.id) : null;
      if (op === 'snapshot-refresh' && !prior) throw error('Snapshot not found.',404);
      if (prior && prior.kind !== 'mine') throw error('Only your own snapshots can be refreshed from their source.',400);
      const source = prior ? prior.workspace : input.workspace;
      if (!(await listWorkspaces(who.agencyId)).some(w => w.id === source)) throw error('Choose a valid source sub-account.',400);
      const sourceAccess = await requireWorkspaceAccess(agency, who, source);
      const include = prior ? prior.include : Array.isArray(input.include) && input.include.length ? input.include.filter(k => snapshotAssets.some(a => a[0] === k)) : snapshotAssets.map(a => a[0]);
      if (!include.length) throw error('Choose at least one asset type.',400);
      requireSetupModules(sourceAccess, include);
      const name = prior ? prior.name : String(input.name || '').trim().slice(0,100);
      if (!name) throw error('Snapshot name is required.',400);
      const { assets, counts } = extractSnapshot(await store.load(source), include);
      const studioSites = await extractStudioSites(assets);
      return changeAgency(who.agencyId, a => {
        if (prior) {
          const snap = a.snapshots.find(s => s.id === prior.id);
          Object.assign(snap, { assets, studioSites, counts, updated: stamp(), version: (snap.version || 1) + 1 });
          logTo(a, who, 'Snapshot refreshed', snap.name, `Version ${snap.version}`);
          return snap.id;
        }
        if (a.snapshots.length >= 50) throw error('You can keep up to 50 snapshots.',400);
        const snap = { id: uid(), name, kind: 'mine', workspace: source, include, assets, studioSites, counts, version: 1, created: stamp(), updated: stamp(), shareCode: '', shared: false };
        a.snapshots.push(snap);
        logTo(a, who, 'Snapshot created', name);
        return snap.id;
      });
    }
    if (op === 'snapshot-load') {
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.id);
      if (!snap) throw error('Snapshot not found.',404);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces(who.agencyId)).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      for (const target of targets) {
        const targetAccess = await requireWorkspaceAccess(agency, who, target.id);
        requireSetupModules(targetAccess, Object.keys(snap.assets || {}));
      }
      const mode = input.mode === 'overwrite' ? 'overwrite' : 'skip';
      const loads = [];
      for (const target of targets) {
        const studioMap = new Map();
        const report = await store.change(target.id, state => applySnapshot(state, snap, mode, studioMap));
        await applyStudioSites(snap, studioMap, target.id);
        loads.push({ id: uid(), snapshotId: snap.id, snapshot: snap.name, workspace: target.id, account: target.name, at: stamp(), mode, ...report });
      }
      await changeAgency(who.agencyId, a => {
        a.snapshotLoads.push(...loads);
        if (a.snapshotLoads.length > 500) a.snapshotLoads.splice(0, a.snapshotLoads.length - 500);
        logTo(a, who, 'Snapshot loaded', snap.name, targets.map(t => t.name).join(', '));
      });
      return loads;
    }
    if (op === 'marketplace-publish') {
      const agency = await loadAgency(who.agencyId);
      const snap = agency.snapshots.find(s => s.id === input.snapshotId && s.kind === 'mine');
      if (!snap) throw error('Escolha um setup criado pela sua agência para publicar.',400);
      requireSetupModules(who, Object.keys(snap.assets || {}));
      const author = agency.company?.name || who.name || 'Agência da comunidade';
      const { listing, updated } = await changeMarketplace(doc => publishToMarketplace(doc, {
        agencyId: who.agencyId, author, snap, studioSites: snap.studioSites || {}, input
      }));
      await changeAgency(who.agencyId, a => {
        const localSnap = a.snapshots.find(s => s.id === snap.id);
        if (localSnap) {
          Object.assign(localSnap, {
            published: true,
            marketplaceId: listing.id,
            publishedVersion: listing.version,
            marketplaceCategory: listing.category,
            marketplaceSummary: listing.summary,
            marketplaceDescription: listing.description,
            marketplaceTags: listing.tags
          });
        }
        logTo(a, who, updated ? 'Setup updated on marketplace' : 'Setup published to marketplace', listing.title, `v${listing.version}`);
      });
      return { listingId: listing.id, updated };
    }
    if (op === 'marketplace-unpublish') {
      const removed = await changeMarketplace(doc => unpublishFromMarketplace(doc, { agencyId: who.agencyId, listingId: input.id }));
      await changeAgency(who.agencyId, a => {
        for (const s of a.snapshots) {
          if (s.marketplaceId === removed.id) {
            s.published = false;
            s.marketplaceId = '';
          }
        }
        logTo(a, who, 'Setup unpublished from marketplace', removed.title);
      });
      return removed.id;
    }
    if (op === 'marketplace-install') {
      const listing = findMarketplaceSetup(await loadMarketplace(), input.id);
      if (!listing) throw error('Setup não encontrado no marketplace.',404);
      const copy = await changeAgency(who.agencyId, a => {
        if (a.snapshots.length >= 50) throw error('Você atingiu o limite de 50 setups salvos na agência.',400);
        const snap = {
          id: uid(),
          name: listing.title,
          kind: 'marketplace',
          workspace: '',
          include: Object.keys(listing.assets || {}),
          assets: structuredClone(listing.assets || {}),
          studioSites: structuredClone(listing.studioSites || {}),
          counts: structuredClone(listing.counts || {}),
          version: listing.version || 1,
          created: stamp(),
          updated: stamp(),
          shareCode: '',
          shared: false,
          marketplaceId: listing.id,
          marketplaceAuthor: listing.author,
          marketplaceCategory: listing.category,
          official: Boolean(listing.official)
        };
        a.snapshots.push(snap);
        logTo(a, who, 'Setup installed from marketplace', listing.title, listing.author);
        return { snapshotId: snap.id, name: snap.name };
      });
      await changeMarketplace(doc => recordMarketplaceInstall(doc, listing.id));
      return copy;
    }
    if (op === 'template-install') {
      const agency = await loadAgency(who.agencyId);
      const template = catalogTemplate(input.template, agency);
      const target = (await listWorkspaces(who.agencyId)).find(w => w.id === input.workspace);
      if (!target) throw error('Choose a valid sub-account.',400);
      await requireWorkspaceAccess(agency, who, target.id, { modules: ['sites'] });
      const page = await store.change(target.id, state => installTemplate(state, template));
      await changeAgency(who.agencyId, a => {
        a.templateInstalls.push({ id: uid(), template: template.id, name: template.name, workspace: target.id, account: target.name, at: stamp() });
        logTo(a, who, 'Template installed', template.name, target.name);
      });
      return { workspace: target.id, page };
    }
    if (op === 'prospect-convert') {
      const prospect = (await loadAgency(who.agencyId)).prospects.find(r => r.id === input.id);
      if (!prospect) throw error('Prospect not found.',404);
      if (prospect.workspace) throw error('This prospect already has a sub-account.',400);
      const newId = await createAccount(who, { name: prospect.name, email: prospect.email, phone: prospect.phone, address: prospect.city, snapshotId: input.snapshotId || '' });
      await changeAgency(who.agencyId, a => { const row = a.prospects.find(r => r.id === input.id); if (row) Object.assign(row, { workspace: newId, status: 'Won' }); });
      return newId;
    }
    throw error('Unknown agency request.',404);
  }
  function change(id,command,who) {
    return store.change(id, state => {
      if (who) requireRecordEffects(who, state, command);
      const result = execute(state, command, { workspace: id });
      return { id:result, state };
    });
  }
  // ---- Social Planner: OAuth secrets, scheduler and media ------------------------------------
  const socialRow = async rowId => {
    try { return await store.load(rowId); }
    // Supabase derives a NOT NULL name column from profile.name, so secret rows carry one too.
    catch { await store.insert(rowId, { profile:{ name:'Social Planner' }, tokens:{}, pending:{}, states:{} }); return store.load(rowId); }
  };
  const socialSecrets = async (workspace, mutate) => { await socialRow(`social-${workspace}`); return store.change(`social-${workspace}`, mutate); };
  const publicBase = req => process.env.SOCIAL_PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const callbackPath = provider => `/api/social/callback/${provider === 'instagram' ? 'facebook' : provider}`;
  const validateInvite = (row, key) => {
    const invite = row.invite;
    if (!key || invite?.hash !== key || invite.expires <= Date.now()) throw error('Este convite expirou ou foi revogado.',404);
    return invite;
  };
  const socialActor = who => who.session?.id || who.userId || 'local-owner';
  async function startSocialOAuth(req, workspace, provider, inviteKey = '', actor = null) {
    const nonce = uid();
    const target = authUrl(provider, { redirectUri: publicBase(req) + callbackPath(provider), state: nonce });
    await socialRow('social-oauth');
    await store.change('social-oauth', row => {
      for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
      row.states[nonce] = { workspace, provider, at: stamp(), inviteKey, actor };
    });
    return target;
  }
  async function inviteAttach(workspace, key, chosen) {
    validateInvite(await store.load(`social-${workspace}`), key);
    await publicAccountPolicy(workspace, true, 'marketing');
    const ids = await store.change(workspace, s => {
      const fresh = chosen.filter(x => !s.socialAccounts.some(a => a.provider === x.provider && a.externalId === x.externalId));
      if (fresh.length !== chosen.length) throw error('Uma das contas já está conectada. Selecione somente novas contas.',409);
      return attachAccounts(s, fresh, { uid, now: stamp });
    });
    await socialSecrets(workspace, row => ids.forEach((id, n) => { row.tokens[id] = seal(chosen[n].secret); }));
    return { connected: ids.length };
  }
  const fileBytes = data => { const [, mime, b64] = String(data).match(/^data:([^;]+);base64,(.*)$/) || []; return { mime, bytes: Buffer.from(b64 || '', 'base64') }; };
  const socialMedia = (state, workspace, base, post) => (post.media || []).map(m => {
    if (m.fileId) {
      const file = state.files.find(f => f.id === m.fileId);
      if (!file) throw error('Uma imagem do post foi removida do Mídia Drive.',400);
      const { mime, bytes } = fileBytes(file.data);
      return { ...m, mime, url: `${base}/m/${workspace}/${m.fileId}`, bytes: async () => bytes };
    }
    return { ...m, bytes: async () => { const r = await fetch(m.url, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw error(`Não foi possível baixar a mídia (${r.status}).`,502); return Buffer.from(await r.arrayBuffer()); } };
  });
  const rssItems = xml => [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(([block]) => {
    const tag = name => (block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const link = tag('link') || block.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] || '';
    return { title: tag('title'), link, guid: tag('guid') || tag('id') || link, summary: tag('description') || tag('summary') };
  }).filter(item => item.guid);
  async function checkFeeds(workspace, agencyId, at) {
    const state = await store.load(workspace);
    const stale = state.socialFeeds.filter(f => f.active && Date.parse(f.lastChecked || 0) < at - 30 * 60_000);
    for (const feed of stale) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      let items = [], problem = '';
      try {
        const r = await fetch(feed.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' } });
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        items = rssItems((await r.text()).slice(0, 2_000_000));
      } catch (e) { problem = `Não foi possível ler o feed: ${e.message}`.slice(0, 200); }
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return;
      await store.change(workspace, s => {
        const row = s.socialFeeds.find(f => f.id === feed.id); if (!row) return;
        row.lastChecked = new Date(at).toISOString(); row.error = problem; if (problem) return;
        const seen = new Set(row.seen || []), fresh = items.filter(item => !seen.has(item.guid)).slice(0, row.seen ? 5 : 3).reverse();
        for (const item of fresh) {
          const summary = row.template.replace(/\{\{\s*(title|link|summary)\s*\}\}/g, (_, k) => item[k] || '').slice(0, 5000);
          const accounts = row.accountIds.filter(accountId => s.socialAccounts.some(a => a.id === accountId));
          s.socialPosts.push({ id: uid(), created: stamp(), type: 'post', summary, overrides: {}, accountIds: accounts, media: [], link: item.link, firstComment: '', categoryId: '', tags: [],
            needsApproval: false, source: 'rss', feedId: row.id, scheduleDate: row.mode === 'schedule' ? new Date(at + 5 * 60_000).toISOString() : '', recurrence: null,
            status: row.mode === 'schedule' && accounts.length ? 'scheduled' : 'draft', approval: '', results: [], createdBy: row.name, error: '' });
        }
        row.seen = items.map(item => item.guid).slice(0, 200);
      });
    }
  }
  async function runSocial(workspace, base, at = Date.now()) {
    let state = await store.load(workspace);
    if (!state.socialFeeds?.length && !state.socialAccounts?.length) return 0;
    const agencyId = state.agencyId || AGENCY_ID;
    if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    if (state.socialFeeds?.length) {
      await checkFeeds(workspace, agencyId, at).catch(e => console.error(e.message));
      if (!await accountIsActive(agencyId, workspace, 'marketing')) return 0;
    }
    if (!state.socialAccounts?.length) return 0;
    const due = await store.change(workspace, s => {
      for (const copy of evergreenDue(s, new Date(at), s.profile.timezone)) s.socialPosts.push({ ...copy, id: uid(), created: stamp() });
      return claimDue(s, at);
    });
    if (!due.length) return 0;
    state = await store.load(workspace);
    const secrets = await socialRow(`social-${workspace}`);
    const refreshed = {}, broken = {};
    let completed = 0;
    for (const post of due) {
      if (!await accountIsActive(agencyId, workspace, 'marketing')) {
        const pending = new Map(due.slice(completed).map(row => [row.id, row.claimedAt]));
        await store.change(workspace, current => {
          for (const row of current.socialPosts) {
            if (row.status === 'in_progress' && pending.get(row.id) === row.claimedAt && pending.has(row.id)) {
              row.status = 'scheduled';
              delete row.claimedAt;
            }
          }
        });
        break;
      }
      const results = [];
      let media = [];
      try { media = socialMedia(state, workspace, base, post); }
      catch (e) { results.push(...post.accountIds.map(accountId => ({ accountId, ok: false, error: e.message }))); }
      if (!results.length) for (const [index, accountId] of post.accountIds.entries()) {
        if (index && !await accountIsActive(agencyId, workspace, 'marketing')) {
          results.push(...post.accountIds.slice(index).map(id => ({ accountId: id, ok: false, error: 'Subconta suspensa durante a publicação.' })));
          break;
        }
        const account = state.socialAccounts.find(a => a.id === accountId);
        if (!account) { results.push({ accountId, ok: false, error: 'Conta desconectada.' }); continue; }
        try {
          const secret = refreshed[accountId] || unseal(secrets.tokens[accountId]);
          const { secret: next, ...outcome } = await socialPublish(account, secret, post, media);
          refreshed[accountId] = next; results.push({ accountId, ...outcome });
        } catch (e) {
          if (e.status === 401) broken[accountId] = e.message;
          results.push({ accountId, ok: false, error: `${network(account.provider)?.name}: ${e.message}`.slice(0, 500) });
        }
      }
      await store.change(workspace, s => {
        settle(s, post.id, results, { uid, now: stamp });
        for (const [accountId, message] of Object.entries(broken)) { const a = s.socialAccounts.find(x => x.id === accountId); if (a) Object.assign(a, { status: 'expired', error: message }); }
      });
      completed++;
    }
    if (Object.keys(refreshed).length) await socialSecrets(workspace, row => { for (const [k, v] of Object.entries(refreshed)) if (v) row.tokens[k] = seal(v); });
    return completed;
  }
  // Webinar reminders that fell due are written to Conversas; WhatsApp ones are also sent when the sub-account has WhatsApp connected.
  async function runWebinarReminders(workspace, base, at = Date.now()) {
    const state = await store.load(workspace);
    if (!state.webinarRegistrations?.length) return 0;
    const result = await change(workspace,{ type:'webinar-reminders', data:{ base, workspace, at:new Date(at).toISOString() } });
    const sent = Array.isArray(result.id) ? result.id : [];
    if (!privateSpace.test(workspace)) for (const item of sent.filter(row => row.channel === 'WhatsApp' && row.phone)) {
      await whatsapp.sendWorkspaceText(state.agencyId || AGENCY_ID, workspace, item.phone, item.body, (agencyId, id) => accountIsActive(agencyId, id, 'conversations')).catch(() => null);
    }
    return sent.length;
  }
  async function runAllSocial(base) {
    let total = 0;
    for (const w of (await store.list()).filter(w => spaceId.test(w.id) || privateSpace.test(w.id))) {
      try { total += await runSocial(w.id, base); } catch (e) { console.error(`Social planner (${w.id}): ${e.message}`); }
      try { await runWebinarReminders(w.id, base); } catch (e) { console.error(`Webinar reminders (${w.id}): ${e.message}`); }
    }
    return total;
  }
  const socialTimer = socialScheduler ? setInterval(() => { ready.then(() => runAllSocial(process.env.SOCIAL_PUBLIC_URL || `http://${host}:${port}`)).catch(() => {}); }, 60_000) : null;
  socialTimer?.unref?.();
  const socialPopup = (base, message) => `<!doctype html><meta charset="utf-8"><title>soci</title><body style="font-family:system-ui;padding:24px">
<p>${message.error ? 'Não foi possível conectar.' : 'Conta autorizada. Você pode fechar esta janela.'}</p><script>
const m=${JSON.stringify({ type: 'soci-social', ...message }).replace(/</g, '\\u003c')};
if (window.opener) { window.opener.postMessage(m, ${JSON.stringify(base)}); window.close(); } else location.href='/app#marketing/social';
</script>`;
  const payload = async request => {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']||'')) throw error('Send a JSON request.',415);
    let size=0; const chunks=[];
    for await (const part of request) { size+=part.length; if(size>1050000) throw error('Request is too large.',413); chunks.push(part); }
    try { const v=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!v||typeof v!=='object'||Array.isArray(v)) throw Error(); return v; }
    catch { throw error('Invalid JSON request.',400); }
  };
  const server=createServer(async (req,res) => {
    const isVercel = Boolean(process.env.VERCEL);
    const currentPort=server.address()?.port ?? port;
    const allowedHosts=[`127.0.0.1:${currentPort}`,`localhost:${currentPort}`];
    res.setHeader('Content-Security-Policy',csp);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    const send=(status,type,data)=>{res.writeHead(status,{'Content-Type':type});res.end(data);};
    const json=(data,status=200)=>send(status,'application/json; charset=utf-8',JSON.stringify(data));
    const goTo = path => { res.writeHead(303, { Location: path }); res.end(); };
    let p = '';
    try {
      const host = req.headers.host || '';
      if (!isVercel && !allowedHosts.includes(host)) throw error('Use the local address shown in the terminal.',403);
      const proto = isVercel || req.socket?.encrypted ? 'https' : 'http';
      const url=new URL(req.url,`${proto}://${host}`);
      p = url.searchParams.get('__path') || url.pathname;
      if (!p.startsWith('/')) p = '/' + p;
      p = p.replace(/\/+/g, '/');
      const method=req.method;
      if (!['GET','HEAD','POST'].includes(method)) throw error('Method not allowed.',405);
      if (method==='POST' && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==url.origin))) throw error('This workspace only accepts local requests.',403);
      if (p.startsWith('/api/') && !p.startsWith('/api/auth/')) await ready;
      const id=url.searchParams.get('workspace') || 'demo';
      const portalMatch = p.match(portalApi);
      if (portalMatch) {
        const [, workspace, operation, courseId] = portalMatch;
        if (Boolean(courseId) !== (operation === 'course')) throw error('Página do portal não encontrada.',404);
        if (operation === 'admin') {
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
          const input = method === 'POST' ? await payload(req) : null;
          await requireActiveAccount(who.agencyId, workspace, true);
          const state = await store.load(workspace);
          return json(await clientPortal.admin(workspace, state, input));
        }
        const secure = proto === 'https';
        if (method === 'POST' && operation === 'exchange') {
          const { token } = await payload(req);
          await publicAccountPolicy(workspace, true, 'memberships');
          const session = await clientPortal.exchange(workspace, token);
          portalCookie(req, res, workspace, session, secure);
          return json({ ok:true });
        }
        if (method === 'POST' && operation === 'logout') {
          await clientPortal.signOut(workspace, portalCookie(req,res,workspace,undefined,secure));
          portalCookie(req,res,workspace,'',secure);
          return json({ ok:true });
        }
        if (method === 'POST' || !['home','course'].includes(operation)) throw error('Método indisponível.',405);
        await publicAccountPolicy(workspace, false, 'memberships');
        const state = await store.load(workspace);
        return json(await clientPortal.content(workspace, state, portalCookie(req,res,workspace,undefined,secure), courseId));
      }
      const portal = p.match(portalPage);
      if (portal && method !== 'POST') {
        await ready;
        await publicAccountPolicy(portal[1], false, 'memberships');
        res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'");
        return send(200,'text/html; charset=utf-8',method==='HEAD' ? undefined : readFileSync(resolve(root,'ui','client-portal.html')));
      }
      if (p === '/favicon.ico') { res.writeHead(302, { Location: '/favicon.svg' }); return res.end(); }
      if (['/prospecting','/prospecting/','/prospecting/add-prospect'].includes(p) && method !== 'POST') {
        res.writeHead(302,{Location:p.endsWith('add-prospect') ? '/#agency/prospecting/search' : '/#agency/prospecting'});
        return res.end();
      }
      const prospectPublic = p.match(prospectPublicPath);
      if (prospectPublic) {
        await ready;
        const [,kind,token] = prospectPublic;
        if (kind === 'report') {
          if (method === 'POST') throw error('Method not allowed.',405);
          const findReport = agency => agency.prospects.find(row => row.shareId === token && !row.archived && row.report);
          const match = await store.findAgency({ prospects: [{ shareId: token }] });
          const prospect = match && findReport(hydrateAgency(match.state));
          if (!prospect) throw error('Relatório indisponível.',404);
          if (method === 'GET' && !String(req.headers.purpose || req.headers['sec-purpose'] || '').includes('prefetch')) {
            try {
              await changeAgency(match.id, agency => {
                const row = findReport(agency);
                if (!row) return;
                const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
                row.views[date] = (row.views[date] || 0)+1;
                const dates = Object.keys(row.views).sort();
                for (const old of dates.slice(0,Math.max(0,dates.length-370))) delete row.views[old];
              });
            } catch { /* The report remains available if the view count cannot be updated. */ }
          }
          return send(200,'text/html; charset=utf-8',method === 'HEAD' ? undefined : shareReportHtml(prospect.report));
        }
        const match = await store.findAgency({ prospecting: { widgets: [{ id: token, active: true }] } });
        const widget = match?.state.prospecting.widgets.find(item => item.id === token && item.active);
        if (!widget) throw error('Formulário indisponível.',404);
        res.setHeader('Content-Security-Policy',csp.replace("frame-ancestors 'none'",'frame-ancestors *'));
        if (method === 'POST') {
          if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
          let size=0; const chunks=[];
          for await (const part of req) { size+=part.length; if (size>12000) throw error('Formulário muito longo.',413); chunks.push(part); }
          const data = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
          try { if (!data.fax) await changeAgency(match.id, agency => captureProspectWidget(agency,token,data)); }
          catch (error) { if (error.status) return send(error.status,'text/html; charset=utf-8',widgetHtml(widget,false,error.message)); throw error; }
          res.writeHead(303,{Location:`${p}?sent=1`}); return res.end();
        }
        return send(200,'text/html; charset=utf-8',method === 'HEAD' ? undefined : widgetHtml(widget,url.searchParams.has('sent')));
      }
      const apiMatch = p.match(apiPath);
      if (apiMatch) {
        const [, account] = apiMatch;
        if (!account) {
          if (method !== 'GET') throw error('Method not allowed.',405);
          const agencyId = await bearer(req,'subaccounts.read');
          return json({ subaccounts: await listWorkspaces(agencyId) });
        }
        const agencyId = await bearer(req,method === 'POST' ? 'contacts.write' : 'contacts.read');
        const input = method === 'POST' ? await payload(req) : null;
        await requireWorkspaceAccess(await loadAgency(agencyId), { agencyId, modules: null }, account, {
          modules: ['contacts'], hide: true, reason: false
        });
        if (method !== 'POST') {
          return json({ contacts: (await store.load(account)).contacts });
        }
        const created = await change(account,{ type:'save', key:'contacts', data: input });
        return json({ id: created.id },201);
      }
      if (p.startsWith('/api/auth/')) {
        if (!auth) throw error('O login do Supabase ainda não foi configurado.',503);
        const operation = p.slice('/api/auth/'.length);
        if (operation === 'callback/google' && method === 'GET') {
          return goTo(await auth.callback(req,res,url.searchParams,async (session,next) => {
            await ready;
            const { who } = await accessContext(req,session);
            return who.owner && who.agencyId !== AGENCY_ID && !/[?#]/.test(next) ? '/app#agency/dashboard' : next;
          }));
        }
        if (operation === 'logout' && method === 'POST') {
          await auth.logout(req,res);
          return json({ ok:true });
        }
        if (operation === 'google' && method === 'POST') {
          const input = await payload(req);
          return json({ url:await auth.google(req,res,url.origin,input.next) });
        }
        throw error('Page not found.',404);
      }
      if (p === '/api/openai') {
        const session = await verifiedUser(req,res);
        if (!session) throw error('Entre na sua conta para conectar sua chave da OpenAI.',401);
        res.setHeader('Cache-Control','no-store');
        if (method !== 'POST') return json(await openAI.status(session));
        const input = await payload(req);
        if (input.action === 'connect') return json(await openAI.connect(session,input.apiKey));
        if (input.action === 'disconnect') return json(await openAI.disconnect(session));
        throw error('Escolha uma ação válida para a conexão com a OpenAI.',400);
      }
      if (p==='/api/workspaces') {
        const who = await access(req,res);
        if (method==='POST') {
          requireCapability(who, 'agency', 'Only agency users can create sub-accounts.');
          const newId = await createAccount(who, await payload(req));
          return json({id:newId,workspaces:await listWorkspaces(who.agencyId)},201);
        }
        return json({workspaces:await visibleWorkspaces(who), agency:who.agency});
      }
      if (p === '/api/social/cron' && (method === 'GET' || method === 'POST')) {
        if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw error('Not allowed.',401);
        return json({ published: await runAllSocial(publicBase(req)) });
      }
      const socialFile = p.match(socialFilePath);
      if (socialFile && method === 'GET') {
        await ready;
        const [, workspace, fileId] = socialFile;
        await publicAccountPolicy(workspace);
        const state = await store.load(workspace);
        const referenced = state.socialPosts.some(post => ['in_progress', 'published'].includes(post.status) &&
          post.media?.some(item => item.fileId === fileId));
        if (referenced) {
          await publicAccountPolicy(workspace, false, 'marketing');
        } else {
          if (!localAccess && !auth?.hasSession(req)) throw error('File not found.',404);
          try { await workspaceAccess(req, res, workspace, { modules: ['media'], support: true, hide: true }); }
          catch (e) {
            if ([401, 403, 404].includes(e.status)) throw error('File not found.',404);
            throw e;
          }
        }
        const file = state.files.find(f => f.id === fileId);
        if (!file || !file.data.startsWith('data:image/')) throw error('File not found.',404);
        const { mime, bytes } = fileBytes(file.data);
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length });
        return res.end(bytes);
      }
      const socialStart = p.match(/^\/api\/social\/connect\/([a-z]+)$/);
      const invitePage = p.match(socialInvitePath);
      if (invitePage && method === 'GET') {
        await ready;
        await publicAccountPolicy(invitePage[1], false, 'marketing');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/social-connect.html')));
      }
      if (p === '/api/social/invited' && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Convite inválido.',404);
        const input = await payload(req);
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw error('Convite inválido.',404);
        const key = hash(input.token);
        const row = await store.load(`social-${id}`);
        const invite = validateInvite(row, key);
        await publicAccountPolicy(id, input.action !== 'info', 'marketing');
        if (input.action === 'info') return json({ expires: invite.expires, providers: availability() });
        if (input.action === 'start') return json({ url: await startSocialOAuth(req, id, input.provider, key) });
        if (input.action === 'bluesky') {
          const candidates = await blueskyLogin(input.identifier, input.password);
          return json(await inviteAttach(id, key, candidates));
        }
        if (input.action === 'candidates' || input.action === 'attach') {
          const requestId = String(input.requestId || ''), pending = row.pending[requestId];
          if (!pending || pending.inviteKey !== key || Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou.',404);
          const candidates = unseal(pending.candidates) || [];
          const state = await store.load(id);
          if (input.action === 'candidates') return json({ candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name }))
            .filter((_, n) => !state.socialAccounts.some(a => a.provider === candidates[n].provider && a.externalId === candidates[n].externalId)) });
          const picks = [...new Set(Array.isArray(input.picks) ? input.picks : [])].filter(n => Number.isInteger(n) && candidates[n]);
          if (!picks.length) throw error('Escolha ao menos uma conta.',400);
          await socialSecrets(id, current => {
            validateInvite(current, key);
            if (current.pending[requestId]?.inviteKey !== key) throw error('Esta autorização expirou.',404);
            delete current.pending[requestId];
          });
          return json(await inviteAttach(id, key, picks.map(n => candidates[n])));
        }
        throw error('Ação inválida para este convite.',400);
      }
      if (socialStart && method === 'GET') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        if (localAccess) req.localSocialUser = url.searchParams.get('user');
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        const target = await startSocialOAuth(req, id, socialStart[1], '', socialActor(who));
        res.writeHead(302, { Location: target }); return res.end();
      }
      const socialBack = p.match(/^\/api\/social\/callback\/([a-z]+)$/);
      if (socialBack && method === 'GET') {
        const base = publicBase(req);
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
        let provider = socialBack[1];
        try {
          await socialRow('social-oauth');
          const nonce = url.searchParams.get('state') || '';
          const pending = await store.change('social-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
          if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000 || callbackPath(pending.provider) !== p) throw error('Este login expirou. Tente conectar de novo.',400);
          if (pending.inviteKey) {
            validateInvite(await store.load(`social-${pending.workspace}`), pending.inviteKey);
          } else {
            if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
            const who = await workspaceAccess(req, res, pending.workspace, { modules: ['marketing'] });
            if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
          }
          await publicAccountPolicy(pending.workspace, true, 'marketing');
          provider = pending.provider;
          if (url.searchParams.get('error')) throw error(url.searchParams.get('error_description') || 'A autorização foi cancelada.',400);
          const candidates = await socialExchange(provider, { code: url.searchParams.get('code') || '', redirectUri: base + callbackPath(provider) });
          await publicAccountPolicy(pending.workspace, true, 'marketing');
          const requestId = uid();
          await socialSecrets(pending.workspace, row => {
            for (const [k, v] of Object.entries(row.pending)) if (Date.parse(v.at) < Date.now() - 30 * 60_000) delete row.pending[k];
            if (pending.inviteKey) validateInvite(row, pending.inviteKey);
            row.pending[requestId] = { provider, at: stamp(), candidates: seal(candidates), inviteKey: pending.inviteKey || '', actor: pending.actor };
          });
          return send(200,'text/html; charset=utf-8',socialPopup(base, { requestId, provider }));
        } catch (e) {
          return send(200,'text/html; charset=utf-8',socialPopup(base, { provider, error: e.message }));
        }
      }
      if (p.startsWith('/api/social/') && method === 'POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const input = await payload(req), op = p.slice('/api/social/'.length);
        const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
        if (op === 'csv-preview') return json({ rows: reviewSocialCsv(await store.load(id), input).map(({ index, fields, error }) =>
          fields ? { index, status: fields.status, date: fields.scheduleDate, accounts: fields.accountIds.length } : { index, error }) });
        if (op === 'invite') {
          if (input.action === 'status') {
            const invite = (await socialRow(`social-${id}`)).invite;
            return json({ expires: invite?.expires > Date.now() ? invite.expires : null });
          }
          if (input.action === 'revoke') {
            await socialSecrets(id, row => { delete row.invite; });
            return json({ expires: null });
          }
          if (input.action !== 'create' || ![1, 24, 72, 168].includes(input.hours)) throw error('Escolha um prazo para o convite.',400);
          const token = (uid() + uid()).replaceAll('-', ''), expires = Date.now() + input.hours * 3_600_000;
          await socialSecrets(id, row => { row.invite = { hash: hash(token), expires }; });
          return json({ url: `${publicBase(req)}/social-connect/${id}#${token}`, expires });
        }
        const withState = async extra => {
          const state = await store.load(id);
          return json({ ...workspaceView(who, state), ...extra });
        };
        if (op === 'candidates' || op === 'attach') {
          const row = await socialRow(`social-${id}`), pending = row.pending[String(input.requestId || '')];
          if (!pending || pending.inviteKey || pending.actor !== socialActor(who) ||
              Date.parse(pending.at) < Date.now() - 30 * 60_000) throw error('Esta autorização expirou. Conecte a conta de novo.',404);
          const candidates = unseal(pending.candidates) || [];
          if (op === 'candidates') {
            const state = await store.load(id);
            return json({ provider: pending.provider, candidates: candidates.map((c, index) => ({ index, provider: c.provider, name: c.name, handle: c.handle || '', avatar: c.avatar || '', kind: c.kind || '',
              connected: state.socialAccounts.some(a => a.provider === c.provider && a.externalId === c.externalId) })) });
          }
          const picks = [...new Set((Array.isArray(input.picks) ? input.picks : []).map(Number))].filter(n => candidates[n]);
          if (!picks.length) throw error('Escolha ao menos uma conta.',400);
          const chosen = picks.map(n => candidates[n]);
          const ids = await store.change(id, s => attachAccounts(s, chosen, { uid, now: stamp }));
          await socialSecrets(id, r => { ids.forEach((accountId, n) => { r.tokens[accountId] = seal(chosen[n].secret); }); delete r.pending[input.requestId]; });
          return withState({ id: ids });
        }
        if (op === 'bluesky') {
          const [found] = await blueskyLogin(input.identifier, input.password);
          const [accountId] = await store.change(id, s => attachAccounts(s, [found], { uid, now: stamp }));
          await socialSecrets(id, r => { r.tokens[accountId] = seal(found.secret); });
          return withState({ id: accountId });
        }
        if (op === 'run') { const published = await runSocial(id, publicBase(req)); return withState({ published }); }
        if (op === 'disconnect') {
          await change(id, { type: 'social-account-remove', id: String(input.id || '') });
          await socialSecrets(id, r => { delete r.tokens[input.id]; });
          return withState({});
        }
        throw error('Unknown social request.',404);
      }
      if (p==='/api/state' && method!=='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const { agency, who: actor } = await accessContext(req,await verifiedUser(req,res));
        const isPersonal = privateSpace.test(id);
        const who = await requireWorkspaceAccess(agency, actor, id, { support: true });
        const studio = hasModule(who, 'sites'), agents = hasModule(who, 'ai-agents');
        const [state, workspaces, aiStatus] = await Promise.all([
          store.load(id), visibleWorkspaces(who), !who.support && (studio || agents) ? openAI.status(who.session) : null
        ]);
        const account = workspaces.find(w => w.id === id)?.name || id;
        const audit = !isPersonal && (who.support || hasModule(who, 'settings')) ? agency.audit.filter(a => a.target === account || a.target === id).slice(-200) : [];
        if (who.support) await changeAgency(who.agencyId, current => logTo(current, who, 'Sub-account support viewed', id, who.account.status));
        return json({ ...workspaceView(who, state), workspaces,
          features:{studioAI: Boolean(aiStatus?.configured && studio), social: hasModule(who, 'marketing') ? availability() : {}, agentModel: aiStatus?.configured && agents ? agentModel : ''},
          agency:agencyForWorkspace(isPersonal ? blankAgency() : agency,id,who.settings),
          ...(who.support && { account: { ...who.account, support: true, statusHistory: agency.accounts[id]?.statusHistory || [],
            ignoredWebhooks: agency.accounts[id]?.ignoredWebhooks || {} } }),
          access:{agency:who.agency,modules:who.modules,name:who.name,session:who.session},audit});
      }
      if (p==='/api/action' && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
        const command = await payload(req);
        const who = await workspaceAccess(req, res, id);
        requireWorkspaceCommand(who, command);
        command.actor = who.name;
        const result = await change(id,command,who);
        let delivery = null;
        if (!privateSpace.test(id) && command.type === 'message' && command.data?.channel === 'WhatsApp' && command.data?.direction === 'Outbound') {
          const contact = result.state.contacts.find(c => c.id === command.data.contactId);
          if (contact?.phone) {
            delivery = await whatsapp.sendWorkspaceText(who.agencyId, id, contact.phone, command.data.body,
              (agencyId, workspace) => accountIsActive(agencyId, workspace, 'conversations'));
          }
        }
        if (!privateSpace.test(id) && ['save','delete','import','opportunity-import','opportunity-move','pipeline','profile','bulk','workflow-enroll','workflow-restore','workflow-move'].includes(command.type)) {
          const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
          const label = command.type === 'bulk' ? `Bulk ${command.data?.operation || ''} on ${command.data?.object || ''}`.trim() : '';
          await recordAudit(who, command.type === 'delete' ? `Deleted ${command.key}` : command.type === 'save' ? `Saved ${command.key}` : label || `Ran ${command.type}`, account);
        }
        return json({ id: result.id, ...workspaceView(who, result.state), ...(delivery ? { delivery } : {}) });
      }
      if (p==='/api/agency' && method!=='POST') {
        return json(await agencyPayload(req,res));
      }
      if (p.startsWith('/api/agency/') && method==='POST') {
        const who = await access(req,res);
        requireCapability(who, 'agency', 'Your user cannot open the agency view.');
        const op = p.slice('/api/agency/'.length), body = await payload(req);
        const result = await agencyRequest(op, who, body);
        // Opening a sub-account only stamps lastLogin; skip rebuilding the full agency payload (it loads every sub-account).
        if (op === 'action' && body?.type === 'account-open') return json({ result });
        return json(await agencyPayload(req,res, { result }));
      }
      if (p.startsWith('/api/whatsapp/webhook/') && method === 'POST') {
        return await whatsapp.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json });
      }
      if (p.startsWith('/api/whatsapp/agency/')) {
        const who = await access(req, res);
        requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração global com WhatsApp.');
        return await whatsapp.handleAgencyApi({
          req, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
        });
      }
      if (p.startsWith('/api/whatsapp/workspace/')) {
        if (!spaceId.test(id)) throw error('Subconta não encontrada.', 404);
        const who = await workspaceAccess(req, res, id, { modules: ['settings'] });
        if (method === 'POST' && p.replace(/\/+$/, '') === '/api/whatsapp/workspace/test') requireModule(who, 'conversations');
        return await whatsapp.handleWorkspaceApi({
          req, url, method, agencyId: who.agencyId, workspaceId: id, payload, publicOrigin: publicBase(req), requireActiveAccount, json
        });
      }
      if (p.startsWith('/api/waha/webhook/') && method === 'POST') {
        return await waha.handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json });
      }
      if (p.startsWith('/api/waha/')) {
        const who = await access(req, res);
        requireCapability(who, 'settings', 'Seu usuário não pode gerenciar a integração com WhatsApp.');
        if (method === 'POST' && p.replace(/\/+$/, '') === '/api/waha/test') requireModule(who, 'conversations');
        return await waha.handleApi({
          req, res, url, method, who, payload, publicOrigin: publicBase(req), listWorkspaces, requireActiveAccount, json
        });
      }
      if (p.startsWith('/api/ask/')) {
        const { agency, who } = await accessContext(req, await verifiedUser(req, res));
        requireCapability(who, 'agency', 'Seu usuário não pode acessar o Pergunte à Soci.');
        return await handleAsk({
          req, res, url, method, who, json,
          loadContext: async () => {
            const workspaces = await listWorkspaces(who.agencyId);
            ensureAccounts(agency, workspaces);
            const states = await agencyWorkspaceViews(agency, who, workspaces);
            return { agency: publicAgency(agency, who), overview: agencyOverview(agency, states) };
          }
        });
      }
      const agentAction = p.match(/^\/api\/agents\/(create|save|publish|unpublish|move|delete|memory|test|build)$/);
      if (agentAction && method==='POST') {
        if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
        const who = await workspaceAccess(req, res, id, { modules: ['ai-agents'] });
        const operation = agentAction[1];
        const input = await payload(req);
        if (operation === 'test') {
          const preview = agentPreview(await store.load(id), input);
          const connection = localAccess && generateAgentReply !== replyAsAgent ? null : await openAI.requireConnection(who.session);
          const reply = await generateAgentReply({ ...preview, model: preview.model || agentModel }, connection);
          const message = preview.messages.at(-1).content;
          const run = await store.change(id, state => recordAgentRun(state, { agent: input.id, version: input.version, input: message, output: reply }));
          return json({ reply, run });
        }
        if (operation === 'build') {
          const build = agentBuildRequest(await store.load(id), input);
          const connection = localAccess && designAgentConfig !== designAgent ? null : await openAI.requireConnection(who.session);
          const { summary, draft } = await designAgentConfig(build, connection);
          const agent = await store.change(id, state => applyAgentDesign(state, input, draft));
          return json({ agent, summary });
        }
        const agent = await store.change(id, state => editAgent(state, operation, { ...input, model: agentModel }));
        if (!privateSpace.test(id) && operation !== 'save') {
          const labels = { create: 'Agente criado', publish: 'Agente publicado', unpublish: 'Agente despublicado', delete: 'Agente excluído' };
          const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
          await recordAudit(who, labels[operation], account, agent?.name || '');
        }
        return json({ agent }, operation === 'create' ? 201 : 200);
      }
      if (p==='/api/studio' && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const kind = input.kind === 'funnel' ? 'funnel' : 'website';
        const blankName = typeof input.name === 'string' ? input.name.trim().slice(0,80) : '';
        const brief = input.mode === 'blank' ? blankName : typeof input.brief === 'string' ? input.brief.trim() : '';
        const template = input.template || 'landing';
        if (input.mode === 'blank' && !blankName) throw error('Dê um nome ao funil ou site.',400);
        if (!brief || brief.length > 4000) throw error('Enter a project description of up to 4,000 characters.',400);
        if (!studioTemplates.some(item => item[0] === template)) throw error('Choose a valid template.',400);
        if (!['model','starter','blank'].includes(input.mode)) throw error('Choose how to create the project.',400);
        const existing = await store.load(id);
        if (existing.studioProjects.length >= 60) throw error('A workspace can have up to 60 Studio projects.',400);
        const connection = input.mode === 'model' ? await openAI.requireConnection(who.session) : null;
        const reference = connection && input.reference ? await readReference(input.reference) : null;
        const design = input.design ? validDesign(input.design) : null;
        const plan = input.plan ? validPlan(input.plan, kind) : null;
        let draft, html;
        if (input.mode === 'model') {
          const site = await generateSite(connection,brief,template,reference?.summary,design,plan?.pages[0] || null);
          draft = { name:site.name, headline:site.name, summary:site.summary, theme:site.theme, blocks:[] };
          html = site.html;
        } else if (design && plan) {
          draft = { name:plan.name, headline:plan.name, summary:plan.summary, theme:'indigo', blocks:[] };
          html = designedPage({ siteName:plan.name, page:plan.pages[0], design, summary:plan.summary });
        } else if (input.mode === 'blank') {
          draft = { name:blankName, headline:blankName, summary:'', theme:'indigo', blocks:[] };
          html = pageFromStructure(draft, blankName);
        } else {
          draft = starterProject(brief,template);
          html = pageFromStructure(draft);
        }
        if (plan) Object.assign(draft, { name:plan.name, headline:plan.name, summary:plan.summary || draft.summary });
        const pages = [{ name:plan ? plan.pages[0].name : kind === 'funnel' ? 'Página de captura' : 'Home', slug:'index', html }];
        if (kind === 'funnel' && !plan) pages.push({ name:'Obrigado', slug:'obrigado', html:thankYouPage(draft) });
        const doc = newSiteDoc({ workspace:id, project:{ id:'pending' }, pages });
        const created = await change(id,{type:'save',key:'studioProjects',data:{...draft,brief,template,kind,design,reference:reference?.url || ''}});
        doc.project = created.id; doc.profile.name = `AI Studio ${created.id}`;
        await store.insert(siteRowId(created.id), doc);
        const synced = await syncMeta(id, created.id, doc);
        return json({ id: synced.id, ...workspaceView(who, synced.state) },201);
      }
      if ((p==='/api/studio/discover' || p==='/api/studio/plan') && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
        if (!brief || brief.length > 4000) throw error('Descreva o que você quer construir em até 4.000 caracteres.',400);
        const kind = input.kind === 'funnel' ? 'funnel' : 'website';
        const connection = await openAI.status(who.session).then(s => s.configured ? openAI.requireConnection(who.session) : null);
        if (p === '/api/studio/discover') {
          if (!connection) return json({ ai:false, intro:`Vou montar ${kind === 'funnel' ? 'o funil' : 'o site'} com base na sua descrição. Antes, escolha a direção visual.`, questions:questionsFor({ kind }) });
          const found = await discoverDesign(connection,{ brief, kind });
          const palettes = found.palettes.map(item => validDesign({ palette:item }).palette).slice(0,4);
          const fonts = found.fonts.map(item => validDesign({ fonts:item }).fonts).slice(0,4);
          return json({ ai:true, intro:String(found.intro || '').slice(0,600), questions:questionsFor({ kind, palettes:palettes.length === 4 ? palettes : undefined, fonts:fonts.length === 4 ? fonts : undefined }) });
        }
        const design = validDesign(input.design);
        const plan = connection ? validPlan(await planSite(connection,{ brief, kind, design }), kind) : localPlan(brief, kind);
        if (kind === 'funnel' && !/obrigad|thank/i.test(plan.pages.at(-1).name + plan.pages.at(-1).slug) && plan.pages.length < 6) plan.pages.push({ name:'Obrigado', slug:'obrigado', purpose:'Confirma o envio e explica os próximos passos.' });
        return json({ ai:Boolean(connection), plan, design });
      }
      if (p==='/api/studio/doc' && method!=='POST') {
        await studioGuard(req,res,id);
        const projectId = url.searchParams.get('id') || '';
        return json({ doc: publicDoc(await siteDoc(id, projectId)) });
      }
      if (p.startsWith('/api/studio/') && method==='POST') {
        const who = await studioGuard(req,res,id);
        const input = await payload(req);
        const result = await studioRequest(id, p.slice('/api/studio/'.length), input, who.session);
        const doc = await siteDoc(id, input.id);
        const synced = await syncMeta(id, input.id, doc);
        return json({ id: synced.id, ...workspaceView(who, synced.state), doc: publicDoc(doc), result });
      }
      const preview = p.match(previewPath);
      if (preview && method === 'GET') {
        await ready;
        const [, workspace, projectId, pageId] = preview;
        await studioGuard(req,res,workspace);
        const doc = await siteDoc(workspace, projectId);
        res.writeHead(200, previewHeaders);
        return res.end(findPage(doc, pageId).html);
      }
      const site = p.match(sitePath);
      if (site) {
        await ready;
        const [, workspace, projectId, slug = 'index'] = site;
        const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
        const base = `/s/${workspace}/${projectId}`;
        const doc = await siteDoc(workspace, projectId, false).catch(() => null);
        if (!doc?.published) throw error('This site is not published.',404);
        if (method === 'POST') {
          const fields = await formFields(req);
          await publicAccountPolicy(workspace, true, 'sites');
          const back = fields._page && fields._page !== 'index' ? `${base}/${encodeURIComponent(fields._page)}` : base;
          const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
          try {
            if (!project?.formId) throw error('This site is not accepting submissions.',404);
            await change(workspace,{ type:'submit', id:project.formId, data:{ name:fields.name, email:fields.email, phone:fields.phone, _source:'Site' } });
            const order = doc.published.pages;
            const from = order.findIndex(item => item.slug === (fields._page || 'index'));
            if (from >= 0) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, order[from].id, 'optins'))).catch(() => {});
            const next = project.kind === 'funnel' && from >= 0 ? order[from + 1] : null;
            res.writeHead(303,{ Location:next ? `${base}/${encodeURIComponent(next.slug)}` : `${back}?sent=1` });
          } catch {
            res.writeHead(303,{ Location:`${back}?error=1` });
          }
          return res.end();
        }
        if (method !== 'GET') throw error('Method not allowed.',405);
        const page = doc.published.pages.find(item => item.slug === slug);
        if (!page) throw error('Page not found.',404);
        if (active && !url.searchParams.has('sent') && !url.searchParams.has('error')) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, page.id, 'views'))).catch(() => {});
        const pt = /<html\b[^>]*\blang\s*=\s*["']?pt/i.test(page.html), es = /<html\b[^>]*\blang\s*=\s*["']?es/i.test(page.html);
        const notice = url.searchParams.has('sent') ? { ok:true, text:pt ? 'Obrigado! Seus dados foram enviados.' : es ? '¡Gracias! Tus datos fueron enviados.' : 'Thank you! Your details were sent.' }
          : url.searchParams.has('error') ? { ok:false, text:pt ? 'Não foi possível enviar. Confira o nome e o e-mail e tente de novo.' : es ? 'No se pudo enviar. Revisa el nombre y el correo e inténtalo de nuevo.' : 'Your details could not be sent. Check the name and email and try again.' } : '';
        res.writeHead(200, publicHeaders);
        return res.end(renderPublic(page,{ base, notice }));
      }
      // Webinars: registration, watch room (attendance when the room is open) and calendar file.
      const webinarRoute = p.match(webinarPath);
      if (webinarRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, webinarId, part] = webinarRoute;
        const state = await store.load(workspace);
        const webinar = state.webinars?.find(item => item.id === webinarId);
        const preview = url.searchParams.get('preview') === '1' && (localAccess || auth?.hasSession(req));
        if (!webinar || (!webinar.active && !preview)) throw error('Este webinar não está disponível.',404);
        const zone = state.profile?.timezone || 'America/Sao_Paulo';
        const page = body => { res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return res.end(method === 'HEAD' ? undefined : body); };
        if (!part) return page(registrationPage(webinar, { workspace, zone }));
        const registration = state.webinarRegistrations.find(item => item.webinarId === webinarId && item.token === String(url.searchParams.get('t') || ''));
        if (!registration) throw error('Inscrição não encontrada. Use o link que você recebeu.',404);
        const session = webinar.sessions.find(item => item.id === registration.sessionId);
        if (part === 'agenda.ics') {
          if (!session) throw error('Sessão não encontrada.',404);
          res.writeHead(200, { 'Content-Type':'text/calendar; charset=utf-8', 'Content-Disposition':'attachment; filename="webinar.ics"' });
          return res.end(calendarFile(webinar, session, `${publicBase(req)}/w/${workspace}/${webinarId}/sala?t=${registration.token}`));
        }
        const now = Date.now();
        if (session && webinar.active && method === 'GET' && now >= Date.parse(session.start) - webinar.openBefore * 60000 && now < Date.parse(session.start) + session.duration * 60000)
          await Promise.resolve().then(() => change(workspace,{ type:'webinar-attend', id:webinarId, data:{ token:registration.token } })).catch(() => {});
        return page(roomPage(webinar, registration, { workspace, zone, at:now }));
      }
      const webinarCall = p.match(webinarApi);
      if (webinarCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const [, workspace, webinarId] = webinarCall;
        const input = await payload(req);
        const result = await change(workspace,{ type:'webinar-register', id:webinarId, data:{ name:input.name, email:input.email, phone:input.phone, sessionId:input.sessionId } });
        const registration = result.state.webinarRegistrations.find(item => item.id === result.id);
        return json({ room:`/w/${workspace}/${webinarId}/sala?t=${registration.token}` },201);
      }
      // QR Codes: count the scan and send the visitor on. The destination can change after printing.
      const qrRoute = p.match(qrPath);
      if (qrRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, qrId] = qrRoute;
        const state = await store.load(workspace);
        const qr = state.qrCodes?.find(item => item.id === qrId);
        const target = qr?.active ? qrTarget(state, qr, { base:publicBase(req), workspace }) : '';
        if (!target) {
          res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'" });
          return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Code indisponível</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#101828;background:#f2f4f7}main{max-width:420px;padding:32px;border-radius:18px;background:#fff;text-align:center}</style></head><body><main><h1 style="font-size:22px;margin:0 0 8px">Este QR Code não está ativo</h1><p style="margin:0;color:#475467">O destino foi pausado ou removido por quem criou o código.</p></main></body></html>`);
        }
        if (method === 'GET') {
          const visitor = `${req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''}|${req.headers['user-agent'] || ''}`;
          await Promise.resolve().then(() => change(workspace,{ type:'qr-scan', id:qrId, data:{ visitor, device:deviceOf(String(req.headers['user-agent'] || '')) } })).catch(() => {});
        }
        res.writeHead(302, { Location:target, 'Cache-Control':'no-store' });
        return res.end();
      }
      // Stores: catalog, product page and cart. Totals always come from quoteOrder on the server.
      const storeRoute = p.match(storePath);
      if (storeRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, storeId, cart, slug] = storeRoute;
        const state = await store.load(workspace);
        const shop = state.stores?.find(item => item.id === storeId);
        const preview = url.searchParams.get('preview') === '1' && (localAccess || auth?.hasSession(req));
        if (!shop || (!shop.active && !preview)) throw error('Esta loja não está aberta.',404);
        const base = `/loja/${workspace}/${storeId}`;
        let body;
        if (cart) body = storeCart(state, shop, { base, workspace });
        else if (slug) { const item = catalog(state, shop).find(row => row.slug === slug); if (!item) throw error('Produto não encontrado.',404); body = storeProduct(state, shop, item, { base }); }
        else body = storeHome(state, shop, { base, category:String(url.searchParams.get('categoria') || '').slice(0,40) });
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'strict-origin-when-cross-origin',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" });
        return res.end(method === 'HEAD' ? undefined : body);
      }
      const storeCall = p.match(storeApi);
      if (storeCall) {
        await ready;
        if (method !== 'POST') throw error('Method not allowed.',405);
        const [, workspace, storeId, op] = storeCall;
        const input = await payload(req);
        if (op === 'quote') {
          const state = await store.load(workspace);
          const shop = state.stores?.find(item => item.id === storeId && item.active);
          if (!shop) throw error('Esta loja não está aberta.',404);
          const { coupon_, ...quote } = quoteOrder(state, shop, input);
          return json(quote);
        }
        const result = await change(workspace,{ type:'store-checkout', id:storeId, data:input });
        const order = result.state.orders.find(item => item.id === result.id), shop = result.state.stores.find(item => item.id === storeId);
        return json({ number:order.number, total:order.total, method:methodLabel[shop.payment.method] || shop.payment.method, instructions:shop.payment.instructions, thanks:shop.thanks },201);
      }
      // Blogs: home with categories and pages, posts with SEO tags, and RSS. Drafts open with ?preview=1 when signed in.
      const blogRoute = p.match(blogPath);
      if (blogRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, blogId, slug] = blogRoute;
        const state = await store.load(workspace);
        const blog = state.blogs?.find(item => item.id === blogId);
        const preview = url.searchParams.get('preview') === '1' && (localAccess || auth?.hasSession(req));
        if (!blog || (!blog.active && !preview)) throw error('Este blog não está publicado.',404);
        const base = `/b/${workspace}/${blogId}`, origin = publicBase(req);
        const html = (status, body) => { res.writeHead(status, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Cache-Control':preview ? 'no-store' : 'public, max-age=60',
          'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return res.end(method === 'HEAD' ? undefined : body); };
        if (slug === 'rss.xml') {
          if (blog.rss === false) throw error('Este blog não tem RSS.',404);
          res.writeHead(200, { 'Content-Type':'application/rss+xml; charset=utf-8', 'Cache-Control':'public, max-age=300' });
          return res.end(method === 'HEAD' ? undefined : blogRss(state, blog, { base, origin }));
        }
        if (!slug) return html(200, blogHome(state, blog, { base, origin, category:String(url.searchParams.get('categoria') || '').slice(0,80), page:Number(url.searchParams.get('pagina')) || 1 }));
        const post = state.blogPosts.find(item => item.blogId === blogId && item.slug === slug);
        if (!post || (!isLive(post) && !preview)) throw error('Artigo não encontrado.',404);
        if (!preview && method === 'GET') await Promise.resolve().then(() => change(workspace,{ type:'blog-view', id:post.id })).catch(() => {});
        return html(200, blogPost(state, blog, post, { base, origin, preview }));
      }
      if (p === '/api/blog/ai' && method === 'POST') {
        const who = await workspaceAccess(req,res,id,{ modules:['sites'] });
        const input = await payload(req);
        const connection = await openAI.status(who.session).then(status => status.configured ? openAI.requireConnection(who.session) : null);
        if (input.mode === 'seo') {
          if (!connection) throw error('Conecte a OpenAI em Configurações para gerar o SEO com IA.',409);
          return json({ ai:true, seo:await postSeo(connection,{ title:input.title, body:input.body }) });
        }
        if (!String(input.topic || input.title || '').trim()) throw error('Descreva o tema do artigo.',400);
        return json(connection ? { ai:true, post:await writePost(connection, input) } : { ai:false, post:localDraft(input) });
      }
      // Chat widget: the loader a site embeds, the panel it opens in an iframe, a demo page and the visitor API.
      const chatRoute = p.match(chatPath);
      if (chatRoute && (method === 'GET' || method === 'HEAD')) {
        await ready;
        const [, workspace, widgetId, part] = chatRoute;
        const state = await store.load(workspace);
        const widget = state.chatWidgets?.find(item => item.id === widgetId);
        const signedIn = localAccess || auth?.hasSession(req);
        if (!widget || (!widget.active && !signedIn)) throw error('Este chat não está publicado.',404);
        if (part === 'widget.js') {
          res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-cache', 'Cross-Origin-Resource-Policy':'cross-origin' });
          return res.end(method === 'HEAD' ? undefined : widget.active ? loaderScript(widget, { workspace }) : '/* chat em rascunho */');
        }
        if (part === 'demo') {
          res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'" });
          return res.end(method === 'HEAD' ? undefined : demoPage(widget, { workspace, brand:state.profile?.name || '' }));
        }
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
          'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors *" });
        return res.end(method === 'HEAD' ? undefined : chatPage(widget, { workspace }));
      }
      const chatCall = p.match(chatApi);
      if (chatCall) {
        await ready;
        const [, workspace, widgetId, op] = chatCall;
        const token = String(req.headers['x-chat-token'] || '');
        const tokenHash = /^[0-9a-f]{48}$/.test(token) ? hash(token) : '';
        if (op === 'messages') {
          if (method !== 'GET') throw error('Method not allowed.',405);
          const state = await store.load(workspace);
          if (!state.chatWidgets?.some(item => item.id === widgetId && item.active)) throw error('Este chat não está disponível.',404);
          return json({ messages:chatHistory(state, widgetId, tokenHash) });
        }
        if (method !== 'POST') throw error('Method not allowed.',405);
        const input = await payload(req);
        if (op === 'start') {
          const fresh = randomBytes(24).toString('hex');
          const result = await change(workspace,{ type:'chat-start', id:widgetId, data:{ name:input.name, email:input.email, phone:input.phone, body:input.body, page:req.headers.referer || '', tokenHash:hash(fresh) } });
          return json({ token:fresh, messages:chatHistory(result.state, widgetId, hash(fresh)) },201);
        }
        const result = await change(workspace,{ type:'chat-send', id:widgetId, data:{ body:input.body, tokenHash } });
        return json({ messages:chatHistory(result.state, widgetId, tokenHash) },201);
      }
      const formRoute = p.match(formPath);
      if (formRoute) {
        await ready;
        const [, workspace, formId] = formRoute;
        const embed = url.searchParams.get('embed') === '1', preview = url.searchParams.get('preview') === '1';
        if (preview) {
          await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
        }
        const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
        const state = await store.load(workspace);
        const form = state.forms.find(item => item.id === formId);
        if (!form || (!form.active && !preview)) throw error('Este formulário não está publicado.',404);
        const redirects = form.onSubmit?.action === 'redirect' && form.onSubmit.url;
        const page = (status, options) => {
          res.writeHead(status, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
            'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; object-src 'none'; form-action 'self'${redirects ? ' https: http:' : ''}; frame-ancestors *` });
          return res.end(method === 'HEAD' ? undefined : formPage(form, { action:`/form/${workspace}/${formId}${embed ? '?embed=1' : preview ? '?preview=1' : ''}`, target:embed && redirects ? '_top' : '',
            customFields:state.customFields || [], embed, brand:state.profile?.name || '', ...options }));
        };
        if (!formOpen(form)) return page(200, { notice:{ title:'Formulário encerrado', text:form.schedule?.closedMessage || 'Este formulário não está recebendo respostas agora.' } });
        if (method === 'GET' || method === 'HEAD') {
          if (active && method === 'GET' && !preview && form.active) await Promise.resolve().then(() => change(workspace,{ type:'form-view', id:formId })).catch(() => {});
          const values = Object.fromEntries([...url.searchParams].filter(([key]) => !['embed','preview','__path'].includes(key)).map(([key, value]) => [key, value.slice(0,500)]));
          return page(200, { values });
        }
        if (!form.active) throw error('Publique o formulário para receber respostas.',403);
        const input = await formBody(req);
        const read = readAnswers(form, input, state.customFields || []);
        if (!read.ok) return page(422, { values:read.values, errors:read.errors });
        await publicAccountPolicy(workspace, true, 'sites');
        try { await change(workspace,{ type:'submit', id:formId, data:{ ...input, _source:embed ? 'Incorporado' : 'Link' } }); }
        catch (failure) { return page(failure.status && failure.status < 500 ? 422 : 500, { values:read.values, errors:{ _form:failure.status && failure.status < 500 ? failure.message : 'Não foi possível enviar agora. Tente de novo.' } }); }
        if (redirects) { res.writeHead(303, { Location:form.onSubmit.url }); return res.end(); }
        const tier = read.result?.tierDetail;
        if (read.result) return page(200, { notice:{ result:read.result, text:tier?.message || form.onSubmit?.message || '', cta:tier?.ctaUrl ? { url:tier.ctaUrl, label:tier.ctaLabel } : null } });
        return page(200, { notice:{ title:'Obrigado!', text:form.onSubmit?.message || 'Recebemos suas respostas.' } });
      }
      const redirect = p.match(redirectPath);
      if (redirect && method === 'GET') {
        await ready;
        const [, workspace, linkId] = redirect;
        const active = await publicAccountPolicy(workspace, false, 'conversations');
        const target = active
          ? await store.change(workspace, state => execute(state, { type: 'link-click', id: linkId }))
          : execute(await store.load(workspace), { type: 'link-click', id: linkId }, { trackClick: false });
        res.writeHead(302, { Location: target });
        return res.end();
      }
      const match=p.replace(/^\/api\/view/,'').match(paths);
      if (p.startsWith('/api/view/') && match) {
        const [,kind,w,item]=match;
        if (method==='POST') {
          if (kind!=='f') throw error('Method not allowed.',405);
          const input = await payload(req);
          await publicAccountPolicy(w, true, 'sites');
          const submission = await change(w,{type:'submit',id:item,data:input});
          return json({id:submission.id},201);
        }
        await publicAccountPolicy(w, false, kind === 'course' ? 'memberships' : 'sites');
        const state=await store.load(w), map={p:'pages',f:'forms',course:'courses'}, row=find(state,map[kind],item);
        if(!row?.active || (kind==='course' && row.portalOnly)) throw error('This item is not published.',404);
        const form=kind==='p' && row.formId ? find(state,'forms',row.formId) : null;
        return json({kind,row,form:form?.active?form:null,brand:state.profile.name});
      }
      const legacyPage = method !== 'POST' && p.match(paths);
      if (legacyPage) {
        await ready;
        await publicAccountPolicy(legacyPage[2], false, legacyPage[1] === 'course' ? 'memberships' : 'sites');
      }
      if (method === 'GET' && legacyPage?.[1] === 'f') { res.writeHead(302, { Location:`/form/${legacyPage[2]}/${legacyPage[3]}` }); return res.end(); }
      if (p === '/privacidade' || p === '/privacidade/') p = '/privacidade.html';
      if ((method==='GET'||method==='HEAD') && (p==='/' || p==='/login' || ['/app','/app/','/painel','/painel/'].includes(p) || paths.test(p) || staticFiles.has(p))) {
        const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
        const isAppDomain = hostHeader.startsWith('app.');
        const isLanding = p === '/login' || (p === '/' && !isAppDomain);
        if (!isLanding && !paths.test(p) && (!staticFiles.has(p) || p === '/index.html') && !localAccess && !auth?.hasSession(req)) {
          const search = new URLSearchParams(url.search); search.delete('__path');
          const next = afterLogin((p === '/' || p === '/index.html' ? '/app' : p) + (search.size ? '?' + search : ''));
          return goTo('/login?' + new URLSearchParams({ next }));
        }
        const f = staticFiles.has(p) ? p : (isLanding ? '/landing.html' : '/index.html');
        return send(200,staticFiles.get(f)||'text/html; charset=utf-8',method==='HEAD'?undefined:readFileSync(resolve(root,'ui',f.slice(1))));
      }
      throw error('Page not found.',404);
    } catch(e) {
      if (!e.status) console.error(e.message);
      if (!res.headersSent && e.publicAccount && !p.startsWith('/api/')) {
        return send(e.status, 'text/html; charset=utf-8', req.method === 'HEAD' ? undefined :
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conteúdo indisponível</title><main><h1>${e.message}</h1><p>Entre em contato com o responsável pela publicação para saber mais.</p></main></html>`);
      }
      if (!res.headersSent) json({
        error: e.status ? e.message : 'The workspace could not complete this request.',
        ...(e.code === 'ACCOUNT_SUSPENDED' && { code: e.code, account: e.account })
      }, e.status || 500);
    }
  });
  server.on('close',()=>{ if (socialTimer) clearInterval(socialTimer); store.close(); });
  return {server,port,host,ready,backend:store.kind};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const store = supabaseFromEnv();
    const { server,port,host,ready,backend } = makeServer(store ? { store } : {});
    await ready;
    server.listen(port,host,()=>console.log(`Local workspace (${backend}): http://${host}:${server.address().port}/`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

let vercelApp = null;
export default async function handler(req, res) {
  if (!vercelApp) {
    const store = supabaseFromEnv();
    const instance = makeServer(store ? { store } : {});
    await instance.ready;
    vercelApp = instance.server;
  }
  vercelApp.emit('request', req, res);
}

