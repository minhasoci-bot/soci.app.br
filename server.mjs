import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { blank, seed, uid, execute, metrics, find } from './model.mjs';
import { createSqliteStore, supabaseFromEnv } from './storage.mjs';
import { generatePage, generateSite, revisePage, studioAiAvailable } from './studio-ai.mjs';
import { addPage, deletePage, findPage, newSiteDoc, pageFromStructure, previewHeaders, publicDoc, publicHeaders, publish, readReference, renamePage, renderPublic, restoreVersion, savePage, siteRowId } from './studio-site.mjs';
import { starterProject, studioTemplates } from './ui/studio-data.js';
import { AGENCY_ID, agencyForWorkspace, agencyOverview, applySnapshot, blankAgency, catalogTemplate, executeAgency, extractSnapshot, hash, hydrateAgency, installTemplate, userAccess } from './agency-model.mjs';
import { captureProspectWidget, runProspectingAction } from './prospecting-model.mjs';
import { mapsEmbedKey, placesConfigured, placesSearch } from './prospecting-places.mjs';
import { folded, prospectSearchText } from './ui/prospecting-data.js';
import { shareReportHtml, widgetHtml } from './ui/prospect-report.js';
import { moduleOfRecord, snapshotAssets } from './ui/agency-data.js';

const root = dirname(fileURLToPath(import.meta.url));
const staticFiles = new Map([
  ['/app.js','text/javascript; charset=utf-8'], ['/icons.js','text/javascript; charset=utf-8'],
  ['/screens.js','text/javascript; charset=utf-8'], ['/conversations.js','text/javascript; charset=utf-8'],
  ['/dashboard.js','text/javascript; charset=utf-8'], ['/dashboard-data.js','text/javascript; charset=utf-8'],
  ['/dashboard-controls.js','text/javascript; charset=utf-8'], ['/dashboard.css','text/css; charset=utf-8'],
  ['/studio.js','text/javascript; charset=utf-8'], ['/studio-data.js','text/javascript; charset=utf-8'], ['/studio.css','text/css; charset=utf-8'],
  ['/agency.js','text/javascript; charset=utf-8'], ['/agency-data.js','text/javascript; charset=utf-8'], ['/agency.css','text/css; charset=utf-8'],
  ['/prospecting.js','text/javascript; charset=utf-8'], ['/prospecting-data.js','text/javascript; charset=utf-8'],
  ['/prospect-report.js','text/javascript; charset=utf-8'], ['/prospecting.css','text/css; charset=utf-8'],
  ['/style.css','text/css; charset=utf-8'], ['/index.html','text/html; charset=utf-8'],
  ['/graao.css','text/css; charset=utf-8'], ['/graao-dark.css','text/css; charset=utf-8'], ['/graao.js','text/javascript; charset=utf-8'], ['/sidebar.js','text/javascript; charset=utf-8'],
  ['/topbar.js','text/javascript; charset=utf-8'], ['/i18n.js','text/javascript; charset=utf-8'],
  ['/fonts/plus-jakarta-sans.woff2','font/woff2'], ['/favicon.svg','image/svg+xml']
]);
const host = '127.0.0.1';
const defaultPort = Number(process.env.GO_PORT || 4317);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self' https:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
const error = (message,status) => Object.assign(new Error(message),{status});
const spaceId = /^[0-9a-f-]{36}$|^demo$/;
const paths = /^\/(p|f|course)\/([0-9a-f-]{36}|demo)\/([0-9a-f-]{36})$/;
const redirectPath = /^\/r\/(demo|[0-9a-f-]{36})\/([0-9a-f-]{36})$/;
const prospectPublicPath = /^\/prospecting\/(report|widget)\/([0-9a-f-]{36})$/;
const apiPath = /^\/api\/v1\/subaccounts(?:\/(demo|[0-9a-f-]{36})\/contacts)?$/;
const commandModule = { message:'conversations', thread:'conversations', 'manual-action':'conversations', 'conversation-sla':'conversations', 'dismiss-sla':'conversations',
  pipeline:'opportunities', stage:'opportunities', import:'contacts', 'studio-visit':'studio', 'studio-star':'studio', profile:'settings',
  'dashboard-create':'dashboard', 'dashboard-save':'dashboard', 'dashboard-restore':'dashboard', 'dashboard-report':'dashboard' };
const settingsCommands = new Set(['profile','company','billing-plan','wallet','auto-recharge','system-email','labs','compliance','api-key','api-key-delete','private-integration','private-integration-delete']);
const settingsRecords = new Set(['users','menuLinks','announcements']);
const publicAgency = agency => ({ ...agency,
  apiKeys: agency.apiKeys.map(({ hash: _hash, ...rest }) => rest),
  privateIntegrations: agency.privateIntegrations.map(({ hash: _hash, ...rest }) => rest) });
const stamp = () => new Date().toISOString();

export function makeServer({dbPath=resolve(root,'.data','go.sqlite'),port=defaultPort,store=createSqliteStore(dbPath)}={}) {
  const ready = Promise.all([store.insert('demo', seed()), store.insert(AGENCY_ID, blankAgency())]);
  ready.catch(() => {});
  const listWorkspaces = async () => (await store.list()).filter(w => spaceId.test(w.id));
  const loadAgency = async () => hydrateAgency(await store.load(AGENCY_ID));
  const changeAgency = mutate => store.change(AGENCY_ID, state => mutate(hydrateAgency(state)));
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
  const access = async req => {
    const userId = String(req.headers['x-go-user'] || '');
    const result = userAccess(await loadAgency(), userId);
    if (!result) throw error('The selected user no longer exists. Choose another user.',403);
    return { ...result, userId };
  };
  const canOpen = (who, id) => !who.accounts || who.accounts.includes(id);
  async function agencyPayload(who, extra = {}) {
    const workspaces = await listWorkspaces();
    const agency = await loadAgency();
    ensureAccounts(agency, workspaces);
    const states = await Promise.all(workspaces.map(async w => ({ ...w, state: await store.load(w.id) })));
    return { agency: publicAgency(agency), overview: agencyOverview(agency, states), workspaces, access: who,
      features:{prospectingMaps:placesConfigured,prospectingMapsEmbed:mapsEmbedKey}, ...extra };
  }
  async function recordAudit(who, action, target, details = '') {
    try { await changeAgency(agency => logTo(agency, who, action, target, details)); }
    catch { /* Audit entries are best effort and never undo the action itself. */ }
  }
  async function createAccount(who, input) {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0,70) : '';
    if (!name) throw error('Sub-account name is required.',400);
    const state = blank(name);
    const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0,240) : '';
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw error('Enter a valid email address.',400);
    Object.assign(state.profile, { email: mail, phone: String(input.phone || '').slice(0,48) });
    if (['America/Sao_Paulo','America/New_York','Europe/London','UTC'].includes(input.timezone)) state.profile.timezone = input.timezone;
    if (['BRL','USD','EUR','GBP'].includes(input.currency)) state.profile.currency = input.currency;
    const agency = await loadAgency();
    if (input.plan && !agency.plans.some(p => p.id === input.plan)) throw error('Choose a valid plan.',400);
    let loaded = null;
    if (input.snapshotId) {
      const snap = agency.snapshots.find(item => item.id === input.snapshotId);
      if (!snap) throw error('Choose a valid snapshot.',400);
      loaded = { snap, report: applySnapshot(state, snap) };
    }
    const newId = uid();
    await store.insert(newId, state);
    await changeAgency(a => {
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
    const allowed = await changeAgency(agency => {
      const key = agency.apiKeys.find(k => k.hash === digest) || agency.privateIntegrations.find(k => k.hash === digest);
      if (!key) return false;
      key.lastUsed = stamp();
      return !key.scopes || key.scopes.includes(scope);
    });
    if (!allowed) throw error('This key is invalid or lacks the required scope.',401);
  }
  // ---- AI Studio sites ----
  async function studioGuard(req, workspace) {
    if (!spaceId.test(workspace)) throw error('Workspace not found.',404);
    const who = await access(req);
    if (!canOpen(who,workspace)) throw error('Your user cannot open this sub-account.',403);
    if (who.modules && !who.modules.includes('studio')) throw error('Your user does not have permission for this module.',403);
    return who;
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
  async function studioRequest(workspace, op, input) {
    const project = (await store.load(workspace)).studioProjects.find(item => item.id === input.id);
    if (!project) throw error('Project not found.',404);
    const doc = await siteDoc(workspace, project.id);
    const text = (value, label, limit) => { const v = typeof value === 'string' ? value.trim() : ''; if (!v) throw error(`${label} is required.`,400); if (v.length > limit) throw error(`${label} can have up to ${limit} characters.`,400); return v; };
    if (op === 'save') return changeSite(project.id, d => savePage(d, input.pageId, input.html, typeof input.label === 'string' ? input.label : 'Saved'));
    if (op === 'revise') {
      const instruction = text(input.instruction,'Request',2000);
      const selection = typeof input.selection === 'string' ? input.selection.slice(0,8000) : '';
      const page = findPage(doc, input.pageId);
      const revised = await revisePage({ html:page.html, instruction, selection });
      await changeSite(project.id, d => savePage(d, page.id, revised.html, `AI: ${instruction}`));
      return { change: revised.change };
    }
    if (op === 'page') {
      if (input.action === 'add') {
        const name = text(input.name,'Page name',60);
        const description = typeof input.description === 'string' ? input.description.trim().slice(0,1500) : '';
        const home = doc.pages.find(item => item.slug === 'index') || doc.pages[0];
        const html = input.ai && studioAiAvailable ? (await generatePage({ name, description, home:home.html, slugs:doc.pages.map(item => item.slug) })).html
          : pageFromStructure({ ...project, blocks:[], summary:description }, name);
        return changeSite(project.id, d => addPage(d, name, html));
      }
      if (input.action === 'rename') return changeSite(project.id, d => renamePage(d, input.pageId, input.name));
      if (input.action === 'delete') return changeSite(project.id, d => deletePage(d, input.pageId));
      throw error('Choose a valid page action.',400);
    }
    if (op === 'restore') return changeSite(project.id, d => restoreVersion(d, input.versionId));
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
  async function formFields(req) {
    if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Send the form fields.',415);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 20000) throw error('Request is too large.',413); chunks.push(part); }
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    return Object.fromEntries(['name','email','phone','_page'].map(key => [key, (params.get(key) || '').slice(0,240)]));
  }
  async function findProspects(input) {
    const agency = await loadAgency();
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
    if (!(await listWorkspaces()).some(row => row.id === workspace) || !canOpen(who,workspace)) throw error('Escolha uma subconta à qual você tem acesso.',400);
    if (who.modules && (!who.modules.includes('contacts') || (input.opportunity === true && !who.modules.includes('opportunities')))) throw error('Você não tem acesso ao módulo de destino.',403);
    const ids = Array.isArray(input.ids) ? [...new Set(input.ids.slice(0,100))] : [];
    if (!ids.length) throw error('Selecione pelo menos um prospect.',400);
    const agency = await loadAgency();
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
    await changeAgency(current => {
      for (const item of imported) {
        const row = current.prospects.find(prospect => prospect.id === item.id);
        if (row) row.transfers[workspace] = { contact:item.contact,opportunity:item.opportunity,at:row.transfers[workspace]?.at || at };
      }
      logTo(current,who,'Prospects sent to CRM',workspace,`${imported.length} prospect(s)`);
    });
    return imported;
  }

  async function agencyRequest(op, who, input) {
    if (op === 'prospecting-search') return findProspects(input);
    if (op === 'prospecting-transfer') return transferProspects(who,input);
    if (op === 'prospecting-action') {
      if (!who.settings && ['brand','sections','widget'].includes(input.op)) throw error('Somente administradores podem alterar essas configurações.',403);
      const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
      return changeAgency(agency => {
        const result = runProspectingAction(agency,{...input,data});
        logTo(agency,who,`Prospecting: ${input.op}`,typeof input.id === 'string' ? input.id : '');
        return result;
      });
    }
    if (op === 'action') {
      if (!who.settings && (settingsCommands.has(input.type) || ((input.type === 'save' || input.type === 'delete') && settingsRecords.has(input.key)))) throw error('Only agency owners and admins can change agency settings.',403);
      const workspaces = await listWorkspaces();
      return changeAgency(agency => { ensureAccounts(agency, workspaces); return executeAgency(agency, input, { accountIds: workspaces.map(w => w.id), actor: who.name }); });
    }
    if (op === 'accounts') return createAccount(who, input);
    if (op === 'snapshot-create' || op === 'snapshot-refresh') {
      const agency = await loadAgency();
      const prior = op === 'snapshot-refresh' ? agency.snapshots.find(s => s.id === input.id) : null;
      if (op === 'snapshot-refresh' && !prior) throw error('Snapshot not found.',404);
      if (prior && prior.kind !== 'mine') throw error('Only your own snapshots can be refreshed from their source.',400);
      const source = prior ? prior.workspace : input.workspace;
      if (!(await listWorkspaces()).some(w => w.id === source)) throw error('Choose a valid source sub-account.',400);
      const include = prior ? prior.include : Array.isArray(input.include) && input.include.length ? input.include.filter(k => snapshotAssets.some(a => a[0] === k)) : snapshotAssets.map(a => a[0]);
      if (!include.length) throw error('Choose at least one asset type.',400);
      const name = prior ? prior.name : String(input.name || '').trim().slice(0,100);
      if (!name) throw error('Snapshot name is required.',400);
      const { assets, counts } = extractSnapshot(await store.load(source), include);
      return changeAgency(a => {
        if (prior) {
          const snap = a.snapshots.find(s => s.id === prior.id);
          Object.assign(snap, { assets, counts, updated: stamp(), version: (snap.version || 1) + 1 });
          logTo(a, who, 'Snapshot refreshed', snap.name, `Version ${snap.version}`);
          return snap.id;
        }
        if (a.snapshots.length >= 50) throw error('You can keep up to 50 snapshots.',400);
        const snap = { id: uid(), name, kind: 'mine', workspace: source, include, assets, counts, version: 1, created: stamp(), updated: stamp(), shareCode: '', shared: false };
        a.snapshots.push(snap);
        logTo(a, who, 'Snapshot created', name);
        return snap.id;
      });
    }
    if (op === 'snapshot-load') {
      const snap = (await loadAgency()).snapshots.find(s => s.id === input.id);
      if (!snap) throw error('Snapshot not found.',404);
      const targets = Array.isArray(input.workspaces) ? (await listWorkspaces()).filter(w => input.workspaces.includes(w.id)) : [];
      if (!targets.length) throw error('Choose at least one sub-account.',400);
      const mode = input.mode === 'overwrite' ? 'overwrite' : 'skip';
      const loads = [];
      for (const target of targets) {
        const report = await store.change(target.id, state => applySnapshot(state, snap, mode));
        loads.push({ id: uid(), snapshotId: snap.id, snapshot: snap.name, workspace: target.id, account: target.name, at: stamp(), mode, ...report });
      }
      await changeAgency(a => {
        a.snapshotLoads.push(...loads);
        if (a.snapshotLoads.length > 500) a.snapshotLoads.splice(0, a.snapshotLoads.length - 500);
        logTo(a, who, 'Snapshot loaded', snap.name, targets.map(t => t.name).join(', '));
      });
      return loads;
    }
    if (op === 'template-install') {
      const template = catalogTemplate(input.template, await loadAgency());
      const target = (await listWorkspaces()).find(w => w.id === input.workspace);
      if (!target) throw error('Choose a valid sub-account.',400);
      const page = await store.change(target.id, state => installTemplate(state, template));
      await changeAgency(a => {
        a.templateInstalls.push({ id: uid(), template: template.id, name: template.name, workspace: target.id, account: target.name, at: stamp() });
        logTo(a, who, 'Template installed', template.name, target.name);
      });
      return { workspace: target.id, page };
    }
    if (op === 'prospect-convert') {
      const prospect = (await loadAgency()).prospects.find(r => r.id === input.id);
      if (!prospect) throw error('Prospect not found.',404);
      if (prospect.workspace) throw error('This prospect already has a sub-account.',400);
      const newId = await createAccount(who, { name: prospect.name, email: prospect.email, phone: prospect.phone, address: prospect.city, snapshotId: input.snapshotId || '' });
      await changeAgency(a => { const row = a.prospects.find(r => r.id === input.id); if (row) Object.assign(row, { workspace: newId, status: 'Won' }); });
      return newId;
    }
    throw error('Unknown agency request.',404);
  }
  function change(id,command) {
    return store.change(id, state => {
      const result = execute(state, command, { workspace: id });
      return { id:result, state, metrics:metrics(state) };
    });
  }
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
    try {
      const host = req.headers.host || '';
      if (!isVercel && !allowedHosts.includes(host)) throw error('Use the local address shown in the terminal.',403);
      const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
      const url=new URL(req.url,`${proto}://${host}`), p=url.pathname, method=req.method;
      if (!['GET','HEAD','POST'].includes(method)) throw error('Method not allowed.',405);
      if (method==='POST' && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==url.origin))) throw error('This workspace only accepts local requests.',403);
      if (p.startsWith('/api/')) await ready;
      const id=url.searchParams.get('workspace') || 'demo';
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
          const prospect = findReport(await loadAgency());
          if (!prospect) throw error('Relatório indisponível.',404);
          if (method === 'GET' && !String(req.headers.purpose || req.headers['sec-purpose'] || '').includes('prefetch')) {
            try {
              await changeAgency(agency => {
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
        const widget = (await loadAgency()).prospecting.widgets.find(item => item.id === token && item.active);
        if (!widget) throw error('Formulário indisponível.',404);
        res.setHeader('Content-Security-Policy',csp.replace("frame-ancestors 'none'",'frame-ancestors *'));
        if (method === 'POST') {
          if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) throw error('Envie os campos do formulário.',415);
          let size=0; const chunks=[];
          for await (const part of req) { size+=part.length; if (size>12000) throw error('Formulário muito longo.',413); chunks.push(part); }
          const data = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
          try { if (!data.fax) await changeAgency(agency => captureProspectWidget(agency,token,data)); }
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
          await bearer(req,'subaccounts.read');
          return json({ subaccounts: await listWorkspaces() });
        }
        if (!(await listWorkspaces()).some(w => w.id === account)) throw error('Sub-account not found.',404);
        if (method !== 'POST') {
          await bearer(req,'contacts.read');
          return json({ contacts: (await store.load(account)).contacts });
        }
        await bearer(req,'contacts.write');
        const created = await change(account,{ type:'save', key:'contacts', data: await payload(req) });
        return json({ id: created.id },201);
      }
      if (p==='/api/workspaces') {
        const who = await access(req);
        if (method==='POST') {
          if (!who.agency) throw error('Only agency users can create sub-accounts.',403);
          const newId = await createAccount(who, await payload(req));
          return json({id:newId,workspaces:await listWorkspaces()},201);
        }
        return json({workspaces:(await listWorkspaces()).filter(w => canOpen(who,w.id))});
      }
      if (p==='/api/state' && method!=='POST') {
        if (!spaceId.test(id)) throw error('Workspace not found.',404);
        const who = await access(req);
        if (!canOpen(who,id)) throw error('Your user cannot open this sub-account.',403);
        const [state,workspaces,agency] = await Promise.all([store.load(id),listWorkspaces(),loadAgency()]);
        return json({state,metrics:metrics(state),workspaces:workspaces.filter(w => canOpen(who,w.id)),features:{studioAI:studioAiAvailable},
          agency:agencyForWorkspace(agency,id),access:{agency:who.agency,modules:who.modules,name:who.name}});
      }
      if (p==='/api/action' && method==='POST') {
        if (!spaceId.test(id)) throw error('Workspace not found.',404);
        const who = await access(req);
        if (!canOpen(who,id)) throw error('Your user cannot open this sub-account.',403);
        const command = await payload(req);
        const module = command.type === 'save' || command.type === 'delete' ? moduleOfRecord[command.key] : commandModule[command.type];
        if (module && who.modules && !who.modules.includes(module)) throw error('Your user does not have permission for this module.',403);
        const result = await change(id,command);
        if (['save','delete','import','pipeline','profile'].includes(command.type)) {
          const account = (await listWorkspaces()).find(w => w.id === id)?.name || id;
          await recordAudit(who, command.type === 'delete' ? `Deleted ${command.key}` : command.type === 'save' ? `Saved ${command.key}` : `Ran ${command.type}`, account);
        }
        return json(result);
      }
      if (p==='/api/agency' && method!=='POST') {
        const who = await access(req);
        if (!who.agency) throw error('Your user cannot open the agency view.',403);
        return json(await agencyPayload(who));
      }
      if (p.startsWith('/api/agency/') && method==='POST') {
        const who = await access(req);
        if (!who.agency) throw error('Your user cannot open the agency view.',403);
        const result = await agencyRequest(p.slice('/api/agency/'.length), who, await payload(req));
        return json(await agencyPayload(await access(req).catch(() => who), { result }));
      }
      if (p==='/api/studio' && method==='POST') {
        await studioGuard(req,id);
        const input = await payload(req);
        const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
        const template = input.template || 'landing';
        if (!brief || brief.length > 4000) throw error('Enter a project description of up to 4,000 characters.',400);
        if (!studioTemplates.some(item => item[0] === template)) throw error('Choose a valid template.',400);
        if (!['model','starter'].includes(input.mode)) throw error('Choose how to create the project.',400);
        const existing = await store.load(id);
        if (existing.studioProjects.length >= 60) throw error('A workspace can have up to 60 Studio projects.',400);
        const reference = input.mode === 'model' && input.reference ? await readReference(input.reference) : null;
        let draft, html;
        if (input.mode === 'model') {
          const site = await generateSite(brief,template,reference?.summary);
          draft = { name:site.name, headline:site.name, summary:site.summary, theme:site.theme, blocks:[] };
          html = site.html;
        } else {
          draft = starterProject(brief,template);
          html = pageFromStructure(draft);
        }
        const doc = newSiteDoc({ workspace:id, project:{ id:'pending' }, pages:[{ name:'Home', slug:'index', html }] });
        const created = await change(id,{type:'save',key:'studioProjects',data:{...draft,brief,template,reference:reference?.url || ''}});
        doc.project = created.id; doc.profile.name = `AI Studio ${created.id}`;
        await store.insert(siteRowId(created.id), doc);
        return json(await syncMeta(id, created.id, doc),201);
      }
      if (p==='/api/studio/doc' && method!=='POST') {
        await studioGuard(req,id);
        const projectId = url.searchParams.get('id') || '';
        return json({ doc: publicDoc(await siteDoc(id, projectId)) });
      }
      if (p.startsWith('/api/studio/') && method==='POST') {
        await studioGuard(req,id);
        const input = await payload(req);
        const result = await studioRequest(id, p.slice('/api/studio/'.length), input);
        const doc = await siteDoc(id, input.id);
        const synced = await syncMeta(id, input.id, doc);
        return json({ ...synced, doc: publicDoc(doc), result });
      }
      const preview = p.match(/^\/studio-preview\/(demo|[0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/);
      if (preview && method === 'GET') {
        await ready;
        const [, workspace, projectId, pageId] = preview;
        const doc = await siteDoc(workspace, projectId);
        res.writeHead(200, previewHeaders);
        return res.end(findPage(doc, pageId).html);
      }
      const site = p.match(/^\/s\/(demo|[0-9a-f-]{36})\/([0-9a-f-]{36})(?:\/([a-z0-9-]{1,48}))?$/);
      if (site) {
        await ready;
        const [, workspace, projectId, slug = 'index'] = site;
        const base = `/s/${workspace}/${projectId}`;
        const doc = await siteDoc(workspace, projectId, false).catch(() => null);
        if (!doc?.published) throw error('This site is not published.',404);
        if (method === 'POST') {
          const fields = await formFields(req);
          const back = fields._page && fields._page !== 'index' ? `${base}/${encodeURIComponent(fields._page)}` : base;
          const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
          try {
            if (!project?.formId) throw error('This site is not accepting submissions.',404);
            await change(workspace,{ type:'submit', id:project.formId, data:{ name:fields.name, email:fields.email, phone:fields.phone } });
            res.writeHead(303,{ Location:`${back}?sent=1` });
          } catch {
            res.writeHead(303,{ Location:`${back}?error=1` });
          }
          return res.end();
        }
        if (method !== 'GET') throw error('Method not allowed.',405);
        const page = doc.published.pages.find(item => item.slug === slug);
        if (!page) throw error('Page not found.',404);
        const pt = /<html\b[^>]*\blang\s*=\s*["']?pt/i.test(page.html), es = /<html\b[^>]*\blang\s*=\s*["']?es/i.test(page.html);
        const notice = url.searchParams.has('sent') ? { ok:true, text:pt ? 'Obrigado! Seus dados foram enviados.' : es ? '¡Gracias! Tus datos fueron enviados.' : 'Thank you! Your details were sent.' }
          : url.searchParams.has('error') ? { ok:false, text:pt ? 'Não foi possível enviar. Confira o nome e o e-mail e tente de novo.' : es ? 'No se pudo enviar. Revisa el nombre y el correo e inténtalo de nuevo.' : 'Your details could not be sent. Check the name and email and try again.' } : '';
        res.writeHead(200, publicHeaders);
        return res.end(renderPublic(page,{ base, notice }));
      }
      const redirect = p.match(redirectPath);
      if (redirect && method === 'GET') {
        await ready;
        const [, workspace, linkId] = redirect;
        const target = await store.change(workspace, state => execute(state, { type: 'link-click', id: linkId }));
        res.writeHead(302, { Location: target });
        return res.end();
      }
      const match=p.replace(/^\/api\/view/,'').match(paths);
      if (p.startsWith('/api/view/') && match) {
        const [,kind,w,item]=match;
        if (method==='POST') {
          if (kind!=='f') throw error('Method not allowed.',405);
          const submission = await change(w,{type:'submit',id:item,data:await payload(req)});
          return json({id:submission.id},201);
        }
        const state=await store.load(w), map={p:'pages',f:'forms',course:'courses'}, row=find(state,map[kind],item);
        if(!row?.active) throw error('This item is not published.',404);
        const form=kind==='p' && row.formId ? find(state,'forms',row.formId) : null;
        return json({kind,row,form:form?.active?form:null,brand:state.profile.name});
      }
      if ((method==='GET'||method==='HEAD') && (p==='/' || paths.test(p) || staticFiles.has(p))) {
        const f=staticFiles.has(p)?p:'/index.html';
        return send(200,staticFiles.get(f),method==='HEAD'?undefined:readFileSync(resolve(root,'ui',f.slice(1))));
      }
      throw error('Page not found.',404);
    } catch(e) {
      if (!e.status) console.error(e.message);
      if (!res.headersSent) json({error:e.status?e.message:'The workspace could not complete this request.'},e.status||500);
    }
  });
  server.on('close',()=>store.close());
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
