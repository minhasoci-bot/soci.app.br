import { createHash, randomBytes } from 'node:crypto';
import { defaults, metrics, uid, now } from './model.mjs';
import { hydrateProspecting } from './prospecting-model.mjs';
import { agentTemplate } from './agent-model.mjs';
import {
  accountStatuses, affiliateRate, agencyLevel, agencyPlans, addOns, collections, integrationCatalog, labFeatures,
  mobileModules, resellProducts, snapshotAssets, subAccountModules, systemEmailKeys, templateCatalog,
  appScopes, maxMarkup, rebillProducts, subFeatures, workflowBuilders
} from './ui/agency-data.js';

export const AGENCY_ID = 'agency';
const platformLanguage = 'Português (Brasil)';
const platformBrand = 'soci';
const defaultPrimary = '#ff00bb';
const defaultSecondary = '#fc972d';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value).slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Choose a valid ${label}.`);
const num = (value, label, max = 1e9) => {
  if (value === '' || value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(`Enter a valid ${label.toLowerCase()}.`);
  return Math.round(n * 100) / 100;
};
const email = (value, label = 'email address') => {
  const v = str(value).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(`Enter a valid ${label}.`);
  return v;
};
const url = (value, label) => {
  const v = str(value, 2000);
  if (!v) return '';
  try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); return u.href; }
  catch { return fail(`${label} must be an http or https address.`); }
};
const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fail('Choose a valid color.');
const image = value => {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 400000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value)) fail('Choose a PNG, JPEG, WebP or GIF image under 300 KB.');
  return value;
};
export const hash = text => createHash('sha256').update(text).digest('hex');

export function blankAgency() {
  return {
    profile: { name: 'Agency', first: 'Agency', last: 'Owner', email: '', phone: '', language: platformLanguage },
    company: { name: 'My Agency', brand: platformBrand, domain: '', website: '', phone: '', address: '', primary: defaultPrimary, secondary: defaultSecondary, logo: '', timezone: 'America/Sao_Paulo', currency: defaults.profile.currency },
    accounts: {}, plans: [], snapshots: [], snapshotLoads: [], prospects: [], partners: [], ideas: [], menuLinks: [], announcements: [],
    users: [], templates: [], templateInstalls: [], referrals: [], addonRequests: [], apiKeys: [], privateIntegrations: [], audit: [],
    reselling: Object.fromEntries(resellProducts.map(p => [p.key, { price: p.base, disabled: [] }])),
    affiliate: { accepted: false, steps: {}, code: '', payout: { method: 'PayPal', email: '' }, payments: [] },
    learning: { completed: [] },
    mobileApp: { appName: 'My Agency', primary: '#1570ef', accent: '#12b76a', loginTitle: 'Welcome back', hidden: [], order: mobileModules.map(m => m[0]), custom: [] },
    desktopApp: { appName: 'My Agency', primary: '#1570ef', domain: '' },
    integrations: {},
    billing: { plan: 'Starter', wallet: [], autoRecharge: { enabled: false, threshold: 10, amount: 25 } },
    systemEmails: Object.fromEntries(systemEmailKeys.map(([key, , subject, body]) => [key, { subject, body }])),
    labs: Object.fromEntries(labFeatures.map(([key]) => [key, false])),
    compliance: { retentionDays: 365, consent: 'By submitting, you agree to receive messages from this business.', cookieBanner: true, hipaa: false },
    stripe: { connected: false },
    saas: { enabled: false, enabledAt: '', rebilling: Object.fromEntries(rebillProducts.map(([key]) => [key, 1])), accounts: [] },
    workflowSettings: { builder: 'Standard', overrides: {} },
    subFeatures: Object.fromEntries(subFeatures.map(([key]) => [key, { on: {}, rebill: [] }])),
    emailServices: { domain: '', added: '', accounts: [] },
    apps: { installs: [], resell: {} }
  };
}

const flag = value => value === true || value === 'on' || value === 'true';
const domainName = value => {
  const v = str(value, 200).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(v) ? v : fail('Enter a domain such as mail.youragency.com.');
};
const featureOn = (agency, key, account) => {
  const spec = subFeatures.find(f => f[0] === key);
  const on = agency.subFeatures[key]?.on || {};
  return Object.hasOwn(on, account) ? on[account] : Boolean(spec?.[3]);
};

export function hydrateAgency(state) {
  const fresh = blankAgency();
  for (const [key, value] of Object.entries(fresh)) {
    if (state[key] === undefined) state[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value) && !['accounts', 'integrations', 'reselling', 'systemEmails', 'labs'].includes(key)) state[key] = { ...value, ...state[key] };
  }
  state.profile.language = platformLanguage;
  state.company.brand = platformBrand;
  state.company.currency = defaults.profile.currency;
  if (!/^#[0-9a-f]{6}$/i.test(state.company.primary || '')) state.company.primary = defaultPrimary;
  if (!/^#[0-9a-f]{6}$/i.test(state.company.secondary || '')) state.company.secondary = defaultSecondary;
  for (const product of resellProducts) state.reselling[product.key] ??= { price: product.base, disabled: [] };
  for (const [key] of rebillProducts) state.saas.rebilling[key] ??= 1;
  for (const [key] of subFeatures) state.subFeatures[key] ??= { on: {}, rebill: [] };
  return hydrateProspecting(state);
}

function sanitize(key, input, accountIds) {
  const spec = collections[key];
  const out = {};
  for (const [field, label, type, required, options] of spec.fields) {
    const raw = input[field];
    let value;
    switch (type) {
      case 'email': value = email(raw, label.toLowerCase()); break;
      case 'url': value = url(raw, label); break;
      case 'number': value = num(raw, label); break;
      case 'score': value = raw === '' || raw === undefined ? null : num(raw, label, 10); break;
      case 'check': value = raw === true || raw === 'on' || raw === 'true'; break;
      case 'select': value = raw === undefined && !required ? '' : one(raw, options, label.toLowerCase()); break;
      case 'textarea': value = str(raw, 5000); break;
      case 'multi': {
        const allowed = options === '@accounts' ? accountIds : options === '@modules' ? subAccountModules.map(m => m[0]) : options;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        value = [...new Set(list.filter(v => allowed.includes(v)))];
        break;
      }
      default: value = str(raw, type === 'tel' ? 48 : 240);
    }
    if (required && (value === '' || value === null)) fail(`${label} is required.`);
    out[field] = value;
  }
  return out;
}

export function audit(state, actor, action, target = '', details = '') {
  state.audit.push({ id: uid(), at: now(), actor: str(actor, 120) || 'Agency Owner', action, target: str(target, 200), details: str(details, 500) });
  if (state.audit.length > 1000) state.audit.splice(0, state.audit.length - 1000);
}

export function accountLifecycle(agency, id) {
  const meta = agency.accounts?.[id];
  const status = meta?.status || 'Active';
  return {
    status,
    suspendedReason: status === 'Active' ? '' : meta?.suspendedReason || '',
    suspendedAt: status === 'Paused' ? meta?.suspendedAt || '' : '',
    closedAt: status === 'Closed' ? meta?.closedAt || '' : ''
  };
}

function updateAccountStatus(state, id, meta, status, reason, actor) {
  const previous = meta.status || 'Active';
  if (reason !== undefined || previous !== status) meta.suspendedReason = status === 'Active' ? '' : str(reason, 500);
  if (previous === status) return;
  const at = now();
  Object.assign(meta, { status, suspendedAt: status === 'Paused' ? at : '', closedAt: status === 'Closed' ? at : '' });
  meta.statusHistory = [...(meta.statusHistory || []).slice(-99), {
    from: previous, to: status, at, actor, reason: meta.suspendedReason
  }];
  audit(state, actor, 'Sub-account status changed', id, `${previous} → ${status}`);
}

const pick = (state, key, id) => state[key].find(item => item.id === id) || fail('Record not found.', 404);

// Commands that only touch the agency record.
export function executeAgency(state, command, { accountIds, actor, sharedSnapshot }) {
  const { type, key, id } = command;
  const d = command.data && typeof command.data === 'object' && !Array.isArray(command.data) ? command.data : {};
  const log = (action, target, details) => audit(state, actor, action, target, details);
  switch (type) {
    case 'save': {
      if (!Object.hasOwn(collections, key)) fail('Unknown record type.');
      const clean = sanitize(key, d, accountIds);
      if (key === 'users' && state.users.some(u => u.email === clean.email && u.id !== id)) fail('A user with this email already exists.');
      if (key === 'users' && agencyLevel(clean.role)) clean.accounts = [];
      if (key === 'users' && d.permissionMode !== undefined) {
        clean.permissionMode = one(d.permissionMode, ['', 'inherit', 'restricted', 'none'], 'permission mode');
      }
      if (key === 'plans' && d.modules !== undefined) {
        if (!Array.isArray(d.modules) || d.modules.some(module => !subAccountModules.some(([key]) => key === module))) fail('Choose valid plan modules.');
        clean.modules = [...new Set(d.modules)];
      }
      if (id) {
        const row = pick(state, key, id);
        Object.assign(row, clean, { updated: now() });
        log(`${collections[key].label} updated`, row.name || row.title || row.first || id);
        return row.id;
      }
      if (state[key].length >= collections[key].max) fail(`You can keep up to ${collections[key].max} records of this type.`);
      const row = { id: uid(), created: now(), ...clean };
      if (key === 'ideas') Object.assign(row, { status: 'Under review', votes: 1, voted: true, comments: [] });
      if (key === 'referrals') row.paid = false;
      state[key].push(row);
      log(`${collections[key].label} created`, row.name || row.title || `${row.first} ${row.last}`);
      return row.id;
    }
    case 'delete': {
      if (!Object.hasOwn(collections, key)) fail('Unknown record type.');
      const row = pick(state, key, id);
      state[key] = state[key].filter(item => item.id !== id);
      if (key === 'plans') for (const meta of Object.values(state.accounts)) if (meta.plan === id) meta.plan = '';
      log(`${collections[key].label} deleted`, row.name || row.title || row.first || id);
      return id;
    }
    case 'account-meta': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      const plan = str(d.plan, 60);
      if (plan && !state.plans.some(p => p.id === plan)) fail('Choose a valid plan.');
      const status = one(d.status, accountStatuses, 'status');
      Object.assign(meta, { address: str(d.address, 240), phone: str(d.phone, 48), website: url(d.website, 'Website'), plan });
      updateAccountStatus(state, id, meta, status, d.suspendedReason, actor);
      log('Sub-account updated', meta.name || id, `Status ${status}`);
      return id;
    }
    case 'account-reactivate': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      updateAccountStatus(state, id, meta, 'Active', '', actor);
      return id;
    }
    case 'account-open': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      if (meta.status && meta.status !== 'Active') return id;
      meta.lastLogin = now();
      return id;
    }
    case 'idea-vote': {
      const idea = pick(state, 'ideas', id);
      idea.voted = !idea.voted; idea.votes += idea.voted ? 1 : -1;
      return id;
    }
    case 'idea-status': {
      const idea = pick(state, 'ideas', id);
      idea.status = one(d.status, ['Under review', 'Planned', 'In progress', 'Completed', 'Declined'], 'status');
      log('Idea status changed', idea.title, idea.status);
      return id;
    }
    case 'idea-comment': {
      const idea = pick(state, 'ideas', id);
      idea.comments.push({ id: uid(), at: now(), author: str(actor, 120) || 'Agency Owner', body: req(d.body, 'Comment', 2000) });
      return id;
    }
    case 'resell': {
      const product = resellProducts.find(p => p.key === id) || fail('Product not found.', 404);
      const price = num(d.price, 'Price', 100000);
      if (price < product.base) fail(`The customer price cannot be below your cost of $${product.base}.`);
      const enabled = Array.isArray(d.enabled) ? d.enabled.filter(v => accountIds.includes(v)) : [];
      state.reselling[id] = { price, disabled: accountIds.filter(a => !enabled.includes(a)) };
      log('Reselling price saved', product.name, `$${price}/mo · ${enabled.length} enabled`);
      return id;
    }
    case 'addon-request': {
      const addon = addOns.find(a => a.key === id) || fail('Add-on not found.', 404);
      if (state.addonRequests.some(r => r.addon === id && r.status === 'Requested')) fail('This add-on already has an open request.');
      state.addonRequests.push({ id: uid(), addon: id, status: 'Requested', created: now(), note: str(d.note, 1000) });
      log('Add-on requested', addon.name);
      return id;
    }
    case 'addon-cancel': {
      const request = pick(state, 'addonRequests', id);
      request.status = 'Withdrawn';
      return id;
    }
    case 'affiliate-step': {
      const step = one(d.step, ['policy', 'video', 'toolkit', 'flowchart'], 'step');
      state.affiliate.steps[step] = true;
      return step;
    }
    case 'affiliate-accept': {
      const done = ['policy', 'video', 'toolkit', 'flowchart'].every(step => state.affiliate.steps[step]);
      if (!done) fail('Complete the four steps before accepting the terms.');
      if (d.agree !== true && d.agree !== 'on') fail('Confirm that you read the affiliate policy.');
      state.affiliate.accepted = true; state.affiliate.acceptedAt = now();
      state.affiliate.code ||= randomBytes(4).toString('hex');
      log('Affiliate terms accepted');
      return state.affiliate.code;
    }
    case 'affiliate-payout': {
      state.affiliate.payout = { method: one(d.method, ['PayPal', 'Bank transfer', 'Wise'], 'payout method'), email: email(d.email, 'payout email') };
      log('Affiliate payout details updated', state.affiliate.payout.method);
      return 'payout';
    }
    case 'affiliate-pay': {
      const due = state.referrals.filter(r => r.status === 'Active' && !r.paid);
      if (!due.length) fail('There are no unpaid active referrals.');
      const amount = Math.round(due.reduce((sum, r) => sum + r.amount * affiliateRate, 0) * 100) / 100;
      due.forEach(r => { r.paid = true; });
      state.affiliate.payments.push({ id: uid(), at: now(), amount, referrals: due.map(r => r.id), method: state.affiliate.payout.method });
      log('Affiliate payout recorded', `$${amount}`);
      return amount;
    }
    case 'learning': {
      const lesson = req(d.lesson, 'Lesson', 20);
      const list = state.learning.completed;
      state.learning.completed = list.includes(lesson) ? list.filter(l => l !== lesson) : [...list, lesson];
      return lesson;
    }
    case 'profile': {
      Object.assign(state.profile, { first: req(d.first, 'Nome', 80), last: req(d.last, 'Sobrenome', 80), email: email(d.email), phone: str(d.phone, 48), language: platformLanguage });
      state.profile.name = `${state.profile.first} ${state.profile.last}`;
      log('Profile updated');
      return 'profile';
    }
    case 'company': {
      Object.assign(state.company, { name: req(d.name, 'Nome da empresa', 120), brand: platformBrand, domain: str(d.domain, 200).toLowerCase(),
        website: url(d.website, 'Website'), phone: str(d.phone, 48), address: str(d.address, 300), primary: color(d.primary),
        secondary: d.secondary === undefined ? state.company.secondary || defaultSecondary : color(d.secondary),
        timezone: req(d.timezone, 'Time zone', 60), currency: defaults.profile.currency });
      if (d.logo !== undefined) state.company.logo = d.logo === 'remove' ? '' : d.logo ? image(d.logo) : state.company.logo;
      log('Company settings updated', state.company.name);
      return 'company';
    }
    case 'mobile-app': {
      const order = Array.isArray(d.order) ? d.order.filter(k => mobileModules.some(m => m[0] === k)) : [];
      const custom = (Array.isArray(d.custom) ? d.custom : []).slice(0, 5).map(item => ({ label: req(item?.label, 'Module name', 40), url: url(item?.url, 'Module URL') || fail('Module URL is required.') }));
      Object.assign(state.mobileApp, { appName: req(d.appName, 'App name', 40), primary: color(d.primary), accent: color(d.accent), loginTitle: str(d.loginTitle, 60),
        hidden: (Array.isArray(d.hidden) ? d.hidden : []).filter(k => mobileModules.some(m => m[0] === k)),
        order: [...new Set([...order, ...mobileModules.map(m => m[0])])], custom });
      log('Mobile app settings saved', state.mobileApp.appName);
      return 'mobile';
    }
    case 'desktop-app': {
      Object.assign(state.desktopApp, { appName: req(d.appName, 'App name', 40), primary: color(d.primary), domain: str(d.domain, 200).toLowerCase() });
      log('Desktop app settings saved', state.desktopApp.appName);
      return 'desktop';
    }
    case 'integration': {
      const item = integrationCatalog.find(entry => entry[0] === id) || fail('Integration not found.', 404);
      const accounts = Array.isArray(d.accounts) ? d.accounts.filter(v => accountIds.includes(v)) : [];
      state.integrations[id] = { accounts, updated: now() };
      log('Integration availability changed', item[1], `${accounts.length} sub-accounts`);
      return id;
    }
    case 'saas-mode': {
      state.saas.enabled = flag(d.enabled);
      if (state.saas.enabled && !state.saas.enabledAt) state.saas.enabledAt = now();
      log(state.saas.enabled ? 'SaaS mode enabled' : 'SaaS mode disabled');
      return state.saas.enabled;
    }
    case 'saas-rebilling': {
      for (const [key, label] of rebillProducts) {
        const markup = num(d[key], `${label} markup`, maxMarkup);
        if (markup < 1) fail(`${label} markup must be between 1× and ${maxMarkup}×.`);
        state.saas.rebilling[key] = markup;
      }
      log('Wallet rebilling updated');
      return 'rebilling';
    }
    case 'saas-account': {
      if (!accountIds.includes(id)) fail('Sub-account not found.', 404);
      state.saas.accounts = state.saas.accounts.filter(a => a !== id && accountIds.includes(a));
      if (flag(d.enabled)) state.saas.accounts.push(id);
      log(flag(d.enabled) ? 'SaaS mode enabled for sub-account' : 'SaaS mode disabled for sub-account', id);
      return id;
    }
    case 'workflow-builder': {
      const builder = one(d.builder, workflowBuilders, 'default builder');
      const overrides = {};
      for (const account of accountIds) {
        const value = d[`o_${account}`];
        if (value && value !== 'default') overrides[account] = one(value, workflowBuilders, 'builder');
      }
      state.workflowSettings = { builder, overrides };
      log('Default workflow builder changed', builder, `${Object.keys(overrides).length} sub-account overrides`);
      return builder;
    }
    case 'sub-feature': {
      const spec = subFeatures.find(f => f[0] === id) || fail('Setting not found.', 404);
      const account = accountIds.includes(d.account) ? d.account : fail('Sub-account not found.', 404);
      const field = one(d.field, ['on', 'rebill'], 'setting');
      const value = flag(d.value);
      const entry = state.subFeatures[id];
      if (field === 'on') {
        entry.on[account] = value;
        if (!value) entry.rebill = entry.rebill.filter(a => a !== account);
      } else {
        if (value && !featureOn(state, id, account)) fail(`Enable ${spec[1]} for this sub-account before rebilling it.`);
        entry.rebill = entry.rebill.filter(a => a !== account);
        if (value) entry.rebill.push(account);
      }
      log(`${spec[1]} ${field === 'on' ? 'access' : 'rebilling'} ${value ? 'enabled' : 'disabled'}`, account);
      return id;
    }
    case 'email-domain': {
      state.emailServices = { domain: domainName(d.domain), added: now(), accounts: [] };
      log('Dedicated sending domain added', state.emailServices.domain);
      return state.emailServices.domain;
    }
    case 'email-domain-accounts': {
      if (!state.emailServices.domain) fail('Add a dedicated domain first.');
      state.emailServices.accounts = Array.isArray(d.accounts) ? d.accounts.filter(v => accountIds.includes(v)) : [];
      log('Dedicated domain sub-accounts changed', state.emailServices.domain, `${state.emailServices.accounts.length} sub-accounts`);
      return 'email';
    }
    case 'email-domain-remove': {
      const old = state.emailServices.domain || fail('No dedicated domain to remove.');
      state.emailServices = { domain: '', added: '', accounts: [] };
      log('Dedicated sending domain removed', old);
      return 'email';
    }
    case 'affiliate-pixel': {
      const pixelId = str(d.pixelId, 32);
      if (pixelId && !/^\d{5,20}$/.test(pixelId)) fail('The Facebook Pixel ID has only digits (5 to 20).');
      state.affiliate.pixelId = pixelId;
      log('Affiliate page settings saved');
      return 'pixel';
    }
    case 'app-install': {
      const app = integrationCatalog.find(entry => entry[0] === id) || fail('App not found.', 404);
      const scope = one(d.scope, appScopes, 'installation level');
      const account = scope === 'Sub-account' ? (accountIds.includes(d.account) ? d.account : fail('Choose a sub-account.')) : '';
      if (account && !state.integrations[id]?.accounts.includes(account)) fail(`Make ${app[1]} available to this sub-account first.`);
      if (state.apps.installs.some(x => x.app === id && x.account === account)) fail(`${app[1]} is already installed there.`);
      state.apps.installs.push({ id: uid(), app: id, scope, account, at: now(), by: str(actor, 120) || 'Agency Owner' });
      log('App installed', app[1], account || 'Agency');
      return id;
    }
    case 'app-uninstall': {
      const row = state.apps.installs.find(x => x.id === id) || fail('Installation not found.', 404);
      state.apps.installs = state.apps.installs.filter(x => x.id !== id);
      log('App uninstalled', integrationCatalog.find(entry => entry[0] === row.app)?.[1] || row.app, row.account || 'Agency');
      return id;
    }
    case 'app-resell': {
      const app = integrationCatalog.find(entry => entry[0] === id) || fail('App not found.', 404);
      const cost = num(d.cost, 'App cost', 100000), price = num(d.price, 'Reselling price', 100000);
      if (price && price < cost) fail('The reselling price cannot be lower than the app cost.');
      state.apps.resell[id] = { cost, price };
      log('App reselling price changed', app[1], `$${price}`);
      return id;
    }
    case 'billing-plan': {
      const plan = one(d.plan, agencyPlans.map(p => p[0]), 'plan');
      state.billing.plan = plan; log('Agency plan changed', plan);
      return plan;
    }
    case 'wallet': {
      const amount = num(d.amount, 'Amount', 100000);
      if (!amount) fail('Enter an amount above zero.');
      const kind = one(d.kind, ['Credit', 'Charge'], 'entry type');
      state.billing.wallet.push({ id: uid(), at: now(), kind, amount, note: str(d.note, 200) });
      log(`Wallet ${kind.toLowerCase()} recorded`, `$${amount}`);
      return 'wallet';
    }
    case 'auto-recharge': {
      state.billing.autoRecharge = { enabled: d.enabled === true || d.enabled === 'on', threshold: num(d.threshold, 'Threshold', 10000), amount: num(d.amount, 'Recharge amount', 10000) };
      log('Wallet auto-recharge updated', state.billing.autoRecharge.enabled ? 'On' : 'Off');
      return 'auto';
    }
    case 'system-email': {
      const entry = systemEmailKeys.find(e => e[0] === id) || fail('Email not found.', 404);
      state.systemEmails[id] = { subject: req(d.subject, 'Subject', 200), body: req(d.body, 'Body', 5000) };
      log('System email updated', entry[1]);
      return id;
    }
    case 'labs': {
      for (const [key] of labFeatures) state.labs[key] = d[key] === true || d[key] === 'on';
      log('Labs features updated');
      return 'labs';
    }
    case 'compliance': {
      state.compliance = { retentionDays: num(d.retentionDays, 'Retention period', 3650), consent: str(d.consent, 1000), cookieBanner: d.cookieBanner === true || d.cookieBanner === 'on', hipaa: d.hipaa === true || d.hipaa === 'on' };
      log('Compliance settings updated');
      return 'compliance';
    }
    case 'api-key': {
      if (state.apiKeys.length >= 10) fail('Delete an existing key before creating another.');
      const secret = `go_${randomBytes(24).toString('hex')}`;
      const row = { id: uid(), name: req(d.name, 'Key name', 80), hash: hash(secret), last4: secret.slice(-4), created: now(), lastUsed: '' };
      state.apiKeys.push(row);
      log('API key created', row.name);
      return { id: row.id, secret };
    }
    case 'api-key-delete': {
      const row = pick(state, 'apiKeys', id);
      state.apiKeys = state.apiKeys.filter(k => k.id !== id);
      log('API key revoked', row.name);
      return id;
    }
    case 'private-integration': {
      if (state.privateIntegrations.length >= 20) fail('Delete an integration before creating another.');
      const scopes = (Array.isArray(d.scopes) ? d.scopes : []).filter(s => ['subaccounts.read', 'contacts.read', 'contacts.write'].includes(s));
      if (!scopes.length) fail('Choose at least one scope.');
      const secret = `pit_${randomBytes(24).toString('hex')}`;
      const row = { id: uid(), name: req(d.name, 'Integration name', 80), description: str(d.description, 500), scopes, hash: hash(secret), last4: secret.slice(-4), created: now(), lastUsed: '' };
      state.privateIntegrations.push(row);
      log('Private integration created', row.name, scopes.join(', '));
      return { id: row.id, secret };
    }
    case 'private-integration-delete': {
      const row = pick(state, 'privateIntegrations', id);
      state.privateIntegrations = state.privateIntegrations.filter(k => k.id !== id);
      log('Private integration deleted', row.name);
      return id;
    }
    case 'snapshot-rename': {
      const snap = pick(state, 'snapshots', id);
      snap.name = req(d.name, 'Snapshot name', 100); snap.updated = now();
      log('Snapshot renamed', snap.name);
      return id;
    }
    case 'snapshot-delete': {
      const snap = pick(state, 'snapshots', id);
      state.snapshots = state.snapshots.filter(s => s.id !== id);
      log('Snapshot deleted', snap.name);
      return id;
    }
    case 'snapshot-share': {
      const snap = pick(state, 'snapshots', id);
      snap.shareCode ||= randomBytes(6).toString('hex');
      snap.shared = true;
      log('Snapshot share link created', snap.name);
      return snap.shareCode;
    }
    case 'snapshot-import': {
      const code = req(d.code, 'Share code', 40).toLowerCase();
      const source = state.snapshots.find(s => s.shareCode === code) ||
        (sharedSnapshot?.shareCode === code && sharedSnapshot) || fail('No snapshot uses this share code.', 404);
      const copy = { ...structuredClone(source), id: uid(), name: `${source.name} (imported)`, kind: 'imported', shareCode: '', shared: false, created: now(), updated: now() };
      state.snapshots.push(copy);
      log('Snapshot imported', copy.name);
      return copy.id;
    }
    default: return fail('Unknown agency action.');
  }
}

// ---- Snapshots -------------------------------------------------------------

const refs = { stages: { pipelineId: 'pipelines' }, pages: { formId: 'forms' }, snippets: { folderId: 'snippetFolders' },
  workflows: { linkId: 'triggerLinks', formId: 'forms', stageId: 'stages', folderId: 'workflowFolders' } };
const label = (key, item) => key === 'stages' ? `${item.pipelineId}:${item.name}` : (item.name || item.title || '').toLowerCase();

export function extractSnapshot(workspace, include = snapshotAssets.map(a => a[0])) {
  const assets = {};
  for (const [key] of snapshotAssets) if (include.includes(key)) assets[key] = structuredClone(workspace[key] || []);
  if (assets.stages && !assets.pipelines) assets.pipelines = structuredClone(workspace.pipelines);
  if (assets.pages && !assets.forms) assets.forms = structuredClone(workspace.forms.filter(f => assets.pages.some(p => p.formId === f.id)));
  if (assets.workflows) assets.workflowFolders = structuredClone((workspace.workflowFolders || [])
    .filter(folder => assets.workflows.some(workflow => workflow.folderId === folder.id)));
  for (const page of assets.pages || []) page.active = false;
  for (const workflow of assets.workflows || []) workflow.active = false;
  if (assets.agents) assets.agents = assets.agents.map(agentTemplate);
  const counts = Object.fromEntries(Object.entries(assets).map(([key, list]) => [key, list.length]));
  return { assets, counts };
}

export function applySnapshot(target, snapshot, mode = 'skip', studioMap = null) {
  const map = {};
  const order = ['pipelines', 'stages', 'snippetFolders', 'forms', 'triggerLinks', 'pages', 'snippets', 'workflowFolders', 'workflows', 'courses', 'agents', 'studioProjects'];
  const report = { added: 0, overwritten: 0, skipped: 0 };
  for (const key of order) {
    const items = snapshot.assets[key];
    if (!items) continue;
    map[key] = new Map();
    target[key] ??= [];
    for (const original of items) {
      const item = structuredClone(key === 'agents' ? agentTemplate(original) : original);
      for (const [field, refKey] of Object.entries(refs[key] || {})) if (item[field]) item[field] = map[refKey]?.get(item[field]) ?? (target[refKey]?.some(r => r.id === item[field]) ? item[field] : '');
      const match = target[key].find(existing => label(key, existing) === label(key, item));
      if (match) {
        map[key].set(original.id, match.id);
        if (mode === 'overwrite' && key !== 'pipelines') {
          if (key === 'agents') Object.assign(item, { active: Boolean(match.published), revision: uid() });
          Object.assign(match, { ...item, id: match.id, updated: now() });
          if (key === 'studioProjects' && studioMap) studioMap.set(original.id, match.id);
          report.overwritten++;
        } else report.skipped++;
        continue;
      }
      const id = uid();
      map[key].set(original.id, id);
      target[key].push({ ...item, id, created: now() });
      if (key === 'studioProjects' && studioMap) studioMap.set(original.id, id);
      report.added++;
    }
  }
  return report;
}

// ---- Templates ---------------------------------------------------------------

export function installTemplate(workspace, template) {
  let formId = '';
  if (template.withForm) {
    formId = uid();
    workspace.forms.push({ id: formId, created: now(), name: `${template.name} lead form`, description: 'Leave your details and we will get back to you.', askPhone: true, active: false });
  }
  const pageId = uid();
  workspace.pages.push({ id: pageId, created: now(), name: template.name, headline: template.headline, body: template.body || '', button: template.button || '', formId, kind: 'Funnel', active: false });
  return pageId;
}

export function catalogTemplate(id, agency) {
  const builtIn = templateCatalog.find(t => t[0] === id);
  if (builtIn) {
    const [, name, category, headline, body, button] = builtIn;
    return { id, name, category, headline, body, button, withForm: true };
  }
  return agency.templates.find(t => t.id === id) || fail('Template not found.', 404);
}

// ---- Overview ----------------------------------------------------------------

const monthKey = iso => iso.slice(0, 7);
export function agencyOverview(agency, workspaces) {
  const accounts = workspaces.map(({ id, name, state, metrics: scopedMetrics }) => {
    const meta = agency.accounts[id] || {};
    const m = scopedMetrics || metrics(state);
    const plan = agency.plans.find(p => p.id === meta.plan);
    const resold = resellProducts.filter(p => !agency.reselling[p.key]?.disabled.includes(id));
    const storage = state.files.reduce((sum, f) => sum + Math.floor((f.data.length - f.data.indexOf(',') - 1) * 3 / 4), 0);
    return {
      id, name, status: meta.status || 'Active', created: meta.created || '', lastLogin: meta.lastLogin || '', plan: plan?.name || '', planPrice: plan?.price || 0,
      address: meta.address || '', phone: meta.phone || state.profile.phone || '', website: meta.website || '', email: state.profile.email,
      currency: state.profile.currency, contacts: m.contacts, open: m.open, openValue: m.openValue, won: m.won, wonValue: m.wonValue,
      invoicesPaid: m.invoicesPaid, appointments: m.appointments, workflows: state.workflows.length, runs: state.runs.length, files: state.files.length, storage,
      resold: resold.map(p => p.key)
    };
  });
  const live = accounts.filter(a => a.status === 'Active');
  const resale = account => resellProducts.reduce((sum, p) => sum + (account.resold.includes(p.key) && agency.reselling[p.key].price > 0 ? agency.reselling[p.key].price : 0), 0);
  const profit = account => resellProducts.reduce((sum, p) => sum + (account.resold.includes(p.key) && agency.reselling[p.key].price > 0 ? agency.reselling[p.key].price - p.base : 0), 0);
  const mrr = live.reduce((sum, a) => sum + a.planPrice, 0);
  const thisMonth = monthKey(now());
  const months = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); months.push(d.toISOString().slice(0, 7)); }
  const growth = months.map(month => ({ month, total: accounts.filter(a => (a.created || '0000') .slice(0, 7) <= month).length, added: accounts.filter(a => a.created && monthKey(a.created) === month).length }));
  const affiliateDue = agency.referrals.filter(r => r.status === 'Active' && !r.paid).reduce((s, r) => s + r.amount * affiliateRate, 0);
  const wallet = agency.billing.wallet.reduce((s, w) => s + (w.kind === 'Credit' ? w.amount : -w.amount), 0);
  return {
    accounts,
    totals: {
      accounts: accounts.length, active: live.length, paused: accounts.filter(a => a.status === 'Paused').length, closed: accounts.filter(a => a.status === 'Closed').length,
      newThisMonth: accounts.filter(a => a.created && monthKey(a.created) === thisMonth).length,
      mrr, resale: live.reduce((s, a) => s + resale(a), 0), resaleProfit: live.reduce((s, a) => s + profit(a), 0),
      contacts: accounts.reduce((s, a) => s + a.contacts, 0), open: accounts.reduce((s, a) => s + a.open, 0), runs: accounts.reduce((s, a) => s + a.runs, 0),
      storage: accounts.reduce((s, a) => s + a.storage, 0), affiliateDue: Math.round(affiliateDue * 100) / 100, wallet: Math.round(wallet * 100) / 100,
      snapshots: agency.snapshots.length, prospects: agency.prospects.length
    },
    growth
  };
}

// Public view of agency settings that a sub-account screen needs.
export function agencyForWorkspace(agency, workspace, includePermissions = false) {
  const applies = item => !item.accounts?.length || item.accounts.includes(workspace);
  return {
    brand: platformBrand, name: agency.company.name, primary: agency.company.primary, secondary: agency.company.secondary || defaultSecondary, logo: agency.company.logo,
    menuLinks: agency.menuLinks.filter(l => l.showOn !== 'Agency' && applies(l)).map(({ id, title, url: href, icon, openIn }) => ({ id, title, url: href, icon, openIn })),
    announcements: agency.announcements.filter(a => a.published && applies(a)).map(({ id, title, body, tone }) => ({ id, title, body, tone })),
    users: agency.users.filter(user => String(user.role || '').startsWith('Agency') || user.accounts?.includes(workspace))
      .map(({ id, first, last, role, accounts, permissions }) => ({
        id, name: `${first} ${last}`, role, accounts: includePermissions ? accounts : (String(role || '').startsWith('Agency') ? [] : [workspace]),
        ...(includePermissions && { permissions })
      }))
  };
}

// Access rules for an acting user (local operator chooses who they act as; this is not authentication).
export function userAccess(agency, userId) {
  if (!userId) return { role: 'Agency Owner', agency: true, settings: true, accounts: null, modules: null, permissionMode: 'unspecified', name: agency.profile.name || 'Agency Owner' };
  const user = agency.users.find(u => u.id === userId);
  if (!user) return null;
  const name = `${user.first} ${user.last}`;
  const saved = Array.isArray(user.permissions) ? user.permissions : [];
  const permissionMode = user.permissionMode || (saved.length ? 'restricted' : user.permissions ? 'inherit' : 'unspecified');
  const modules = permissionMode === 'inherit' || permissionMode === 'unspecified' ? null
    : permissionMode === 'restricted' ? saved : [];
  const role = user.role;
  const agencyMember = ['Agency Owner', 'Agency Admin', 'Agency User'].includes(role);
  return { role, agency: agencyMember, settings: role === 'Agency Owner' || role === 'Agency Admin',
    accounts: agencyMember ? null : Array.isArray(user.accounts) ? user.accounts : [], modules, permissionMode, name };
}
