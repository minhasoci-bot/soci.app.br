// App Studio (7.3): apps an agency builds and the sub-accounts install from the marketplace.
//
// Agency document: `studioApps` (the apps) and `appInstalls` (where each one is installed, with the hash of the
// install token the app received). Sub-account document: `appInstalls` (a copy of what each installed app does,
// read by the workflow engine and the screens) and `appLog` (the latest deliveries to the apps).
// The signing secret is never stored: it is derived from the server secret, the agency, the app and a version.
import { createHmac, randomBytes, createHash } from 'node:crypto';
import { appApiScopes, appCategories, appEvents, appLimits, appSlug } from './ui/app-studio-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const now = () => new Date().toISOString();
const id = () => randomBytes(8).toString('hex');
export const tokenHash = token => createHash('sha256').update(String(token)).digest('hex');

function https(value, label) {
  const v = str(value, 2000);
  if (!v) return '';
  let u;
  try { u = new URL(v); } catch { fail(`${label}: informe um endereço https:// válido.`); }
  if (u.protocol !== 'https:' || u.username || u.password) fail(`${label}: use um endereço https:// sem usuário e senha.`);
  return u.href;
}
const menuUrl = value => {
  const v = str(value, 2000);
  if (!v) return '';
  // {{location.id}} is allowed anywhere in the address; it is checked with a sample id.
  https(v.replaceAll('{{location.id}}', 'x'), 'Link do menu');
  return v;
};

// "Nome" or "Nome: o que faz" per line → [{ key, label, description }], keeping the keys of the items that stay.
function items(raw, prior = [], max, label) {
  const lines = (Array.isArray(raw) ? raw.map(item => typeof item === 'string' ? item : `${item?.label || ''}${item?.description ? `: ${item.description}` : ''}`) : String(raw || '').split('\n'))
    .map(line => line.trim()).filter(Boolean);
  if (lines.length > max) fail(`Um app pode ter até ${max} ${label}.`);
  const seen = new Set();
  return lines.map(line => {
    const [name, ...rest] = line.split(':');
    const text = str(name, appLimits.itemLabel);
    const key = prior.find(item => item.label.toLowerCase() === text.toLowerCase())?.key || appSlug(text);
    if (!key) fail(`Dê um nome a cada uma das ${label}.`);
    if (seen.has(key)) fail(`Há ${label} repetidas: "${text}".`);
    seen.add(key);
    return { key, label: text, description: str(rest.join(':'), appLimits.itemText) };
  });
}

/* ───────────── Agency: build, publish and install ───────────── */

export function saveStudioApp(agency, input = {}, { accountIds = [], actor = '' } = {}) {
  agency.studioApps ||= [];
  const prior = input.id ? agency.studioApps.find(app => app.id === input.id) || fail('App não encontrado.', 404) : null;
  if (!prior && agency.studioApps.length >= appLimits.apps) fail(`A agência pode ter até ${appLimits.apps} apps.`);
  const d = input.data || {};
  const name = str(d.name, appLimits.name) || fail('Dê um nome ao app.');
  if (agency.studioApps.some(app => app.id !== prior?.id && app.name.toLowerCase() === name.toLowerCase())) fail(`Já existe um app chamado ${name}.`);
  const list = (value, allowed) => (Array.isArray(value) ? value : value ? [value] : []).filter(v => allowed.includes(v));
  const webhookUrl = https(d.webhookUrl, 'Webhook do app');
  const app = {
    ...(prior || { id: id(), created: now(), status: 'draft', secretVersion: 1, by: str(actor, 120) }),
    name, tagline: str(d.tagline, appLimits.tagline), description: str(d.description, appLimits.description),
    category: appCategories.includes(d.category) ? d.category : 'Outros',
    website: https(d.website, 'Site do desenvolvedor'), webhookUrl,
    events: list(d.events, appEvents), scopes: list(d.scopes, appApiScopes.map(([scope]) => scope)),
    actions: items(d.actions, prior?.actions, appLimits.actions, 'ações'),
    triggers: items(d.triggers, prior?.triggers, appLimits.triggers, 'gatilhos'),
    menu: str(d.menuLabel, 40) && d.menuUrl ? { label: str(d.menuLabel, 40), url: menuUrl(d.menuUrl) } : null,
    availability: d.availability === 'chosen'
      ? { mode: 'chosen', accounts: list(d.accounts, accountIds) }
      : { mode: 'all', accounts: [] },
    updated: now()
  };
  if (!webhookUrl && (app.events.length || app.scopes.length || app.actions.length)) {
    fail('Informe o webhook do app: é por ele que chegam os eventos, as ações dos workflows e o token de acesso à API.');
  }
  if (app.availability.mode === 'chosen' && !app.availability.accounts.length) fail('Escolha ao menos uma subconta ou libere para todas.');
  if (!app.webhookUrl && !app.triggers.length && !app.menu) fail('O app precisa fazer algo: webhook, gatilhos ou um link de menu.');
  if (prior) agency.studioApps = agency.studioApps.map(row => row.id === prior.id ? app : row);
  else agency.studioApps.push(app);
  return app;
}

export function publishStudioApp(agency, appId, on) {
  const app = (agency.studioApps || []).find(row => row.id === appId) || fail('App não encontrado.', 404);
  app.status = on ? 'published' : 'draft';
  app.updated = now();
  return app;
}

export function deleteStudioApp(agency, appId) {
  const app = (agency.studioApps || []).find(row => row.id === appId) || fail('App não encontrado.', 404);
  const installs = (agency.appInstalls || []).filter(row => row.appId === appId).length;
  if (installs) fail(`${app.name} está instalado em ${installs} subconta(s). Desinstale antes de excluir.`, 409);
  agency.studioApps = agency.studioApps.filter(row => row.id !== appId);
  return app;
}

export function rotateAppSecret(agency, appId) {
  const app = (agency.studioApps || []).find(row => row.id === appId) || fail('App não encontrado.', 404);
  app.secretVersion = (Number(app.secretVersion) || 1) + 1;
  return app;
}

export const appSecret = (serverSecret, agencyId, app) =>
  createHmac('sha256', String(serverSecret)).update(`soci-app:${agencyId}:${app.id}:${app.secretVersion || 1}`).digest('hex');

// Header value the app checks: HMAC-SHA256 of "<timestamp>.<body>" with its secret.
export const appSignature = (secret, timestamp, body) => `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

export const appAvailableTo = (app, account) => app.status === 'published' && (app.availability?.mode !== 'chosen' || app.availability.accounts.includes(account));

// What a sub-account sees in its marketplace (never the webhook address or the secret).
export const marketplaceEntry = (app, installs = []) => ({
  id: app.id, name: app.name, tagline: app.tagline, description: app.description, category: app.category, website: app.website,
  events: app.events, scopes: app.scopes, actions: app.actions.map(({ key, label, description }) => ({ key, label, description })),
  triggers: app.triggers.map(({ key, label, description }) => ({ key, label, description })), menu: app.menu,
  installed: installs.some(row => row.appId === app.id)
});

export function marketplaceFor(agency, account) {
  const installs = (agency.appInstalls || []).filter(row => row.account === account);
  return (agency.studioApps || []).filter(app => appAvailableTo(app, account) || installs.some(row => row.appId === app.id))
    .map(app => marketplaceEntry(app, installs));
}

// The copy kept in the sub-account: what the engine and the screens need to run the app there.
export const installedCopy = (app, install) => ({
  installId: install.id, appId: app.id, name: app.name, tagline: app.tagline, category: app.category,
  webhook: Boolean(app.webhookUrl), events: app.events, scopes: app.scopes,
  actions: app.actions.map(({ key, label }) => ({ key, label })), triggers: app.triggers.map(({ key, label }) => ({ key, label })),
  menu: app.menu, installedAt: install.at, by: install.by
});

export function addInstall(agency, appId, account, by = '') {
  const app = (agency.studioApps || []).find(row => row.id === appId) || fail('App não encontrado.', 404);
  if (!appAvailableTo(app, account)) fail(`${app.name} não está disponível para esta subconta.`, 403);
  agency.appInstalls ||= [];
  if (agency.appInstalls.some(row => row.appId === appId && row.account === account)) fail(`${app.name} já está instalado nesta subconta.`, 409);
  const token = `soci_app_${randomBytes(24).toString('hex')}`;
  const install = { id: id(), appId, account, tokenHash: tokenHash(token), last4: token.slice(-4), at: now(), by: str(by, 120), lastUsed: '' };
  agency.appInstalls.push(install);
  return { app, install, token };
}

export function removeInstall(agency, installId, account) {
  const install = (agency.appInstalls || []).find(row => row.id === installId && row.account === account) || fail('Instalação não encontrada.', 404);
  agency.appInstalls = agency.appInstalls.filter(row => row.id !== installId);
  return { install, app: (agency.studioApps || []).find(row => row.id === install.appId) || null };
}

/* ───────────── Sub-account: the installed copy, events, actions and triggers ───────────── */

export function setInstalledApp(s, copy) {
  s.appInstalls = (s.appInstalls || []).filter(row => row.appId !== copy.appId);
  s.appInstalls.push(copy);
  return copy;
}
export function dropInstalledApp(s, appId) {
  const before = (s.appInstalls || []).length;
  s.appInstalls = (s.appInstalls || []).filter(row => row.appId !== appId);
  return before !== s.appInstalls.length;
}

const contactCard = contact => contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, company: contact.company, tags: contact.tags || [], custom: contact.custom || {} } : null;
const plain = ctx => Object.fromEntries(Object.entries(ctx).filter(([key, value]) => key !== 'depth' && (typeof value !== 'object' || value === null)));

// Every workflow event an installed app subscribed to becomes a signed delivery, sent after the save.
export function queueAppEvents(s, type, ctx = {}) {
  if (!appEvents.includes(type)) return 0;
  const apps = (s.appInstalls || []).filter(app => app.webhook && app.events.includes(type));
  if (!apps.length) return 0;
  const contact = ctx.contactId ? (s.contacts || []).find(row => row.id === ctx.contactId) : null;
  s.workflowOutbox ??= [];
  for (const app of apps) {
    s.workflowOutbox.push({ id: id(), created: now(), kind: 'app', appId: app.appId, installId: app.installId,
      body: { type: 'event', event: type, data: plain(ctx), contact: contactCard(contact) } });
  }
  if (s.workflowOutbox.length > 500) s.workflowOutbox.splice(0, s.workflowOutbox.length - 500);
  return apps.length;
}

// Workflow action "Ação de app": the app's webhook receives the action, the contact and the text the step sends.
export function appActionItem(s, config, { run, contact, data }) {
  const [appId, key] = String(config.action || '').split(':');
  const app = (s.appInstalls || []).find(row => row.appId === appId);
  if (!app) return { error: 'o app desta ação não está mais instalado' };
  const action = app.actions.find(item => item.key === key);
  if (!action) return { error: `o app ${app.name} não tem mais esta ação` };
  return { item: { kind: 'app', runId: run.id, appId, installId: app.installId,
    body: { type: 'action', action: key, workflow: { id: run.workflowId, name: run.name, runId: run.id }, contact: contactCard(contact), data } }, label: `${app.name} · ${action.label}` };
}

// An app fires one of its triggers through the API: the contact is found by e-mail or phone, or created.
export function appTrigger(s, { appId, key, contact = {}, payload = {} }, { add, run }) {
  const app = (s.appInstalls || []).find(row => row.appId === appId) || fail('O app não está instalado nesta subconta.', 403);
  const trigger = app.triggers.find(item => item.key === key) || fail(`O app não tem o gatilho "${str(key, 60)}". Gatilhos: ${app.triggers.map(item => item.key).join(', ') || 'nenhum'}.`, 404);
  const email = str(contact.email, 240).toLowerCase(), phone = str(contact.phone, 48), name = str(contact.name, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail do contato inválido.');
  const digits = value => String(value || '').replace(/\D/g, '');
  let row = (email && s.contacts.find(item => String(item.email || '').toLowerCase() === email))
    || (digits(phone).length >= 8 && s.contacts.find(item => digits(item.phone) === digits(phone))) || null;
  if (!row && (email || phone || name)) row = add(s, 'contacts', { name: name || email || phone, email, phone, tags: [], source: app.name });
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (JSON.stringify(data).length > 8000) fail('Os dados do gatilho passam de 8 KB.', 413);
  run(s, 'app_trigger', { contactId: row?.id || '', appId, key, app: app.name, trigger: trigger.label, payload: data });
  appLog(s, { app: app.name, appId, kind: 'trigger', text: `Gatilho recebido: ${trigger.label}${row ? ` · ${row.name}` : ''}` });
  return { contactId: row?.id || '', trigger: trigger.key };
}

export function appLog(s, entry) {
  s.appLog ||= [];
  s.appLog.unshift({ at: now(), ...entry, text: str(entry.text, 200) });
  if (s.appLog.length > appLimits.log) s.appLog.length = appLimits.log;
}
