import { brandHighlight, brandIcon, icon as i, logo, brandName, bootScreen, shcLayers } from './icons.js';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import { applyBrandColor } from './graao.js';
import { tr } from './i18n.js';
import { money } from './screens.js';
import { colorPicker, mountColorPicker } from './color-picker.js';
import { createProspecting, prospectRoutes } from './prospecting.js';
import { createSociChat } from './soci-chat.js';
import {
  affiliateRate, agencyPlans, agencyRoles, auditAreas, collections, integrationCatalog, labFeatures, learningTracks,
  marketplaceCategories, mobileModules, resellProducts, snapshotAssets, subAccountModules, systemEmailKeys, templateCatalog,
  appScopes, maxMarkup, rebillProducts, subFeatures
} from './agency-data.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const day = (d, time = false) => d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(d)) : '—';
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(tr(text))}</span>`;
const statusTone = { Active: 'green', Paused: 'gold', Closed: 'red', Won: 'green', Lost: 'red', Trial: 'blue', Cancelled: 'red', Requested: 'blue', Withdrawn: '', Planned: 'blue', 'In progress': 'pink', Completed: 'green', Declined: 'red', 'Under review': '' };
const tone = s => statusTone[s] || '';
const initials = s => (s || '').split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'AG';

export const agencyNav = [
  ['ask', 'Pergunte à Soci', 'spark'], ['ai-suite', 'Central de IA', 'studio'], ['dashboard', 'Painel da agência', 'grid'], ['saas', 'Configurador SaaS', 'chart'], ['prospecting', 'Prospecção', 'search'],
  ['accounts', 'Subcontas', 'users'], ['snapshots', 'Setups de conta', 'box'],
  ['affiliate', 'Portal de afiliados', 'link'], ['templates', 'Biblioteca de templates', 'site'], ['partners', 'Parceiros', 'award'], ['university', 'Universidade', 'book'],
  ['ideas', 'Ideias e sugestões', 'bulb'], ['mobile-app', 'Aplicativo móvel', 'mobile'],
  ['settings', 'Configurações', 'gear']
];
const subTabs = {
  prospecting: prospectRoutes,
  snapshots: [['marketplace', 'Marketplace'], ['mine', 'Meus setups'], ['published', 'Publicados por mim'], ['history', 'Histórico de cargas']],
  affiliate: [['dashboard', 'Painel'], ['reports', 'Relatórios de indicações'], ['payment', 'Dados de pagamento'], ['history', 'Histórico de pagamentos']],
  templates: [['all', 'Todos os templates'], ['mine', 'Meus templates'], ['installs', 'Instalações']],
  ideas: [['all', 'Todas'], ['Under review', 'Em análise'], ['Planned', 'Planejadas'], ['In progress', 'Em andamento'], ['Completed', 'Concluídas']],
  saas: [['overview', 'Visão geral'], ['plans', 'Planos SaaS'], ['rebilling', 'Rebilling da carteira'], ['accounts', 'Subcontas SaaS']],
  settings: [['profile', 'Meu perfil'], ['company', 'Empresa e marca'], ['users', 'Equipe'], ['billing', 'Faturamento e carteira'],
    ['whatsapp', 'WhatsApp'], ['email-services', 'Serviços de e-mail'], ['emails', 'E-mails do sistema'], ['announcements', 'Comunicados'],
    ['workflow-premium', 'Workflow: recursos premium'], ['external-ai', 'Workflow: IA externa'], ['domain-purchase', 'Compra de domínios'],
    ['openai', 'OpenAI'], ['private-integrations', 'Integrações privadas'], ['affiliates', 'Afiliados'], ['menu-links', 'Links de menu'], ['stripe', 'Stripe'], ['api-keys', 'Chaves de API'],
    ['compliance', 'Conformidade'], ['labs', 'Recursos experimentais'], ['audit', 'Logs de auditoria'], ['storage', 'Armazenamento de mídia']]
};

export function startAgency(env) {
  const { app, overlay, api, flash, openWorkspace } = env;
  const A = { data: null, openAI: null, openAIOnly: false, wa: null, waFocus: null, waPairOpen: false, page: 'dashboard', sub: '', query: '', status: '', category: '', mktOrigin: '', selected: new Set(), chat: [], auditPage: 0, navOpen: true };
  let waPollTimer = null;
  function stopWaPoll() { if (waPollTimer) { clearInterval(waPollTimer); waPollTimer = null; } }
  const G = s => document.querySelector(s);
  const D = () => A.data.agency;
  const O = () => A.data.overview;
  const M = () => A.data.marketplace || [];
  const accounts = () => O().accounts;
  const accountName = id => accounts().find(a => a.id === id)?.name || 'Subconta removida';
  const match = (...values) => !A.query || values.join(' ').toLowerCase().includes(A.query.toLowerCase());
  const go = (page, sub = '') => { const next = `#agency/${page}${sub ? `/${sub}` : ''}`; if (location.hash === next) render(); else location.hash = next; };

  let visit = 0, loading = false;
  async function call(op, body) {
    const currentVisit = visit;
    const data = await api(`/api/agency/${op}`, body);
    if (currentVisit === visit) A.data = data;
    if (op === 'action' && body.type === 'company') env.onBrandColorChange(data.agency.company.primary, data.agency.company.secondary);
    return data.result;
  }
  const act = (type, extra = {}) => call('action', { type, ...extra });

  // ---- Dialogs -----------------------------------------------------------
  let returnFocus;
  function close() { const d = G('#dialog'); if (d?.open) d.close(); overlay.innerHTML = ''; if (returnFocus?.isConnected) returnFocus.focus(); }
  function dialog(title, body, { form = '', id = '', submit = 'Salvar', wide = false, description = '' } = {}) {
    returnFocus = document.activeElement;
    overlay.innerHTML = `<dialog id="dialog" class="${wide ? 'ag-wide' : ''}" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2>${description ? `<p>${h(description)}</p>` : ''}</div><button class="icon-btn" aria-label="Fechar diálogo" data-close-dialog>${i('close', 17)}</button></header>${form
      ? `<form data-ag-form="${form}" data-id="${h(id)}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-close-dialog>Cancelar</button><button class="primary">${h(submit)}</button></footer></form>`
      : `<div class="modal-body">${body}</div>`}</dialog>`;
    const d = G('#dialog'); d.showModal(); d.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    let downTarget = null; d.addEventListener('mousedown', ev => { downTarget = ev.target; });
    d.addEventListener('click', ev => {
      if (ev.target === d && downTarget === d) {
        const r = d.getBoundingClientRect();
        if (ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) close();
      }
    });
    d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  }
  const confirmBox = (title, text, form, id, submit) => dialog(title, `<p>${h(text)}</p>`, { form, id, submit });

  // ---- Form fields -------------------------------------------------------
  const options = token => token === '@accounts' ? accounts().map(a => [a.id, a.name]) : token === '@modules' ? subAccountModules : token.map(v => [v, tr(v)]);
  function field([key, label, type, required, opts], value) {
    const req = required ? ' required' : '';
    const v = value ?? '';
    if (type === 'textarea') return `<label class="ag-full">${h(label)}<textarea name="${key}"${req}>${h(v)}</textarea></label>`;
    if (type === 'check') return `<label class="check"><input type="checkbox" name="${key}" ${v ? 'checked' : ''}> ${h(label)}</label>`;
    if (type === 'select') return `<label>${h(label)}<select name="${key}"${req}>${options(opts).map(([id, text]) => `<option value="${h(id)}" ${String(id) === String(v) ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
    if (type === 'multi') {
      const list = options(opts), chosen = Array.isArray(v) ? v : [];
      return `<fieldset class="ag-checks ag-full"><legend>${h(label)}</legend>${list.length ? list.map(([id, text]) => `<label class="check"><input type="checkbox" name="${key}" value="${h(id)}" ${chosen.includes(id) ? 'checked' : ''}> ${h(text)}</label>`).join('') : '<p class="dim">Nenhuma opção disponível.</p>'}</fieldset>`;
    }
    const kind = type === 'score' || type === 'number' ? 'number' : type;
    const range = type === 'score' ? ' min="0" max="10" step="1"' : type === 'number' ? ' min="0" step="0.01"' : '';
    return `<label>${h(label)}<input name="${key}" type="${kind}" value="${h(v)}"${range}${req}></label>`;
  }
  const fieldsFor = (key, row = {}) => `<div class="field-grid">${collections[key].fields.map(f => field(f, row[f[0]] ?? (f[2] === 'select' && f[3] ? undefined : ''))).join('')}</div>`;
  function editRecord(key, id = '', preset = {}) {
    const row = id ? D()[key].find(r => r.id === id) : preset;
    if (id && !row) return;
    dialog(`${id ? 'Editar' : 'Novo'} ${collections[key].label.toLowerCase()}`, fieldsFor(key, row) + (id ? `<button type="button" class="secondary danger ag-delete" data-ag="delete-record" data-key="${key}" data-id="${id}">${i('trash', 15)} Excluir</button>` : ''), { form: `record:${key}`, id, submit: id ? 'Salvar alterações' : 'Criar' });
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
  const sw = (label, on, attrs, disabled = false) => `<label class="ag-sw"><input type="checkbox" role="switch" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${attrs} aria-label="${h(label)}"><span aria-hidden="true"></span></label>`;
  const bar = (pct, cls = '') => `<span class="ag-bar ${cls}"><span data-w="${Math.max(0, Math.min(100, Math.round(pct)))}"></span></span>`;

  function shell(content) {
    const company = D().company;
    const users = D().users;
    const session = A.data.access?.session;
    const acting = localStorage.getItem('go.user') || '';
    const item = ([key, label, ico]) => ({ href: `#agency/${key}`, label, icon: ico, current: A.page === key });
    const currentPageLabel = agencyNav.find(n => n[0] === A.page)?.[1] || 'Painel da agência';
    return `<div class="shell ${A.navOpen ? 'wide' : ''} ag-shell">${sidebar({
      label: 'Navegação da agência',
      home: '#agency/dashboard',
      brand: brandName(),
      mark: logo,
      account: { name: company.name || 'Minha Agência', logo: company.logo || '', caption: 'Agência · ir para subconta', attr: 'data-ag="switch-account"', tip: 'Trocar para uma subconta' },
      toggle: 'data-ag="nav"',
      open: A.navOpen,
      groups: [
        { title: 'Visão geral', items: agencyNav.slice(0, 5).map(item) },
        { title: 'Subcontas', items: agencyNav.slice(5, 10).map(item) },
        { title: 'Aprender e apps', items: agencyNav.slice(10, -1).map(item) },
        { title: 'Atalhos', items: D().menuLinks.filter(l => l.showOn !== 'Sub-accounts').map(l => ({ href: l.url, label: l.title, icon: l.icon, external: true })) }
      ],
      footer: [
        { href: 'https://chat.whatsapp.com/IuU6twK8qf606ye5wvP638', label: 'Comunidade', icon: 'whatsapp', external: true },
        item(agencyNav.at(-1))
      ]
    })}
    <div class="workspace">${topbar({
      crumbs: [
        { label: company.name || 'Agência', href: '#agency/dashboard' },
        { label: currentPageLabel }
      ],
      search: 'data-act="search"',
      extra: session ? '' : `<div class="ag-acting">${i('users', 15)}<label class="sr-only" for="ag-user-select">Agindo como</label><select id="ag-user-select" data-ag-user aria-label="Agindo como"><option value="">${h(D().profile.name)} (Dono da agência)</option>${users.map(u => `<option value="${u.id}" ${u.id === acting ? 'selected' : ''}>${h(`${u.first} ${u.last}`)} (${h(tr(u.role))})</option>`).join('')}</select></div>`,
      tools: [
        { icon: 'bell', label: 'Notificações', attr: 'data-act="notifications"' }
      ],
      profile: {
        text: initials(session?.name || company.name || D().profile.name || 'AG'),
        picture: session?.picture,
        label: session?.name || 'Configurações da agência',
        attr: session ? 'data-act="account"' : 'data-ag="go-profile"'
      }
    })}<main id="screen" class="screen${A.page === 'ask' ? ' screen-ask-chat' : ''}">${content}</main></div></div>`;
  }

  // ---- Pages -------------------------------------------------------------
  const pages = {};

  pages.ask = () => `<div class="sc-host" data-soci-chat-host></div>`;

  pages['ai-suite'] = () => {
    const tools = [
      ['Funcionário de IA', 'Uso ilimitado de recursos de IA para as subcontas da agência.', 'Disponível em todas as subcontas', ''],
      ['AI Studio', 'Gere e edite protótipos de páginas e sites dentro de cada subconta.', 'Disponível em todas as subcontas', ''],
      ['Agentes de IA', 'Crie agentes por descrição ou modelo, configure gatilhos, subagentes e recursos, teste e publique versões.', 'Disponível em todas as subcontas', '', 'ai-agents'],
      ['Pergunte à Soci', 'Assistente executivo com respostas baseadas nos registros da agência.', 'Nível da agência', 'ask']
    ];
    return `<div class="page">${head('Central de IA', 'Ferramentas de Inteligência Artificial para potencializar sua agência e seus clientes.')}<div class="card-grid">${tools.map(([name, text, state, page, view]) => `<article class="surface padded resource"><span class="metric-icon">${i('spark')}</span><div><h2>${h(name)}</h2><p>${h(text)}</p></div>${badge(state, 'blue')}${page ? `<a class="text-link" href="#agency/${page}">Abrir ${i('arrow', 15)}</a>` : btn('Abrir em uma subconta', 'switch-account', view ? `data-view="${view}"` : '')}</article>`).join('')}</div></div>`;
  };

  pages.dashboard = () => {
    const t = O().totals, growth = O().growth, max = Math.max(1, ...growth.map(g => g.total));
    const top = [...accounts()].sort((a, b) => b.contacts - a.contacts).slice(0, 8);
    return `<div class="page">${head('Painel da agência', `Boas-vindas, ${D().profile.first}. Métricas consolidadas das suas subcontas e registros da agência.`, primary('Criar subconta', 'new-account'))}
      ${D().stripe.connected ? '' : `<div class="surface padded ag-notice">${i('pay', 20)}<div><b>Os KPIs de faturamento usam registros locais</b><p>A receita dos planos é calculada a partir do plano SaaS atribuído a cada subconta. Uma conexão com o Stripe é necessária para processar pagamentos reais.</p></div><a class="secondary" href="#agency/settings/stripe">Configurar Stripe</a></div>`}
      <div class="metrics">${metric('Receita recorrente mensal (MRR)', money(t.mrr), 'Dos planos SaaS de contas ativas')}${metric('Subcontas ativas', `${t.active} <small>/ ${t.accounts}</small>`, `${t.paused} pausada(s) · ${t.closed} encerrada(s)`)}${metric('Novas neste mês', t.newThisMonth)}${metric('Planos SaaS cadastrados', D().plans.length, 'Disponíveis no Configurador SaaS')}</div>
      <div class="metrics">${metric('Contatos', t.contacts)}${metric('Oportunidades abertas', t.open)}${metric('Execuções de automação', t.runs)}${metric('Saldo da carteira', money(t.wallet))}</div>
      <div class="ag-two"><section class="surface padded"><h2>Crescimento de subcontas</h2><p class="dim">Total de subcontas acumuladas no final de cada mês</p><div class="ag-chart">${growth.map(g => `<div class="ag-col"><b>${g.total}</b><span class="ag-colbar"><span data-h="${(g.total / max) * 100}"></span></span><small>${h(g.month.slice(5))}/${h(g.month.slice(2, 4))}</small></div>`).join('')}</div></section>
      <section class="surface padded"><h2>Configuração da agência</h2>${[['Identidade da marca', D().company.domain || D().company.logo, 'settings/company'], ['Primeiro setup', D().snapshots.length, 'snapshots'], ['Planos SaaS', D().plans.length, 'saas/plans'], ['Membros da equipe', D().users.length, 'settings/users'], ['Programa de afiliados', D().affiliate.accepted, 'affiliate']].map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Concluído', 'green') : badge('Pendente')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section></div>
      <h2 class="section-heading">Subcontas por atividade</h2>${table(['Subconta', 'Status', 'Plano', 'Contatos', 'Negócios abertos', 'Último acesso', ''], top.map(a => `<tr><td><b>${h(a.name)}</b></td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td>${a.contacts}</td><td>${a.open}</td><td>${day(a.lastLogin, true)}</td><td class="right">${btn('Acessar', 'open-account', `data-id="${a.id}"`)}</td></tr>`), empty('Nenhuma subconta cadastrada', 'Crie uma subconta para acompanhar as métricas aqui.'))}</div>`;
  };

  pages.prospecting = () => prospecting.render(A.sub);

  function prospectReport(p) {
    const rows = auditAreas.map(([k, label]) => [label, p[`score_${k}`]]);
    return `<div class="ag-report"><p class="dim">${h(p.category || 'Empresa')} · ${h(p.city || '')}</p><h3>${h(p.name)}</h3>${rows.map(([label, v]) => `<div class="ag-score"><span>${h(label)}</span>${v === null || v === undefined ? '<span class="dim">Não avaliado</span>' : `${bar(v * 10, v < 5 ? 'low' : '')}<b>${v}/10</b>`}</div>`).join('')}${p.notes ? `<p>${h(p.notes)}</p>` : ''}</div>`;
  }
  function reportHtml(p) {
    const rows = auditAreas.map(([k, label]) => `<tr><td>${h(label)}</td><td>${p[`score_${k}`] ?? 'Não avaliado'}</td></tr>`).join('');
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditoria · ${h(p.name)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#101828}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e7ef;padding:10px}</style><p>${h(D().company.name)}</p><h1>Auditoria de presença online: ${h(p.name)}</h1><p>${h(p.website || '')}</p><table>${rows}</table><p>${h(p.notes || '')}</p></html>`;
  }

  pages.accounts = () => {
    const list = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status));
    const canManage = A.data.access?.settings;
    return `<div class="page">${head('Subcontas', `${accounts().length} subconta(s) cadastradas`, primary('Criar subconta', 'new-account'))}
      <div class="toolbar">${search('Buscar subcontas…')}<select data-ag-status aria-label="Filtrar por status"><option value="">Todos os status</option>${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${A.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-ag-all ${list.length && list.every(a => A.selected.has(a.id)) ? 'checked' : ''}> Selecionar todas</label>
      ${A.selected.size ? `<span class="badge blue">${A.selected.size} selecionada(s)</span>${canManage ? btn('Alterar status', 'bulk-status') : ''}${btn('Carregar setup', 'bulk-snapshot')}` : ''}</div>
      <div class="ag-accounts">${list.map(a => {
        const active = a.status === 'Active';
        const reason = D().accounts[a.id]?.suspendedReason;
        return `<article class="surface padded ag-account"><label class="check ag-pick"><input type="checkbox" data-ag-pick="${a.id}" ${A.selected.has(a.id) ? 'checked' : ''} aria-label="Selecionar ${h(a.name)}"></label>
        <div class="ag-account-main"><h2>${h(a.name)}</h2><div class="inline-gap">${badge(a.status, tone(a.status))}${a.plan ? badge(a.plan, 'blue') : ''}</div><p class="dim">${h(a.address || 'Sem endereço')} · ${h(a.phone || 'Sem telefone')}</p></div>
        <dl class="ag-facts"><div><dt>Criada em</dt><dd>${day(a.created)}</dd></div><div><dt>Último acesso</dt><dd>${a.lastLogin ? day(a.lastLogin, true) : 'N/A'}</dd></div><div><dt>Contatos</dt><dd>${a.contacts}</dd></div><div><dt>Negócios abertos</dt><dd>${a.open}</dd></div></dl>
        ${!active && reason ? `<p class="dim">${h(reason)}</p>` : ''}
        <div class="inline-gap">${active || canManage ? btn(active ? 'Acessar subconta' : 'Abrir suporte', 'open-account', `data-id="${a.id}"`, 'primary') : ''}
        ${canManage ? btn('Editar', 'edit-account', `data-id="${a.id}"`) : ''}
        ${canManage && !active ? btn('Reativar', 'reactivate-account', `data-id="${a.id}"`) : ''}</div></article>`;
      }).join('') || empty('Nenhuma subconta encontrada', 'Tente outros termos de busca ou limpe os filtros.')}</div>
      ${D().plans.length ? '' : `<p class="dim ag-hint">Dica: crie planos SaaS no Configurador SaaS para atribuir um plano e precificação a cada subconta.</p>`}</div>`;
  };

  function accountForm(preset = {}) {
    const snaps = D().snapshots;
    return `<div class="field-grid"><label>Nome da empresa<input name="name" required maxlength="70" value="${h(preset.name || '')}"></label><label>E-mail<input name="email" type="email" value="${h(preset.email || '')}"></label>
      <label>Telefone<input name="phone" type="tel" value="${h(preset.phone || '')}"></label><label>Endereço<input name="address" value="${h(preset.address || '')}"></label>
      <label>Fuso horário<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Moeda<input readonly value="Real brasileiro (BRL)"></label>
      <label>Setup inicial<select name="snapshotId"><option value="">Começar em branco</option>${snaps.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>
      <label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}">${h(p.name)} · ${money(p.price)}/mês</option>`).join('')}</select></label></div>`;
  }

  const assetLabelsPt = {
    pipelines: 'Pipelines', stages: 'Etapas', workflows: 'Workflows', forms: 'Formulários', pages: 'Páginas',
    snippetFolders: 'Pastas de snippets', snippets: 'Snippets', triggerLinks: 'Links de gatilho',
    courses: 'Cursos', agents: 'Agentes de IA', studioProjects: 'Sites do Studio', workflowFolders: 'Pastas de workflow'
  };
  const assetSummary = counts => Object.entries(counts || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${(assetLabelsPt[k] || snapshotAssets.find(a => a[0] === k)?.[1] || k).toLowerCase()}`).join(' · ') || 'Sem recursos';
  const assetChips = counts => Object.entries(counts || {}).filter(([k, n]) => n && k !== 'stages' && k !== 'snippetFolders' && k !== 'workflowFolders').slice(0, 5)
    .map(([k, n]) => `<span class="ag-mkt-chip">${n} ${h((assetLabelsPt[k] || k).toLowerCase())}</span>`).join('');

  pages.snapshots = () => {
    const sub = A.sub || 'marketplace';
    const actions = `${btn('Publicar no marketplace', 'marketplace-publish', '', 'secondary', 'upload')}${primary('Criar setup', 'snapshot-create')}`;

    if (sub === 'history') {
      return `<div class="page">${head('Setups de conta', 'Histórico de setups carregados nas subcontas.', actions)}${tabs('snapshots')}${table(['Setup', 'Subconta', 'Modo', 'Adicionados', 'Sobrescritos', 'Ignorados', 'Carregado em'], [...D().snapshotLoads].reverse().map(l => `<tr><td><b>${h(l.snapshot)}</b></td><td>${h(l.account)}</td><td>${l.mode === 'overwrite' ? 'Sobrescrever' : 'Manter existentes'}</td><td>${l.added}</td><td>${l.overwritten}</td><td>${l.skipped}</td><td>${day(l.at, true)}</td></tr>`), empty('Nenhum carregamento registrado', 'Ao carregar um setup em uma subconta, o histórico aparecerá aqui.'))}</div>`;
    }

    if (sub === 'published') {
      const mine = M().filter(item => item.mine);
      return `<div class="page">${head('Setups de conta', 'Gerencie os setups que você publicou no marketplace para outros usuários.', actions)}${tabs('snapshots')}
        ${mine.length ? table(['Setup publicado', 'Categoria', 'Recursos', 'Versão', 'Instalações', 'Atualizado em', ''], mine.map(item => `<tr>
          <td><b>${h(item.title)}</b><br><small class="dim">${h(item.summary)}</small></td>
          <td><span class="badge">${h(item.category)}</span></td>
          <td><small>${h(assetSummary(item.counts))}</small></td>
          <td>v${item.version || 1}</td>
          <td>${item.installs || 0}</td>
          <td>${day(item.updatedAt, true)}</td>
          <td class="right inline-gap">${btn('Ver detalhes', 'marketplace-preview', `data-id="${item.id}"`)}${item.sourceSnapshotId ? btn('Editar / Atualizar', 'marketplace-publish', `data-id="${item.sourceSnapshotId}"`, 'primary') : ''}${btn('Retirar', 'marketplace-unpublish', `data-id="${item.id}"`)}</td>
        </tr>`), '')
        : `<div class="surface padded ag-explain"><h2>Compartilhe seus melhores setups no marketplace</h2><p class="dim">Publique estruturas prontas para ajudar outras agências e empresas na Soci — gratuitamente e sem expor nenhum dado real de clientes.</p><ul><li><b>Publicação imediata:</b> escolha um dos seus setups, adicione nicho e descrição e ele já entra no ar.</li><li><b>Controle total:</b> atualize para novas versões ou retire do marketplace quando quiser.</li><li><b>Privacidade garantida:</b> contatos, conversas e pagamentos nunca são publicados.</li></ul><div class="inline-gap">${D().snapshots.some(s => s.kind === 'mine') ? primary('Publicar um setup', 'marketplace-publish') : primary('Criar meu primeiro setup', 'snapshot-create')}</div></div>`}</div>`;
    }

    if (sub === 'mine') {
      const list = D().snapshots;
      const publishedMap = new Map(M().filter(item => item.mine && item.sourceSnapshotId).map(item => [item.sourceSnapshotId, item]));
      return `<div class="page">${head('Setups de conta', 'Todos os setups da sua agência: criados por você ou adicionados do marketplace.', actions)}${tabs('snapshots')}
        ${list.length ? table(['Setup', 'Origem', 'Recursos inclusos', 'Versão', 'Atualizado em', ''], list.map(s => {
          const pub = publishedMap.get(s.id);
          const origin = s.kind === 'mine'
            ? `${h(accountName(s.workspace))}${pub ? ` <span class="badge green">No marketplace</span>` : ''}`
            : s.kind === 'marketplace'
              ? `Marketplace · ${h(s.marketplaceAuthor || 'Soci')}${s.official ? ` <span class="badge blue">Oficial</span>` : ''}`
              : 'Importado';
          return `<tr><td><b>${h(s.name)}</b></td><td>${origin}</td><td><small>${h(assetSummary(s.counts))}</small></td><td>v${s.version || 1}</td><td>${day(s.updated, true)}</td>
            <td class="right inline-gap">${btn('Carregar', 'snapshot-load', `data-id="${s.id}"`, 'primary')}${s.kind === 'mine' ? btn(pub ? 'Atualizar no marketplace' : 'Publicar', 'marketplace-publish', `data-id="${s.id}"`) : ''}${s.kind === 'mine' ? btn('Atualizar', 'snapshot-refresh', `data-id="${s.id}"`) : ''}${btn('Renomear', 'snapshot-rename', `data-id="${s.id}"`)}<button class="icon-btn" data-ag="snapshot-delete" data-id="${s.id}" aria-label="Excluir ${h(s.name)}">${i('trash', 16)}</button></td></tr>`;
        }), '')
        : `<div class="surface padded ag-explain"><h2>Para que servem os setups de conta</h2><ul><li><b>Reutilização:</b> empacote pipelines, automações, formulários, páginas, agentes de IA e sites da sua melhor subconta.</li><li><b>Consistência:</b> carregue o mesmo setup estruturado em cada novo cliente em poucos cliques.</li><li><b>Marketplace:</b> comece ainda mais rápido adicionando setups oficiais da Soci ou criados pela comunidade.</li><li><b>Segurança:</b> contatos, conversas e pagamentos nunca entram no setup.</li></ul><div class="inline-gap">${primary('Criar setup', 'snapshot-create')}${btn('Explorar marketplace', 'go-marketplace')}</div></div>`}</div>`;
    }

    // Default tab: Marketplace
    const installedIds = new Set(D().snapshots.map(s => s.marketplaceId).filter(Boolean));
    const catalog = M().filter(item => {
      if (A.category && item.category !== A.category) return false;
      if (A.mktOrigin === 'official' && !item.official) return false;
      if (A.mktOrigin === 'community' && item.official) return false;
      return match(item.title, item.summary, item.description, item.category, item.author, ...(item.tags || []));
    });
    return `<div class="page">${head('Setups de conta', 'Descubra setups completos da Soci e da comunidade para replicar em suas subcontas.', actions)}${tabs('snapshots')}
      <div class="toolbar">
        ${search('Buscar por nicho, nome ou recurso…')}
        <select data-ag-category aria-label="Categoria"><option value="">Todas as categorias</option>${marketplaceCategories.map(c => `<option value="${h(c)}" ${A.category === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>
        <select data-ag-mkt-origin aria-label="Origem"><option value="">Todos os setups</option><option value="official" ${A.mktOrigin === 'official' ? 'selected' : ''}>Oficiais Soci</option><option value="community" ${A.mktOrigin === 'community' ? 'selected' : ''}>Comunidade</option></select>
      </div>
      ${catalog.length ? `<div class="ag-mkt-grid">${catalog.map(item => {
        const installed = installedIds.has(item.id);
        return `<article class="surface ag-mkt-card">
          <div class="ag-mkt-top">
            <div class="inline-gap"><span class="badge">${h(item.category)}</span>${item.official ? '<span class="badge blue">Soci Oficial</span>' : '<span class="badge">Comunidade</span>'}</div>
            <div class="inline-gap">${item.mine ? '<span class="badge pink">Seu setup</span>' : ''}${installed ? '<span class="badge green">Na biblioteca</span>' : ''}</div>
          </div>
          <h3>${h(item.title)}</h3>
          <p class="dim ag-mkt-sum">${h(item.summary)}</p>
          <div class="ag-mkt-chips">${assetChips(item.counts) || '<span class="ag-mkt-chip">Estrutura base</span>'}</div>
          <div class="ag-mkt-foot">
            <div class="ag-mkt-meta"><span>Por <b>${h(item.author)}</b></span><span>v${item.version || 1} · ${item.installs === 1 ? '1 uso' : `${item.installs || 0} usos`} · <b>Gratuito</b></span></div>
            <div class="inline-gap">${btn('Detalhes', 'marketplace-preview', `data-id="${item.id}"`)}${item.mine && item.sourceSnapshotId
              ? btn('Editar', 'marketplace-publish', `data-id="${item.sourceSnapshotId}"`)
              : btn(installed ? 'Usar novamente' : 'Usar setup', 'marketplace-install', `data-id="${item.id}"`, installed ? 'secondary' : 'primary')}</div>
          </div>
        </article>`;
      }).join('')}</div>`
      : empty('Nenhum setup encontrado', 'Tente outro termo de busca, limpe os filtros ou publique o primeiro setup deste nicho.')}</div>`;
  };

  pages.reselling = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  pages.addons = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  pages.affiliate = () => {
    const aff = D().affiliate;
    if (!aff.accepted) {
      const steps = [
        ['policy', 'Revisar a política oficial de afiliados'],
        ['video', 'Assistir ao vídeo de conformidade e boas práticas'],
        ['toolkit', 'Baixar o kit de materiais de marketing'],
        ['flowchart', 'Baixar o fluxograma de conformidade']
      ];
      const done = steps.every(([k]) => aff.steps[k]);
      return `<div class="page">${head('Portal de afiliados', 'Ganhe comissões recorrentes indicando novos negócios para a plataforma.')}<form class="surface padded ag-terms" data-ag-form="affiliate-accept"><h2>Aceite os termos de afiliado</h2><p class="dim">Conclua cada etapa e aceite os termos para liberar seu link exclusivo de indicação.</p>
        <ol class="ag-steps">${steps.map(([k, label]) => `<li>${aff.steps[k] ? badge('Concluído', 'green') : btn('Marcar como concluído', 'affiliate-step', `data-step="${k}" type="button"`)} ${h(label)}</li>`).join('')}</ol>
        <label class="check"><input type="checkbox" name="agree" ${done ? '' : 'disabled'}> Li e concordo com os termos e políticas do programa de afiliados</label><button class="primary" ${done ? '' : 'disabled'}>Aceitar termos e participar</button><p class="form-status" role="alert"></p>
        <ul class="ag-list"><li>${Math.round(affiliateRate * 100)}% de comissão recorrente em indicações ativas</li><li>Relatórios detalhados de promotor e histórico de pagamentos</li></ul></form></div>`;
    }
    const sub = A.sub || 'dashboard', refs = D().referrals;
    const active = refs.filter(r => r.status === 'Active');
    const link = `${location.origin}/?ref=${aff.code}`;
    const paid = aff.payments.reduce((s, p) => s + p.amount, 0);
    const pageHead = head('Portal de afiliados', `Código de indicação: ${aff.code}`);
    if (sub === 'reports') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Indicações</h2>${primary('Adicionar indicação', 'new-record', 'data-key="referrals"')}</div>${table(['Empresa', 'Plano', 'Valor da assinatura', 'Comissão mensal', 'Status', 'Pago', ''], refs.filter(r => match(r.name, r.email)).map(r => `<tr><td><b>${h(r.name)}</b><br><small class="dim">${h(r.email)}</small></td><td>${h(r.plan)}</td><td>${money(r.amount)}</td><td>${money(r.amount * affiliateRate)}</td><td>${badge(r.status, tone(r.status))}</td><td>${r.paid ? badge('Pago', 'green') : '—'}</td><td class="right">${btn('Editar', 'edit-record', `data-key="referrals" data-id="${r.id}"`)}</td></tr>`), empty('Nenhuma indicação cadastrada', 'Adicione as empresas que se registraram utilizando seu link.'))}</div>`;
    if (sub === 'payment') return `<div class="page">${pageHead}${tabs('affiliate')}<form class="surface padded settings-form" data-ag-form="affiliate-payout"><h2>Dados de pagamento</h2><div class="field-grid"><label>Método de recebimento<select name="method">${['Transferência bancária', 'PayPal', 'Wise', 'Pix'].map(m => `<option ${aff.payout.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>E-mail ou chave de recebimento<input name="email" type="email" value="${h(aff.payout.email)}"></label></div><button class="primary">Salvar dados</button><p class="form-status" role="alert"></p></form></div>`;
    if (sub === 'history') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Histórico de pagamentos</h2>${btn('Registrar pagamento de comissões', 'affiliate-pay', '', 'primary')}</div>${table(['Data', 'Valor', 'Indicações', 'Método'], [...aff.payments].reverse().map(p => `<tr><td>${day(p.at, true)}</td><td>${money(p.amount)}</td><td>${p.referrals.length}</td><td>${h(p.method)}</td></tr>`), empty('Nenhum pagamento registrado', 'Os pagamentos de comissões registrados aparecerão aqui.'))}</div>`;
    return `<div class="page">${pageHead}${tabs('affiliate')}<div class="metrics">${metric('Indicações ativas', active.length)}${metric('Comissão mensal', money(active.reduce((s, r) => s + r.amount * affiliateRate, 0)))}${metric('Comissão a receber', money(O().totals.affiliateDue))}${metric('Total pago até hoje', money(paid))}</div>
      <div class="surface padded"><h2>Seu link de indicação</h2><div class="ag-copy"><input readonly value="${h(link)}" aria-label="Link de indicação">${btn('Copiar link', 'copy', `data-text="${h(link)}"`)}</div></div></div>`;
  };

  pages.templates = () => {
    const sub = A.sub || 'all';
    const cats = [...new Set([...templateCatalog.map(t => t[2]), ...D().templates.map(t => t.category)])].sort();
    if (sub === 'installs') return `<div class="page">${head('Biblioteca de templates', 'Modelos instalados nas subcontas.')}${tabs('templates')}${table(['Template', 'Subconta', 'Data da instalação'], [...D().templateInstalls].reverse().map(t => `<tr><td><b>${h(t.name)}</b></td><td>${h(t.account)}</td><td>${day(t.at, true)}</td></tr>`), empty('Nenhuma instalação realizada', 'Instale um template em uma subconta para registrá-lo aqui.'))}</div>`;
    const list = sub === 'mine' ? D().templates.map(t => ({ ...t, mine: true })) : templateCatalog.map(([id, name, category, headline, body, button]) => ({ id, name, category, headline, body, button }));
    const shown = list.filter(t => match(t.name, t.category, t.headline) && (!A.category || t.category === A.category));
    return `<div class="page">${head('Biblioteca de templates', 'Visualize modelos de páginas prontos e instale-os nas subcontas como funis de rascunho.', primary('Criar template', 'new-record', 'data-key="templates"'))}${tabs('templates')}
      <div class="toolbar">${search('Buscar templates…')}<select data-ag-category aria-label="Categoria"><option value="">Todas as categorias</option>${cats.map(c => `<option value="${c}" ${A.category === c ? 'selected' : ''}>${h(tr(c))}</option>`).join('')}</select></div>
      <div class="card-grid">${shown.map(t => `<article class="surface resource ag-template"><div class="ag-thumb"><small>${h(tr(t.category))}</small><b>${h(t.headline)}</b><span>${h(t.button || 'Saiba mais')}</span></div><div class="padded"><h2>${h(t.name)}</h2><div class="inline-gap">${btn('Visualizar', 'template-preview', `data-id="${t.id}"`)}${btn('Instalar', 'template-install', `data-id="${t.id}"`, 'primary')}${t.mine ? btn('Editar', 'edit-record', `data-key="templates" data-id="${t.id}"`) : ''}</div></div></article>`).join('') || empty(sub === 'mine' ? 'Nenhum template próprio' : 'Nenhum template encontrado', sub === 'mine' ? 'Crie um template para reutilizá-lo em múltiplas subcontas.' : 'Tente outros filtros ou termos de busca.')}</div></div>`;
  };
  const findTemplate = id => { const t = templateCatalog.find(x => x[0] === id); return t ? { id, name: t[1], category: t[2], headline: t[3], body: t[4], button: t[5] } : D().templates.find(x => x.id === id); };

  pages.partners = () => `<div class="page">${head('Parceiros', 'Diretório centralizado de freelancers, agências parceiras e fornecedores da sua operação.', primary('Adicionar parceiro', 'new-record', 'data-key="partners"'))}<div class="toolbar">${search('Buscar parceiros…')}</div>
    ${table(['Parceiro', 'Serviço prestado', 'Contato', 'Site oficial', ''], D().partners.filter(p => match(p.name, p.service, p.contact)).map(p => `<tr><td><b>${h(p.name)}</b></td><td>${h(tr(p.service))}</td><td>${h(p.contact || '—')}<br><small class="dim">${h(p.email)}</small></td><td>${p.website ? `<a class="text-link" href="${h(p.website)}" target="_blank" rel="noopener">${h(new URL(p.website).hostname)}</a>` : '—'}</td><td class="right">${btn('Editar', 'edit-record', `data-key="partners" data-id="${p.id}"`)}</td></tr>`), empty('Nenhum parceiro cadastrado', 'Adicione parceiros para manter contatos e serviços centralizados.'))}</div>`;

  const learning = (key, title, text) => () => {
    const done = D().learning.completed, tracks = learningTracks[key];
    const total = tracks.reduce((s, t) => s + t[2].length, 0), count = tracks.reduce((s, t) => s + t[2].filter(l => done.includes(l[0])).length, 0);
    return `<div class="page">${head(title, text)}<div class="surface padded ag-progress"><b>${count} de ${total} aulas concluídas</b>${bar(total ? (count / total) * 100 : 0)}</div>
      ${tracks.map(([, name, lessons]) => `<section class="surface padded ag-track"><h2>${h(name)}</h2>${lessons.map(([id, lesson, summary]) => `<div class="line-item"><div><b>${h(lesson)}</b><p class="dim">${h(summary)}</p></div>${btn(done.includes(id) ? 'Concluída' : 'Marcar como concluída', 'learn', `data-id="${id}" aria-pressed="${done.includes(id)}"`, done.includes(id) ? 'secondary ag-done' : 'secondary')}</div>`).join('')}</section>`).join('')}</div>`;
  };
  pages.university = learning('university', 'Universidade', 'Treinamentos práticos e metodológicos para estruturar e operar sua plataforma de agência.');
  pages['saas-education'] = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  pages.ideas = () => {
    const sub = A.sub || 'all';
    const list = D().ideas.filter(x => (sub === 'all' || x.status === sub) && match(x.title, x.body, x.category)).sort((a, b) => b.votes - a.votes);
    return `<div class="page">${head('Ideias e sugestões', 'Compartilhe melhorias e vote nas funcionalidades mais desejadas para a plataforma.', primary('Enviar sugestão', 'new-record', 'data-key="ideas"'))}${tabs('ideas')}<div class="toolbar">${search('Buscar ideias…')}</div>
      <div class="ag-ideas">${list.map(x => `<article class="surface padded ag-idea"><button class="ag-vote ${x.voted ? 'on' : ''}" data-ag="idea-vote" data-id="${x.id}" aria-pressed="${x.voted}" aria-label="Votar em ${h(x.title)}">${i('arrow', 15)}<b>${x.votes}</b></button><div><h2>${h(x.title)}</h2><p>${h(x.body)}</p><div class="inline-gap">${badge(x.category)}${badge(x.status, tone(x.status))}<small class="dim">${day(x.created)}</small></div></div>
        <div class="inline-gap">${btn(`Comentários (${x.comments.length})`, 'idea-comments', `data-id="${x.id}"`)}<select data-ag-idea-status="${x.id}" aria-label="Status">${['Under review', 'Planned', 'In progress', 'Completed', 'Declined'].map(s => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select></div></article>`).join('') || empty('Nenhuma ideia nesta categoria', 'Envie uma sugestão para abrir a discussão no quadro.')}</div></div>`;
  };

  pages['mobile-app'] = () => {
    const m = D().mobileApp;
    const order = m.order.map(k => mobileModules.find(x => x[0] === k)).filter(Boolean);
    const custom = [...m.custom, { label: '', url: '' }, { label: '', url: '' }].slice(0, 5);
    return `<div class="page">${head('Aplicativo móvel', 'Personalize o aplicativo mobile dos seus clientes: nome, identidade visual, tela de login e ordem dos módulos.')}<div class="ag-builder">
      <form class="surface padded settings-form" data-ag-form="mobile-app"><div class="field-grid"><label>Nome do app<input name="appName" required maxlength="40" value="${h(m.appName)}"></label><label>Título na tela de login<input name="loginTitle" maxlength="60" value="${h(m.loginTitle)}"></label>
        <label>Cor primária<input name="primary" type="color" value="${h(m.primary)}"></label><label>Cor de destaque<input name="accent" type="color" value="${h(m.accent)}"></label></div>
        <fieldset class="ag-full"><legend>Módulos (ordem de exibição e visibilidade)</legend><ol class="ag-order">${order.map(([k, label]) => `<li data-module="${k}"><label class="check"><input type="checkbox" name="visible" value="${k}" ${m.hidden.includes(k) ? '' : 'checked'}> ${h(tr(label))}</label><span><button type="button" class="icon-btn" data-ag="move-up" aria-label="Mover ${h(label)} para cima">▲</button><button type="button" class="icon-btn" data-ag="move-down" aria-label="Mover ${h(label)} para baixo">▼</button></span></li>`).join('')}</ol></fieldset>
        <fieldset class="ag-full"><legend>Módulos adicionais via URL personalizada</legend>${custom.map((c, k) => `<div class="field-grid"><label>Nome do botão<input name="customLabel${k}" maxlength="40" value="${h(c.label)}"></label><label>URL de destino<input name="customUrl${k}" type="url" value="${h(c.url)}"></label></div>`).join('')}</fieldset>
        <button class="primary">Salvar aplicativo móvel</button><p class="form-status" role="alert"></p></form>
      <div class="ag-phone" aria-label="Pré-visualização do celular"><div class="ag-phone-top" data-bg="${h(m.primary)}"><b data-preview="appName">${h(m.appName)}</b></div><p class="ag-login" data-preview="loginTitle">${h(m.loginTitle)}</p><ul class="ag-phone-list">${order.filter(([k]) => !m.hidden.includes(k)).map(([, label]) => `<li><span class="ag-dot" data-bg="${h(m.accent)}"></span>${h(tr(label))}</li>`).join('')}${m.custom.map(c => `<li><span class="ag-dot" data-bg="${h(m.accent)}"></span>${h(c.label)}</li>`).join('')}</ul></div></div></div>`;
  };

  pages['desktop-app'] = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  // ---- SaaS Configurator --------------------------------------------------
  pages.saas = () => {
    const s = D().saas;
    if (!s.enabled) {
      const points = [
        ['chart', 'Escale sua receita', 'O modo SaaS aumenta a retenção dos clientes e cria uma receita recorrente previsível.'],
        ['flow', 'Automatize a operação de receita', 'Cada subconta recebe um plano e a cobrança mensal entra no MRR do painel da agência.'],
        ['pay', 'Aumente suas margens', `A carteira repassa o uso de telefone, e-mail, automações, IA e outros produtos com markup de até ${maxMarkup}×.`]
      ];
      return `<div class="page">${head('Configurador SaaS', 'Venda a plataforma com a sua marca, em planos mensais.')}<section class="surface padded ag-hero"><div><h2>Transforme a agência em um software com receita recorrente</h2><ul class="ag-points">${points.map(([ico, t, x]) => `<li><span class="metric-icon">${i(ico)}</span><div><b>${h(t)}</b><p class="dim">${h(x)}</p></div></li>`).join('')}</ul>
        ${btn('Ativar o modo SaaS', 'saas-mode', 'data-on="1"', 'primary', 'spark')}<p class="dim">A cobrança dos planos fica registrada localmente. Pagamentos reais exigem a conexão com o Stripe.</p></div>
        <div class="ag-hero-art" aria-hidden="true"><div class="ag-hero-card"><small>Plano mensal</small><b>${money(D().plans[0]?.price || 297)}</b></div><div class="ag-hero-card"><small>Markup da carteira</small><b>até ${maxMarkup}×</b></div><div class="ag-hero-card"><small>Subcontas</small><b>${accounts().length}</b></div></div></section></div>`;
    }
    const sub = A.sub || 'overview', inSaas = accounts().filter(a => s.accounts.includes(a.id));
    const pageHead = head('Configurador SaaS', `Modo SaaS ativo desde ${day(s.enabledAt)}.`, btn('Desativar modo SaaS', 'saas-mode', 'data-on=""'));
    if (sub === 'plans') return `<div class="page">${pageHead}${tabs('saas')}<div class="page-head"><h2>Planos SaaS</h2>${primary('Novo plano', 'new-record', 'data-key="plans"')}</div>
      ${table(['Plano', 'Preço', 'Período de teste', 'Recursos inclusos', 'Subcontas assinantes', ''], D().plans.map(p => `<tr><td><b>${h(p.name)}</b></td><td>${money(p.price)}/mês</td><td>${p.trialDays ? `${p.trialDays} dias` : '—'}</td><td><small>${h((p.features || '').split('\n').filter(Boolean).join(' · ') || '—')}</small></td><td>${accounts().filter(a => a.plan === p.name).length}</td><td class="right">${btn('Editar', 'edit-record', `data-key="plans" data-id="${p.id}"`)}</td></tr>`), empty('Nenhum plano SaaS cadastrado', 'Os planos definem o valor mensal utilizado no cálculo de receita recorrente.'))}
      <h2 class="section-heading">Plano por subconta</h2>${table(['Subconta', 'Status', 'Plano', ''], accounts().map(a => `<tr><td>${h(a.name)}</td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td class="right">${btn('Alterar', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), '')}</div>`;
    if (sub === 'rebilling') return `<div class="page">${pageHead}${tabs('saas')}<form class="surface padded settings-form" data-ag-form="saas-rebilling"><h2>Rebilling da carteira</h2><p class="dim">Multiplicador aplicado ao custo de uso cobrado das subcontas SaaS. 1× repassa o custo sem margem; o máximo é ${maxMarkup}×.</p>
      <div class="field-grid">${rebillProducts.map(([key, label]) => `<label>${h(tr(label))}<input name="${key}" type="number" min="1" max="${maxMarkup}" step="0.01" required value="${s.rebilling[key]}"></label>`).join('')}</div><button class="primary">Salvar markups</button><p class="form-status" role="alert"></p></form>
      <p class="dim ag-hint">Exemplo: com markup 1,5× um SMS de R$0,0079 custa R$0,0119 para o cliente e deixa R$0,0040 de margem para a agência.</p></div>`;
    if (sub === 'accounts') return `<div class="page">${pageHead}${tabs('saas')}<div class="toolbar">${search('Buscar subcontas…')}</div>${table(['Subconta', 'Status', 'Plano', 'Valor mensal', 'Modo SaaS', ''], accounts().filter(a => match(a.name)).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td>${a.planPrice ? `${money(a.planPrice)}/mês` : '—'}</td><td>${sw(`Modo SaaS em ${a.name}`, s.accounts.includes(a.id), `data-ag-saas-account="${a.id}"`)}</td><td class="right">${btn('Alterar plano', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), empty('Nenhuma subconta', 'Crie uma subconta para ativar o modo SaaS nela.'))}</div>`;
    const mrr = inSaas.filter(a => a.status === 'Active').reduce((t, a) => t + a.planPrice, 0);
    const avg = rebillProducts.reduce((t, [k]) => t + s.rebilling[k], 0) / rebillProducts.length;
    const steps = [['Criar planos SaaS', D().plans.length, 'saas/plans'], ['Definir markups da carteira', rebillProducts.some(([k]) => s.rebilling[k] > 1), 'saas/rebilling'], ['Colocar subcontas no modo SaaS', inSaas.length, 'saas/accounts'], ['Conectar o Stripe', D().stripe.connected, 'settings/stripe']];
    return `<div class="page">${pageHead}${tabs('saas')}<div class="metrics">${metric('Subcontas no modo SaaS', `${inSaas.length} <small>/ ${accounts().length}</small>`)}${metric('MRR das subcontas SaaS', money(mrr), 'Planos de subcontas ativas')}${metric('Planos SaaS', D().plans.length)}${metric('Markup médio da carteira', `${avg.toFixed(2).replace('.', ',')}×`)}</div>
      <section class="surface padded"><h2>Configuração</h2>${steps.map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Concluído', 'green') : badge('Pendente')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section></div>`;
  };

  // ---- App Marketplace ----------------------------------------------------
  pages.marketplace = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  // ---- Settings ----------------------------------------------------------
  const isOpenAIPage = () => A.page === 'settings' && A.sub === 'openai';
  function openAISettings() {
    const connection = A.openAI;
    const hl = brandHighlight('openai');
    const headHtml = `<div class="shc-panel-head"><span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('openai', 24)}</span></span><h2>Chave de API da OpenAI</h2></div>`;
    if (A.data && !A.data.access.session) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p>Entre na sua conta para conectar uma chave.</p></section>`;
    if (!connection) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p role="status">Carregando conexão…</p></section>`;
    if (connection.error) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p role="alert">${h(connection.error)}</p>${btn('Tentar novamente', 'openai-retry')}</section>`;
    return `<form class="surface padded settings-form shc-card shc-panel${connection.configured ? ' is-connected' : ''}" data-ag-form="openai-connect" style="--shc-highlight:${hl}">
      ${shcLayers()}
      ${headHtml}
      <p class="dim">Use a chave do seu projeto da OpenAI para gerar páginas no AI Studio e testar agentes. O uso é cobrado no seu projeto.</p>
      <p>${connection.configured ? `Chave conectada · final <code>${h(connection.last4)}</code> · ${h(connection.model)}` : 'Nenhuma chave conectada'}</p>
      <label>${connection.configured ? 'Nova chave de API' : 'Chave de API'}<input name="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="512" placeholder="sk-…" required></label>
      <a class="text-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">Gerenciar chaves na OpenAI</a>
      <div class="inline-gap"><button type="submit" class="primary">${connection.configured ? 'Substituir chave' : 'Conectar chave'}</button>
        ${connection.configured ? '<button type="button" class="secondary" data-ag="openai-disconnect">Desconectar</button>' : ''}</div>
      <p class="form-status" role="alert"></p>
    </form>`;
  }
  async function refreshOpenAI() {
    const currentVisit = visit;
    try {
      const connection = await api('/api/openai');
      if (currentVisit === visit) A.openAI = connection;
    } catch (error) {
      if (currentVisit === visit) A.openAI = { error: error.message };
    }
    if (currentVisit === visit && isOpenAIPage()) render();
  }
  const isWhatsAppPage = () => A.page === 'settings' && A.sub === 'whatsapp';
  async function refreshWhatsApp() {
    const currentVisit = visit;
    try {
      const data = await api('/api/whatsapp/agency/status');
      if (currentVisit === visit) A.wa = data;
    } catch (error) {
      if (currentVisit === visit) A.wa = { error: error.message };
    }
    if (currentVisit === visit && isWhatsAppPage()) render();
  }
  function startWaPoll(workspaceId) {
    stopWaPoll();
    const currentVisit = visit;
    waPollTimer = setInterval(async () => {
      if (currentVisit !== visit || !isWhatsAppPage() || A.waFocus?.workspace !== workspaceId) { stopWaPoll(); return; }
      try {
        const live = await api(`/api/whatsapp/workspace/status?workspace=${encodeURIComponent(workspaceId)}`);
        if (currentVisit !== visit || A.waFocus?.workspace !== workspaceId) return;
        A.waFocus = { ...live, workspace: workspaceId };
        if (A.wa?.subaccounts?.[workspaceId]) {
          A.wa.subaccounts[workspaceId] = { ...A.wa.subaccounts[workspaceId], status: live.status, phone: live.phone, profileName: live.profileName };
        }
        if (live.status === 'connected') {
          stopWaPoll();
          flash(`WhatsApp de ${accountName(workspaceId)} conectado!`);
        }
        render();
      } catch {}
    }, 3000);
  }
  function waStatusBadge(status) {
    if (status === 'connected') return badge('Conectado', 'green');
    if (status === 'connecting') return badge('Aguardando QR Code', 'blue');
    if (status === 'hibernated') return badge('Hibernado', 'gold');
    return badge('Desconectado', '');
  }
  function whatsappSettings() {
    const w = A.wa;
    const markup = String(D().saas.rebilling.whatsapp ?? 1).replace('.', ',');
    const subCfg = w?.subaccounts || {};
    const statusBannerBadge = w?.error
      ? badge('Erro ao consultar', 'red')
      : !w
        ? badge('Carregando…')
        : w.managed && !w.hasCustomServer
          ? badge('Servidor gerenciado ativo', 'green')
          : w.configured
            ? badge('UAZAPI conectada', 'green')
            : badge('Aguardando configuração');

    const serverForm = `
      <form class="settings-form" data-ag-form="wa-config">
        <div class="field-grid">
          <label class="ag-full">URL do servidor UAZAPI<input name="baseUrl" type="url" required placeholder="https://suaagencia.uazapi.com" value="${h(w?.baseUrl || '')}"></label>
          <label class="ag-full">Admin Token (<code>admintoken</code>)<input name="adminToken" type="password" autocomplete="off" ${w?.hasAdminToken ? '' : 'required'} placeholder="${w?.hasAdminToken ? `Token salvo (••••${h(w.adminTokenLast4)}) — deixe em branco para manter` : 'Cole o admintoken da sua conta UAZAPI'}"></label>
        </div>
        <div class="inline-gap">
          <button class="primary">Salvar servidor UAZAPI</button>
          ${w?.hasCustomServer ? btn('Remover servidor próprio', 'wa-disconnect-server') : ''}
        </div>
        <p class="form-status" role="alert"></p>
      </form>`;

    const focus = A.waFocus;
    const focusName = focus ? accountName(focus.workspace) : '';
    const focusPanel = focus ? `
      <div class="surface padded ag-gap ag-wa-focus">
        <div class="page-head">
          <div>
            <div class="inline-gap"><h2>WhatsApp · ${h(focusName)}</h2>${waStatusBadge(focus.status)}</div>
            <p class="dim">O cliente desta subconta também pode fazer esta conexão direto em <b>Configurações → WhatsApp</b> dentro da subconta.</p>
          </div>
          <div class="inline-gap">
            ${focus.status === 'connected'
              ? btn('Desconectar WhatsApp', 'wa-sub-disconnect', `data-id="${focus.workspace}"`)
              : btn('Atualizar QR Code', 'wa-sub-connect', `data-id="${focus.workspace}"`, 'primary')}
            ${btn('Fechar', 'wa-focus-close')}
          </div>
        </div>
        ${focus.status === 'connected' ? `
          <div class="ag-two">
            <div class="ag-waha-qr">
              <span class="ag-waha-icon">${i('whatsapp', 24)}</span>
              <b>${h(focus.profileName || 'WhatsApp conectado')}</b>
              <small class="dim">${focus.phone ? `+${h(focus.phone)}` : 'Pronto para enviar e receber mensagens em Conversas.'}</small>
            </div>
            <form class="settings-form" data-ag-form="wa-sub-test" data-id="${focus.workspace}">
              <h3>Enviar mensagem de teste</h3>
              <label>Número destino (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
              <label>Mensagem<textarea name="text" required maxlength="2000" placeholder="Olá! WhatsApp conectado na Soci via UAZAPI."></textarea></label>
              <button class="primary">Enviar teste</button>
              <p class="form-status" role="alert"></p>
            </form>
          </div>
        ` : `
          <div class="ag-two">
            <div class="ag-waha-qr">
              ${focus.qrcode
                ? `<div class="ag-waha-qr-frame"><img src="${h(focus.qrcode)}" alt="QR Code do WhatsApp de ${h(focusName)}"></div>
                   <b>Aponte a câmera do WhatsApp para o QR Code</b>
                   <small class="dim">1. Abra o WhatsApp · 2. Toque em <b>Aparelhos conectados</b> · 3. Escaneie o código.<br>Verificando conexão automaticamente…</small>`
                : focus.paircode
                  ? `<span class="ag-waha-icon">${i('whatsapp', 22)}</span>
                     <b>Digite este código no celular</b>
                     <div class="ag-waha-code">${h(focus.paircode)}</div>
                     <small class="dim">No WhatsApp: <b>Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</b>.</small>`
                  : `<span class="ag-waha-icon">${i('whatsapp', 22)}</span><b>Gerando QR Code…</b><small class="dim">Clique em <b>Atualizar QR Code</b> caso não carregue em alguns segundos.</small>`}
            </div>
            <form class="settings-form" data-ag-form="wa-sub-pair" data-id="${focus.workspace}">
              <h3>Prefere conectar sem câmera?</h3>
              <p class="dim">Informe o número do WhatsApp com DDI e DDD para gerar um código de 8 dígitos.</p>
              <label>Número do WhatsApp (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
              <button class="secondary">Gerar código de pareamento</button>
              <p class="form-status" role="alert"></p>
            </form>
          </div>
        `}
      </div>` : '';

    const rows = accounts().filter(a => match(a.name)).map(a => {
      const cfg = subCfg[a.id] || { enabled: true, rebill: false, status: 'disconnected', phone: '', profileName: '' };
      const connectBtn = !w?.configured || !cfg.enabled
        ? `<span class="dim">—</span>`
        : cfg.status === 'connected'
          ? `<div class="inline-gap">${btn('Gerenciar', 'wa-sub-open', `data-id="${a.id}"`)}${btn('Desconectar', 'wa-sub-disconnect', `data-id="${a.id}"`)}</div>`
          : btn('Conectar QR Code', 'wa-sub-connect', `data-id="${a.id}"`, 'primary');
      return `<tr>
        <td><b>${h(a.name)}</b><br><small class="dim">${h(a.id)}</small></td>
        <td>${waStatusBadge(cfg.status)}${cfg.phone ? `<br><small class="dim">+${h(cfg.phone)}</small>` : ''}</td>
        <td>${connectBtn}</td>
        <td>${sw(`WhatsApp em ${a.name}`, cfg.enabled, `data-ag-wa-sub="${a.id}" data-field="enabled"`)}</td>
        <td>${sw(`Rebilling de WhatsApp em ${a.name}`, cfg.rebill, `data-ag-wa-sub="${a.id}" data-field="rebill"`, !cfg.enabled)}</td>
      </tr>`;
    });

    const waHl = brandHighlight('whatsapp');
    const waActive = Boolean(w?.configured || (w?.managed && !w?.hasCustomServer));
    return `
      <div class="surface padded ag-notice shc-card shc-panel${waActive ? ' is-connected' : ''}" style="--shc-highlight:${waHl}">
        ${shcLayers()}
        <span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('whatsapp', 22)}</span></span>
        <div>
          <div class="inline-gap"><b>Integração com WhatsApp (UAZAPI)</b>${statusBannerBadge}</div>
          <p>Conecte sua conta <a class="text-link" href="https://uazapi.com" target="_blank" rel="noopener">UAZAPI</a> uma única vez para que <b>cada subconta</b> conecte o próprio número apenas lendo o QR Code. Markup SaaS atual: <b>${h(markup)}×</b>.</p>
          ${w?.error ? `<p class="form-status">${h(w.error)}</p>` : ''}
        </div>
        <a class="secondary" href="#agency/saas/rebilling">Ajustar markup</a>
      </div>

      ${w?.managed && !w?.hasCustomServer ? `
        <div class="surface padded ag-gap">
          <div class="inline-gap">${badge('Modo 1-clique ativo', 'green')}<b>Servidor UAZAPI gerenciado pela plataforma</b></div>
          <p class="dim">Os usuários de cada subconta já podem abrir <b>Configurações → WhatsApp</b> e conectar o número apenas escaneando o QR Code — sem digitar URL nem chaves.</p>
          <details class="ag-wa-details"><summary>Usar servidor UAZAPI próprio (opcional)</summary>${serverForm}</details>
        </div>
      ` : `
        <div class="surface padded ag-gap">
          <h2>Servidor UAZAPI da agência</h2>
          <p class="dim">Informe uma única vez a URL e o <code>admintoken</code> da sua conta UAZAPI (armazenado criptografado no Supabase). Depois disso, cada subconta verá apenas o botão <b>Conectar WhatsApp</b> com QR Code.</p>
          ${serverForm}
        </div>
      `}

      ${focusPanel}

      <div class="page-head ag-gap">
        <div>
          <h3>Subcontas conectadas ${badge(`${accounts().length} subconta(s)`, 'blue')}</h3>
          <p class="dim">Cada subconta recebe uma instância isolada na UAZAPI e pode parear seu próprio número via QR Code.</p>
        </div>
        <div class="inline-gap">
          ${w?.configured ? btn('Atualizar status', 'wa-refresh', '', 'secondary', 'refresh') : ''}
          ${search('Buscar pelo nome…')}
        </div>
      </div>
      ${table(['Subconta', 'Status', 'Conexão', 'WhatsApp ativo', 'Rebilling ativo'], rows, empty('Nenhuma subconta encontrada', 'Crie uma subconta ou ajuste a busca.'))}`;
  }
  // Per-sub-account switches: access to the feature and rebilling its usage through the wallet.
  function featureTable(key) {
    const [, title, text, byDefault] = subFeatures.find(f => f[0] === key);
    const st = D().subFeatures[key];
    const on = id => Object.hasOwn(st.on, id) ? st.on[id] : byDefault;
    const rows = accounts().filter(a => match(a.name)).map(a => `<tr><td><b>${h(a.name)}</b><br><small class="dim">${h(a.id)}</small></td><td>${sw(`${title} em ${a.name}`, on(a.id), `data-ag-feature="${key}" data-field="on" data-account="${a.id}"`)}</td><td>${sw(`Rebilling de ${title} em ${a.name}`, st.rebill.includes(a.id), `data-ag-feature="${key}" data-field="rebill" data-account="${a.id}"`, !on(a.id))}</td></tr>`);
    return `<div class="page-head"><div><h2>${h(tr(title))}</h2><p class="dim">${h(tr(text))}</p></div></div>
      <div class="page-head"><div><h3>Configurações das subcontas ${badge(`${accounts().length} subcontas`, 'blue')}</h3><p class="dim">Ative ou desative o recurso e o rebilling para cada subconta.</p></div>${search('Buscar pelo nome…')}</div>
      ${table(['Subconta', 'Recurso ativo', 'Rebilling ativo'], rows, empty('Nenhuma subconta encontrada', 'Crie uma subconta ou ajuste a busca.'))}`;
  }
  const settingsPages = {
    openai: openAISettings,
    profile: () => { const p = D().profile; return `<form class="surface padded settings-form" data-ag-form="profile"><h2>Dados pessoais</h2><div class="field-grid"><label>Nome<input name="first" required value="${h(p.first)}"></label><label>Sobrenome<input name="last" required value="${h(p.last)}"></label><label>E-mail<input name="email" type="email" value="${h(p.email)}"></label><label>Telefone<input name="phone" type="tel" value="${h(p.phone)}"></label></div><button class="primary">Salvar perfil</button><p class="form-status" role="alert"></p></form>`; },
    company: () => {
      const c = D().company;
      return `<form class="surface padded settings-form" data-ag-form="company">
        <h2>Dados da empresa</h2>
        <div class="field-grid">
          <label>Nome da empresa<input name="name" required maxlength="120" value="${h(c.name)}"></label>
          <label>Site institucional<input name="website" type="url" value="${h(c.website)}"></label>
          <label>Telefone<input name="phone" type="tel" value="${h(c.phone)}"></label>
          <label>Endereço comercial<input name="address" value="${h(c.address)}"></label>
          <label>Fuso horário padrão<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option ${c.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
          <label>Moeda<input readonly value="Real brasileiro (BRL)"></label>
          ${colorPicker(c.primary, { name: 'primary', label: 'Cor primária', fallback: '#FF00BB' })}
          ${colorPicker(c.secondary, { name: 'secondary', label: 'Cor secundária', fallback: '#FC972D' })}
        </div>
        <div class="ag-brand-preview" aria-label="Prévia das cores primária e secundária">
          <span class="ag-brand-preview-bar" aria-hidden="true"></span>
          <span class="ag-brand-preview-meta">
            <span class="badge pink">Badge</span>
            <span class="text-link">Link de destaque</span>
          </span>
        </div>
        <p class="dim">As cores primária e secundária formam o gradiente de botões, avatares e heróis, além dos focos e destaques na agência e nas subcontas.</p>
        <h2>White Label das subcontas</h2>
        <div class="field-grid">
          <label>Domínio para subcontas<input name="domain" placeholder="app.suaagencia.com.br" value="${h(c.domain)}"></label>
          <label>Logotipo (PNG, JPEG, WebP ou GIF, até 300 KB)<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        </div>
        ${c.logo ? `<div class="inline-gap"><img class="ag-logo-preview" src="${h(c.logo)}" alt="Logotipo das subcontas"><label class="check"><input type="checkbox" name="removeLogo"> Remover logotipo</label></div>` : ''}
        <button class="primary">Salvar dados da empresa</button><p class="form-status" role="alert"></p>
      </form>`;
    },
    users: () => `<div class="page-head"><div><h2>Membros da equipe</h2><p class="dim">${A.data.access?.session ? 'Use o e-mail confirmado no Supabase para conceder acesso à equipe.' : 'Use “Agir como” para testar as permissões de um usuário.'}</p></div>${primary('Adicionar usuário', 'new-record', 'data-key="users"')}</div>${table(['Nome', 'Função', 'Acesso', 'Permissões de módulos', ''], D().users.map(u => `<tr><td><b>${h(`${u.first} ${u.last}`)}</b><br><small class="dim">${h(u.email)}</small></td><td>${badge(u.role, u.role.startsWith('Agency') ? 'pink' : 'blue')}</td><td><small>${u.role.startsWith('Agency') ? 'Todas as subcontas' : h(u.accounts.map(accountName).join(', ') || 'Nenhuma subconta')}</small></td><td><small>${u.permissions.length ? `${u.permissions.length} módulos permitidos` : 'Todos os módulos'}</small></td><td class="right inline-gap">${A.data.access?.session ? '' : btn('Agir como', 'act-as', `data-id="${u.id}"`)}${btn('Editar', 'edit-record', `data-key="users" data-id="${u.id}"`)}</td></tr>`), empty('Nenhum membro cadastrado', 'Adicione usuários e defina permissões específicas por subconta e módulo.'))}`,
    billing: () => { const b = D().billing; const wallet = O().totals.wallet; return `<div class="ag-two"><form class="surface padded settings-form" data-ag-form="billing-plan"><h2>Plano da agência</h2><p class="dim">O plano é gravado localmente para cálculo de recursos; a alteração não gera cobrança automática no cartão.</p><div class="ag-plans">${agencyPlans.map(([name, price]) => `<label class="choice"><input type="radio" name="plan" value="${name}" ${b.plan === name ? 'checked' : ''}><strong>${name}</strong><span>${money(price)}/mês</span></label>`).join('')}</div><button class="primary">Alterar plano</button><p class="form-status" role="alert"></p></form>
      <form class="surface padded settings-form" data-ag-form="auto-recharge"><h2>Saldo da carteira</h2><p class="ag-big">${money(wallet)}</p><label class="check"><input type="checkbox" name="enabled" ${b.autoRecharge.enabled ? 'checked' : ''}> Notificar quando o saldo estiver baixo</label><div class="field-grid"><label>Saldo mínimo de alerta<input name="threshold" type="number" min="0" step="0.01" value="${b.autoRecharge.threshold}"></label><label>Valor sugerido de recarga<input name="amount" type="number" min="0" step="0.01" value="${b.autoRecharge.amount}"></label></div><div class="inline-gap"><button class="primary">Salvar regras</button>${btn('Registrar lançamento', 'wallet')}</div><p class="form-status" role="alert"></p></form></div>
      ${b.autoRecharge.enabled && wallet < b.autoRecharge.threshold ? `<p class="surface padded ag-warn">O saldo da carteira está abaixo de ${money(b.autoRecharge.threshold)}. Registre uma recarga de ${money(b.autoRecharge.amount)}.</p>` : ''}
      <h2 class="section-heading">Histórico de transações da carteira</h2>${table(['Data', 'Tipo', 'Valor', 'Observação'], [...b.wallet].reverse().map(w => `<tr><td>${day(w.at, true)}</td><td>${badge(w.kind === 'Credit' ? 'Crédito' : 'Débito', w.kind === 'Credit' ? 'green' : 'orange')}</td><td>${money(w.amount)}</td><td>${h(w.note || '—')}</td></tr>`), empty('Nenhuma transação', 'Lance créditos e débitos para acompanhar o saldo da carteira da agência.'))}`; },
    'menu-links': () => `<div class="page-head"><div><h2>Links personalizados do menu</h2><p class="dim">Estes links aparecem na barra lateral das subcontas ou da própria agência.</p></div>${primary('Adicionar link', 'new-record', 'data-key="menuLinks"')}</div>${table(['Título', 'URL', 'Exibição', 'Subcontas com acesso', ''], D().menuLinks.map(l => `<tr><td>${i(l.icon, 15)} <b>${h(l.title)}</b></td><td><small>${h(l.url)}</small></td><td>${h(tr(l.showOn))} · ${h(tr(l.openIn))}</td><td><small>${l.accounts.length ? h(l.accounts.map(accountName).join(', ')) : 'Todas'}</small></td><td class="right">${btn('Editar', 'edit-record', `data-key="menuLinks" data-id="${l.id}"`)}</td></tr>`), empty('Nenhum link personalizado', 'Adicione atalhos para sistemas ou ferramentas externas utilizadas pelos clientes.'))}`,
    'api-keys': () => `<div class="page-head"><div><h2>Chaves de API da agência</h2><p class="dim">Chaves de API concedem acesso programático de leitura a subcontas e contatos via <code>/api/v1</code>. O token é exibido apenas uma vez.</p></div>${primary('Criar chave', 'api-key')}</div>
      ${table(['Nome', 'Chave (final)', 'Criada em', 'Último uso', ''], D().apiKeys.map(k => `<tr><td><b>${h(k.name)}</b></td><td><code>go_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Revogar', 'api-key-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma chave de API', 'Crie chaves de API para automatizar fluxos via scripts ou integrações.'))}
      <p class="dim ag-hint">Tokens com escopos limitados ficam em <a class="text-link" href="#agency/settings/private-integrations">Integrações privadas</a>.</p>
      <div class="surface padded ag-gap"><h2>Endpoints disponíveis</h2><pre class="ag-code">GET  ${h(location.origin)}/api/v1/subaccounts
GET  ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
POST ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
Authorization: Bearer &lt;sua-chave&gt;</pre></div>`,
    'private-integrations': () => `<div class="page-head"><div><h2>Integrações privadas</h2><p class="dim">Tokens com escopos estritamente delimitados para scripts e sistemas internos. O token é exibido apenas uma vez.</p></div>${primary('Criar integração', 'private-integration')}</div>
      ${table(['Nome', 'Escopos autorizados', 'Token', 'Criada em', 'Último uso', ''], D().privateIntegrations.map(k => `<tr><td><b>${h(k.name)}</b><br><small class="dim">${h(k.description)}</small></td><td><small>${h(k.scopes.join(', '))}</small></td><td><code>pit_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Excluir', 'private-integration-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma integração privada', 'Crie uma integração privada para scripts que exigem apenas permissões pontuais.'))}`,
    whatsapp: whatsappSettings,
    phone: whatsappSettings,
    'email-services': () => { const e = D().emailServices, hl = brandHighlight('email'); return `${e.domain ? `<div class="surface padded ag-notice shc-card shc-panel is-connected" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('email', 22)}</span></span><div><b>Domínio dedicado: ${h(e.domain)}</b><p>Adicionado em ${day(e.added)}. A verificação de DNS e o aquecimento do domínio dependem do provedor de envio, que não está conectado neste projeto local.</p></div>${btn('Remover domínio', 'email-domain-remove')}</div>
      <form class="surface padded settings-form ag-gap" data-ag-form="email-domain-accounts"><h2>Subcontas que enviam pelo domínio dedicado</h2>${pickAccounts('accounts', e.accounts)}<button class="primary">Salvar</button><p class="form-status" role="alert"></p></form>`
      : `<div class="surface padded ag-notice shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('email', 22)}</span></span><div><b>Você está usando um domínio compartilhado</b><p>As subcontas enviam pelo domínio compartilhado da plataforma porque nenhum domínio da agência está conectado. Um domínio dedicado dá controle sobre a reputação de envio.</p></div></div>
      <form class="surface padded settings-form ag-gap" data-ag-form="email-domain"><h2>Criar domínio dedicado</h2><label>Domínio de envio<input name="domain" required placeholder="mail.suaagencia.com.br" maxlength="200"></label><button class="primary">Adicionar domínio</button><p class="form-status" role="alert"></p></form>`}
      <h2 class="section-heading">Desempenho das subcontas</h2>${table(['Subconta', 'Domínio de envio', 'Status'], accounts().map(a => `<tr><td><b>${h(a.name)}</b></td><td>${e.accounts.includes(a.id) ? h(e.domain) : 'Compartilhado'}</td><td>${badge(a.status, tone(a.status))}</td></tr>`), empty('Nenhuma subconta', 'As subcontas que enviam e-mails aparecem aqui.'))}`; },
    'workflow-premium': () => featureTable('workflow-premium'),
    'external-ai': () => featureTable('external-ai'),
    'domain-purchase': () => featureTable('domain-purchase'),
    affiliates: () => { const aff = D().affiliate, link = `${location.origin}/?ref=${aff.code}`; return `<div class="surface padded"><h2>Configurações de afiliado</h2>${aff.accepted ? `<p>Este é o seu link de afiliado. Quem se cadastrar por ele gera ${Math.round(affiliateRate * 100)}% de comissão recorrente para você.</p><div class="ag-copy"><input readonly value="${h(link)}" aria-label="Link de afiliado">${btn('Copiar link', 'copy', `data-text="${h(link)}"`)}</div><p class="dim">Acrescente <code>?ref=${h(aff.code)}</code> ao final de qualquer URL do seu site.</p>` : `<p class="dim">Aceite os termos no Portal de afiliados para gerar seu link.</p><a class="secondary" href="#agency/affiliate">Abrir Portal de afiliados</a>`}</div>
      <form class="surface padded settings-form ag-gap" data-ag-form="affiliate-pixel"><h2>Configurações da página</h2><label>ID do Pixel do Facebook<input name="pixelId" inputmode="numeric" maxlength="20" placeholder="ID do Pixel" value="${h(aff.pixelId || '')}"></label><button class="primary">Salvar</button><p class="form-status" role="alert"></p></form>`; },
    stripe: () => `<div class="surface padded shc-card shc-panel${D().stripe.connected ? ' is-connected' : ''}" style="--shc-highlight:${brandHighlight('stripe')}">${shcLayers()}<div class="shc-panel-head"><span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('stripe', 24)}</span></span><h2>Integração com o Stripe</h2></div><p>Conectar uma conta Stripe libera cobrança de assinaturas, rebilling, revenda e modo SaaS com pagamentos reais.</p>
      <p class="surface padded ag-warn">Depois de conectada, a conta Stripe não pode ser trocada. Use uma conta dedicada aos ganhos da agência.</p>
      <p>${D().stripe.connected ? badge('Conectado', 'green') : badge('Não conectado')}</p><p class="dim">A conexão usa o fluxo OAuth do Stripe Connect, que exige um endereço público e credenciais da plataforma. Neste projeto local, planos, carteira e revendas ficam registrados sem cobrança.</p></div>`,
    announcements: () => `<div class="page-head"><div><h2>Comunicados gerais</h2><p class="dim">Comunicados ativos são exibidos em banner de destaque no topo das subcontas selecionadas.</p></div>${primary('Novo comunicado', 'new-record', 'data-key="announcements"')}</div>${table(['Título', 'Estilo', 'Público-alvo', 'Status', ''], [...D().announcements].reverse().map(a => `<tr><td><b>${h(a.title)}</b><br><small class="dim">${h(a.body.slice(0, 90))}</small></td><td>${h(tr(a.tone))}</td><td><small>${a.accounts.length ? h(a.accounts.map(accountName).join(', ')) : 'Todas as subcontas'}</small></td><td>${badge(a.published ? 'Publicado' : 'Rascunho', a.published ? 'green' : '')}</td><td class="right">${btn('Editar', 'edit-record', `data-key="announcements" data-id="${a.id}"`)}</td></tr>`), empty('Nenhum comunicado', 'Crie comunicados informativos ou alertas para os clientes da agência.'))}`,
    emails: () => `<h2>E-mails do sistema</h2><p class="dim ag-hint">Modelos de e-mail disparados pela plataforma. O envio em produção requer um provedor de e-mail conectado.</p>${systemEmailKeys.map(([key, label]) => { const e = D().systemEmails[key]; return `<form class="surface padded settings-form ag-gap" data-ag-form="system-email" data-id="${key}"><h2>${h(tr(label))}</h2><label class="ag-full">Assunto<input name="subject" required value="${h(e.subject)}"></label><label class="ag-full">Mensagem<textarea name="body" required>${h(e.body)}</textarea></label><button class="primary">Salvar modelo</button><p class="form-status" role="alert"></p></form>`; }).join('')}`,
    labs: () => `<form class="surface padded settings-form" data-ag-form="labs"><h2>Recursos experimentais (Labs)</h2><p class="dim">Ative antecipadamente funcionalidades e comportamentos em fase de experimentação.</p>${labFeatures.map(([key, label, text]) => `<label class="check ag-lab"><input type="checkbox" name="${key}" ${D().labs[key] ? 'checked' : ''}><span><b>${h(label)}</b><br><small class="dim">${h(text)}</small></span></label>`).join('')}<button class="primary">Salvar preferências</button><p class="form-status" role="alert"></p></form>`,
    compliance: () => { const c = D().compliance; return `<form class="surface padded settings-form" data-ag-form="compliance"><h2>Conformidade e privacidade (LGPD)</h2><div class="field-grid"><label>Período de retenção de dados (dias)<input name="retentionDays" type="number" min="0" max="3650" value="${c.retentionDays}"></label></div><label class="ag-full">Texto padrão de consentimento em formulários<textarea name="consent">${h(c.consent)}</textarea></label><label class="check"><input type="checkbox" name="cookieBanner" ${c.cookieBanner ? 'checked' : ''}> Exibir aviso e banner de cookies nas páginas publicadas</label><label class="check"><input type="checkbox" name="hipaa" ${c.hipaa ? 'checked' : ''}> Modo de dados sensíveis de saúde (requer o complemento correspondente)</label><button class="primary">Salvar conformidade</button><p class="form-status" role="alert"></p></form>`; },
    audit: () => {
      const rows = [...D().audit].reverse().filter(a => match(a.actor, a.action, a.target, a.details));
      const per = 50, pgs = Math.max(1, Math.ceil(rows.length / per)); A.auditPage = Math.min(A.auditPage, pgs - 1);
      return `<div class="toolbar">${search('Buscar no log de auditoria…')}${btn('Exportar CSV', 'audit-csv', '', 'secondary', 'download')}</div>${table(['Data/Hora', 'Usuário', 'Ação', 'Alvo', 'Detalhes'], rows.slice(A.auditPage * per, A.auditPage * per + per).map(a => `<tr><td>${day(a.at, true)}</td><td>${h(a.actor)}</td><td><b>${h(a.action)}</b></td><td>${h(a.target)}</td><td><small>${h(a.details)}</small></td></tr>`), empty('Nenhuma atividade recente', 'Todas as alterações realizadas na agência e nas subcontas são auditadas aqui.'))}
        ${pgs > 1 ? `<div class="inline-gap ag-gap">${btn('Anterior', 'audit-page', `data-step="-1" ${A.auditPage ? '' : 'disabled'}`)}<span>Página ${A.auditPage + 1} de ${pgs}</span>${btn('Próxima', 'audit-page', `data-step="1" ${A.auditPage < pgs - 1 ? '' : 'disabled'}`)}</div>` : ''}`;
    },
    storage: () => { const total = O().totals.storage, max = Math.max(1, ...accounts().map(a => a.storage)); return `<div class="metrics three">${metric('Total de arquivos armazenados', bytes(total))}${metric('Quantidade de arquivos', accounts().reduce((s, a) => s + a.files, 0))}${metric('Subcontas ativas', accounts().length)}</div>${table(['Subconta', 'Arquivos', 'Espaço utilizado', ''], [...accounts()].sort((a, b) => b.storage - a.storage).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${a.files}</td><td>${bytes(a.storage)}</td><td>${bar((a.storage / max) * 100)}</td></tr>`), '')}`; }
  };
  pages.settings = () => { const sub = A.sub || 'profile'; return `<div class="page">${head('Configurações', 'Gerencie dados da empresa, equipe, faturamento, integrações e conformidade.')}${tabs('settings')}<div class="ag-settings">${settingsPages[sub]()}</div></div>`; };

  // ---- Render ------------------------------------------------------------
  function render() {
    if (!active()) return;
    if (!A.data) {
      if (A.openAIOnly && isOpenAIPage()) {
        app.innerHTML = `<main class="page">${head('Configurações', '', '<a class="secondary" href="#dashboard">Voltar para a subconta</a>')}<div class="ag-settings">${openAISettings()}</div></main>`;
      }
      return;
    }
    const prev = document.querySelector('#screen')?.scrollTop || 0;
    const page = pages[A.page] || pages.dashboard;
    document.title = 'soci';
    applyBrandColor(D().company.primary, D().company.secondary);
    app.innerHTML = shell(page());
    for (const picker of app.querySelectorAll('[data-color-picker]')) mountColorPicker(picker);
    const chatHost = app.querySelector('[data-soci-chat-host]');
    if (chatHost) sociChat.mount(chatHost, { conversationId: A.sub });
    else sociChat.unmount();
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
    const normalizedSub = A.page === 'settings' && sub === 'phone' ? 'whatsapp' : sub;
    A.sub = A.page === 'ask'
      ? (sub && /^[\w-]{4,80}$/.test(sub) ? sub : '')
      : (subTabs[A.page]?.some(t => t[0] === normalizedSub) ? normalizedSub : '');
    if (A.data) {
      if (!isWhatsAppPage()) stopWaPoll();
      render();
      if (isOpenAIPage() && A.data.access.session && !A.openAI) await refreshOpenAI();
      if (isWhatsAppPage() && !A.wa) await refreshWhatsApp();
      return;
    }
    if (loading) return;
    const currentVisit = visit;
    loading = true;
    applyBrandColor();
    app.innerHTML = bootScreen('Abrindo a agência…');
    try {
      const data = await api('/api/agency');
      if (currentVisit !== visit || !active()) return;
      A.data = data;
      A.openAIOnly = false;
      render();
      if (isOpenAIPage() && data.access.session && !A.openAI) await refreshOpenAI();
      if (isWhatsAppPage() && !A.wa) await refreshWhatsApp();
    } catch (e) {
      if (currentVisit !== visit || !active()) return;
      if (e.status === 403 && isOpenAIPage()) {
        A.openAIOnly = true;
        render();
        await refreshOpenAI();
        return;
      }
      app.innerHTML = `<div class="boot"><h1>Visão da agência indisponível</h1><p>${h(e.message)}</p><a href="#dashboard">Voltar para o workspace</a></div>`;
    } finally {
      if (currentVisit === visit) loading = false;
    }
  }

  function leave() {
    visit++;
    loading = false;
    stopWaPoll();
    A.data = null;
    A.openAI = null;
    A.openAIOnly = false;
    A.wa = null;
    A.waFocus = null;
    A.waPairOpen = false;
    sociChat.reset();
  }

  // ---- Events -------------------------------------------------------------
  const active = () => location.hash === '#agency' || location.hash.startsWith('#agency/');
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const pickAccounts = (name = 'workspaces', chosen = []) => `<fieldset class="ag-checks"><legend>Subcontas selecionadas</legend>${accounts().map(a => `<label class="check"><input type="checkbox" name="${name}" value="${a.id}" ${chosen.includes(a.id) ? 'checked' : ''}> ${h(a.name)}</label>`).join('')}</fieldset>`;
  const oneAccount = (label = 'Subconta de destino') => `<label>${h(label)}<select name="workspace" required>${accounts().map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label>`;
  const secretBox = (title, secret) => dialog(title, `<p>Copie este código agora. Ele não será exibido novamente.</p><div class="ag-copy"><input readonly value="${h(secret)}" aria-label="Código secreto">${btn('Copiar', 'copy', `data-text="${h(secret)}"`)}</div>`);

  document.addEventListener('click', async ev => {
    if (!active()) return;

    // Handle profile click from topbar
    const profBtn = ev.target.closest('[data-ag-profile]');
    if (profBtn) { go('settings', 'company'); return; }

    const b = ev.target.closest('[data-ag]'); if (!b) return;
    const d = b.dataset, id = d.id;
    try {
      switch (d.ag) {
        case 'openai-retry': A.openAI = null; render(); await refreshOpenAI(); break;
        case 'openai-disconnect': confirmBox('Desconectar a chave da OpenAI?', 'Você precisará conectar outra chave para voltar a usar os recursos de IA.', 'openai-disconnect', '', 'Desconectar'); break;
        case 'wa-refresh': await refreshWhatsApp(); flash('Status do WhatsApp atualizado.'); break;
        case 'wa-disconnect-server': confirmBox('Remover servidor UAZAPI próprio?', 'A URL e o admintoken cadastrados pela agência serão removidos.', 'wa-disconnect-server', '', 'Remover'); break;
        case 'wa-focus-close': stopWaPoll(); A.waFocus = null; render(); break;
        case 'wa-sub-open': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/status?workspace=${encodeURIComponent(id)}`);
          A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], status: live.status, phone: live.phone, profileName: live.profileName };
          if (live.status === 'connecting') startWaPoll(id);
          render();
          break;
        }
        case 'wa-sub-connect': {
          stopWaPoll();
          A.waFocus = { workspace: id, status: 'connecting', qrcode: '', paircode: '', phone: '', profileName: '' };
          render();
          const live = await api(`/api/whatsapp/workspace/connect?workspace=${encodeURIComponent(id)}`, {});
          A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], status: live.status, phone: live.phone, profileName: live.profileName };
          render();
          if (live.status === 'connecting') { startWaPoll(id); flash('QR Code pronto! Aponte a câmera do WhatsApp.'); }
          else if (live.status === 'connected') flash('WhatsApp conectado!');
          break;
        }
        case 'wa-sub-disconnect': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/disconnect?workspace=${encodeURIComponent(id)}`, {});
          if (A.waFocus?.workspace === id) A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], status: 'disconnected', phone: '' };
          render();
          flash('WhatsApp da subconta desconectado.');
          break;
        }
        case 'go-profile': go('settings', 'company'); break;
        case 'nav': A.navOpen = !A.navOpen; render(); G('[data-ag="nav"]')?.focus(); break;
        case 'tab': go(A.page, d.sub); break;
        case 'switch-account': {
          const view = d.view === 'ai-agents' ? d.view : '';
          const available = !view || !A.data.access.modules || A.data.access.modules.includes(view);
          const personal = A.data.personalWorkspace;
          const personalChoice = personal ? `<button class="choice" data-ag="open-personal-workspace" data-view="${view}"><strong>${h(personal.name)}</strong><span>Workspace pessoal</span></button>` : '';
          const choices = personalChoice + accounts().map(a => `<button class="choice" data-ag="open-account" data-id="${a.id}" data-view="${view}"><strong>${h(a.name)}</strong><span>${h(tr(a.status))} · ${a.contacts} contatos</span></button>`).join('');
          dialog(view ? 'Abrir Agentes de IA' : 'Trocar para uma subconta', available
            ? `<div class="ag-switch">${choices || '<p class="dim">Nenhuma subconta disponível.</p>'}</div>`
            : '<p class="dim">Você não tem acesso a Agentes de IA.</p>');
          break;
        }
        case 'open-personal-workspace': close(); await openWorkspace(A.data.personalWorkspace.id, d.view === 'ai-agents' ? d.view : undefined, A.data.personalWorkspace.name); break;
        case 'open-account': {
          close();
          const name = accountName(id);
          // Stamp "último acesso" in the background; the switch no longer waits on it.
          const meta = accounts().find(a => a.id === id);
          if (meta?.status === 'Active') {
            meta.lastLogin = new Date().toISOString();
            api('/api/agency/action', { type: 'account-open', id }).catch(() => {});
          }
          await openWorkspace(id, d.view === 'ai-agents' ? d.view : undefined, name);
          break;
        }
        case 'new-account': dialog('Criar nova subconta', accountForm(), { form: 'account', submit: 'Criar subconta' }); break;
        case 'edit-account': {
          const a = accounts().find(x => x.id === id), meta = D().accounts[id] || {};
          dialog(`Editar ${a.name}`, `<div class="field-grid"><label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select></label><label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}" ${meta.plan === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label><label>Endereço<input name="address" value="${h(meta.address)}"></label><label>Telefone<input name="phone" value="${h(meta.phone)}"></label><label>Site<input name="website" type="url" value="${h(meta.website)}"></label></div>
            <label>Motivo da suspensão ou encerramento<textarea name="suspendedReason" maxlength="500">${h(meta.suspendedReason || '')}</textarea><small class="dim">Visível para usuários da subconta enquanto o acesso estiver bloqueado.</small></label>`, { form: 'account-meta', id, submit: 'Salvar alterações' });
          break;
        }
        case 'reactivate-account':
          dialog(`Reativar ${accountName(id)}`, '<p>Os usuários recuperam o acesso permitido. Publicações pendentes poderão voltar a ser processadas.</p>', { form: 'account-reactivate', id, submit: 'Reativar subconta' });
          break;
        case 'bulk-status': dialog(`Alterar status de ${A.selected.size} subconta(s)`, `<label>Novo status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}">${tr(s)}</option>`).join('')}</select></label><label>Motivo visível para usuários com acesso bloqueado<textarea name="suspendedReason" maxlength="500"></textarea></label>`, { form: 'bulk-status', submit: 'Atualizar status' }); break;
        case 'bulk-snapshot': if (!D().snapshots.length) { flash('Crie um setup primeiro.', true); break; } dialog(`Carregar setup em ${A.selected.size} subconta(s)`, `<label>Setup<select name="id">${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>${loadMode()}`, { form: 'bulk-snapshot', submit: 'Carregar setup' }); break;
        case 'new-record': editRecord(d.key); break;
        case 'edit-record': editRecord(d.key, id); break;
        case 'delete-record': confirmBox('Excluir este registro?', 'Esta ação não poderá ser desfeita.', `delete:${d.key}`, id, 'Excluir'); break;
        case 'prospect-report': { const p = D().prospects.find(x => x.id === id); dialog('Relatório de auditoria', prospectReport(p) + `<div class="inline-gap">${btn('Baixar HTML', 'prospect-download', `data-id="${id}"`, 'primary', 'download')}</div>`, { wide: true }); break; }
        case 'prospect-download': { const p = D().prospects.find(x => x.id === id); download(`${p.name.replace(/[^\w-]+/g, '-')}-auditoria.html`, reportHtml(p), 'text/html'); break; }
        case 'prospect-convert': dialog('Criar subconta para este prospect', `<label>Setup inicial<select name="snapshotId"><option value="">Começar em branco</option>${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>`, { form: 'prospect-convert', id, submit: 'Criar subconta' }); break;
        case 'snapshot-create': dialog('Criar setup', `<label>Nome do setup<input name="name" required maxlength="100"></label>${oneAccount('Subconta de origem')}<fieldset class="ag-checks"><legend>Recursos a incluir</legend>${snapshotAssets.map(([k, l]) => `<label class="check"><input type="checkbox" name="include" value="${k}" checked> ${h(assetLabelsPt[k] || l)}</label>`).join('')}</fieldset><p class="dim">Contatos, conversas e pagamentos nunca são incluídos. Páginas e fluxos entram como rascunhos.</p>`, { form: 'snapshot-create', submit: 'Criar setup' }); break;
        case 'snapshot-load': { const s = D().snapshots.find(x => x.id === id); dialog(`Carregar “${s.name}”`, `<p class="dim">${h(assetSummary(s.counts))}</p>${pickAccounts()}${loadMode()}`, { form: 'snapshot-load', id, submit: 'Carregar setup' }); break; }
        case 'snapshot-refresh': confirmBox('Atualizar setup?', `Substituir o conteúdo do setup pelos ativos mais recentes de ${accountName(D().snapshots.find(x => x.id === id).workspace)}.`, 'snapshot-refresh', id, 'Atualizar'); break;
        case 'snapshot-rename': { const s = D().snapshots.find(x => x.id === id); dialog('Renomear setup', `<label>Novo nome<input name="name" required maxlength="100" value="${h(s.name)}"></label>`, { form: 'snapshot-rename', id, submit: 'Renomear' }); break; }
        case 'snapshot-delete': confirmBox('Excluir setup?', 'As subcontas que já carregaram este setup manterão seus recursos normalmente.', 'snapshot-delete', id, 'Excluir'); break;
        case 'go-marketplace': close(); go('snapshots', 'marketplace'); break;
        case 'go-my-setups': close(); go('snapshots', 'mine'); break;
        case 'marketplace-preview': {
          const item = M().find(x => x.id === id);
          if (!item) break;
          const sections = Object.entries(item.preview || {}).map(([k, names]) => {
            const total = item.counts?.[k] || names.length;
            const more = total > names.length ? `<li class="dim">+ ${total - names.length} mais</li>` : '';
            return `<div class="ag-mkt-sec"><h4>${h(assetLabelsPt[k] || k)} (${total})</h4><ul>${names.map(n => `<li>${h(n)}</li>`).join('')}${more}</ul></div>`;
          }).join('');
          const tagsHtml = (item.tags || []).length ? `<div class="ag-mkt-chips">${item.tags.map(t => `<span class="ag-mkt-chip">#${h(t)}</span>`).join('')}</div>` : '';
          const installed = D().snapshots.some(s => s.marketplaceId === item.id);
          const cta = item.mine
            ? `${item.sourceSnapshotId ? btn('Editar / Atualizar publicação', 'marketplace-publish', `data-id="${item.sourceSnapshotId}"`, 'primary') : ''}${btn('Retirar do marketplace', 'marketplace-unpublish', `data-id="${item.id}"`)}`
            : btn(installed ? 'Adicionar outra cópia à biblioteca' : 'Usar este setup gratuitamente', 'marketplace-install', `data-id="${item.id}"`, 'primary');
          dialog(item.title, `<div class="ag-mkt-detail">
            <div class="inline-gap"><span class="badge">${h(item.category)}</span>${item.official ? '<span class="badge blue">Soci Oficial</span>' : '<span class="badge">Comunidade</span>'}<span class="badge green">Gratuito</span><span class="dim">Por <b>${h(item.author)}</b> · v${item.version || 1} · ${item.installs === 1 ? '1 uso' : `${item.installs || 0} usos`}</span></div>
            <p class="ag-mkt-desc">${h(item.description || item.summary)}</p>
            ${tagsHtml}
            ${sections ? `<div><h3 style="margin:0 0 8px;font-size:14px">O que vem neste setup</h3><div class="ag-mkt-sections">${sections}</div></div>` : `<p class="dim">${h(assetSummary(item.counts))}</p>`}
            <p class="dim">Contatos, conversas e pagamentos nunca são compartilhados. Páginas e workflows entram como rascunhos prontos para revisão.</p>
            <div class="inline-gap">${cta}</div>
          </div>`, { wide: true });
          break;
        }
        case 'marketplace-install': {
          const installed = await call('marketplace-install', { id });
          render();
          dialog('Setup adicionado à sua biblioteca', `<p><b>${h(installed.name)}</b> foi salvo em <b>Meus setups</b> e já pode ser carregado em qualquer subconta ou usado como setup inicial.</p><div class="inline-gap">${btn('Carregar em uma subconta agora', 'snapshot-load', `data-id="${installed.snapshotId}"`, 'primary')}${btn('Ver em Meus setups', 'go-my-setups')}</div>`);
          break;
        }
        case 'marketplace-publish': {
          const own = D().snapshots.filter(s => s.kind === 'mine');
          if (!own.length) {
            flash('Crie um setup a partir de uma subconta primeiro para publicar no marketplace.', true);
            break;
          }
          const selected = own.find(s => s.id === id) || own[0];
          const existing = M().find(x => x.mine && x.sourceSnapshotId === selected.id);
          const isEdit = Boolean(existing);
          dialog(isEdit ? 'Atualizar publicação no marketplace' : 'Publicar setup no marketplace', `<div class="field-grid">
            <label class="ag-full">Setup de origem<select name="snapshotId" required data-ag-mkt-pick>${own.map(s => `<option value="${s.id}" ${s.id === selected.id ? 'selected' : ''}>${h(s.name)} (v${s.version || 1})</option>`).join('')}</select></label>
            <label>Título no marketplace<input name="title" required maxlength="100" value="${h(existing?.title || selected.name)}"></label>
            <label>Categoria / Nicho<select name="category">${marketplaceCategories.map(c => `<option value="${h(c)}" ${(existing?.category || selected.marketplaceCategory || '') === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>
            <label class="ag-full">Resumo curto (aparece no card)<input name="summary" required maxlength="180" placeholder="Ex.: Funil completo de avaliação, automações e agente de IA pronto para uso." value="${h(existing?.summary || selected.marketplaceSummary || '')}"></label>
            <label class="ag-full">Descrição detalhada<textarea name="description" rows="4" maxlength="1200" placeholder="Explique para qual negócio este setup funciona melhor e o que ele resolve.">${h(existing?.description || selected.marketplaceDescription || '')}</textarea></label>
            <label class="ag-full">Tags (opcional, separadas por vírgula)<input name="tags" maxlength="180" placeholder="ex.: estética, whatsapp, crm, ia" value="${h((existing?.tags || selected.marketplaceTags || []).join(', '))}"></label>
          </div><p class="dim">Publicação gratuita e imediata. Apenas a estrutura do setup é publicada — contatos, conversas e pagamentos nunca são expostos.</p>`, { form: 'marketplace-publish', id: existing?.id || '', submit: isEdit ? 'Atualizar no marketplace' : 'Publicar no marketplace', wide: true });
          break;
        }
        case 'marketplace-unpublish': confirmBox('Retirar setup do marketplace?', 'Ele deixará de aparecer no catálogo público. Agências que já adicionaram este setup continuarão com a cópia local normalmente.', 'marketplace-unpublish', id, 'Retirar do marketplace'); break;
        case 'addon-request': dialog(`Solicitar ${addOns.find(a => a.key === id).name}`, '<label>Observação para a equipe (opcional)<textarea name="note" maxlength="1000"></textarea></label><p class="dim">O pedido será registrado para análise. Nenhuma cobrança é realizada de imediato.</p>', { form: 'addon-request', id, submit: 'Enviar solicitação' }); break;
        case 'addon-cancel': await act('addon-cancel', { id }); render(); flash('Solicitação retirada.'); break;
        case 'affiliate-step': await act('affiliate-step', { data: { step: d.step } }); render(); break;
        case 'affiliate-pay': { const amount = await act('affiliate-pay'); render(); flash(`Pagamento de ${money(amount)} registrado.`); break; }
        case 'copy': await navigator.clipboard.writeText(d.text).then(() => flash('Copiado para a área de transferência.'), () => flash('Selecione o texto e copie manualmente.', true)); break;
        case 'template-preview': { const t = findTemplate(id); dialog(t.name, `<div class="ag-preview"><small>${h(tr(t.category))}</small><h3>${h(t.headline)}</h3><p>${h(t.body || '')}</p>${t.button ? `<span class="primary">${h(t.button)}</span>` : ''}</div>`, { wide: true }); break; }
        case 'template-install': dialog(`Instalar “${findTemplate(id).name}”`, `${oneAccount()}<p class="dim">A página será adicionada como funil de rascunho com formulário de captura vinculado.</p>`, { form: 'template-install', id, submit: 'Instalar agora' }); break;
        case 'learn': await act('learning', { data: { lesson: id } }); render(); break;
        case 'idea-vote': await act('idea-vote', { id }); render(); break;
        case 'idea-comments': { const x = D().ideas.find(r => r.id === id); dialog(x.title, `${x.comments.map(cm => `<div class="line-item"><div><b>${h(cm.author)}</b> <small class="dim">${day(cm.at, true)}</small><p>${h(cm.body)}</p></div></div>`).join('') || '<p class="dim">Nenhum comentário registrado ainda.</p>'}<label>Adicionar comentário<textarea name="body" required maxlength="2000"></textarea></label>`, { form: 'idea-comment', id, submit: 'Comentar' }); break; }
        case 'move-up': case 'move-down': { const li = b.closest('li'); if (d.ag === 'move-up' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); if (d.ag === 'move-down' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); b.focus(); break; }
        case 'integration': { const x = integrationCatalog.find(r => r[0] === id); dialog(`Disponibilidade: ${x[1]}`, `<p class="dim">As subcontas selecionadas verão este app disponível. Cada cliente precisará da sua própria conta de ${h(x[1])} para conectar.</p>${pickAccounts('accounts', D().integrations[id]?.accounts || [])}`, { form: 'integration', id, submit: 'Salvar disponibilidade' }); break; }
        case 'act-as': localStorage.setItem('go.user', id); flash('Navegando com as permissões do usuário selecionado.'); location.hash = '#dashboard'; location.reload(); break;
        case 'wallet': dialog('Lançamento na carteira', `<div class="field-grid"><label>Tipo de operação<select name="kind"><option value="Credit">Crédito</option><option value="Charge">Débito</option></select></label><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label></div><label>Observação<input name="note" maxlength="200"></label>`, { form: 'wallet', submit: 'Registrar lançamento' }); break;
        case 'api-key': dialog('Criar chave de API', '<label>Identificação da chave<input name="name" required maxlength="80"></label>', { form: 'api-key', submit: 'Criar chave' }); break;
        case 'api-key-delete': confirmBox('Revogar esta chave de API?', 'Sistemas ou integrações que utilizam esta chave deixarão de funcionar imediatamente.', 'api-key-delete', id, 'Revogar'); break;
        case 'private-integration': dialog('Criar integração privada', `<label>Nome da integração<input name="name" required maxlength="80"></label><label>Descrição do propósito<input name="description" maxlength="500"></label><fieldset class="ag-checks"><legend>Escopos de acesso</legend>${['subaccounts.read', 'contacts.read', 'contacts.write'].map(s => `<label class="check"><input type="checkbox" name="scopes" value="${s}"> ${s}</label>`).join('')}</fieldset>`, { form: 'private-integration', submit: 'Criar token' }); break;
        case 'private-integration-delete': confirmBox('Excluir esta integração?', 'O token associado deixará de funcionar imediatamente.', 'private-integration-delete', id, 'Excluir'); break;
        case 'saas-mode': await act('saas-mode', { data: { enabled: Boolean(d.on) } }); go('saas'); flash(d.on ? 'Modo SaaS ativado.' : 'Modo SaaS desativado.'); break;
        case 'app-install': {
          const name = appName(id), avail = D().integrations[id]?.accounts || [];
          dialog(`Instalar ${name}`, `<label>Onde instalar<select name="scope">${appScopes.map(s => `<option value="${s}">${s === 'Agency' ? 'Na agência' : 'Em uma subconta'}</option>`).join('')}</select></label><label>Subconta (para instalação em subconta)<select name="account"><option value="">—</option>${accounts().filter(a => avail.includes(a.id)).map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label><p class="dim">${avail.length ? 'Só aparecem subcontas para as quais o app está disponível.' : 'O app ainda não está disponível para nenhuma subconta. Use "Gerenciar disponibilidade" para liberá-lo.'}</p>`, { form: 'app-install', id, submit: 'Instalar' });
          break;
        }
        case 'app-uninstall': confirmBox('Desinstalar este app?', 'A instalação sai da lista e deixa de contar nos ganhos.', 'app-uninstall', id, 'Desinstalar'); break;
        case 'email-domain-remove': confirmBox('Remover o domínio dedicado?', 'As subcontas voltam a enviar pelo domínio compartilhado.', 'email-domain-remove', '', 'Remover'); break;
        case 'audit-page': A.auditPage += Number(d.step); render(); break;
        case 'audit-csv': { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`; download('auditoria-agencia.csv', ['Data,Usuario,Acao,Alvo,Detalhes', ...D().audit.map(a => [a.at, a.actor, a.action, a.target, a.details].map(q).join(','))].join('\n'), 'text/csv'); break; }
      }
    } catch (e) { flash(e.message, true); }
  });

  const loadMode = () => `<fieldset class="ag-checks"><legend>Quando já existir um recurso com o mesmo nome</legend><label class="check"><input type="radio" name="mode" value="skip" checked> Manter o recurso existente</label><label class="check"><input type="radio" name="mode" value="overwrite"> Sobrescrever com a versão do setup</label></fieldset>`;

  document.addEventListener('input', ev => {
    if (!active()) return;
    const el = ev.target;
    if (el.matches('[data-ag-search]')) {
      A.query = el.value; A.auditPage = 0; const pos = el.selectionStart; render();
      const next = G('[data-ag-search]'); next.focus(); next.setSelectionRange(pos, pos);
    }
    if (el.matches('[data-ag-price]')) el.form.querySelector('[data-ag-profit]').textContent = money((Number(el.value) || 0) - Number(el.dataset.agPrice));
    if (el.matches('[data-ag-app-price],[data-ag-app-cost]')) { const price = Number(el.form.price.value) || 0; el.form.querySelector('[data-ag-profit]').textContent = money(price ? price - (Number(el.form.cost.value) || 0) : 0); }
    if (el.form?.dataset.agForm === 'company' && (el.name === 'primary' || el.name === 'secondary') && /^#[0-9a-f]{6}$/i.test(el.value)) {
      D().company[el.name] = el.value.toLowerCase();
      applyBrandColor(D().company.primary, D().company.secondary);
    }
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
    if (el.form?.dataset.agForm === 'company' && (el.name === 'primary' || el.name === 'secondary') && /^#[0-9a-f]{6}$/i.test(el.value)) {
      D().company[el.name] = el.value.toLowerCase();
      applyBrandColor(D().company.primary, D().company.secondary);
    }
    try {
      if (el.matches('[data-ag-user]')) { if (el.value) localStorage.setItem('go.user', el.value); else localStorage.removeItem('go.user'); location.reload(); }
      if (el.matches('[data-ag-status]')) { A.status = el.value; render(); G('[data-ag-status]').focus(); }
      if (el.matches('[data-ag-category]')) { A.category = el.value; render(); G('[data-ag-category]').focus(); }
      if (el.matches('[data-ag-mkt-origin]')) { A.mktOrigin = el.value; render(); G('[data-ag-mkt-origin]').focus(); }
      if (el.matches('[data-ag-mkt-pick]')) {
        const snap = D().snapshots.find(s => s.id === el.value);
        const existing = M().find(x => x.mine && x.sourceSnapshotId === el.value);
        if (snap && el.form) {
          el.form.title.value = existing?.title || snap.name || '';
          if (existing?.category) el.form.category.value = existing.category;
          el.form.summary.value = existing?.summary || snap.marketplaceSummary || '';
          el.form.description.value = existing?.description || snap.marketplaceDescription || '';
          el.form.tags.value = (existing?.tags || snap.marketplaceTags || []).join(', ');
        }
      }
      if (el.matches('[data-ag-pick]')) { if (el.checked) A.selected.add(el.dataset.agPick); else A.selected.delete(el.dataset.agPick); render(); G(`[data-ag-pick="${el.dataset.agPick}"]`)?.focus(); }
      if (el.matches('[data-ag-all]')) { const ids = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status)).map(a => a.id); ids.forEach(x => el.checked ? A.selected.add(x) : A.selected.delete(x)); render(); G('[data-ag-all]').focus(); }
      if (el.matches('[data-ag-feature]')) {
        const sel = `[data-ag-feature="${el.dataset.agFeature}"][data-field="${el.dataset.field}"][data-account="${el.dataset.account}"]`;
        await act('sub-feature', { id: el.dataset.agFeature, data: { account: el.dataset.account, field: el.dataset.field, value: el.checked } }); render(); G(sel)?.focus(); flash('Configuração salva.');
      }
      if (el.matches('[data-ag-wa-sub]')) {
        const ws = el.dataset.agWaSub, field = el.dataset.field;
        A.wa = await api('/api/whatsapp/agency/subaccount', { workspace: ws, [field]: el.checked });
        render(); G(`[data-ag-wa-sub="${ws}"][data-field="${field}"]`)?.focus(); flash('Configuração do WhatsApp salva.');
      }
      if (el.matches('[data-ag-saas-account]')) { const x = el.dataset.agSaasAccount; await act('saas-account', { id: x, data: { enabled: el.checked } }); render(); G(`[data-ag-saas-account="${x}"]`)?.focus(); flash(el.checked ? 'Subconta no modo SaaS.' : 'Modo SaaS desativado na subconta.'); }
      if (el.matches('[data-ag-idea-status]')) { await act('idea-status', { id: el.dataset.agIdeaStatus, data: { status: el.value } }); render(); flash('Status atualizado.'); }
    } catch (e) { flash(e.message, true); render(); }
  });

  const readImage = file => new Promise((resolve, reject) => {
    if (file.size > 300000) { reject(Error('Selecione uma imagem com menos de 300 KB.')); return; }
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Não foi possível ler a imagem selecionada.')); r.readAsDataURL(file);
  });

  document.addEventListener('submit', async ev => {
    const f = ev.target; if (!f.dataset.agForm || !active()) return;
    ev.preventDefault(); if (f.dataset.pending) return; f.dataset.pending = '1';
    const status = f.querySelector('.form-status'); if (status) status.textContent = '';
    const submit = f.querySelector('button:not([type=button])'); if (submit) submit.disabled = true;
    const name = f.dataset.agForm, id = f.dataset.id, data = formData(f);
    let msg = 'Salvo com sucesso.', keepOpen = false;
    try {
      if (name.startsWith('record:')) { await act('save', { key: name.slice(7), id, data }); msg = id ? 'Alterações salvas.' : 'Criado com sucesso.'; }
      else if (name.startsWith('delete:')) { await act('delete', { key: name.slice(7), id }); msg = 'Excluído com sucesso.'; }
      else switch (name) {
        case 'openai-connect':
        case 'openai-disconnect': {
          const connect = name === 'openai-connect';
          const currentVisit = visit;
          const connection = await api('/api/openai', connect ? { action: 'connect', apiKey: data.apiKey } : { action: 'disconnect' });
          env.onOpenAIChange(connection);
          if (currentVisit !== visit) return;
          A.openAI = connection;
          void sociChat.refreshState();
          msg = connect ? 'Chave da OpenAI conectada.' : 'Chave da OpenAI desconectada.';
          break;
        }
        case 'wa-config': {
          stopWaPoll();
          A.waFocus = null;
          A.wa = await api('/api/whatsapp/agency/config', data);
          msg = 'Servidor UAZAPI salvo. As subcontas já podem conectar por QR Code!';
          break;
        }
        case 'wa-disconnect-server': {
          stopWaPoll();
          A.waFocus = null;
          A.wa = await api('/api/whatsapp/agency/disconnect-server', {});
          msg = 'Servidor UAZAPI próprio removido.';
          break;
        }
        case 'wa-sub-pair': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/connect?workspace=${encodeURIComponent(id)}`, { phone: data.phone });
          A.waFocus = { ...live, workspace: id };
          if (live.status === 'connecting') startWaPoll(id);
          msg = live.paircode ? 'Código de pareamento gerado!' : 'Conexão iniciada.';
          break;
        }
        case 'wa-sub-test': {
          await api(`/api/whatsapp/workspace/test?workspace=${encodeURIComponent(id)}`, { phone: data.phone, text: data.text });
          msg = 'Mensagem de teste enviada pelo WhatsApp.';
          break;
        }
        case 'account': { const newId = await call('accounts', data); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<p><b>${h(data.name)}</b> está pronta para uso.</p><div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'account-meta': await act('account-meta', { id, data }); msg = 'Dados da subconta atualizados.'; break;
        case 'account-reactivate': await act('account-reactivate', { id }); msg = 'Subconta reativada.'; break;
        case 'bulk-status': for (const x of A.selected) { const meta = D().accounts[x]; await act('account-meta', { id: x, data: { ...meta, status: data.status, suspendedReason: data.suspendedReason } }); } A.selected.clear(); msg = 'Status das subcontas atualizado.'; break;
        case 'bulk-snapshot': await call('snapshot-load', { id: data.id, workspaces: [...A.selected], mode: data.mode }); A.selected.clear(); msg = 'Setup carregado com sucesso.'; break;
        case 'prospect-convert': { const newId = await call('prospect-convert', { id, snapshotId: data.snapshotId }); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'snapshot-create': await call('snapshot-create', data); msg = 'Setup criado com sucesso.'; break;
        case 'snapshot-refresh': await call('snapshot-refresh', { id }); msg = 'Setup atualizado com sucesso.'; break;
        case 'snapshot-load': { const loads = await call('snapshot-load', { id, workspaces: data.workspaces, mode: data.mode }); msg = `Carregado em ${loads.length} subconta(s): ${loads.reduce((s, l) => s + l.added, 0)} adicionados, ${loads.reduce((s, l) => s + l.overwritten, 0)} sobrescritos, ${loads.reduce((s, l) => s + l.skipped, 0)} mantidos.`; break; }
        case 'snapshot-rename': await act('snapshot-rename', { id, data }); msg = 'Setup renomeado.'; break;
        case 'snapshot-delete': await act('snapshot-delete', { id }); msg = 'Setup excluído.'; break;
        case 'marketplace-publish': { const r = await call('marketplace-publish', { ...data, listingId: id }); msg = r.updated ? 'Publicação atualizada no marketplace.' : 'Setup publicado no marketplace!'; break; }
        case 'marketplace-unpublish': await call('marketplace-unpublish', { id }); msg = 'Setup retirado do marketplace.'; break;
        case 'resell': await act('resell', { id, data: { price: data.price, enabled: data.enabled } }); msg = 'Configurações de revenda salvas.'; break;
        case 'addon-request': await act('addon-request', { id, data }); msg = 'Solicitação registrada com sucesso.'; break;
        case 'affiliate-accept': await act('affiliate-accept', { data }); msg = 'Boas-vindas ao programa de afiliados!'; break;
        case 'affiliate-payout': await act('affiliate-payout', { data }); msg = 'Dados de pagamento atualizados.'; break;
        case 'template-install': { const r = await call('template-install', { template: id, workspace: data.workspace }); msg = `Instalado em ${accountName(r.workspace)} como funil de rascunho.`; break; }
        case 'idea-comment': await act('idea-comment', { id, data }); msg = 'Comentário adicionado.'; break;
        case 'integration': await act('integration', { id, data: { accounts: data.accounts } }); msg = 'Disponibilidade de integração atualizada.'; break;
        case 'mobile-app': {
          const order = [...f.querySelectorAll('.ag-order li')].map(li => li.dataset.module);
          const visible = data.visible || [];
          const custom = [0, 1, 2, 3, 4].map(k => ({ label: (data[`customLabel${k}`] || '').trim(), url: (data[`customUrl${k}`] || '').trim() })).filter(c => c.label || c.url);
          await act('mobile-app', { data: { appName: data.appName, loginTitle: data.loginTitle, primary: data.primary, accent: data.accent, order, hidden: order.filter(k => !visible.includes(k)), custom } });
          msg = 'Aplicativo móvel salvo.'; break;
        }
        case 'desktop-app': await act('desktop-app', { data }); msg = 'Aplicativo desktop salvo.'; break;
        case 'profile': await act('profile', { data }); msg = 'Perfil atualizado com sucesso.'; break;
        case 'company': {
          const file = f.querySelector('[name=logoFile]').files[0];
          const logoValue = data.removeLogo ? 'remove' : file ? await readImage(file) : undefined;
          const { logoFile: _file, removeLogo: _remove, ...rest } = data;
          await act('company', { data: { ...rest, ...(logoValue === undefined ? {} : { logo: logoValue }) } });
          msg = 'Dados da empresa salvos com sucesso.'; break;
        }
        case 'billing-plan': await act('billing-plan', { data }); msg = 'Plano da agência atualizado.'; break;
        case 'auto-recharge': await act('auto-recharge', { data }); msg = 'Regras de alerta de saldo salvas.'; break;
        case 'wallet': await act('wallet', { data }); msg = 'Lançamento na carteira registrado.'; break;
        case 'system-email': await act('system-email', { id, data }); msg = 'Modelo de e-mail salvo.'; break;
        case 'labs': await act('labs', { data }); msg = 'Recursos experimentais atualizados.'; break;
        case 'compliance': await act('compliance', { data }); msg = 'Configurações de conformidade salvas.'; break;
        case 'api-key': { const r = await act('api-key', { data }); close(); render(); secretBox('Chave de API criada', r.secret); keepOpen = true; msg = ''; break; }
        case 'api-key-delete': await act('api-key-delete', { id }); msg = 'Chave de API revogada.'; break;
        case 'private-integration': { const r = await act('private-integration', { data: { ...data, scopes: data.scopes || [] } }); close(); render(); secretBox('Token de integração privada criado', r.secret); keepOpen = true; msg = ''; break; }
        case 'private-integration-delete': await act('private-integration-delete', { id }); msg = 'Integração privada excluída.'; break;
        case 'saas-rebilling': await act('saas-rebilling', { data }); msg = 'Markups da carteira salvos.'; break;
        case 'email-domain': await act('email-domain', { data }); msg = 'Domínio dedicado adicionado.'; break;
        case 'email-domain-accounts': await act('email-domain-accounts', { data: { accounts: data.accounts } }); msg = 'Subcontas do domínio dedicado salvas.'; break;
        case 'email-domain-remove': await act('email-domain-remove'); msg = 'Domínio dedicado removido.'; break;
        case 'affiliate-pixel': await act('affiliate-pixel', { data }); msg = 'Configurações da página salvas.'; break;
        case 'app-install': await act('app-install', { id, data }); msg = `${appName(id)} instalado.`; break;
        case 'app-uninstall': await act('app-uninstall', { id }); msg = 'App desinstalado.'; break;
        case 'app-resell': await act('app-resell', { id, data }); msg = 'Preço de revenda salvo.'; break;
        default: throw Error('Formulário desconhecido.');
      }
      if (!keepOpen) { close(); render(); }
      if (msg) flash(msg);
    } catch (e) {
      if (status) status.textContent = e.message; else flash(e.message, true);
      delete f.dataset.pending; if (submit) submit.disabled = false;
    }
  });

  const prospecting = createProspecting({data:()=>A.data,accounts,call,render,dialog,close,flash,download});
  const sociChat = createSociChat({
    api,
    flash,
    onOpenOpenAISettings: () => go('settings', 'openai'),
    getHeaders: () => {
      if (A.data?.access?.session) return {};
      try { return { 'X-Go-User': localStorage.getItem('go.user') || '' }; } catch { return {}; }
    }
  });
  return { show, leave, session: () => A.data?.access?.session };
}
