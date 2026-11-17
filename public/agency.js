import { icon as i, logo, brandName, brandColor } from './icons.js';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import { tr } from './i18n.js';
import { createProspecting, prospectRoutes } from './prospecting.js';
import {
  addOns, affiliateRate, agencyPlans, agencyRoles, auditAreas, collections, integrationCatalog, labFeatures, learningTracks,
  mobileModules, resellProducts, snapshotAssets, subAccountModules, systemEmailKeys, templateCatalog
} from './agency-data.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const usd = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v || 0);
const day = (d, time = false) => d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(d)) : '—';
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(tr(text))}</span>`;
const statusTone = { Active: 'green', Paused: 'gold', Closed: 'red', Won: 'green', Lost: 'red', Trial: 'blue', Cancelled: 'red', Requested: 'blue', Withdrawn: '', Planned: 'blue', 'In progress': 'purple', Completed: 'green', Declined: 'red', 'Under review': '' };
const tone = s => statusTone[s] || '';
const initials = s => (s || '').split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'AG';

export const agencyNav = [
  ['ask', 'Pergunte à IA', 'spark'], ['ai-suite', 'Central de IA', 'studio'], ['dashboard', 'Painel da agência', 'grid'], ['prospecting', 'Prospecção', 'search'],
  ['accounts', 'Subcontas', 'users'], ['snapshots', 'Snapshots de contas', 'box'], ['reselling', 'Revenda', 'tag'], ['addons', 'Complementos', 'gift'],
  ['affiliate', 'Portal de afiliados', 'link'], ['templates', 'Biblioteca de templates', 'site'], ['partners', 'Parceiros', 'award'], ['university', 'Universidade', 'book'],
  ['saas-education', 'Educação SaaS', 'chart'], ['ideas', 'Ideias e sugestões', 'bulb'], ['mobile-app', 'Aplicativo móvel', 'mobile'], ['desktop-app', 'Aplicativo desktop', 'monitor'],
  ['marketplace', 'Marketplace de apps', 'apps'], ['settings', 'Configurações', 'gear']
];
const subTabs = {
  prospecting: prospectRoutes,
  snapshots: [['mine', 'Meus snapshots'], ['imported', 'Snapshots importados'], ['shared', 'Snapshots compartilhados'], ['history', 'Histórico de cargas']],
  reselling: [['subscription', 'Assinatura'], ['plans', 'Planos SaaS'], ['usage', 'Uso']],
  affiliate: [['dashboard', 'Painel'], ['reports', 'Relatórios de indicações'], ['payment', 'Dados de pagamento'], ['history', 'Histórico de pagamentos']],
  templates: [['all', 'Todos os templates'], ['mine', 'Meus templates'], ['installs', 'Instalações']],
  ideas: [['all', 'Todas'], ['Under review', 'Em análise'], ['Planned', 'Planejadas'], ['In progress', 'Em andamento'], ['Completed', 'Concluídas']],
  settings: [['profile', 'Meu perfil'], ['company', 'Empresa e marca'], ['users', 'Equipe'], ['billing', 'Faturamento e carteira'], ['menu-links', 'Links de menu'], ['api-keys', 'Chaves de API'],
    ['announcements', 'Comunicados'], ['emails', 'E-mails do sistema'], ['labs', 'Recursos experimentais'], ['compliance', 'Conformidade'], ['audit', 'Logs de auditoria'], ['storage', 'Armazenamento de mídia']]
};

export function startAgency(env) {
  const { app, overlay, api, flash, openWorkspace } = env;
  const A = { data: null, page: 'dashboard', sub: '', query: '', status: '', category: '', selected: new Set(), chat: [], auditPage: 0, navOpen: true };
  const G = s => document.querySelector(s);
  const D = () => A.data.agency;
  const O = () => A.data.overview;
  const accounts = () => O().accounts;
  const accountName = id => accounts().find(a => a.id === id)?.name || 'Subconta removida';
  const go = (page, sub = '') => { const next = `#agency/${page}${sub ? `/${sub}` : ''}`; if (location.hash === next) render(); else location.hash = next; };

  async function load() { A.data = await api('/api/agency'); }
  async function call(op, body) { const d = await api(`/api/agency/${op}`, body); A.data = d; return d.result; }
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
  const bar = (pct, cls = '') => `<span class="ag-bar ${cls}"><span data-w="${Math.max(0, Math.min(100, Math.round(pct)))}"></span></span>`;

  function shell(content) {
    const company = D().company;
    const users = D().users;
    const acting = localStorage.getItem('go.user') || '';
    const item = ([key, label, ico]) => ({ href: `#agency/${key}`, label, icon: ico, current: A.page === key });
    const currentPageLabel = agencyNav.find(n => n[0] === A.page)?.[1] || 'Painel da agência';
    return `<div class="shell ${A.navOpen ? 'wide' : ''} ag-shell">${sidebar({
      label: 'Navegação da agência',
      home: '#agency/dashboard',
      brand: brandName(company.brand),
      mark: company.logo ? `<img class="ag-logo" src="${h(company.logo)}" alt="">` : logo,
      account: { name: company.name || 'Minha Agência', caption: 'Agência · ir para subconta', attr: 'data-ag="switch-account"', tip: 'Trocar para uma subconta' },
      toggle: 'data-ag="nav"',
      open: A.navOpen,
      groups: [
        { title: 'Visão geral', items: agencyNav.slice(0, 4).map(item) },
        { title: 'Revenda', items: agencyNav.slice(4, 11).map(item) },
        { title: 'Aprender e apps', items: agencyNav.slice(11, -1).map(item) },
        { title: 'Atalhos', items: D().menuLinks.filter(l => l.showOn !== 'Sub-accounts').map(l => ({ href: l.url, label: l.title, icon: l.icon, external: true })) }
      ],
      footer: [item(agencyNav.at(-1))]
    })}
    <div class="workspace">${topbar({
      crumbs: [
        { label: company.name || 'Agência', href: '#agency/dashboard' },
        { label: currentPageLabel }
      ],
      search: 'data-act="search"',
      quick: 'data-act="agency-quick"',
      extra: `<div class="ag-acting">${i('users', 15)}<label class="sr-only" for="ag-user-select">Agindo como</label><select id="ag-user-select" data-ag-user aria-label="Agindo como"><option value="">${h(D().profile.name)} (Dono da agência)</option>${users.map(u => `<option value="${u.id}" ${u.id === acting ? 'selected' : ''}>${h(`${u.first} ${u.last}`)} (${h(tr(u.role))})</option>`).join('')}</select></div>`,
      tools: [
        { icon: 'lang', label: 'Idioma', attr: 'data-act="language"' },
        { icon: 'phone', label: 'Discador', attr: 'data-act="dialer"' },
        { icon: 'meg', label: 'Novidades', attr: 'data-act="updates"', dot: true },
        { icon: 'bell', label: 'Notificações', attr: 'data-act="notifications"' },
        { icon: 'help', label: 'Ajuda', attr: 'data-act="help"' }
      ],
      profile: {
        text: initials(company.name || D().profile.name || 'AG'),
        label: 'Configurações da agência',
        attr: 'data-ag="go-profile"'
      }
    })}<main id="screen" class="screen">${content}</main></div></div>`;
  }

  // ---- Pages -------------------------------------------------------------
  const pages = {};

  pages.ask = () => {
    const prompts = [
      'Qual é a nossa receita recorrente mensal (MRR)?',
      'Qual subconta tem mais contatos cadastrados?',
      'Quais subcontas ainda não realizaram login?',
      'Quais são os próximos passos recomendados para a agência?'
    ];
    return `<div class="page ag-ask">${head('Pergunte à IA', 'Obtenha respostas com base nos dados e registros desta agência.')}
      <div class="surface padded ag-chat">${A.chat.length ? A.chat.map(m => `<div class="${m.me ? 'user-msg' : 'ai-msg'}">${h(m.text)}</div>`).join('') : `<div class="ag-prompts">${prompts.map(p => btn(p, 'ask', `data-q="${h(p)}"`)).join('')}</div>`}</div>
      <form class="ag-ask-form" data-ag-form="ask"><input name="q" required maxlength="500" placeholder="Pergunte sobre subcontas, receita, snapshots, equipe…" aria-label="Pergunta"><button class="primary">Perguntar</button></form></div>`;
  };

  function answer(q) {
    const t = O().totals, list = accounts();
    q = q.toLowerCase();
    if (/receita|mrr|revenue|money|plano|faturamento/.test(q)) return `A receita recorrente mensal (MRR) dos planos SaaS é de ${usd(t.mrr)} em ${t.active} subcontas ativas. ${D().plans.length ? '' : 'Nenhum plano SaaS foi criado ainda: crie um em Revenda → Planos SaaS.'}`;
    if (/contato|contatos|contact|biggest|most|maior/.test(q)) { const top = [...list].sort((a, b) => b.contacts - a.contacts)[0]; return top ? `${top.name} tem o maior número de contatos (${top.contacts}). A agência possui ${t.contacts} contatos no total.` : 'Ainda não há subcontas cadastradas.'; }
    if (/login|inativo|acesso|logged/.test(q)) { const idle = list.filter(a => !a.lastLogin); return idle.length ? `${idle.length} subconta(s) ainda não registraram login: ${idle.map(a => a.name).join(', ')}.` : 'Todas as subcontas registraram login recentemente.'; }
    if (/snapshot/.test(q)) return `${D().snapshots.length} snapshot(s) salvos, carregados ${D().snapshotLoads.length} vez(es) nas subcontas.`;
    const next = [!D().company.domain && 'configurar um domínio White Label em Configurações → Empresa', !D().snapshots.length && 'criar um snapshot a partir da sua melhor subconta', !D().plans.length && 'definir planos SaaS para cobrança recorrente', !D().users.length && 'convidar sua equipe em Configurações → Equipe'].filter(Boolean);
    return next.length ? `Próximos passos recomendados: ${next.join('; ')}.` : 'A configuração da sua agência cobre identidade visual, snapshots, planos e equipe. Acompanhe a atividade no Painel da agência.';
  }

  pages['ai-suite'] = () => {
    const ai = D().reselling['ai-employee'];
    const enabled = accounts().filter(a => !ai.disabled.includes(a.id));
    const tools = [
      ['Funcionário de IA', 'Uso ilimitado de recursos de IA para as subcontas assinantes.', `${enabled.length} de ${accounts().length} subcontas podem contratar por ${usd(ai.price)}/mês`, 'reselling'],
      ['AI Studio', 'Gere e edite protótipos de páginas e sites dentro de cada subconta.', 'Disponível em todas as subcontas', ''],
      ['Agentes de IA', 'Perfis de agentes inteligentes treinados por função para automatizar respostas.', 'Disponível em todas as subcontas', ''],
      ['Pergunte à IA', 'Assistente executivo com respostas baseadas nos registros da agência.', 'Nível da agência', 'ask']
    ];
    return `<div class="page">${head('Central de IA', 'Ferramentas de Inteligência Artificial para potencializar sua agência e seus clientes.')}<div class="card-grid">${tools.map(([name, text, state, page]) => `<article class="surface padded resource"><span class="metric-icon">${i('spark')}</span><div><h2>${h(name)}</h2><p>${h(text)}</p></div>${badge(state, 'blue')}${page ? `<a class="text-link" href="#agency/${page}">Abrir ${i('arrow', 15)}</a>` : btn('Abrir em uma subconta', 'switch-account')}</article>`).join('')}</div></div>`;
  };

  pages.dashboard = () => {
    const t = O().totals, growth = O().growth, max = Math.max(1, ...growth.map(g => g.total));
    const top = [...accounts()].sort((a, b) => b.contacts - a.contacts).slice(0, 8);
    return `<div class="page">${head('Painel da agência', `Boas-vindas, ${D().profile.first}. Métricas consolidadas das suas subcontas e registros da agência.`, primary('Criar subconta', 'new-account'))}
      ${D().stripe.connected ? '' : `<div class="surface padded ag-notice">${i('pay', 20)}<div><b>Os KPIs de faturamento usam registros locais</b><p>A receita dos planos é calculada a partir do plano SaaS atribuído a cada subconta. Uma conexão com o Stripe é necessária para processar pagamentos reais.</p></div><a class="secondary" href="#agency/marketplace">Ver integrações</a></div>`}
      <div class="metrics">${metric('Receita recorrente mensal (MRR)', usd(t.mrr), 'Dos planos SaaS de contas ativas')}${metric('Subcontas ativas', `${t.active} <small>/ ${t.accounts}</small>`, `${t.paused} pausada(s) · ${t.closed} encerrada(s)`)}${metric('Novas neste mês', t.newThisMonth)}${metric('Tabela de revenda', usd(t.resale), `${usd(t.resaleProfit)} de margem potencial se todas assinarem`)}</div>
      <div class="metrics">${metric('Contatos', t.contacts)}${metric('Oportunidades abertas', t.open)}${metric('Execuções de automação', t.runs)}${metric('Saldo da carteira', usd(t.wallet))}</div>
      <div class="ag-two"><section class="surface padded"><h2>Crescimento de subcontas</h2><p class="dim">Total de subcontas acumuladas no final de cada mês</p><div class="ag-chart">${growth.map(g => `<div class="ag-col"><b>${g.total}</b><span class="ag-colbar"><span data-h="${(g.total / max) * 100}"></span></span><small>${h(g.month.slice(5))}/${h(g.month.slice(2, 4))}</small></div>`).join('')}</div></section>
      <section class="surface padded"><h2>Configuração da agência</h2>${[['Identidade da marca', D().company.domain || D().company.logo, 'settings/company'], ['Primeiro snapshot', D().snapshots.length, 'snapshots'], ['Planos SaaS', D().plans.length, 'reselling/plans'], ['Membros da equipe', D().users.length, 'settings/users'], ['Programa de afiliados', D().affiliate.accepted, 'affiliate']].map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Concluído', 'green') : badge('Pendente')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section></div>
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
    const plans = Object.fromEntries(D().plans.map(p => [p.id, p.name]));
    return `<div class="page">${head('Subcontas', `${accounts().length} subconta(s) cadastradas`, primary('Criar subconta', 'new-account'))}
      <div class="toolbar">${search('Buscar subcontas…')}<select data-ag-status aria-label="Filtrar por status"><option value="">Todos os status</option>${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${A.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-ag-all ${list.length && list.every(a => A.selected.has(a.id)) ? 'checked' : ''}> Selecionar todas</label>
      ${A.selected.size ? `<span class="badge blue">${A.selected.size} selecionada(s)</span>${btn('Alterar status', 'bulk-status')}${btn('Carregar snapshot', 'bulk-snapshot')}` : ''}</div>
      <div class="ag-accounts">${list.map(a => `<article class="surface padded ag-account"><label class="check ag-pick"><input type="checkbox" data-ag-pick="${a.id}" ${A.selected.has(a.id) ? 'checked' : ''} aria-label="Selecionar ${h(a.name)}"></label>
        <div class="ag-account-main"><h2>${h(a.name)}</h2><div class="inline-gap">${badge(a.status, tone(a.status))}${a.plan ? badge(a.plan, 'blue') : ''}</div><p class="dim">${h(a.address || 'Sem endereço')} · ${h(a.phone || 'Sem telefone')}</p></div>
        <dl class="ag-facts"><div><dt>Criada em</dt><dd>${day(a.created)}</dd></div><div><dt>Último acesso</dt><dd>${a.lastLogin ? day(a.lastLogin, true) : 'N/A'}</dd></div><div><dt>Contatos</dt><dd>${a.contacts}</dd></div><div><dt>Negócios abertos</dt><dd>${a.open}</dd></div></dl>
        <div class="inline-gap">${btn('Acessar subconta', 'open-account', `data-id="${a.id}"`, 'primary')}${btn('Editar', 'edit-account', `data-id="${a.id}"`)}</div></article>`).join('') || empty('Nenhuma subconta encontrada', 'Tente outros termos de busca ou limpe os filtros.')}</div>
      ${D().plans.length ? '' : `<p class="dim ag-hint">Dica: crie planos SaaS na aba Revenda para atribuir um plano e precificação a cada subconta.</p>`}</div>`;
  };

  function accountForm(preset = {}) {
    const snaps = D().snapshots;
    return `<div class="field-grid"><label>Nome da empresa<input name="name" required maxlength="70" value="${h(preset.name || '')}"></label><label>E-mail<input name="email" type="email" value="${h(preset.email || '')}"></label>
      <label>Telefone<input name="phone" type="tel" value="${h(preset.phone || '')}"></label><label>Endereço<input name="address" value="${h(preset.address || '')}"></label>
      <label>Fuso horário<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Moeda<select name="currency">${['BRL', 'USD', 'EUR', 'GBP'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Snapshot inicial<select name="snapshotId"><option value="">Começar em branco</option>${snaps.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>
      <label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}">${h(p.name)} · ${usd(p.price)}/mês</option>`).join('')}</select></label></div>`;
  }

  const assetSummary = counts => Object.entries(counts || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${snapshotAssets.find(a => a[0] === k)?.[1].toLowerCase() || k}`).join(' · ') || 'Sem recursos';

  pages.snapshots = () => {
    const sub = A.sub || 'mine';
    const list = D().snapshots.filter(s => sub === 'shared' ? s.shared : s.kind === sub);
    const actions = `${btn('Importar snapshot', 'snapshot-import', '', 'secondary', 'download')}${primary('Criar snapshot', 'snapshot-create')}`;
    if (sub === 'history') return `<div class="page">${head('Snapshots de contas', 'Histórico de snapshots carregados nas subcontas.', actions)}${tabs('snapshots')}${table(['Snapshot', 'Subconta', 'Modo', 'Adicionados', 'Sobrescritos', 'Ignorados', 'Carregado em'], [...D().snapshotLoads].reverse().map(l => `<tr><td><b>${h(l.snapshot)}</b></td><td>${h(l.account)}</td><td>${l.mode === 'overwrite' ? 'Sobrescrever' : 'Manter existentes'}</td><td>${l.added}</td><td>${l.overwritten}</td><td>${l.skipped}</td><td>${day(l.at, true)}</td></tr>`), empty('Nenhum carregamento registrado', 'Ao carregar um snapshot em uma subconta, o histórico aparecerá aqui.'))}</div>`;
    return `<div class="page">${head('Snapshots de contas', 'Crie modelos pré-configurados e replique estruturas prontas entre clientes.', actions)}${tabs('snapshots')}
      ${list.length ? table(['Snapshot', 'Origem', 'Recursos inclusos', 'Versão', 'Atualizado em', ''], list.map(s => `<tr><td><b>${h(s.name)}</b>${s.shared ? `<br><small class="dim">Código de compartilhamento: ${h(s.shareCode)}</small>` : ''}</td><td>${s.kind === 'mine' ? h(accountName(s.workspace)) : 'Importado'}</td><td><small>${h(assetSummary(s.counts))}</small></td><td>v${s.version || 1}</td><td>${day(s.updated, true)}</td>
        <td class="right inline-gap">${btn('Carregar', 'snapshot-load', `data-id="${s.id}"`, 'primary')}${s.kind === 'mine' ? btn('Atualizar', 'snapshot-refresh', `data-id="${s.id}"`) : ''}${btn(s.shared ? 'Código' : 'Compartilhar', 'snapshot-share', `data-id="${s.id}"`)}${btn('Renomear', 'snapshot-rename', `data-id="${s.id}"`)}<button class="icon-btn" data-ag="snapshot-delete" data-id="${s.id}" aria-label="Excluir ${h(s.name)}">${i('trash', 16)}</button></td></tr>`), '')
        : `<div class="surface padded ag-explain"><h2>Para que servem os snapshots</h2><ul><li><b>Reutilização:</b> empacote pipelines, automações, formulários, páginas e snippets da sua melhor subconta.</li><li><b>Consistência:</b> carregue o mesmo setup estruturado em cada novo cliente.</li><li><b>Seletivo:</b> escolha exatamente quais tipos de recursos deseja incluir.</li><li><b>Segurança:</b> atualize um snapshot antes de grandes mudanças para manter cópias de segurança.</li></ul>${sub === 'mine' ? primary('Criar snapshot', 'snapshot-create') : sub === 'imported' ? btn('Importar com código', 'snapshot-import') : '<p class="dim">Compartilhe um dos seus snapshots para vê-lo aqui.</p>'}</div>`}</div>`;
  };

  pages.reselling = () => {
    const sub = A.sub || 'subscription';
    const r = D().reselling;
    const head1 = head('Revenda', 'Configure preços de revenda de produtos e controle quais subcontas podem adquiri-los.');
    if (sub === 'plans') return `<div class="page">${head1}${tabs('reselling')}<div class="page-head"><h2>Planos SaaS</h2>${primary('Novo plano', 'new-record', 'data-key="plans"')}</div>
      ${table(['Plano', 'Preço', 'Período de teste', 'Recursos inclusos', 'Subcontas assinantes', ''], D().plans.map(p => `<tr><td><b>${h(p.name)}</b></td><td>${usd(p.price)}/mês</td><td>${p.trialDays ? `${p.trialDays} dias` : '—'}</td><td><small>${h((p.features || '').split('\n').filter(Boolean).join(' · ') || '—')}</small></td><td>${accounts().filter(a => a.plan === p.name).length}</td><td class="right">${btn('Editar', 'edit-record', `data-key="plans" data-id="${p.id}"`)}</td></tr>`), empty('Nenhum plano SaaS cadastrado', 'Os planos definem o valor mensal utilizado no cálculo de receita recorrente.'))}
      <h2 class="section-heading">Plano por subconta</h2>${table(['Subconta', 'Status', 'Plano', ''], accounts().map(a => `<tr><td>${h(a.name)}</td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td class="right">${btn('Alterar', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), '')}</div>`;
    if (sub === 'usage') return `<div class="page">${head1}${tabs('reselling')}${table(['Subconta', 'Produtos habilitados', 'Total da tabela', 'Plano atual'], accounts().map(a => { const list = resellProducts.filter(p => a.resold.includes(p.key)); return `<tr><td><b>${h(a.name)}</b></td><td>${list.length} / ${resellProducts.length}</td><td>${usd(list.reduce((s, p) => s + r[p.key].price, 0))}/mês</td><td>${h(a.plan || '—')}</td></tr>`; }), '')}</div>`;
    return `<div class="page">${head1}${tabs('reselling')}<div class="ag-products">${resellProducts.map(p => {
      const cfg = r[p.key], enabled = accounts().filter(a => !cfg.disabled.includes(a.id));
      return `<form class="surface padded ag-product" data-ag-form="resell" data-id="${p.key}"><div class="ag-product-head"><div><h2>${h(tr(p.name))}</h2><p class="dim">${h(p.text)}</p></div>${badge(p.kind)}</div>
        <div class="ag-price"><div><small>Seu custo base</small><b>${usd(p.base)}</b></div><label><small>Preço cobrado do cliente / mês</small><input name="price" type="number" min="${p.base}" step="0.01" value="${cfg.price}" data-ag-price="${p.base}"></label><div><small>Sua margem de lucro</small><b data-ag-profit>${usd(cfg.price - p.base)}</b></div></div>
        <details><summary>Acesso por subconta · habilitadas: ${enabled.length} · desabilitadas: ${accounts().length - enabled.length}</summary><div class="ag-checks">${accounts().map(a => `<label class="check"><input type="checkbox" name="enabled" value="${a.id}" ${cfg.disabled.includes(a.id) ? '' : 'checked'}> ${h(a.name)}</label>`).join('')}</div></details>
        <button class="primary">Salvar alterações</button><p class="form-status" role="alert"></p></form>`;
    }).join('')}</div></div>`;
  };

  pages.addons = () => {
    const requests = D().addonRequests;
    const open = key => requests.find(r => r.addon === key && r.status === 'Requested');
    const groups = [...new Set(addOns.map(a => a.group))];
    return `<div class="page">${head('Complementos', 'Recursos avançados para sua marca, conformidade e suporte executivo. As solicitações são registradas localmente.')}
      ${groups.map(g => `<h2 class="section-heading">${h(tr(g))}</h2><div class="card-grid">${addOns.filter(a => a.group === g).map(a => `<article class="surface padded resource"><div><h2>${h(a.name)}</h2><p class="ag-big">${usd(a.price)}<small>${h(a.period === '/mo' ? '/mês' : a.period)}</small></p></div><ul class="ag-list">${a.points.map(p => `<li>${h(p)}</li>`).join('')}</ul>${open(a.key) ? `${badge('Solicitado', 'blue')}${btn('Retirar solicitação', 'addon-cancel', `data-id="${open(a.key).id}"`)}` : btn('Solicitar complemento', 'addon-request', `data-id="${a.key}"`, 'primary')}</article>`).join('')}</div>`).join('')}
      <h2 class="section-heading">Solicitações registradas</h2>${table(['Complemento', 'Status', 'Observação', 'Data do pedido'], [...requests].reverse().map(r => `<tr><td>${h(addOns.find(a => a.key === r.addon)?.name)}</td><td>${badge(r.status, tone(r.status))}</td><td>${h(r.note || '—')}</td><td>${day(r.created, true)}</td></tr>`), empty('Nenhuma solicitação', 'Os complementos solicitados pela sua agência aparecerão aqui.'))}</div>`;
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
    if (sub === 'reports') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Indicações</h2>${primary('Adicionar indicação', 'new-record', 'data-key="referrals"')}</div>${table(['Empresa', 'Plano', 'Valor da assinatura', 'Comissão mensal', 'Status', 'Pago', ''], refs.filter(r => match(r.name, r.email)).map(r => `<tr><td><b>${h(r.name)}</b><br><small class="dim">${h(r.email)}</small></td><td>${h(r.plan)}</td><td>${usd(r.amount)}</td><td>${usd(r.amount * affiliateRate)}</td><td>${badge(r.status, tone(r.status))}</td><td>${r.paid ? badge('Pago', 'green') : '—'}</td><td class="right">${btn('Editar', 'edit-record', `data-key="referrals" data-id="${r.id}"`)}</td></tr>`), empty('Nenhuma indicação cadastrada', 'Adicione as empresas que se registraram utilizando seu link.'))}</div>`;
    if (sub === 'payment') return `<div class="page">${pageHead}${tabs('affiliate')}<form class="surface padded settings-form" data-ag-form="affiliate-payout"><h2>Dados de pagamento</h2><div class="field-grid"><label>Método de recebimento<select name="method">${['Transferência bancária', 'PayPal', 'Wise', 'Pix'].map(m => `<option ${aff.payout.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>E-mail ou chave de recebimento<input name="email" type="email" value="${h(aff.payout.email)}"></label></div><button class="primary">Salvar dados</button><p class="form-status" role="alert"></p></form></div>`;
    if (sub === 'history') return `<div class="page">${pageHead}${tabs('affiliate')}<div class="page-head"><h2>Histórico de pagamentos</h2>${btn('Registrar pagamento de comissões', 'affiliate-pay', '', 'primary')}</div>${table(['Data', 'Valor', 'Indicações', 'Método'], [...aff.payments].reverse().map(p => `<tr><td>${day(p.at, true)}</td><td>${usd(p.amount)}</td><td>${p.referrals.length}</td><td>${h(p.method)}</td></tr>`), empty('Nenhum pagamento registrado', 'Os pagamentos de comissões registrados aparecerão aqui.'))}</div>`;
    return `<div class="page">${pageHead}${tabs('affiliate')}<div class="metrics">${metric('Indicações ativas', active.length)}${metric('Comissão mensal', usd(active.reduce((s, r) => s + r.amount * affiliateRate, 0)))}${metric('Comissão a receber', usd(O().totals.affiliateDue))}${metric('Total pago até hoje', usd(paid))}</div>
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
  pages['saas-education'] = learning('saas', 'Educação SaaS', 'Como transformar sua agência em um software próprio (White Label) com receita recorrente previsível.');

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
    const d = D().desktopApp;
    return `<div class="page">${head('Aplicativo desktop', 'Personalize o aplicativo desktop para download pela sua equipe e clientes.')}<div class="ag-builder"><form class="surface padded settings-form" data-ag-form="desktop-app"><div class="field-grid"><label>Nome do app<input name="appName" required maxlength="40" value="${h(d.appName)}"></label><label>Domínio do app<input name="domain" placeholder="app.suaagencia.com.br" value="${h(d.domain)}"></label><label>Cor primária<input name="primary" type="color" value="${h(d.primary)}"></label></div><button class="primary">Salvar aplicativo desktop</button><p class="form-status" role="alert"></p></form>
      <div class="ag-window"><div class="ag-window-bar" data-bg="${h(d.primary)}"><span></span><span></span><span></span><b data-preview="appName">${h(d.appName)}</b></div><div class="ag-window-body"><p class="dim">${h(d.domain || 'app.suaagencia.com.br')}</p><p>As compilações oficiais para Windows e macOS exigem certificados de assinatura de código e servidor de atualizações.</p></div></div></div></div>`;
  };

  pages.marketplace = () => `<div class="page">${head('Marketplace de apps', 'Habilite integrações externas disponíveis para as subcontas conectarem seus próprios serviços.')}<div class="toolbar">${search('Buscar apps e integrações…')}</div>
    <div class="card-grid">${integrationCatalog.filter(x => match(x[1], x[3], x[4])).map(([key, name, ico, cat, text]) => { const n = D().integrations[key]?.accounts.length || 0; return `<article class="surface padded resource"><span class="metric-icon">${i(ico)}</span><div><h2>${h(name)}</h2><p>${h(text)}</p></div><div class="inline-gap">${badge(cat)}${badge(n ? `Disponível para ${n}` : 'Não oferecido', n ? 'blue' : '')}</div>${btn('Gerenciar disponibilidade', 'integration', `data-id="${key}"`)}</article>`; }).join('')}</div></div>`;

  // ---- Settings ----------------------------------------------------------
  const settingsPages = {
    profile: () => { const p = D().profile; return `<form class="surface padded settings-form" data-ag-form="profile"><h2>Dados pessoais</h2><div class="field-grid"><label>Nome<input name="first" required value="${h(p.first)}"></label><label>Sobrenome<input name="last" required value="${h(p.last)}"></label><label>E-mail<input name="email" type="email" value="${h(p.email)}"></label><label>Telefone<input name="phone" type="tel" value="${h(p.phone)}"></label><label>Idioma da plataforma<select name="language">${['Português (Brasil)', 'English (United States)', 'Español'].map(l => `<option ${p.language === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><button class="primary">Salvar perfil</button><p class="form-status" role="alert"></p></form>`; },
    company: () => { const c = D().company; return `<form class="surface padded settings-form" data-ag-form="company"><h2>Empresa e White Label</h2><div class="field-grid"><label>Nome da empresa<input name="name" required value="${h(c.name)}"></label><label>Nome da marca (exibido na interface)<input name="brand" required maxlength="60" value="${h(c.brand)}"></label><label>Domínio White Label<input name="domain" placeholder="app.suaagencia.com.br" value="${h(c.domain)}"></label><label>Site institucional<input name="website" type="url" value="${h(c.website)}"></label><label>Telefone<input name="phone" type="tel" value="${h(c.phone)}"></label><label>Endereço comercial<input name="address" value="${h(c.address)}"></label><label>Cor primária da marca<input name="primary" type="color" value="${h(c.primary)}"></label><label>Fuso horário padrão<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option ${c.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label><label>Moeda padrão<select name="currency">${['BRL', 'USD', 'EUR', 'GBP'].map(z => `<option ${c.currency === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <label>Logotipo da agência (PNG, JPEG, WebP; até 300 KB)<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif"></label></div>${c.logo ? `<div class="inline-gap"><img class="ag-logo-preview" src="${h(c.logo)}" alt="Logo atual"><label class="check"><input type="checkbox" name="removeLogo"> Remover logo</label></div>` : ''}<p class="dim">O nome da marca, as cores e o logo são aplicados na visão da agência e em todas as subcontas vinculadas.</p><button class="primary">Salvar dados da empresa</button><p class="form-status" role="alert"></p></form>`; },
    users: () => `<div class="page-head"><div><h2>Membros da equipe</h2><p class="dim">Selecione "Agir como" para navegar e testar a plataforma com as permissões daquele usuário.</p></div>${primary('Adicionar usuário', 'new-record', 'data-key="users"')}</div>${table(['Nome', 'Função', 'Acesso', 'Permissões de módulos', ''], D().users.map(u => `<tr><td><b>${h(`${u.first} ${u.last}`)}</b><br><small class="dim">${h(u.email)}</small></td><td>${badge(u.role, u.role.startsWith('Agency') ? 'purple' : 'blue')}</td><td><small>${u.role.startsWith('Agency') ? 'Todas as subcontas' : h(u.accounts.map(accountName).join(', ') || 'Nenhuma subconta')}</small></td><td><small>${u.permissions.length ? `${u.permissions.length} módulos permitidos` : 'Todos os módulos'}</small></td><td class="right inline-gap">${btn('Agir como', 'act-as', `data-id="${u.id}"`)}${btn('Editar', 'edit-record', `data-key="users" data-id="${u.id}"`)}</td></tr>`), empty('Nenhum membro cadastrado', 'Adicione usuários e defina permissões específicas por subconta e módulo.'))}`,
    billing: () => { const b = D().billing; const wallet = O().totals.wallet; return `<div class="ag-two"><form class="surface padded settings-form" data-ag-form="billing-plan"><h2>Plano da agência</h2><p class="dim">O plano é gravado localmente para cálculo de recursos; a alteração não gera cobrança automática no cartão.</p><div class="ag-plans">${agencyPlans.map(([name, price]) => `<label class="choice"><input type="radio" name="plan" value="${name}" ${b.plan === name ? 'checked' : ''}><strong>${name}</strong><span>${usd(price)}/mês</span></label>`).join('')}</div><button class="primary">Alterar plano</button><p class="form-status" role="alert"></p></form>
      <form class="surface padded settings-form" data-ag-form="auto-recharge"><h2>Saldo da carteira</h2><p class="ag-big">${usd(wallet)}</p><label class="check"><input type="checkbox" name="enabled" ${b.autoRecharge.enabled ? 'checked' : ''}> Notificar quando o saldo estiver baixo</label><div class="field-grid"><label>Saldo mínimo de alerta<input name="threshold" type="number" min="0" step="0.01" value="${b.autoRecharge.threshold}"></label><label>Valor sugerido de recarga<input name="amount" type="number" min="0" step="0.01" value="${b.autoRecharge.amount}"></label></div><div class="inline-gap"><button class="primary">Salvar regras</button>${btn('Registrar lançamento', 'wallet')}</div><p class="form-status" role="alert"></p></form></div>
      ${b.autoRecharge.enabled && wallet < b.autoRecharge.threshold ? `<p class="surface padded ag-warn">O saldo da carteira está abaixo de ${usd(b.autoRecharge.threshold)}. Registre uma recarga de ${usd(b.autoRecharge.amount)}.</p>` : ''}
      <h2 class="section-heading">Histórico de transações da carteira</h2>${table(['Data', 'Tipo', 'Valor', 'Observação'], [...b.wallet].reverse().map(w => `<tr><td>${day(w.at, true)}</td><td>${badge(w.kind === 'Credit' ? 'Crédito' : 'Débito', w.kind === 'Credit' ? 'green' : 'orange')}</td><td>${usd(w.amount)}</td><td>${h(w.note || '—')}</td></tr>`), empty('Nenhuma transação', 'Lance créditos e débitos para acompanhar o saldo da carteira da agência.'))}`; },
    'menu-links': () => `<div class="page-head"><div><h2>Links personalizados do menu</h2><p class="dim">Estes links aparecem na barra lateral das subcontas ou da própria agência.</p></div>${primary('Adicionar link', 'new-record', 'data-key="menuLinks"')}</div>${table(['Título', 'URL', 'Exibição', 'Subcontas com acesso', ''], D().menuLinks.map(l => `<tr><td>${i(l.icon, 15)} <b>${h(l.title)}</b></td><td><small>${h(l.url)}</small></td><td>${h(tr(l.showOn))} · ${h(tr(l.openIn))}</td><td><small>${l.accounts.length ? h(l.accounts.map(accountName).join(', ')) : 'Todas'}</small></td><td class="right">${btn('Editar', 'edit-record', `data-key="menuLinks" data-id="${l.id}"`)}</td></tr>`), empty('Nenhum link personalizado', 'Adicione atalhos para sistemas ou ferramentas externas utilizadas pelos clientes.'))}`,
    'api-keys': () => `<div class="page-head"><div><h2>Chaves de API da agência</h2><p class="dim">Chaves de API concedem acesso programático de leitura a subcontas e contatos via <code>/api/v1</code>. O token é exibido apenas uma vez.</p></div>${primary('Criar chave', 'api-key')}</div>
      ${table(['Nome', 'Chave (final)', 'Criada em', 'Último uso', ''], D().apiKeys.map(k => `<tr><td><b>${h(k.name)}</b></td><td><code>go_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Revogar', 'api-key-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma chave de API', 'Crie chaves de API para automatizar fluxos via scripts ou integrações.'))}
      <div class="page-head ag-gap"><div><h2>Integrações privadas</h2><p class="dim">Tokens com escopos estritamente delimitados.</p></div>${primary('Criar integração', 'private-integration')}</div>
      ${table(['Nome', 'Escopos autorizados', 'Token', 'Último uso', ''], D().privateIntegrations.map(k => `<tr><td><b>${h(k.name)}</b><br><small class="dim">${h(k.description)}</small></td><td><small>${h(k.scopes.join(', '))}</small></td><td><code>pit_…${h(k.last4)}</code></td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Excluir', 'private-integration-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma integração privada', 'Crie uma integração privada para scripts que exigem apenas permissões pontuais.'))}
      <div class="surface padded ag-gap"><h2>Endpoints disponíveis</h2><pre class="ag-code">GET  ${h(location.origin)}/api/v1/subaccounts
GET  ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
POST ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
Authorization: Bearer &lt;sua-chave&gt;</pre></div>`,
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
    const prev = document.querySelector('#screen')?.scrollTop || 0;
    const page = pages[A.page] || pages.dashboard;
    document.title = 'graao';
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
      app.innerHTML = `<div class="boot"><h1>Visão da agência indisponível</h1><p>${h(e.message)}</p><button class="primary" data-ag="reset-user">Acessar como dono da agência</button> <a href="#ask-ai">Voltar para o workspace</a></div>`;
    }
  }

  // ---- Events -------------------------------------------------------------
  const active = () => location.hash.startsWith('#agency');
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const pickAccounts = (name = 'workspaces', chosen = []) => `<fieldset class="ag-checks"><legend>Subcontas selecionadas</legend>${accounts().map(a => `<label class="check"><input type="checkbox" name="${name}" value="${a.id}" ${chosen.includes(a.id) ? 'checked' : ''}> ${h(a.name)}</label>`).join('')}</fieldset>`;
  const oneAccount = () => `<label>Subconta de destino<select name="workspace" required>${accounts().map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label>`;
  const secretBox = (title, secret) => dialog(title, `<p>Copie este código agora. Ele não será exibido novamente.</p><div class="ag-copy"><input readonly value="${h(secret)}" aria-label="Código secreto">${btn('Copiar', 'copy', `data-text="${h(secret)}"`)}</div>`);

  document.addEventListener('click', async ev => {
    if (!active()) return;

    // Handle profile click from topbar
    const profBtn = ev.target.closest('[data-ag-profile]');
    if (profBtn) { go('settings', 'company'); return; }

    // Handle agency quick actions from topbar
    const quickBtn = ev.target.closest('[data-act="agency-quick"]');
    if (quickBtn) {
      dialog('Ações rápidas da agência', `<div class="quick-list">
        <button class="secondary" data-ag="new-account">${i('plus', 16)} Nova subconta</button>
        <button class="secondary" data-ag="snapshot-create">${i('box', 16)} Criar snapshot</button>
        <button class="secondary" data-ag="new-record" data-key="users">${i('users', 16)} Adicionar membro da equipe</button>
        <button class="secondary" data-ag="new-record" data-key="plans">${i('tag', 16)} Novo plano SaaS</button>
        <button class="secondary" data-ag="new-record" data-key="partners">${i('award', 16)} Novo parceiro</button>
        <button class="secondary" data-ag="switch-account">${i('refresh', 16)} Trocar para subconta</button>
      </div>`);
      return;
    }

    const b = ev.target.closest('[data-ag]'); if (!b) return;
    const d = b.dataset, id = d.id;
    try {
      switch (d.ag) {
        case 'go-profile': go('settings', 'company'); break;
        case 'nav': A.navOpen = !A.navOpen; render(); G('[data-ag="nav"]')?.focus(); break;
        case 'tab': go(A.page, d.sub); break;
        case 'reset-user': localStorage.removeItem('go.user'); location.hash = '#agency/dashboard'; location.reload(); break;
        case 'switch-account': dialog('Trocar para uma subconta', `<div class="ag-switch">${accounts().map(a => `<button class="choice" data-ag="open-account" data-id="${a.id}"><strong>${h(a.name)}</strong><span>${h(tr(a.status))} · ${a.contacts} contatos</span></button>`).join('')}</div>`); break;
        case 'open-account': close(); await act('account-open', { id }); await openWorkspace(id); break;
        case 'ask': A.chat.push({ me: true, text: d.q }, { text: answer(d.q) }); render(); break;
        case 'new-account': dialog('Criar nova subconta', accountForm(), { form: 'account', submit: 'Criar subconta' }); break;
        case 'edit-account': {
          const a = accounts().find(x => x.id === id), meta = D().accounts[id] || {};
          dialog(`Editar ${a.name}`, `<div class="field-grid"><label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select></label><label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}" ${meta.plan === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label><label>Endereço<input name="address" value="${h(meta.address)}"></label><label>Telefone<input name="phone" value="${h(meta.phone)}"></label><label>Site<input name="website" type="url" value="${h(meta.website)}"></label></div>`, { form: 'account-meta', id, submit: 'Salvar alterações' });
          break;
        }
        case 'bulk-status': dialog(`Alterar status de ${A.selected.size} subconta(s)`, `<label>Novo status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}">${tr(s)}</option>`).join('')}</select></label>`, { form: 'bulk-status', submit: 'Atualizar status' }); break;
        case 'bulk-snapshot': if (!D().snapshots.length) { flash('Crie um snapshot primeiro.', true); break; } dialog(`Carregar snapshot em ${A.selected.size} subconta(s)`, `<label>Snapshot<select name="id">${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>${loadMode()}`, { form: 'bulk-snapshot', submit: 'Carregar snapshot' }); break;
        case 'new-record': editRecord(d.key); break;
        case 'edit-record': editRecord(d.key, id); break;
        case 'delete-record': confirmBox('Excluir este registro?', 'Esta ação não poderá ser desfeita.', `delete:${d.key}`, id, 'Excluir'); break;
        case 'prospect-report': { const p = D().prospects.find(x => x.id === id); dialog('Relatório de auditoria', prospectReport(p) + `<div class="inline-gap">${btn('Baixar HTML', 'prospect-download', `data-id="${id}"`, 'primary', 'download')}</div>`, { wide: true }); break; }
        case 'prospect-download': { const p = D().prospects.find(x => x.id === id); download(`${p.name.replace(/[^\w-]+/g, '-')}-auditoria.html`, reportHtml(p), 'text/html'); break; }
        case 'prospect-convert': dialog('Criar subconta para este prospect', `<label>Snapshot inicial<select name="snapshotId"><option value="">Começar em branco</option>${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>`, { form: 'prospect-convert', id, submit: 'Criar subconta' }); break;
        case 'snapshot-create': dialog('Criar snapshot', `<label>Nome do snapshot<input name="name" required maxlength="100"></label>${oneAccount()}<fieldset class="ag-checks"><legend>Recursos a incluir</legend>${snapshotAssets.map(([k, l]) => `<label class="check"><input type="checkbox" name="include" value="${k}" checked> ${h(l)}</label>`).join('')}</fieldset><p class="dim">Contatos, conversas e pagamentos nunca são incluídos. Páginas e fluxos entram como rascunhos.</p>`, { form: 'snapshot-create', submit: 'Criar snapshot' }); break;
        case 'snapshot-load': { const s = D().snapshots.find(x => x.id === id); dialog(`Carregar “${s.name}”`, `<p class="dim">${h(assetSummary(s.counts))}</p>${pickAccounts()}${loadMode()}`, { form: 'snapshot-load', id, submit: 'Carregar snapshot' }); break; }
        case 'snapshot-refresh': confirmBox('Atualizar snapshot?', `Substituir o conteúdo do snapshot pelos ativos mais recentes de ${accountName(D().snapshots.find(x => x.id === id).workspace)}.`, 'snapshot-refresh', id, 'Atualizar'); break;
        case 'snapshot-share': { const code = await act('snapshot-share', { id }); render(); dialog('Compartilhar snapshot', `<p>Qualquer pessoa com acesso à agência pode importar o snapshot com este código na aba "Snapshots importados".</p><div class="ag-copy"><input readonly value="${h(code)}" aria-label="Código de compartilhamento">${btn('Copiar', 'copy', `data-text="${h(code)}"`)}</div>`); break; }
        case 'snapshot-rename': { const s = D().snapshots.find(x => x.id === id); dialog('Renomear snapshot', `<label>Novo nome<input name="name" required maxlength="100" value="${h(s.name)}"></label>`, { form: 'snapshot-rename', id, submit: 'Renomear' }); break; }
        case 'snapshot-delete': confirmBox('Excluir snapshot?', 'As subcontas que já carregaram este snapshot manterão seus recursos normalmente.', 'snapshot-delete', id, 'Excluir'); break;
        case 'snapshot-import': dialog('Importar snapshot', '<label>Código de compartilhamento<input name="code" required maxlength="40"></label>', { form: 'snapshot-import', submit: 'Importar' }); break;
        case 'addon-request': dialog(`Solicitar ${addOns.find(a => a.key === id).name}`, '<label>Observação para a equipe (opcional)<textarea name="note" maxlength="1000"></textarea></label><p class="dim">O pedido será registrado para análise. Nenhuma cobrança é realizada de imediato.</p>', { form: 'addon-request', id, submit: 'Enviar solicitação' }); break;
        case 'addon-cancel': await act('addon-cancel', { id }); render(); flash('Solicitação retirada.'); break;
        case 'affiliate-step': await act('affiliate-step', { data: { step: d.step } }); render(); break;
        case 'affiliate-pay': { const amount = await act('affiliate-pay'); render(); flash(`Pagamento de ${usd(amount)} registrado.`); break; }
        case 'copy': await navigator.clipboard.writeText(d.text).then(() => flash('Copiado para a área de transferência.'), () => flash('Selecione o texto e copie manualmente.', true)); break;
        case 'template-preview': { const t = findTemplate(id); dialog(t.name, `<div class="ag-preview"><small>${h(tr(t.category))}</small><h3>${h(t.headline)}</h3><p>${h(t.body || '')}</p>${t.button ? `<span class="primary">${h(t.button)}</span>` : ''}</div>`, { wide: true }); break; }
        case 'template-install': dialog(`Instalar “${findTemplate(id).name}”`, `${oneAccount()}<p class="dim">A página será adicionada como funil de rascunho com formulário de captura vinculado.</p>`, { form: 'template-install', id, submit: 'Instalar agora' }); break;
        case 'learn': await act('learning', { data: { lesson: id } }); render(); break;
        case 'idea-vote': await act('idea-vote', { id }); render(); break;
        case 'idea-comments': { const x = D().ideas.find(r => r.id === id); dialog(x.title, `${x.comments.map(cm => `<div class="line-item"><div><b>${h(cm.author)}</b> <small class="dim">${day(cm.at, true)}</small><p>${h(cm.body)}</p></div></div>`).join('') || '<p class="dim">Nenhum comentário registrado ainda.</p>'}<label>Adicionar comentário<textarea name="body" required maxlength="2000"></textarea></label>`, { form: 'idea-comment', id, submit: 'Comentar' }); break; }
        case 'move-up': case 'move-down': { const li = b.closest('li'); if (d.ag === 'move-up' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); if (d.ag === 'move-down' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); b.focus(); break; }
        case 'integration': { const x = integrationCatalog.find(r => r[0] === id); dialog(`Disponibilidade: ${x[1]}`, `<p class="dim">As subcontas selecionadas verão este app disponível. Cada cliente precisará da sua própria conta de ${h(x[1])} para conectar.</p>${pickAccounts('accounts', D().integrations[id]?.accounts || [])}`, { form: 'integration', id, submit: 'Salvar disponibilidade' }); break; }
        case 'act-as': localStorage.setItem('go.user', id); flash('Navegando com as permissões do usuário selecionado.'); location.hash = '#ask-ai'; location.reload(); break;
        case 'wallet': dialog('Lançamento na carteira', `<div class="field-grid"><label>Tipo de operação<select name="kind"><option value="Credit">Crédito</option><option value="Charge">Débito</option></select></label><label>Valor (USD)<input name="amount" type="number" min="0.01" step="0.01" required></label></div><label>Observação<input name="note" maxlength="200"></label>`, { form: 'wallet', submit: 'Registrar lançamento' }); break;
        case 'api-key': dialog('Criar chave de API', '<label>Identificação da chave<input name="name" required maxlength="80"></label>', { form: 'api-key', submit: 'Criar chave' }); break;
        case 'api-key-delete': confirmBox('Revogar esta chave de API?', 'Sistemas ou integrações que utilizam esta chave deixarão de funcionar imediatamente.', 'api-key-delete', id, 'Revogar'); break;
        case 'private-integration': dialog('Criar integração privada', `<label>Nome da integração<input name="name" required maxlength="80"></label><label>Descrição do propósito<input name="description" maxlength="500"></label><fieldset class="ag-checks"><legend>Escopos de acesso</legend>${['subaccounts.read', 'contacts.read', 'contacts.write'].map(s => `<label class="check"><input type="checkbox" name="scopes" value="${s}"> ${s}</label>`).join('')}</fieldset>`, { form: 'private-integration', submit: 'Criar token' }); break;
        case 'private-integration-delete': confirmBox('Excluir esta integração?', 'O token associado deixará de funcionar imediatamente.', 'private-integration-delete', id, 'Excluir'); break;
        case 'audit-page': A.auditPage += Number(d.step); render(); break;
        case 'audit-csv': { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`; download('auditoria-agencia.csv', ['Data,Usuario,Acao,Alvo,Detalhes', ...D().audit.map(a => [a.at, a.actor, a.action, a.target, a.details].map(q).join(','))].join('\n'), 'text/csv'); break; }
      }
    } catch (e) { flash(e.message, true); }
  });

  const loadMode = () => `<fieldset class="ag-checks"><legend>Quando já existir um recurso com o mesmo nome</legend><label class="check"><input type="radio" name="mode" value="skip" checked> Manter o recurso existente</label><label class="check"><input type="radio" name="mode" value="overwrite"> Sobrescrever com a versão do snapshot</label></fieldset>`;

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
        case 'ask': A.chat.push({ me: true, text: data.q }, { text: answer(data.q) }); msg = ''; break;
        case 'account': { const newId = await call('accounts', data); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<p><b>${h(data.name)}</b> está pronta para uso.</p><div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'account-meta': await act('account-meta', { id, data }); msg = 'Dados da subconta atualizados.'; break;
        case 'bulk-status': for (const x of A.selected) { const meta = D().accounts[x]; await act('account-meta', { id: x, data: { ...meta, status: data.status } }); } A.selected.clear(); msg = 'Status das subcontas atualizado.'; break;
        case 'bulk-snapshot': await call('snapshot-load', { id: data.id, workspaces: [...A.selected], mode: data.mode }); A.selected.clear(); msg = 'Snapshot carregado com sucesso.'; break;
        case 'prospect-convert': { const newId = await call('prospect-convert', { id, snapshotId: data.snapshotId }); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'snapshot-create': await call('snapshot-create', data); msg = 'Snapshot criado com sucesso.'; break;
        case 'snapshot-refresh': await call('snapshot-refresh', { id }); msg = 'Snapshot atualizado com sucesso.'; break;
        case 'snapshot-load': { const loads = await call('snapshot-load', { id, workspaces: data.workspaces, mode: data.mode }); msg = `Carregado em ${loads.length} subconta(s): ${loads.reduce((s, l) => s + l.added, 0)} adicionados, ${loads.reduce((s, l) => s + l.overwritten, 0)} sobrescritos, ${loads.reduce((s, l) => s + l.skipped, 0)} mantidos.`; break; }
        case 'snapshot-rename': await act('snapshot-rename', { id, data }); msg = 'Snapshot renomeado.'; break;
        case 'snapshot-delete': await act('snapshot-delete', { id }); msg = 'Snapshot excluído.'; break;
        case 'snapshot-import': await act('snapshot-import', { data }); msg = 'Snapshot importado com sucesso.'; break;
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
  return { show };
}
