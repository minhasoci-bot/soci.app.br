import { icon as i, logo, brandName, brandColor } from './icons.js';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import {
  addOns, affiliateRate, agencyPlans, agencyRoles, auditAreas, collections, integrationCatalog, labFeatures, learningTracks,
  mobileModules, resellProducts, snapshotAssets, subAccountModules, systemEmailKeys, templateCatalog
} from './agency-data.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const usd = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v || 0);
const day = (d, time = false) => d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(d)) : '—';
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;
const statusTone = { Active: 'green', Paused: 'gold', Closed: 'red', Won: 'green', Lost: 'red', Trial: 'blue', Cancelled: 'red', Requested: 'blue', Withdrawn: '', Planned: 'blue', 'In progress': 'purple', Completed: 'green', Declined: 'red', 'Under review': '' };
const tone = s => statusTone[s] || '';

export const agencyNav = [
  ['ask', 'Ask AI', 'spark'], ['ai-suite', 'AI Suite', 'studio'], ['dashboard', 'Agency Dashboard', 'grid'], ['prospecting', 'Prospecting', 'search'],
  ['accounts', 'Sub-Accounts', 'users'], ['snapshots', 'Account Snapshots', 'box'], ['reselling', 'Reselling', 'tag'], ['addons', 'Add-Ons', 'gift'],
  ['affiliate', 'Affiliate Portal', 'link'], ['templates', 'Template Library', 'site'], ['partners', 'Partners', 'award'], ['university', 'University', 'book'],
  ['saas-education', 'SaaS Education', 'chart'], ['ideas', 'Ideas', 'bulb'], ['mobile-app', 'Mobile App', 'mobile'], ['desktop-app', 'Desktop App', 'monitor'],
  ['marketplace', 'App Marketplace', 'apps'], ['settings', 'Settings', 'gear']
];
const subTabs = {
  snapshots: [['mine', 'My snapshots'], ['imported', 'Imported snapshots'], ['shared', 'Shared snapshots'], ['history', 'Load history']],
  reselling: [['subscription', 'Subscription'], ['plans', 'SaaS plans'], ['usage', 'Usage']],
  affiliate: [['dashboard', 'Dashboard'], ['reports', 'Promoter reports'], ['payment', 'Payment details'], ['history', 'Payment history']],
  templates: [['all', 'All templates'], ['mine', 'My templates'], ['installs', 'Installs']],
  ideas: [['all', 'All'], ['Under review', 'Under review'], ['Planned', 'Planned'], ['In progress', 'In progress'], ['Completed', 'Completed']],
  settings: [['profile', 'My Profile'], ['company', 'Company'], ['users', 'Users'], ['billing', 'Billing'], ['menu-links', 'Custom Menu Links'], ['api-keys', 'API Keys'],
    ['announcements', 'Announcements'], ['emails', 'System Emails'], ['labs', 'Labs'], ['compliance', 'Compliance'], ['audit', 'Audit Logs'], ['storage', 'Media Storage Usage']]
};

export function startAgency(env) {
  const { app, overlay, api, flash, openWorkspace } = env;
  const A = { data: null, page: 'dashboard', sub: '', query: '', status: '', category: '', selected: new Set(), chat: [], auditPage: 0, navOpen: true };
  const G = s => document.querySelector(s);
  const D = () => A.data.agency;
  const O = () => A.data.overview;
  const accounts = () => O().accounts;
  const accountName = id => accounts().find(a => a.id === id)?.name || 'Removed sub-account';
  const go = (page, sub = '') => { const next = `#agency/${page}${sub ? `/${sub}` : ''}`; if (location.hash === next) render(); else location.hash = next; };

  async function load() { A.data = await api('/api/agency'); }
  async function call(op, body) { const d = await api(`/api/agency/${op}`, body); A.data = d; return d.result; }
  const act = (type, extra = {}) => call('action', { type, ...extra });

  // ---- Dialogs -----------------------------------------------------------
  let returnFocus;
  function close() { const d = G('#dialog'); if (d?.open) d.close(); overlay.innerHTML = ''; if (returnFocus?.isConnected) returnFocus.focus(); }
  function dialog(title, body, { form = '', id = '', submit = 'Save', wide = false, description = '' } = {}) {
    returnFocus = document.activeElement;
    overlay.innerHTML = `<dialog id="dialog" class="${wide ? 'ag-wide' : ''}" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2>${description ? `<p>${h(description)}</p>` : ''}</div><button class="icon-btn" aria-label="Close dialog" data-close-dialog>${i('close', 17)}</button></header>${form
      ? `<form data-ag-form="${form}" data-id="${h(id)}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-close-dialog>Cancel</button><button class="primary">${h(submit)}</button></footer></form>`
      : `<div class="modal-body">${body}</div>`}</dialog>`;
    const d = G('#dialog'); d.showModal(); d.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  }
  const confirmBox = (title, text, form, id, submit) => dialog(title, `<p>${h(text)}</p>`, { form, id, submit });

  // ---- Form fields -------------------------------------------------------
  const options = token => token === '@accounts' ? accounts().map(a => [a.id, a.name]) : token === '@modules' ? subAccountModules : token.map(v => [v, v]);
  function field([key, label, type, required, opts], value) {
    const req = required ? ' required' : '';
    const v = value ?? '';
    if (type === 'textarea') return `<label class="ag-full">${h(label)}<textarea name="${key}"${req}>${h(v)}</textarea></label>`;
    if (type === 'check') return `<label class="check"><input type="checkbox" name="${key}" ${v ? 'checked' : ''}> ${h(label)}</label>`;
    if (type === 'select') return `<label>${h(label)}<select name="${key}"${req}>${options(opts).map(([id, text]) => `<option value="${h(id)}" ${String(id) === String(v) ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
    if (type === 'multi') {
      const list = options(opts), chosen = Array.isArray(v) ? v : [];
      return `<fieldset class="ag-checks ag-full"><legend>${h(label)}</legend>${list.length ? list.map(([id, text]) => `<label class="check"><input type="checkbox" name="${key}" value="${h(id)}" ${chosen.includes(id) ? 'checked' : ''}> ${h(text)}</label>`).join('') : '<p class="dim">Nothing to choose yet.</p>'}</fieldset>`;
    }
    const kind = type === 'score' || type === 'number' ? 'number' : type;
    const range = type === 'score' ? ' min="0" max="10" step="1"' : type === 'number' ? ' min="0" step="0.01"' : '';
    return `<label>${h(label)}<input name="${key}" type="${kind}" value="${h(v)}"${range}${req}></label>`;
  }
  const fieldsFor = (key, row = {}) => `<div class="field-grid">${collections[key].fields.map(f => field(f, row[f[0]] ?? (f[2] === 'select' && f[3] ? undefined : ''))).join('')}</div>`;
  function editRecord(key, id = '', preset = {}) {
    const row = id ? D()[key].find(r => r.id === id) : preset;
    if (id && !row) return;
    dialog(`${id ? 'Edit' : 'New'} ${collections[key].label.toLowerCase()}`, fieldsFor(key, row) + (id ? `<button type="button" class="secondary danger ag-delete" data-ag="delete-record" data-key="${key}" data-id="${id}">${i('trash', 15)} Delete</button>` : ''), { form: `record:${key}`, id });
  }
  function formData(form) {
    const fd = new FormData(form), out = {};
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key);
      out[key] = form.querySelector(`input[type=checkbox][name="${CSS.escape(key)}"][value]`) ? all : all.at(-1);
    }
    for (const box of form.querySelectorAll('input[type=checkbox]')) {
      if (box.hasAttribute('value')) out[box.name] ??= [];
      else out[box.name] = box.checked;
    }
    return out;
  }

  // ---- Shell -------------------------------------------------------------
  const head = (title, desc = '', actions = '') => `<header class="page-head"><div><h1>${h(title)}</h1>${desc ? `<p>${h(desc)}</p>` : ''}</div><div class="head-actions">${actions}</div></header>`;
  const tabs = page => `<div class="tabs" role="tablist">${subTabs[page].map(([key, label]) => `<button role="tab" data-ag="tab" data-sub="${key}" class="${A.sub === key ? 'selected' : ''}" aria-selected="${A.sub === key}">${h(label)}</button>`).join('')}</div>`;
  const btn = (label, ag, attrs = '', cls = 'secondary', ico = '') => `<button class="${cls}" data-ag="${ag}" ${attrs}>${ico ? i(ico, 15) : ''}${h(label)}</button>`;
  const primary = (label, ag, attrs = '') => btn(label, ag, attrs, 'primary', 'plus');
  const empty = (title, text, cta = '') => `<div class="empty">${i('inbox', 26)}<strong>${h(title)}</strong><p>${h(text)}</p>${cta}</div>`;
  const table = (cols, rows, nothing) => `<div class="surface table-shell"><table><thead><tr>${cols.map(c => `<th scope="col">${h(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length ? '' : nothing}</div>`;
  const metric = (label, value, note = '') => `<div class="surface metric"><span>${h(label)}</span><b>${value}</b>${note ? `<small class="dim">${h(note)}</small>` : ''}</div>`;
  const search = placeholder => `<label class="search">${i('search', 16)}<input data-ag-search value="${h(A.query)}" placeholder="${h(placeholder)}" aria-label="${h(placeholder)}" autocomplete="off"></label>`;
  const match = (...values) => !A.query || values.join(' ').toLowerCase().includes(A.query.toLowerCase());
  const bar = (pct, cls = '') => `<span class="ag-bar ${cls}"><span data-w="${Math.max(0, Math.min(100, Math.round(pct)))}"></span></span>`;

  function shell(content) {
    const company = D().company;
    const users = D().users;
    const acting = localStorage.getItem('go.user') || '';
    const item = ([key, label, ico]) => ({ href: `#agency/${key}`, label, icon: ico, current: A.page === key });
    return `<div class="shell ${A.navOpen ? 'wide' : ''} ag-shell">${sidebar({ label: 'Navegação da agência', home: '#agency/dashboard', brand: brandName(company.brand),
      mark: company.logo ? `<img class="ag-logo" src="${h(company.logo)}" alt="">` : logo,
      account: { name: company.name, caption: 'Agência · ir para subconta', attr: 'data-ag="switch-account"', tip: 'Trocar para uma subconta' },
      toggle: 'data-ag="nav"', open: A.navOpen,
      groups: [
        { title: 'Visão geral', items: agencyNav.slice(0, 4).map(item) },
        { title: 'Revenda', items: agencyNav.slice(4, 11).map(item) },
        { title: 'Aprender e apps', items: agencyNav.slice(11, -1).map(item) },
        { title: 'Atalhos', items: D().menuLinks.filter(l => l.showOn !== 'Sub-accounts').map(l => ({ href: l.url, label: l.title, icon: l.icon, external: true })) }
      ],
      footer: [item(agencyNav.at(-1))] })}
      <div class="workspace">${topbar({ crumbs: [{ label: 'Agência', href: '#agency/dashboard' }, { label: agencyNav.find(n => n[0] === A.page)?.[1] || 'Agency' }], extra: `<label class="ag-acting">${i('users', 15)}<span class="sr-only">Acting as</span><select data-ag-user aria-label="Acting as"><option value="">${h(D().profile.name)} (Agency Owner)</option>${users.map(u => `<option value="${u.id}" ${u.id === acting ? 'selected' : ''}>${h(`${u.first} ${u.last}`)} (${h(u.role)})</option>`).join('')}</select></label>` })}<main id="screen" class="screen">${content}</main></div></div>`;
  }

  // ---- Pages -------------------------------------------------------------
  const pages = {};

  pages.ask = () => {
    const prompts = ['How much recurring revenue do we have?', 'Which sub-account has the most contacts?', 'Which accounts have not logged in?', 'What should I set up next?'];
    return `<div class="page ag-ask">${head('Ask AI', 'Answers come from the records stored in this agency.')}
      <div class="surface padded ag-chat">${A.chat.length ? A.chat.map(m => `<div class="${m.me ? 'user-msg' : 'ai-msg'}">${h(m.text)}</div>`).join('') : `<div class="ag-prompts">${prompts.map(p => btn(p, 'ask', `data-q="${h(p)}"`)).join('')}</div>`}</div>
      <form class="ag-ask-form" data-ag-form="ask"><input name="q" required maxlength="500" placeholder="Ask about sub-accounts, revenue, snapshots…" aria-label="Question"><button class="primary">Ask</button></form></div>`;
  };
  function answer(q) {
    const t = O().totals, list = accounts();
    q = q.toLowerCase();
    if (/revenue|mrr|receita|money|plan/.test(q)) return `Monthly recurring revenue from SaaS plans is ${usd(t.mrr)} across ${t.active} active sub-accounts. ${D().plans.length ? '' : 'No SaaS plans exist yet: create one under Reselling → SaaS plans.'}`;
    if (/contact|biggest|most|maior/.test(q)) { const top = [...list].sort((a, b) => b.contacts - a.contacts)[0]; return top ? `${top.name} has the most contacts (${top.contacts}). The agency holds ${t.contacts} contacts in total.` : 'There are no sub-accounts yet.'; }
    if (/login|inactive|logged/.test(q)) { const idle = list.filter(a => !a.lastLogin); return idle.length ? `${idle.length} sub-account(s) have no recorded login: ${idle.map(a => a.name).join(', ')}.` : 'Every sub-account has a recorded login.'; }
    if (/snapshot/.test(q)) return `${D().snapshots.length} snapshot(s) are saved and they have been loaded ${D().snapshotLoads.length} time(s).`;
    const next = [!D().company.domain && 'set a white-label domain in Settings → Company', !D().snapshots.length && 'create a snapshot from your best sub-account', !D().plans.length && 'define SaaS plans', !D().users.length && 'invite your team in Settings → Users'].filter(Boolean);
    return next.length ? `Suggested next steps: ${next.join('; ')}.` : 'Your agency setup covers branding, snapshots, plans and users. Review the Agency Dashboard for account activity.';
  }

  pages['ai-suite'] = () => {
    const ai = D().reselling['ai-employee'];
    const enabled = accounts().filter(a => !ai.disabled.includes(a.id));
    const tools = [['AI Employee', 'Unlimited AI usage for subscribed sub-accounts.', `${enabled.length} of ${accounts().length} sub-accounts can buy it at ${usd(ai.price)}/mo`, 'reselling'],
      ['AI Studio', 'Generate and edit landing page prototypes inside each sub-account.', 'Available in every sub-account', ''],
      ['AI Agents', 'Agent profiles that draft replies by role.', 'Available in every sub-account', ''],
      ['Ask AI', 'Questions answered from agency records.', 'Agency level', 'ask']];
    return `<div class="page">${head('AI Suite', 'AI tools available to your agency and your clients.')}<div class="card-grid">${tools.map(([name, text, state, page]) => `<article class="surface padded resource"><span class="metric-icon">${i('spark')}</span><div><h2>${h(name)}</h2><p>${h(text)}</p></div>${badge(state, 'blue')}${page ? `<a class="text-link" href="#agency/${page}">Open ${i('arrow', 15)}</a>` : btn('Open in a sub-account', 'switch-account')}</article>`).join('')}</div></div>`;
  };

  pages.dashboard = () => {
    const t = O().totals, growth = O().growth, max = Math.max(1, ...growth.map(g => g.total));
    const top = [...accounts()].sort((a, b) => b.contacts - a.contacts).slice(0, 8);
    return `<div class="page">${head('Agency Dashboard', `Welcome, ${D().profile.first}. Figures come from your sub-accounts and agency records.`, primary('Create Sub-Account', 'new-account'))}
      ${D().stripe.connected ? '' : `<div class="surface padded ag-notice">${i('pay', 20)}<div><b>Billing KPIs use local records</b><p>Plan revenue is calculated from the SaaS plan assigned to each sub-account. A Stripe connection is needed to read real payments.</p></div><a class="secondary" href="#agency/marketplace">View integrations</a></div>`}
      <div class="metrics">${metric('Monthly recurring revenue', usd(t.mrr), 'From SaaS plans of active accounts')}${metric('Active sub-accounts', `${t.active} <small>/ ${t.accounts}</small>`, `${t.paused} paused · ${t.closed} closed`)}${metric('New this month', t.newThisMonth)}${metric('Reselling price list', usd(t.resale), `${usd(t.resaleProfit)} margin if every enabled account subscribes`)}</div>
      <div class="metrics">${metric('Contacts', t.contacts)}${metric('Open opportunities', t.open)}${metric('Workflow runs', t.runs)}${metric('Wallet balance', usd(t.wallet))}</div>
      <div class="ag-two"><section class="surface padded"><h2>Sub-account growth</h2><p class="dim">Total sub-accounts at the end of each month</p><div class="ag-chart">${growth.map(g => `<div class="ag-col"><b>${g.total}</b><span class="ag-colbar"><span data-h="${(g.total / max) * 100}"></span></span><small>${h(g.month.slice(5))}/${h(g.month.slice(2, 4))}</small></div>`).join('')}</div></section>
      <section class="surface padded"><h2>Agency setup</h2>${[['Company branding', D().company.domain || D().company.logo, 'settings/company'], ['First snapshot', D().snapshots.length, 'snapshots'], ['SaaS plans', D().plans.length, 'reselling/plans'], ['Team users', D().users.length, 'settings/users'], ['Affiliate program', D().affiliate.accepted, 'affiliate']].map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Done', 'green') : badge('To do')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section></div>
      <h2 class="section-heading">Sub-accounts by activity</h2>${table(['Sub-account', 'Status', 'Plan', 'Contacts', 'Open deals', 'Last login', ''], top.map(a => `<tr><td><b>${h(a.name)}</b></td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td>${a.contacts}</td><td>${a.open}</td><td>${day(a.lastLogin, true)}</td><td class="right">${btn('Switch', 'open-account', `data-id="${a.id}"`)}</td></tr>`), empty('No sub-accounts', 'Create a sub-account to see activity here.'))}</div>`;
  };

  pages.prospecting = () => {
    const rows = D().prospects.filter(p => match(p.name, p.category, p.city, p.status));
    const score = p => auditAreas.reduce((s, [k]) => s + (p[`score_${k}`] ?? 0), 0);
    return `<div class="page">${head('Prospecting', 'Audit local businesses, share a report and turn won prospects into sub-accounts.', primary('Add prospect', 'new-record', 'data-key="prospects"'))}
      <div class="toolbar">${search('Search prospects…')}</div>
      ${table(['Business', 'Category', 'City', 'Status', 'Audit score', ''], rows.map(p => `<tr><td><b>${h(p.name)}</b><br><small class="dim">${h(p.website || p.email || '')}</small></td><td>${h(p.category || '—')}</td><td>${h(p.city || '—')}</td><td>${badge(p.status, tone(p.status))}</td><td>${score(p)} / 50 ${bar(score(p) * 2)}</td><td class="right inline-gap">${btn('Report', 'prospect-report', `data-id="${p.id}"`)}${p.workspace ? badge('Sub-account created', 'green') : btn('Convert', 'prospect-convert', `data-id="${p.id}"`)}${btn('Edit', 'edit-record', `data-key="prospects" data-id="${p.id}"`)}</td></tr>`), empty('No prospects yet', 'Add a business and score its online presence from 0 to 10 in each area.'))}</div>`;
  };
  function prospectReport(p) {
    const rows = auditAreas.map(([k, label]) => [label, p[`score_${k}`]]);
    return `<div class="ag-report"><p class="dim">${h(p.category || 'Business')} · ${h(p.city || '')}</p><h3>${h(p.name)}</h3>${rows.map(([label, v]) => `<div class="ag-score"><span>${h(label)}</span>${v === null || v === undefined ? '<span class="dim">Not scored</span>' : `${bar(v * 10, v < 5 ? 'low' : '')}<b>${v}/10</b>`}</div>`).join('')}${p.notes ? `<p>${h(p.notes)}</p>` : ''}</div>`;
  }
  function reportHtml(p) {
    const rows = auditAreas.map(([k, label]) => `<tr><td>${h(label)}</td><td>${p[`score_${k}`] ?? 'Not scored'}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${h(p.name)} audit</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#101828}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e7ef;padding:10px}</style><p>${h(D().company.name)}</p><h1>Online presence audit: ${h(p.name)}</h1><p>${h(p.website || '')}</p><table>${rows}</table><p>${h(p.notes || '')}</p></html>`;
  }

  pages.accounts = () => {
    const list = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status));
    const plans = Object.fromEntries(D().plans.map(p => [p.id, p.name]));
    return `<div class="page">${head('Sub-accounts', `${accounts().length} sub-accounts`, primary('Create Sub-Account', 'new-account'))}
      <div class="toolbar">${search('Search by sub-account…')}<select data-ag-status aria-label="Filter by status"><option value="">All statuses</option>${['Active', 'Paused', 'Closed'].map(s => `<option ${A.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-ag-all ${list.length && list.every(a => A.selected.has(a.id)) ? 'checked' : ''}> Select all</label>
      ${A.selected.size ? `<span class="badge blue">${A.selected.size} selected</span>${btn('Change status', 'bulk-status')}${btn('Load snapshot', 'bulk-snapshot')}` : ''}</div>
      <div class="ag-accounts">${list.map(a => `<article class="surface padded ag-account"><label class="check ag-pick"><input type="checkbox" data-ag-pick="${a.id}" ${A.selected.has(a.id) ? 'checked' : ''} aria-label="Select ${h(a.name)}"></label>
        <div class="ag-account-main"><h2>${h(a.name)}</h2><div class="inline-gap">${badge(a.status, tone(a.status))}${a.plan ? badge(a.plan, 'blue') : ''}</div><p class="dim">${h(a.address || 'No address')} · ${h(a.phone || 'No phone')}</p></div>
        <dl class="ag-facts"><div><dt>Date added</dt><dd>${day(a.created)}</dd></div><div><dt>Last login</dt><dd>${a.lastLogin ? day(a.lastLogin, true) : 'N/A'}</dd></div><div><dt>Contacts</dt><dd>${a.contacts}</dd></div><div><dt>Open deals</dt><dd>${a.open}</dd></div></dl>
        <div class="inline-gap">${btn('Switch to Sub-Account', 'open-account', `data-id="${a.id}"`, 'primary')}${btn('Edit', 'edit-account', `data-id="${a.id}"`)}</div></article>`).join('') || empty('No sub-accounts match', 'Change the search or status filter.')}</div>
      ${D().plans.length ? '' : `<p class="dim ag-hint">Tip: create SaaS plans under Reselling to assign a plan and price to each sub-account. ${Object.keys(plans).length ? '' : ''}</p>`}</div>`;
  };
  function accountForm(preset = {}) {
    const snaps = D().snapshots;
    return `<div class="field-grid"><label>Business name<input name="name" required maxlength="70" value="${h(preset.name || '')}"></label><label>Email<input name="email" type="email" value="${h(preset.email || '')}"></label>
      <label>Phone<input name="phone" type="tel" value="${h(preset.phone || '')}"></label><label>Address<input name="address" value="${h(preset.address || '')}"></label>
      <label>Time zone<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Currency<select name="currency">${['BRL', 'USD', 'EUR', 'GBP'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Snapshot<select name="snapshotId"><option value="">Start blank</option>${snaps.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>
      <label>SaaS plan<select name="plan"><option value="">No plan</option>${D().plans.map(p => `<option value="${p.id}">${h(p.name)} · ${usd(p.price)}/mo</option>`).join('')}</select></label></div>`;
  }

  const assetSummary = counts => Object.entries(counts || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${snapshotAssets.find(a => a[0] === k)?.[1].toLowerCase() || k}`).join(' · ') || 'No assets';
  pages.snapshots = () => {
    const sub = A.sub || 'mine';
    const list = D().snapshots.filter(s => sub === 'shared' ? s.shared : s.kind === sub);
    const actions = `${btn('Import snapshot', 'snapshot-import', '', 'secondary', 'download')}${primary('Create snapshot', 'snapshot-create')}`;
    if (sub === 'history') return `<div class="page">${head('Account snapshots', 'Create and manage your snapshots.', actions)}${tabs('snapshots')}${table(['Snapshot', 'Sub-account', 'Mode', 'Added', 'Overwritten', 'Skipped', 'Loaded'], [...D().snapshotLoads].reverse().map(l => `<tr><td><b>${h(l.snapshot)}</b></td><td>${h(l.account)}</td><td>${l.mode === 'overwrite' ? 'Overwrite' : 'Keep existing'}</td><td>${l.added}</td><td>${l.overwritten}</td><td>${l.skipped}</td><td>${day(l.at, true)}</td></tr>`), empty('Nothing loaded yet', 'Loading a snapshot into a sub-account records it here.'))}</div>`;
    return `<div class="page">${head('Account snapshots', 'Create and manage your snapshots.', actions)}${tabs('snapshots')}
      ${list.length ? table(['Snapshot', 'Source', 'Assets', 'Version', 'Updated', ''], list.map(s => `<tr><td><b>${h(s.name)}</b>${s.shared ? `<br><small class="dim">Share code ${h(s.shareCode)}</small>` : ''}</td><td>${s.kind === 'mine' ? h(accountName(s.workspace)) : 'Imported'}</td><td><small>${h(assetSummary(s.counts))}</small></td><td>v${s.version || 1}</td><td>${day(s.updated, true)}</td>
        <td class="right inline-gap">${btn('Load', 'snapshot-load', `data-id="${s.id}"`, 'primary')}${s.kind === 'mine' ? btn('Refresh', 'snapshot-refresh', `data-id="${s.id}"`) : ''}${btn(s.shared ? 'Share code' : 'Share', 'snapshot-share', `data-id="${s.id}"`)}${btn('Rename', 'snapshot-rename', `data-id="${s.id}"`)}<button class="icon-btn" data-ag="snapshot-delete" data-id="${s.id}" aria-label="Delete ${h(s.name)}">${i('trash', 16)}</button></td></tr>`), '')
        : `<div class="surface padded ag-explain"><h2>What snapshots are for</h2><ul><li><b>Reuse:</b> package pipelines, workflows, forms, pages and snippets from one sub-account.</li><li><b>Consistency:</b> load the same setup into every new client.</li><li><b>Selective:</b> choose which asset types to include.</li><li><b>Safety:</b> refresh a snapshot before big changes to keep a copy.</li></ul>${sub === 'mine' ? primary('Create snapshot', 'snapshot-create') : sub === 'imported' ? btn('Import with a share code', 'snapshot-import') : '<p class="dim">Share one of your snapshots to see it here.</p>'}</div>`}</div>`;
  };

  pages.reselling = () => {
    const sub = A.sub || 'subscription';
    const r = D().reselling;
    const head1 = head('Reselling', 'Set what clients pay for each product and which sub-accounts may buy it.');
    if (sub === 'plans') return `<div class="page">${head1}${tabs('reselling')}<div class="page-head"><h2>SaaS plans</h2>${primary('New plan', 'new-record', 'data-key="plans"')}</div>
      ${table(['Plan', 'Price', 'Trial', 'Features', 'Sub-accounts', ''], D().plans.map(p => `<tr><td><b>${h(p.name)}</b></td><td>${usd(p.price)}/mo</td><td>${p.trialDays ? `${p.trialDays} days` : '—'}</td><td><small>${h((p.features || '').split('\n').filter(Boolean).join(' · ') || '—')}</small></td><td>${accounts().filter(a => a.plan === p.name).length}</td><td class="right">${btn('Edit', 'edit-record', `data-key="plans" data-id="${p.id}"`)}</td></tr>`), empty('No SaaS plans', 'Plans set the monthly price used for recurring revenue.'))}
      <h2 class="section-heading">Plan per sub-account</h2>${table(['Sub-account', 'Status', 'Plan', ''], accounts().map(a => `<tr><td>${h(a.name)}</td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td class="right">${btn('Change', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), '')}</div>`;
    if (sub === 'usage') return `<div class="page">${head1}${tabs('reselling')}${table(['Sub-account', 'Products enabled', 'Price list total', 'Plan'], accounts().map(a => { const list = resellProducts.filter(p => a.resold.includes(p.key)); return `<tr><td><b>${h(a.name)}</b></td><td>${list.length} / ${resellProducts.length}</td><td>${usd(list.reduce((s, p) => s + r[p.key].price, 0))}/mo</td><td>${h(a.plan || '—')}</td></tr>`; }), '')}</div>`;
    return `<div class="page">${head1}${tabs('reselling')}<div class="ag-products">${resellProducts.map(p => {
      const cfg = r[p.key], enabled = accounts().filter(a => !cfg.disabled.includes(a.id));
      return `<form class="surface padded ag-product" data-ag-form="resell" data-id="${p.key}"><div class="ag-product-head"><div><h2>${h(p.name)}</h2><p class="dim">${h(p.text)}</p></div>${badge(p.kind)}</div>
        <div class="ag-price"><div><small>Your cost</small><b>${usd(p.base)}</b></div><label><small>Customer price / month</small><input name="price" type="number" min="${p.base}" step="0.01" value="${cfg.price}" data-ag-price="${p.base}"></label><div><small>Your profit</small><b data-ag-profit>${usd(cfg.price - p.base)}</b></div></div>
        <details><summary>Sub-account access · enabled ${enabled.length} · disabled ${accounts().length - enabled.length}</summary><div class="ag-checks">${accounts().map(a => `<label class="check"><input type="checkbox" name="enabled" value="${a.id}" ${cfg.disabled.includes(a.id) ? '' : 'checked'}> ${h(a.name)}</label>`).join('')}</div></details>
        <button class="primary">Save changes</button><p class="form-status" role="alert"></p></form>`;
    }).join('')}</div></div>`;
  };

  pages.addons = () => {
    const requests = D().addonRequests;
    const open = key => requests.find(r => r.addon === key && r.status === 'Requested');
    const groups = [...new Set(addOns.map(a => a.group))];
    return `<div class="page">${head('Add-ons', 'Upgrades for your brand, compliance and support. Requests are recorded here; no payment is taken.')}
      ${groups.map(g => `<h2 class="section-heading">${h(g)}</h2><div class="card-grid">${addOns.filter(a => a.group === g).map(a => `<article class="surface padded resource"><div><h2>${h(a.name)}</h2><p class="ag-big">${usd(a.price)}<small>${h(a.period)}</small></p></div><ul class="ag-list">${a.points.map(p => `<li>${h(p)}</li>`).join('')}</ul>${open(a.key) ? `${badge('Requested', 'blue')}${btn('Withdraw request', 'addon-cancel', `data-id="${open(a.key).id}"`)}` : btn('Request add-on', 'addon-request', `data-id="${a.key}"`, 'primary')}</article>`).join('')}</div>`).join('')}
      <h2 class="section-heading">Requests</h2>${table(['Add-on', 'Status', 'Note', 'Requested'], [...requests].reverse().map(r => `<tr><td>${h(addOns.find(a => a.key === r.addon)?.name)}</td><td>${badge(r.status, tone(r.status))}</td><td>${h(r.note || '—')}</td><td>${day(r.created, true)}</td></tr>`), empty('No requests', 'Requested add-ons appear here.'))}</div>`;
  };

  pages.affiliate = () => {
    const aff = D().affiliate;
    if (!aff.accepted) {
      const steps = [['policy', 'Review the affiliate policy'], ['video', 'Watch the compliance video'], ['toolkit', 'Download the marketing toolkit'], ['flowchart', 'Download the compliance flowchart']];
      const done = steps.every(([k]) => aff.steps[k]);
      return `<div class="page">${head('Affiliate Portal', 'Earn a recurring commission for every business you refer.')}<form class="surface padded ag-terms" data-ag-form="affiliate-accept"><h2>Accept the affiliate terms</h2><p class="dim">Complete each step, then accept the terms to get your referral link.</p>
        <ol class="ag-steps">${steps.map(([k, label]) => `<li>${aff.steps[k] ? badge('Done', 'green') : btn('Mark as done', 'affiliate-step', `data-step="${k}" type="button"`)} ${h(label)}</li>`).join('')}</ol>
        <label class="check"><input type="checkbox" name="agree" ${done ? '' : 'disabled'}> I have read and accepted the affiliate policy</label><button class="primary" ${done ? '' : 'disabled'}>Accept terms and join</button><p class="form-status" role="alert"></p>
        <ul class="ag-list"><li>${Math.round(affiliateRate * 100)}% recurring commission on active referrals</li><li>Promoter reports and payment history</li></ul></form></div>`;
    }
    const sub = A.sub || 'dashboard', refs = D().referrals;
    const active = refs.filter(r => r.status === 'Active');
    const link = `${location.origin}/?ref=${aff.code}`;
    const paid = aff.payments.reduce((s, p) => s + p.amount, 0);
    const pageHead = head('Affiliate Portal', `Referral code ${aff.code}`);
    if (sub === 'reports') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Referrals</h2>${primary('Add referral', 'new-record', 'data-key="referrals"')}</div>${table(['Business', 'Plan', 'Subscription', 'Commission', 'Status', 'Paid', ''], refs.filter(r => match(r.name, r.email)).map(r => `<tr><td><b>${h(r.name)}</b><br><small class="dim">${h(r.email)}</small></td><td>${h(r.plan)}</td><td>${usd(r.amount)}</td><td>${usd(r.amount * affiliateRate)}</td><td>${badge(r.status, tone(r.status))}</td><td>${r.paid ? badge('Paid', 'green') : '—'}</td><td class="right">${btn('Edit', 'edit-record', `data-key="referrals" data-id="${r.id}"`)}</td></tr>`), empty('No referrals yet', 'Add the businesses that signed up with your link.'))}</div>`;
    if (sub === 'payment') return `<div class="page">${pageHead}${tabs('affiliate')}<form class="surface padded settings-form" data-ag-form="affiliate-payout"><h2>Payment details</h2><div class="field-grid"><label>Method<select name="method">${['PayPal', 'Bank transfer', 'Wise'].map(m => `<option ${aff.payout.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>Payout email<input name="email" type="email" value="${h(aff.payout.email)}"></label></div><button class="primary">Save details</button><p class="form-status" role="alert"></p></form></div>`;
    if (sub === 'history') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Payment history</h2>${btn('Record payout of unpaid commission', 'affiliate-pay', '', 'primary')}</div>${table(['Date', 'Amount', 'Referrals', 'Method'], [...aff.payments].reverse().map(p => `<tr><td>${day(p.at, true)}</td><td>${usd(p.amount)}</td><td>${p.referrals.length}</td><td>${h(p.method)}</td></tr>`), empty('No payouts yet', 'Recorded payouts appear here.'))}</div>`;
    return `<div class="page">${pageHead}${tabs('affiliate')}<div class="metrics">${metric('Active referrals', active.length)}${metric('Monthly commission', usd(active.reduce((s, r) => s + r.amount * affiliateRate, 0)))}${metric('Commission due', usd(O().totals.affiliateDue))}${metric('Paid to date', usd(paid))}</div>
      <div class="surface padded"><h2>Your referral link</h2><div class="ag-copy"><input readonly value="${h(link)}" aria-label="Referral link">${btn('Copy', 'copy', `data-text="${h(link)}"`)}</div></div></div>`;
  };

  pages.templates = () => {
    const sub = A.sub || 'all';
    const cats = [...new Set([...templateCatalog.map(t => t[2]), ...D().templates.map(t => t.category)])].sort();
    if (sub === 'installs') return `<div class="page">${head('Template library', 'Templates installed into sub-accounts.')}${tabs('templates')}${table(['Template', 'Sub-account', 'Installed'], [...D().templateInstalls].reverse().map(t => `<tr><td><b>${h(t.name)}</b></td><td>${h(t.account)}</td><td>${day(t.at, true)}</td></tr>`), empty('No installs yet', 'Install a template into a sub-account to see it here.'))}</div>`;
    const list = sub === 'mine' ? D().templates.map(t => ({ ...t, mine: true })) : templateCatalog.map(([id, name, category, headline, body, button]) => ({ id, name, category, headline, body, button }));
    const shown = list.filter(t => match(t.name, t.category, t.headline) && (!A.category || t.category === A.category));
    return `<div class="page">${head('Template library', 'Preview page templates and install them into a sub-account as a draft funnel page.', primary('Create template', 'new-record', 'data-key="templates"'))}${tabs('templates')}
      <div class="toolbar">${search('Search templates…')}<select data-ag-category aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${A.category === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></div>
      <div class="card-grid">${shown.map(t => `<article class="surface resource ag-template"><div class="ag-thumb"><small>${h(t.category)}</small><b>${h(t.headline)}</b><span>${h(t.button || 'Learn more')}</span></div><div class="padded"><h2>${h(t.name)}</h2><div class="inline-gap">${btn('Preview', 'template-preview', `data-id="${t.id}"`)}${btn('Install', 'template-install', `data-id="${t.id}"`, 'primary')}${t.mine ? btn('Edit', 'edit-record', `data-key="templates" data-id="${t.id}"`) : ''}</div></div></article>`).join('') || empty(sub === 'mine' ? 'No templates of your own' : 'No templates match', sub === 'mine' ? 'Create a template to reuse it across sub-accounts.' : 'Change the search or category.')}</div></div>`;
  };
  const findTemplate = id => { const t = templateCatalog.find(x => x[0] === id); return t ? { id, name: t[1], category: t[2], headline: t[3], body: t[4], button: t[5] } : D().templates.find(x => x.id === id); };

  pages.partners = () => `<div class="page">${head('Partners', 'Keep a directory of the freelancers and companies you work with.', primary('Add partner', 'new-record', 'data-key="partners"'))}<div class="toolbar">${search('Search partners…')}</div>
    ${table(['Partner', 'Service', 'Contact', 'Website', ''], D().partners.filter(p => match(p.name, p.service, p.contact)).map(p => `<tr><td><b>${h(p.name)}</b></td><td>${h(p.service)}</td><td>${h(p.contact || '—')}<br><small class="dim">${h(p.email)}</small></td><td>${p.website ? `<a class="text-link" href="${h(p.website)}" target="_blank" rel="noopener">${h(new URL(p.website).hostname)}</a>` : '—'}</td><td class="right">${btn('Edit', 'edit-record', `data-key="partners" data-id="${p.id}"`)}</td></tr>`), empty('No partners yet', 'Add a partner to keep their details in one place.'))}</div>`;

  const learning = (key, title, text) => () => {
    const done = D().learning.completed, tracks = learningTracks[key];
    const total = tracks.reduce((s, t) => s + t[2].length, 0), count = tracks.reduce((s, t) => s + t[2].filter(l => done.includes(l[0])).length, 0);
    return `<div class="page">${head(title, text)}<div class="surface padded ag-progress"><b>${count} of ${total} lessons completed</b>${bar(total ? (count / total) * 100 : 0)}</div>
      ${tracks.map(([, name, lessons]) => `<section class="surface padded ag-track"><h2>${h(name)}</h2>${lessons.map(([id, lesson, summary]) => `<div class="line-item"><div><b>${h(lesson)}</b><p class="dim">${h(summary)}</p></div>${btn(done.includes(id) ? 'Completed' : 'Mark complete', 'learn', `data-id="${id}" aria-pressed="${done.includes(id)}"`, done.includes(id) ? 'secondary ag-done' : 'secondary')}</div>`).join('')}</section>`).join('')}</div>`;
  };
  pages.university = learning('university', 'University', 'Short lessons for running the agency platform.');
  pages['saas-education'] = learning('saas', 'SaaS Education', 'Package the platform as your own software and charge for it.');

  pages.ideas = () => {
    const sub = A.sub || 'all';
    const list = D().ideas.filter(x => (sub === 'all' || x.status === sub) && match(x.title, x.body, x.category)).sort((a, b) => b.votes - a.votes);
    return `<div class="page">${head('Ideas', 'Suggest improvements and vote on what matters most.', primary('Submit idea', 'new-record', 'data-key="ideas"'))}${tabs('ideas')}<div class="toolbar">${search('Search ideas…')}</div>
      <div class="ag-ideas">${list.map(x => `<article class="surface padded ag-idea"><button class="ag-vote ${x.voted ? 'on' : ''}" data-ag="idea-vote" data-id="${x.id}" aria-pressed="${x.voted}" aria-label="Vote for ${h(x.title)}">${i('arrow', 15)}<b>${x.votes}</b></button><div><h2>${h(x.title)}</h2><p>${h(x.body)}</p><div class="inline-gap">${badge(x.category)}${badge(x.status, tone(x.status))}<small class="dim">${day(x.created)}</small></div></div>
        <div class="inline-gap">${btn(`Comments (${x.comments.length})`, 'idea-comments', `data-id="${x.id}"`)}<select data-ag-idea-status="${x.id}" aria-label="Status">${['Under review', 'Planned', 'In progress', 'Completed', 'Declined'].map(s => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></article>`).join('') || empty('No ideas here', 'Submit an idea to start the board.')}</div></div>`;
  };

  pages['mobile-app'] = () => {
    const m = D().mobileApp;
    const order = m.order.map(k => mobileModules.find(x => x[0] === k)).filter(Boolean);
    const custom = [...m.custom, { label: '', url: '' }, { label: '', url: '' }].slice(0, 5);
    return `<div class="page">${head('Mobile App', 'Brand the client mobile app: name, colors, login screen and module order.')}<div class="ag-builder">
      <form class="surface padded settings-form" data-ag-form="mobile-app"><div class="field-grid"><label>App name<input name="appName" required maxlength="40" value="${h(m.appName)}"></label><label>Login title<input name="loginTitle" maxlength="60" value="${h(m.loginTitle)}"></label>
        <label>Primary color<input name="primary" type="color" value="${h(m.primary)}"></label><label>Accent color<input name="accent" type="color" value="${h(m.accent)}"></label></div>
        <fieldset class="ag-full"><legend>Modules (order and visibility)</legend><ol class="ag-order">${order.map(([k, label]) => `<li data-module="${k}"><label class="check"><input type="checkbox" name="visible" value="${k}" ${m.hidden.includes(k) ? '' : 'checked'}> ${h(label)}</label><span><button type="button" class="icon-btn" data-ag="move-up" aria-label="Move ${h(label)} up">▲</button><button type="button" class="icon-btn" data-ag="move-down" aria-label="Move ${h(label)} down">▼</button></span></li>`).join('')}</ol></fieldset>
        <fieldset class="ag-full"><legend>Custom modules from your URLs</legend>${custom.map((c, k) => `<div class="field-grid"><label>Name<input name="customLabel${k}" maxlength="40" value="${h(c.label)}"></label><label>URL<input name="customUrl${k}" type="url" value="${h(c.url)}"></label></div>`).join('')}</fieldset>
        <button class="primary">Save mobile app</button><p class="form-status" role="alert"></p></form>
      <div class="ag-phone" aria-label="Preview"><div class="ag-phone-top" data-bg="${h(m.primary)}"><b data-preview="appName">${h(m.appName)}</b></div><p class="ag-login" data-preview="loginTitle">${h(m.loginTitle)}</p><ul class="ag-phone-list">${order.filter(([k]) => !m.hidden.includes(k)).map(([, label]) => `<li><span class="ag-dot" data-bg="${h(m.accent)}"></span>${h(label)}</li>`).join('')}${m.custom.map(c => `<li><span class="ag-dot" data-bg="${h(m.accent)}"></span>${h(c.label)}</li>`).join('')}</ul></div></div></div>`;
  };
  pages['desktop-app'] = () => {
    const d = D().desktopApp;
    return `<div class="page">${head('Desktop App', 'Brand the desktop app your team and clients install.')}<div class="ag-builder"><form class="surface padded settings-form" data-ag-form="desktop-app"><div class="field-grid"><label>App name<input name="appName" required maxlength="40" value="${h(d.appName)}"></label><label>App domain<input name="domain" placeholder="app.youragency.com" value="${h(d.domain)}"></label><label>Primary color<input name="primary" type="color" value="${h(d.primary)}"></label></div><button class="primary">Save desktop app</button><p class="form-status" role="alert"></p></form>
      <div class="ag-window"><div class="ag-window-bar" data-bg="${h(d.primary)}"><span></span><span></span><span></span><b data-preview="appName">${h(d.appName)}</b></div><div class="ag-window-body"><p class="dim">${h(d.domain || 'app.youragency.com')}</p><p>Builds for Windows and macOS need code-signing certificates and an update server, which this local project does not provide.</p></div></div></div></div>`;
  };

  pages.marketplace = () => `<div class="page">${head('App Marketplace', 'Choose which integrations each sub-account may connect. Connecting requires each provider’s own account.')}<div class="toolbar">${search('Search apps…')}</div>
    <div class="card-grid">${integrationCatalog.filter(x => match(x[1], x[3], x[4])).map(([key, name, ico, cat, text]) => { const n = D().integrations[key]?.accounts.length || 0; return `<article class="surface padded resource"><span class="metric-icon">${i(ico)}</span><div><h2>${h(name)}</h2><p>${h(text)}</p></div><div class="inline-gap">${badge(cat)}${badge(n ? `Available to ${n}` : 'Not offered', n ? 'blue' : '')}</div>${btn('Manage availability', 'integration', `data-id="${key}"`)}</article>`; }).join('')}</div></div>`;

  // ---- Settings ----------------------------------------------------------
  const settingsPages = {
    profile: () => { const p = D().profile; return `<form class="surface padded settings-form" data-ag-form="profile"><h2>Personal details</h2><div class="field-grid"><label>First name<input name="first" required value="${h(p.first)}"></label><label>Last name<input name="last" required value="${h(p.last)}"></label><label>Email<input name="email" type="email" value="${h(p.email)}"></label><label>Phone<input name="phone" type="tel" value="${h(p.phone)}"></label><label>Platform language<select name="language">${['English (United States)', 'Português (Brasil)', 'Español'].map(l => `<option ${p.language === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><button class="primary">Update profile</button><p class="form-status" role="alert"></p></form>`; },
    company: () => { const c = D().company; return `<form class="surface padded settings-form" data-ag-form="company"><h2>Company and white label</h2><div class="field-grid"><label>Company name<input name="name" required value="${h(c.name)}"></label><label>Brand name (shown in the app)<input name="brand" required maxlength="60" value="${h(c.brand)}"></label><label>White-label domain<input name="domain" placeholder="app.youragency.com" value="${h(c.domain)}"></label><label>Website<input name="website" type="url" value="${h(c.website)}"></label><label>Phone<input name="phone" type="tel" value="${h(c.phone)}"></label><label>Address<input name="address" value="${h(c.address)}"></label><label>Brand color<input name="primary" type="color" value="${h(c.primary)}"></label><label>Time zone<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option ${c.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label><label>Currency<select name="currency">${['USD', 'BRL', 'EUR', 'GBP'].map(z => `<option ${c.currency === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <label>Logo (PNG, JPEG, WebP; under 300 KB)<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif"></label></div>${c.logo ? `<div class="inline-gap"><img class="ag-logo-preview" src="${h(c.logo)}" alt="Current logo"><label class="check"><input type="checkbox" name="removeLogo"> Remove logo</label></div>` : ''}<p class="dim">The brand name, color and logo are applied to the agency view and to every sub-account.</p><button class="primary">Save company</button><p class="form-status" role="alert"></p></form>`; },
    users: () => `<div class="page-head"><div><h2>Team</h2><p class="dim">Choose "Act as" to try the app with a user’s role and permissions. This is a local preview, not a sign-in.</p></div>${primary('Add user', 'new-record', 'data-key="users"')}</div>${table(['Name', 'Role', 'Access', 'Permissions', ''], D().users.map(u => `<tr><td><b>${h(`${u.first} ${u.last}`)}</b><br><small class="dim">${h(u.email)}</small></td><td>${badge(u.role, u.role.startsWith('Agency') ? 'purple' : 'blue')}</td><td><small>${u.role.startsWith('Agency') ? 'All sub-accounts' : h(u.accounts.map(accountName).join(', ') || 'No sub-accounts')}</small></td><td><small>${u.permissions.length ? `${u.permissions.length} modules` : 'All modules'}</small></td><td class="right inline-gap">${btn('Act as', 'act-as', `data-id="${u.id}"`)}${btn('Edit', 'edit-record', `data-key="users" data-id="${u.id}"`)}</td></tr>`), empty('No team members', 'Add users and limit them to specific sub-accounts and modules.'))}`,
    billing: () => { const b = D().billing; const wallet = O().totals.wallet; return `<div class="ag-two"><form class="surface padded settings-form" data-ag-form="billing-plan"><h2>Agency plan</h2><p class="dim">The plan is recorded locally; changing it does not charge anything.</p><div class="ag-plans">${agencyPlans.map(([name, price]) => `<label class="choice"><input type="radio" name="plan" value="${name}" ${b.plan === name ? 'checked' : ''}><strong>${name}</strong><span>${usd(price)}/mo</span></label>`).join('')}</div><button class="primary">Change plan</button><p class="form-status" role="alert"></p></form>
      <form class="surface padded settings-form" data-ag-form="auto-recharge"><h2>Wallet</h2><p class="ag-big">${usd(wallet)}</p><label class="check"><input type="checkbox" name="enabled" ${b.autoRecharge.enabled ? 'checked' : ''}> Remind me to recharge</label><div class="field-grid"><label>When balance is below<input name="threshold" type="number" min="0" step="0.01" value="${b.autoRecharge.threshold}"></label><label>Recharge amount<input name="amount" type="number" min="0" step="0.01" value="${b.autoRecharge.amount}"></label></div><div class="inline-gap"><button class="primary">Save</button>${btn('Record entry', 'wallet')}</div><p class="form-status" role="alert"></p></form></div>
      ${b.autoRecharge.enabled && wallet < b.autoRecharge.threshold ? `<p class="surface padded ag-warn">The wallet is below ${usd(b.autoRecharge.threshold)}. Record a credit of ${usd(b.autoRecharge.amount)} after recharging.</p>` : ''}
      <h2 class="section-heading">Wallet transactions</h2>${table(['Date', 'Type', 'Amount', 'Note'], [...b.wallet].reverse().map(w => `<tr><td>${day(w.at, true)}</td><td>${badge(w.kind, w.kind === 'Credit' ? 'green' : 'orange')}</td><td>${usd(w.amount)}</td><td>${h(w.note || '—')}</td></tr>`), empty('No transactions', 'Record credits and charges to track the wallet balance.'))}`; },
    'menu-links': () => `<div class="page-head"><div><h2>Custom menu links</h2><p class="dim">Links appear in the sub-account or agency sidebar.</p></div>${primary('Add link', 'new-record', 'data-key="menuLinks"')}</div>${table(['Title', 'URL', 'Shown on', 'Sub-accounts', ''], D().menuLinks.map(l => `<tr><td>${i(l.icon, 15)} <b>${h(l.title)}</b></td><td><small>${h(l.url)}</small></td><td>${h(l.showOn)} · ${h(l.openIn)}</td><td><small>${l.accounts.length ? h(l.accounts.map(accountName).join(', ')) : 'All'}</small></td><td class="right">${btn('Edit', 'edit-record', `data-key="menuLinks" data-id="${l.id}"`)}</td></tr>`), empty('No custom links', 'Add links to tools your clients use.'))}`,
    'api-keys': () => `<div class="page-head"><div><h2>Agency API keys</h2><p class="dim">Keys give full read access to sub-accounts and contacts through <code>/api/v1</code>. Each key is shown once.</p></div>${primary('Create key', 'api-key')}</div>
      ${table(['Name', 'Key', 'Created', 'Last used', ''], D().apiKeys.map(k => `<tr><td><b>${h(k.name)}</b></td><td><code>go_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Never'}</td><td class="right">${btn('Revoke', 'api-key-delete', `data-id="${k.id}"`)}</td></tr>`), empty('No API keys', 'Create a key to read data from scripts.'))}
      <div class="page-head ag-gap"><div><h2>Private integrations</h2><p class="dim">Tokens limited to the scopes you choose.</p></div>${primary('Create integration', 'private-integration')}</div>
      ${table(['Name', 'Scopes', 'Token', 'Last used', ''], D().privateIntegrations.map(k => `<tr><td><b>${h(k.name)}</b><br><small class="dim">${h(k.description)}</small></td><td><small>${h(k.scopes.join(', '))}</small></td><td><code>pit_…${h(k.last4)}</code></td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Never'}</td><td class="right">${btn('Delete', 'private-integration-delete', `data-id="${k.id}"`)}</td></tr>`), empty('No private integrations', 'Create one for a script that only needs contacts.'))}
      <div class="surface padded ag-gap"><h2>Endpoints</h2><pre class="ag-code">GET  ${h(location.origin)}/api/v1/subaccounts
GET  ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
POST ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
Authorization: Bearer &lt;key&gt;</pre></div>`,
    announcements: () => `<div class="page-head"><div><h2>Announcements</h2><p class="dim">Published announcements appear at the top of the selected sub-accounts.</p></div>${primary('New announcement', 'new-record', 'data-key="announcements"')}</div>${table(['Title', 'Style', 'Audience', 'Status', ''], [...D().announcements].reverse().map(a => `<tr><td><b>${h(a.title)}</b><br><small class="dim">${h(a.body.slice(0, 90))}</small></td><td>${h(a.tone)}</td><td><small>${a.accounts.length ? h(a.accounts.map(accountName).join(', ')) : 'All sub-accounts'}</small></td><td>${badge(a.published ? 'Published' : 'Draft', a.published ? 'green' : '')}</td><td class="right">${btn('Edit', 'edit-record', `data-key="announcements" data-id="${a.id}"`)}</td></tr>`), empty('No announcements', 'Write a message for your clients.'))}`,
    emails: () => `<h2>System emails</h2><p class="dim ag-hint">Templates your platform would send. Delivery requires an email provider.</p>${systemEmailKeys.map(([key, label]) => { const e = D().systemEmails[key]; return `<form class="surface padded settings-form ag-gap" data-ag-form="system-email" data-id="${key}"><h2>${h(label)}</h2><label class="ag-full">Subject<input name="subject" required value="${h(e.subject)}"></label><label class="ag-full">Body<textarea name="body" required>${h(e.body)}</textarea></label><button class="primary">Save</button><p class="form-status" role="alert"></p></form>`; }).join('')}`,
    labs: () => `<form class="surface padded settings-form" data-ag-form="labs"><h2>Labs</h2><p class="dim">Feature switches stored with the agency. They are preferences for this project and change no behavior yet.</p>${labFeatures.map(([key, label, text]) => `<label class="check ag-lab"><input type="checkbox" name="${key}" ${D().labs[key] ? 'checked' : ''}><span><b>${h(label)}</b><br><small class="dim">${h(text)}</small></span></label>`).join('')}<button class="primary">Save</button><p class="form-status" role="alert"></p></form>`,
    compliance: () => { const c = D().compliance; return `<form class="surface padded settings-form" data-ag-form="compliance"><h2>Compliance</h2><div class="field-grid"><label>Data retention (days)<input name="retentionDays" type="number" min="0" max="3650" value="${c.retentionDays}"></label></div><label class="ag-full">Consent text for forms<textarea name="consent">${h(c.consent)}</textarea></label><label class="check"><input type="checkbox" name="cookieBanner" ${c.cookieBanner ? 'checked' : ''}> Show a cookie notice on published pages</label><label class="check"><input type="checkbox" name="hipaa" ${c.hipaa ? 'checked' : ''}> Health data mode (requires the compliance add-on)</label><button class="primary">Save</button><p class="form-status" role="alert"></p></form>`; },
    audit: () => {
      const rows = [...D().audit].reverse().filter(a => match(a.actor, a.action, a.target, a.details));
      const per = 50, pages = Math.max(1, Math.ceil(rows.length / per)); A.auditPage = Math.min(A.auditPage, pages - 1);
      return `<div class="toolbar">${search('Search the audit log…')}${btn('Export CSV', 'audit-csv', '', 'secondary', 'download')}</div>${table(['When', 'User', 'Action', 'Target', 'Details'], rows.slice(A.auditPage * per, A.auditPage * per + per).map(a => `<tr><td>${day(a.at, true)}</td><td>${h(a.actor)}</td><td><b>${h(a.action)}</b></td><td>${h(a.target)}</td><td><small>${h(a.details)}</small></td></tr>`), empty('No activity yet', 'Changes made in the agency and in sub-accounts are recorded here.'))}
        ${pages > 1 ? `<div class="inline-gap ag-gap">${btn('Previous', 'audit-page', `data-step="-1" ${A.auditPage ? '' : 'disabled'}`)}<span>Page ${A.auditPage + 1} of ${pages}</span>${btn('Next', 'audit-page', `data-step="1" ${A.auditPage < pages - 1 ? '' : 'disabled'}`)}</div>` : ''}`;
    },
    storage: () => { const total = O().totals.storage, max = Math.max(1, ...accounts().map(a => a.storage)); return `<div class="metrics three">${metric('Total media stored', bytes(total))}${metric('Files', accounts().reduce((s, a) => s + a.files, 0))}${metric('Sub-accounts', accounts().length)}</div>${table(['Sub-account', 'Files', 'Size', ''], [...accounts()].sort((a, b) => b.storage - a.storage).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${a.files}</td><td>${bytes(a.storage)}</td><td>${bar((a.storage / max) * 100)}</td></tr>`), '')}`; }
  };
  pages.settings = () => { const sub = A.sub || 'profile'; return `<div class="page">${head('Settings', 'Agency profile, branding, team, billing and developer access.')}${tabs('settings')}<div class="ag-settings">${settingsPages[sub]()}</div></div>`; };

  // ---- Render ------------------------------------------------------------
  function render() {
    const prev = document.querySelector('#screen')?.scrollTop || 0;
    const page = pages[A.page] || pages.dashboard;
    document.title = `${agencyNav.find(n => n[0] === A.page)?.[1] || 'Agency'} · ${brandName(D().company.brand)}`;
    app.innerHTML = shell(page());
    document.documentElement.style.setProperty('--blue', brandColor(D().company.primary));
    for (const el of app.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
    for (const el of app.querySelectorAll('[data-h]')) el.style.height = `${Math.max(3, Number(el.dataset.h))}%`;
    for (const el of app.querySelectorAll('[data-bg]')) el.style.background = el.dataset.bg;
    const screen = document.querySelector('#screen'); if (screen && renderKey === `${A.page}/${A.sub}`) screen.scrollTop = prev;
    renderKey = `${A.page}/${A.sub}`;
  }
  let renderKey = '';

  async function show(page, sub) {
    const nextPage = pages[page] ? page : 'dashboard';
    if (nextPage !== A.page) { A.query = ''; A.status = ''; A.category = ''; A.selected.clear(); A.auditPage = 0; }
    A.page = nextPage;
    A.sub = subTabs[A.page]?.some(t => t[0] === sub) ? sub : '';
    try { await load(); render(); }
    catch (e) {
      app.innerHTML = `<div class="boot"><h1>Agency view unavailable</h1><p>${h(e.message)}</p><button class="primary" data-ag="reset-user">Act as the agency owner</button> <a href="#ask-ai">Back to the sub-account</a></div>`;
    }
  }

  // ---- Events -------------------------------------------------------------
  const active = () => location.hash.startsWith('#agency');
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const pickAccounts = (name = 'workspaces', chosen = []) => `<fieldset class="ag-checks"><legend>Sub-accounts</legend>${accounts().map(a => `<label class="check"><input type="checkbox" name="${name}" value="${a.id}" ${chosen.includes(a.id) ? 'checked' : ''}> ${h(a.name)}</label>`).join('')}</fieldset>`;
  const oneAccount = () => `<label>Sub-account<select name="workspace" required>${accounts().map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label>`;
  const secretBox = (title, secret) => dialog(title, `<p>Copy this value now. It will not be shown again.</p><div class="ag-copy"><input readonly value="${h(secret)}" aria-label="Secret">${btn('Copy', 'copy', `data-text="${h(secret)}"`)}</div>`);

  document.addEventListener('click', async ev => {
    if (!active()) return;
    const b = ev.target.closest('[data-ag]'); if (!b) return;
    const d = b.dataset, id = d.id;
    try {
      switch (d.ag) {
        case 'nav': A.navOpen = !A.navOpen; render(); G('[data-ag="nav"]')?.focus(); break;
        case 'tab': go(A.page, d.sub); break;
        case 'reset-user': localStorage.removeItem('go.user'); location.hash = '#agency/dashboard'; location.reload(); break;
        case 'switch-account': dialog('Switch to a sub-account', `<div class="ag-switch">${accounts().map(a => `<button class="choice" data-ag="open-account" data-id="${a.id}"><strong>${h(a.name)}</strong><span>${h(a.status)} · ${a.contacts} contacts</span></button>`).join('')}</div>`); break;
        case 'open-account': close(); await act('account-open', { id }); await openWorkspace(id); break;
        case 'ask': A.chat.push({ me: true, text: d.q }, { text: answer(d.q) }); render(); break;
        case 'new-account': dialog('Create sub-account', accountForm(), { form: 'account', submit: 'Create' }); break;
        case 'edit-account': {
          const a = accounts().find(x => x.id === id), meta = D().accounts[id] || {};
          dialog(`Edit ${a.name}`, `<div class="field-grid"><label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>SaaS plan<select name="plan"><option value="">No plan</option>${D().plans.map(p => `<option value="${p.id}" ${meta.plan === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label><label>Address<input name="address" value="${h(meta.address)}"></label><label>Phone<input name="phone" value="${h(meta.phone)}"></label><label>Website<input name="website" type="url" value="${h(meta.website)}"></label></div>`, { form: 'account-meta', id });
          break;
        }
        case 'bulk-status': dialog(`Change status of ${A.selected.size} sub-accounts`, `<label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option>${s}</option>`).join('')}</select></label>`, { form: 'bulk-status' }); break;
        case 'bulk-snapshot': if (!D().snapshots.length) { flash('Create a snapshot first.', true); break; } dialog(`Load a snapshot into ${A.selected.size} sub-accounts`, `<label>Snapshot<select name="id">${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>${loadMode()}`, { form: 'bulk-snapshot', submit: 'Load' }); break;
        case 'new-record': editRecord(d.key); break;
        case 'edit-record': editRecord(d.key, id); break;
        case 'delete-record': confirmBox('Delete this record?', 'This cannot be undone.', `delete:${d.key}`, id, 'Delete'); break;
        case 'prospect-report': { const p = D().prospects.find(x => x.id === id); dialog('Audit report', prospectReport(p) + `<div class="inline-gap">${btn('Download HTML', 'prospect-download', `data-id="${id}"`, 'primary', 'download')}</div>`, { wide: true }); break; }
        case 'prospect-download': { const p = D().prospects.find(x => x.id === id); download(`${p.name.replace(/[^\w-]+/g, '-')}-audit.html`, reportHtml(p), 'text/html'); break; }
        case 'prospect-convert': dialog('Create a sub-account for this prospect', `<label>Snapshot<select name="snapshotId"><option value="">Start blank</option>${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>`, { form: 'prospect-convert', id, submit: 'Create sub-account' }); break;
        case 'snapshot-create': dialog('Create snapshot', `<label>Snapshot name<input name="name" required maxlength="100"></label>${oneAccount()}<fieldset class="ag-checks"><legend>Include</legend>${snapshotAssets.map(([k, l]) => `<label class="check"><input type="checkbox" name="include" value="${k}" checked> ${h(l)}</label>`).join('')}</fieldset><p class="dim">Contacts, conversations and payments are never included. Pages and workflows load as drafts.</p>`, { form: 'snapshot-create', submit: 'Create' }); break;
        case 'snapshot-load': { const s = D().snapshots.find(x => x.id === id); dialog(`Load “${s.name}”`, `<p class="dim">${h(assetSummary(s.counts))}</p>${pickAccounts()}${loadMode()}`, { form: 'snapshot-load', id, submit: 'Load snapshot' }); break; }
        case 'snapshot-refresh': confirmBox('Refresh snapshot?', `Replace the snapshot contents with the current assets of ${accountName(D().snapshots.find(x => x.id === id).workspace)}.`, 'snapshot-refresh', id, 'Refresh'); break;
        case 'snapshot-share': { const code = await act('snapshot-share', { id }); render(); dialog('Share snapshot', `<p>Anyone with access to this agency can import the snapshot with this code under Imported snapshots.</p><div class="ag-copy"><input readonly value="${h(code)}" aria-label="Share code">${btn('Copy', 'copy', `data-text="${h(code)}"`)}</div>`); break; }
        case 'snapshot-rename': { const s = D().snapshots.find(x => x.id === id); dialog('Rename snapshot', `<label>Name<input name="name" required maxlength="100" value="${h(s.name)}"></label>`, { form: 'snapshot-rename', id }); break; }
        case 'snapshot-delete': confirmBox('Delete snapshot?', 'Sub-accounts that already loaded it keep their assets.', 'snapshot-delete', id, 'Delete'); break;
        case 'snapshot-import': dialog('Import snapshot', '<label>Share code<input name="code" required maxlength="40"></label>', { form: 'snapshot-import', submit: 'Import' }); break;
        case 'addon-request': dialog(`Request ${addOns.find(a => a.key === id).name}`, '<label>Note for the team (optional)<textarea name="note" maxlength="1000"></textarea></label><p class="dim">This records a request. No purchase is made.</p>', { form: 'addon-request', id, submit: 'Send request' }); break;
        case 'addon-cancel': await act('addon-cancel', { id }); render(); flash('Request withdrawn.'); break;
        case 'affiliate-step': await act('affiliate-step', { data: { step: d.step } }); render(); break;
        case 'affiliate-pay': { const amount = await act('affiliate-pay'); render(); flash(`Payout of ${usd(amount)} recorded.`); break; }
        case 'copy': await navigator.clipboard.writeText(d.text).then(() => flash('Copied.'), () => flash('Select the text and copy it manually.', true)); break;
        case 'template-preview': { const t = findTemplate(id); dialog(t.name, `<div class="ag-preview"><small>${h(t.category)}</small><h3>${h(t.headline)}</h3><p>${h(t.body || '')}</p>${t.button ? `<span class="primary">${h(t.button)}</span>` : ''}</div>`, { wide: true }); break; }
        case 'template-install': dialog(`Install “${findTemplate(id).name}”`, `${oneAccount()}<p class="dim">The page is added as an unpublished funnel page, with a lead form when the template has one.</p>`, { form: 'template-install', id, submit: 'Install' }); break;
        case 'learn': await act('learning', { data: { lesson: id } }); render(); break;
        case 'idea-vote': await act('idea-vote', { id }); render(); break;
        case 'idea-comments': { const x = D().ideas.find(r => r.id === id); dialog(x.title, `${x.comments.map(cm => `<div class="line-item"><div><b>${h(cm.author)}</b> <small class="dim">${day(cm.at, true)}</small><p>${h(cm.body)}</p></div></div>`).join('') || '<p class="dim">No comments yet.</p>'}<label>Add a comment<textarea name="body" required maxlength="2000"></textarea></label>`, { form: 'idea-comment', id, submit: 'Comment' }); break; }
        case 'move-up': case 'move-down': { const li = b.closest('li'); if (d.ag === 'move-up' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); if (d.ag === 'move-down' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); b.focus(); break; }
        case 'integration': { const x = integrationCatalog.find(r => r[0] === id); dialog(`${x[1]} availability`, `<p class="dim">Selected sub-accounts see this app as available. Each still needs its own ${h(x[1])} account to connect.</p>${pickAccounts('accounts', D().integrations[id]?.accounts || [])}`, { form: 'integration', id }); break; }
        case 'act-as': localStorage.setItem('go.user', id); flash('Acting as the selected user.'); location.hash = '#ask-ai'; location.reload(); break;
        case 'wallet': dialog('Record wallet entry', `<div class="field-grid"><label>Type<select name="kind"><option>Credit</option><option>Charge</option></select></label><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required></label></div><label>Note<input name="note" maxlength="200"></label>`, { form: 'wallet' }); break;
        case 'api-key': dialog('Create API key', '<label>Key name<input name="name" required maxlength="80"></label>', { form: 'api-key', submit: 'Create key' }); break;
        case 'api-key-delete': confirmBox('Revoke this key?', 'Scripts using it stop working immediately.', 'api-key-delete', id, 'Revoke'); break;
        case 'private-integration': dialog('Create private integration', `<label>Name<input name="name" required maxlength="80"></label><label>Description<input name="description" maxlength="500"></label><fieldset class="ag-checks"><legend>Scopes</legend>${['subaccounts.read', 'contacts.read', 'contacts.write'].map(s => `<label class="check"><input type="checkbox" name="scopes" value="${s}"> ${s}</label>`).join('')}</fieldset>`, { form: 'private-integration', submit: 'Create' }); break;
        case 'private-integration-delete': confirmBox('Delete this integration?', 'Its token stops working immediately.', 'private-integration-delete', id, 'Delete'); break;
        case 'audit-page': A.auditPage += Number(d.step); render(); break;
        case 'audit-csv': { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`; download('audit-log.csv', ['When,User,Action,Target,Details', ...D().audit.map(a => [a.at, a.actor, a.action, a.target, a.details].map(q).join(','))].join('\n'), 'text/csv'); break; }
      }
    } catch (e) { flash(e.message, true); }
  });
  const loadMode = () => `<fieldset class="ag-checks"><legend>When an asset with the same name exists</legend><label class="check"><input type="radio" name="mode" value="skip" checked> Keep the existing asset</label><label class="check"><input type="radio" name="mode" value="overwrite"> Overwrite it with the snapshot version</label></fieldset>`;

  document.addEventListener('input', ev => {
    if (!active()) return;
    const el = ev.target;
    if (el.matches('[data-ag-search]')) {
      A.query = el.value; A.auditPage = 0; const pos = el.selectionStart; render();
      const next = G('[data-ag-search]'); next.focus(); next.setSelectionRange(pos, pos);
    }
    if (el.matches('[data-ag-price]')) el.form.querySelector('[data-ag-profit]').textContent = usd((Number(el.value) || 0) - Number(el.dataset.agPrice));
    if (el.form?.dataset.agForm === 'mobile-app' || el.form?.dataset.agForm === 'desktop-app') {
      const preview = el.form.parentElement;
      if (el.name === 'appName' || el.name === 'loginTitle') preview.querySelectorAll(`[data-preview="${el.name}"]`).forEach(x => { x.textContent = el.value; });
      if (el.name === 'primary') preview.querySelectorAll('.ag-phone-top,.ag-window-bar').forEach(x => { x.style.background = el.value; });
      if (el.name === 'accent') preview.querySelectorAll('.ag-dot').forEach(x => { x.style.background = el.value; });
    }
  });
  document.addEventListener('change', async ev => {
    if (!active()) return;
    const el = ev.target;
    try {
      if (el.matches('[data-ag-user]')) { if (el.value) localStorage.setItem('go.user', el.value); else localStorage.removeItem('go.user'); location.reload(); }
      if (el.matches('[data-ag-status]')) { A.status = el.value; render(); G('[data-ag-status]').focus(); }
      if (el.matches('[data-ag-category]')) { A.category = el.value; render(); G('[data-ag-category]').focus(); }
      if (el.matches('[data-ag-pick]')) { if (el.checked) A.selected.add(el.dataset.agPick); else A.selected.delete(el.dataset.agPick); render(); G(`[data-ag-pick="${el.dataset.agPick}"]`)?.focus(); }
      if (el.matches('[data-ag-all]')) { const ids = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status)).map(a => a.id); ids.forEach(x => el.checked ? A.selected.add(x) : A.selected.delete(x)); render(); G('[data-ag-all]').focus(); }
      if (el.matches('[data-ag-idea-status]')) { await act('idea-status', { id: el.dataset.agIdeaStatus, data: { status: el.value } }); render(); flash('Status updated.'); }
    } catch (e) { flash(e.message, true); render(); }
  });
  const readImage = file => new Promise((resolve, reject) => {
    if (file.size > 300000) { reject(Error('Choose an image under 300 KB.')); return; }
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('The image could not be read.')); r.readAsDataURL(file);
  });

  document.addEventListener('submit', async ev => {
    const f = ev.target; if (!f.dataset.agForm || !active()) return;
    ev.preventDefault(); if (f.dataset.pending) return; f.dataset.pending = '1';
    const status = f.querySelector('.form-status'); if (status) status.textContent = '';
    const submit = f.querySelector('button:not([type=button])'); if (submit) submit.disabled = true;
    const name = f.dataset.agForm, id = f.dataset.id, data = formData(f);
    let msg = 'Saved.', keepOpen = false;
    try {
      if (name.startsWith('record:')) { await act('save', { key: name.slice(7), id, data }); msg = id ? 'Changes saved.' : 'Created.'; }
      else if (name.startsWith('delete:')) { await act('delete', { key: name.slice(7), id }); msg = 'Deleted.'; }
      else switch (name) {
        case 'ask': A.chat.push({ me: true, text: data.q }, { text: answer(data.q) }); msg = ''; break;
        case 'account': { const newId = await call('accounts', data); msg = 'Sub-account created.'; close(); dialog('Sub-account created', `<p>${h(data.name)} is ready.</p><div class="inline-gap">${btn('Switch to it now', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'account-meta': await act('account-meta', { id, data }); break;
        case 'bulk-status': for (const x of A.selected) { const meta = D().accounts[x]; await act('account-meta', { id: x, data: { ...meta, status: data.status } }); } A.selected.clear(); msg = 'Status changed.'; break;
        case 'bulk-snapshot': await call('snapshot-load', { id: data.id, workspaces: [...A.selected], mode: data.mode }); A.selected.clear(); msg = 'Snapshot loaded.'; break;
        case 'prospect-convert': { const newId = await call('prospect-convert', { id, snapshotId: data.snapshotId }); msg = 'Sub-account created.'; close(); dialog('Sub-account created', `<div class="inline-gap">${btn('Switch to it now', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'snapshot-create': await call('snapshot-create', data); msg = 'Snapshot created.'; break;
        case 'snapshot-refresh': await call('snapshot-refresh', { id }); msg = 'Snapshot refreshed.'; break;
        case 'snapshot-load': { const loads = await call('snapshot-load', { id, workspaces: data.workspaces, mode: data.mode }); msg = `Loaded into ${loads.length} sub-account(s): ${loads.reduce((s, l) => s + l.added, 0)} added, ${loads.reduce((s, l) => s + l.overwritten, 0)} overwritten, ${loads.reduce((s, l) => s + l.skipped, 0)} kept.`; break; }
        case 'snapshot-rename': await act('snapshot-rename', { id, data }); break;
        case 'snapshot-delete': await act('snapshot-delete', { id }); msg = 'Snapshot deleted.'; break;
        case 'snapshot-import': await act('snapshot-import', { data }); msg = 'Snapshot imported.'; break;
        case 'resell': await act('resell', { id, data: { price: data.price, enabled: data.enabled } }); msg = 'Reselling settings saved.'; break;
        case 'addon-request': await act('addon-request', { id, data }); msg = 'Request recorded.'; break;
        case 'affiliate-accept': await act('affiliate-accept', { data }); msg = 'Welcome to the affiliate program.'; break;
        case 'affiliate-payout': await act('affiliate-payout', { data }); break;
        case 'template-install': { const r = await call('template-install', { template: id, workspace: data.workspace }); msg = `Installed in ${accountName(r.workspace)} under Sites as a draft.`; break; }
        case 'idea-comment': await act('idea-comment', { id, data }); msg = 'Comment added.'; break;
        case 'integration': await act('integration', { id, data: { accounts: data.accounts } }); break;
        case 'mobile-app': {
          const order = [...f.querySelectorAll('.ag-order li')].map(li => li.dataset.module);
          const visible = data.visible || [];
          const custom = [0, 1, 2, 3, 4].map(k => ({ label: (data[`customLabel${k}`] || '').trim(), url: (data[`customUrl${k}`] || '').trim() })).filter(c => c.label || c.url);
          await act('mobile-app', { data: { appName: data.appName, loginTitle: data.loginTitle, primary: data.primary, accent: data.accent, order, hidden: order.filter(k => !visible.includes(k)), custom } });
          break;
        }
        case 'desktop-app': await act('desktop-app', { data }); break;
        case 'profile': await act('profile', { data }); break;
        case 'company': {
          const file = f.querySelector('[name=logoFile]').files[0];
          const logoValue = data.removeLogo ? 'remove' : file ? await readImage(file) : undefined;
          const { logoFile: _file, removeLogo: _remove, ...rest } = data;
          await act('company', { data: { ...rest, ...(logoValue === undefined ? {} : { logo: logoValue }) } });
          msg = 'Company settings saved.'; break;
        }
        case 'billing-plan': await act('billing-plan', { data }); msg = 'Plan updated.'; break;
        case 'auto-recharge': await act('auto-recharge', { data }); break;
        case 'wallet': await act('wallet', { data }); msg = 'Entry recorded.'; break;
        case 'system-email': await act('system-email', { id, data }); break;
        case 'labs': await act('labs', { data }); break;
        case 'compliance': await act('compliance', { data }); break;
        case 'api-key': { const r = await act('api-key', { data }); close(); render(); secretBox('API key created', r.secret); keepOpen = true; msg = ''; break; }
        case 'api-key-delete': await act('api-key-delete', { id }); msg = 'Key revoked.'; break;
        case 'private-integration': { const r = await act('private-integration', { data: { ...data, scopes: data.scopes || [] } }); close(); render(); secretBox('Integration token created', r.secret); keepOpen = true; msg = ''; break; }
        case 'private-integration-delete': await act('private-integration-delete', { id }); msg = 'Integration deleted.'; break;
        default: throw Error('Unknown form.');
      }
      if (!keepOpen) { close(); render(); }
      if (msg) flash(msg);
    } catch (e) {
      if (status) status.textContent = e.message; else flash(e.message, true);
      delete f.dataset.pending; if (submit) submit.disabled = false;
    }
  });

  return { show };
}
