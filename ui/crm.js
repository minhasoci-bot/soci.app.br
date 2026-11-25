// CRM tabs of the sub-account: Contacts (bulk actions, custom fields, companies), Opportunities (forecast,
// bulk actions), Payments (products, subscriptions, links, transactions, coupons) and the Settings data pages.
// screens.js calls the renderers; app.js calls crmForm/customInputs from its record dialog and crmEvents once.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';
import { badge, h, money, fmt, pageShell } from './screens.js';
import { bulkOperations, couponKinds, couponStatus, customObjects, fieldTypes, forecast, intervals, paymentMethods, productKinds,
  subscriptionStatuses, transactionSources, transactionStatuses } from './crm-data.js';

export const crmTabs = {
  contacts: [['all', 'Listas inteligentes'], ['bulk', 'Ações em massa'], ['fields', 'Campos personalizados'], ['tasks', 'Tarefas'], ['companies', 'Empresas'], ['trash', 'Lixeira']],
  opportunities: [['pipeline', 'Oportunidades'], ['list', 'Lista'], ['forecast', 'Previsão'], ['pipelines', 'Pipelines'], ['bulk', 'Ações em massa']],
  payments: [['invoices', 'Faturas'], ['recurring', 'Faturas recorrentes'], ['invoice-templates', 'Modelos de fatura'], ['documents', 'Documentos e contratos'], ['estimates', 'Orçamentos'], ['orders', 'Pedidos'], ['abandoned-checkouts', 'Checkouts abandonados'], ['products', 'Produtos'], ['collections', 'Coleções'], ['inventory', 'Estoque'], ['reviews', 'Avaliações'], ['gift-cards', 'Cartões-presente'], ['subscriptions', 'Assinaturas'], ['links', 'Links de pagamento'], ['transactions', 'Transações'], ['coupons', 'Cupons'], ['payment-settings', 'Configurações']],
  settings: [['business', 'Perfil da empresa'], ['whatsapp', 'WhatsApp'], ['abacatepay', 'AbacatePay'], ['google', 'Google'], ['email', 'Serviços de e-mail'], ['phone', 'Telefonia'], ['wallet', 'Carteira de créditos'], ['labs', 'Labs'], ['apps', 'Apps'], ['connectors', 'Conectores'], ['users', 'Usuários'], ['fields', 'Campos personalizados'], ['values', 'Valores personalizados'], ['tags', 'Tags'],
    ['scoring', 'Pontuação de leads'], ['tracking', 'Rastreamento externo'], ['preferences', 'Preferências de comunicação'], ['objects', 'Objetos'], ['import', 'Importar dados'], ['audit', 'Logs de auditoria'], ['workspaces', 'Workspaces']]
};
export const crmEntityNames = { customFields: 'Campo personalizado', customValues: 'Valor personalizado', tags: 'Tag', companies: 'Empresa', products: 'Produto',
  paymentLinks: 'Link de pagamento', subscriptions: 'Assinatura', transactions: 'Transação', coupons: 'Cupom' };

const objectLabel = { Contact: 'Contato', Opportunity: 'Oportunidade', Company: 'Empresa' };
const typeLabel = { 'Single line': 'Linha única', 'Multi line': 'Várias linhas', Number: 'Número', Monetary: 'Monetário', Date: 'Data',
  'Dropdown (single)': 'Lista suspensa (única)', Checkbox: 'Caixa de seleção', Email: 'E-mail', Phone: 'Telefone' };
const label = (map, v) => map[v] || tr(v);
const mt = money;
const date = (d, c, time = false) => fmt(d && d.length === 10 ? `${d}T12:00:00Z` : d, c.s.profile.timezone, time);
const who = (id, c) => c.s.contacts.find(r => r.id === id)?.name || '—';
const product = (id, c) => c.s.products.find(p => p.id === id);
const match = (c, ...values) => !c.query || values.join(' ').toLowerCase().includes(c.query.toLowerCase());
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const primary = (text, key, extra = '') => `<button class="primary" data-edit="${key}" ${extra}>${i('plus', 16)} ${text}</button>`;
const head = (title, desc, cta, sub) => `<header class="page-head"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div><div class="head-actions">${cta || ''}</div></header>${sub || ''}`;
const empty = (title, desc, ico = 'inbox') => `<div class="empty">${i(ico, 26)}<strong>${title}</strong><p>${desc}</p></div>`;
const search = (c, text) => `<label class="search">${i('search', 16)}<input id="page-search" value="${h(c.query)}" placeholder="${text}" aria-label="${text}" autocomplete="off"></label>`;
const table = (cols, rows, nothing) => `<div class="surface table-shell"><table><thead><tr>${cols.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length ? '' : nothing}</div>`;
const edit = (key, id) => `<td class="right"><button class="icon-btn" title="Editar registro" aria-label="Editar registro" data-edit="${key}" data-id="${id}">${i('edit', 16)}</button></td>`;
const metric = (title, value, note = '') => `<div class="surface metric"><span>${title}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
const page = content => `<div class="page">${content}</div>`;

// ---- Selection for bulk actions ---------------------------------------------------------------
const picked = { contacts: new Set(), opportunities: new Set() };
// Usados pela RecordsTable (bui-mounts.js), que cuida das próprias caixas de seleção.
export const pickedIds = object => [...picked[object]];
export function setPicked(object, ids) { picked[object] = new Set(ids); }
export const pickBox = (object, id) => `<input type="checkbox" data-crm-pick="${object}" value="${id}" ${picked[object].has(id) ? 'checked' : ''} aria-label="Selecionar registro">`;
export const pickCell = (object, id) => `<td class="crm-pick"><input type="checkbox" data-crm-pick="${object}" value="${id}" ${picked[object].has(id) ? 'checked' : ''} aria-label="Selecionar registro"></td>`;
export const pickHead = (object, ids) => `<input type="checkbox" data-crm-all="${object}" data-ids="${ids.join(',')}" ${ids.length && ids.every(id => picked[object].has(id)) ? 'checked' : ''} aria-label="Selecionar todos">`;
export function bulkBar(c, object) {
  const set = picked[object];
  for (const id of [...set]) if (!c.s[object].some(r => r.id === id)) set.delete(id);
  if (!set.size) return '';
  const tagList = [...new Set([...c.s.tags.map(t => t.name), ...c.s.contacts.flatMap(x => x.tags)])].sort();
  const choices = object === 'contacts'
    ? `<select name="operation" aria-label="Ação">${bulkOperations.contacts.map(([k, l]) => `<option value="${k}">${{ 'add-tag': 'Adicionar tag', 'remove-tag': 'Remover tag', delete: 'Excluir' }[k] || l}</option>`).join('')}</select>
       <input name="value" list="crm-tags" placeholder="Tag" maxlength="48" aria-label="Tag"><datalist id="crm-tags">${tagList.map(t => `<option value="${h(t)}">`).join('')}</datalist>`
    : `<select name="operation" aria-label="Ação">${c.s.pipelines.map(p => `<optgroup label="Mover para · ${h(tr(p.name))}">${c.s.stages.filter(st => st.pipelineId === p.id).map(st => `<option value="move-stage|${st.id}">${h(tr(st.name))}</option>`).join('')}</optgroup>`).join('')}
       <optgroup label="Alterar status">${['Open', 'Won', 'Lost', 'Abandoned'].map(st => `<option value="status|${st}">${h(tr(st))}</option>`).join('')}</optgroup><option value="delete|">Excluir</option></select>`;
  return `<form class="surface crm-bulk" data-crm-bulk="${object}">${badge(`${set.size} selecionado(s)`, 'blue')}${choices}<button class="primary">Aplicar</button><button type="button" class="secondary" data-crm-clear="${object}">Limpar seleção</button></form>`;
}

// ---- Shared pieces -------------------------------------------------------------------------------
const bulkLog = (c, object) => {
  const rows = [...c.s.bulkActions].reverse().filter(b => b.object === object && match(c, b.label, b.status, b.user));
  return `<p class="dim crm-intro">Acompanhe o andamento e o resultado das ações em massa. Selecione registros na lista para iniciar uma.</p><div class="toolbar">${search(c, 'Buscar ações…')}</div>` +
    table(['Ação', 'Operação', 'Status', 'Usuário', 'Criada em', 'Concluída em', 'Estatísticas'], rows.map(b => `<tr><td><b>${h(b.label)}</b></td><td>${h({ 'add-tag': 'Adicionar tag', 'remove-tag': 'Remover tag', delete: 'Excluir', 'move-stage': 'Mover etapa', status: 'Alterar status' }[b.operation] || b.operation)}</td><td>${badge(b.status, b.failed ? (b.done ? 'gold' : 'red') : 'green')}</td><td>${h(b.user || '—')}</td><td>${date(b.created, c, true)}</td><td>${date(b.completed, c, true)}</td><td><small>${b.done} de ${b.total} concluído(s)${b.failed ? ` · ${b.failed} com erro` : ''}</small></td></tr>`),
      empty('Nenhuma ação em massa encontrada', 'Selecione registros na lista e aplique uma ação a todos de uma vez.', 'list'));
};
function fieldsTable(c, objectFilter) {
  const rows = c.s.customFields.filter(f => (!objectFilter || f.object === objectFilter) && match(c, f.name, f.folder, f.key, f.type));
  const counts = customObjects.map(o => `${label(objectLabel, o)} ${c.s.customFields.filter(f => f.object === o).length}`).join(' · ');
  return `<p class="dim crm-intro">Crie campos personalizados para capturar e organizar dados de contatos, oportunidades e empresas. Todos: ${c.s.customFields.length} · ${counts}</p><div class="toolbar">${search(c, 'Buscar campos…')}</div>` +
    table(['Nome do campo', 'Objeto', 'Tipo', 'Pasta', 'Chave', 'Criado em', ''], rows.map(f => `<tr><td><b>${h(f.name)}</b></td><td>${h(label(objectLabel, f.object))}</td><td>${h(label(typeLabel, f.type))}</td><td>${h(f.folder || '—')}</td><td><code>{{${h(f.key)}}}</code></td><td>${date(f.created, c, true)}</td>${edit('customFields', f.id)}</tr>`),
      empty('Nenhum campo personalizado', 'Crie um campo para que ele apareça nos formulários de contato, oportunidade ou empresa.', 'list'));
}

// ---- Contacts ------------------------------------------------------------------------------------
export function contactsTab(c, tab) {
  const tabCfg = { key: 'contacts', items: crmTabs.contacts, current: tab, label: 'Seções de contatos' };
  const desc = 'Gerencie leads, tarefas, campos personalizados e empresas deste workspace.';
  if (tab === 'bulk') return pageShell({ title: 'Contatos', desc, tabs: tabCfg, content: bulkLog(c, 'contacts') });
  if (tab === 'fields') return pageShell({ title: 'Contatos', desc, cta: primary('Novo campo', 'customFields', 'data-object="Contact"'), tabs: tabCfg, content: fieldsTable(c, 'Contact') });
  const rows = c.s.companies.filter(x => match(c, x.name, x.email, x.phone, x.city, x.website));
  const people = x => c.s.contacts.filter(p => same(p.company, x.name)).length;
  return pageShell({
    title: 'Contatos',
    desc,
    cta: primary('Adicionar empresa', 'companies'),
    tabs: tabCfg,
    content: `<p class="dim crm-intro">${c.s.companies.length} empresa(s). O vínculo com contatos usa o campo Empresa do contato.</p><div class="toolbar">${search(c, 'Buscar empresas…')}</div>` +
      table(['Empresa', 'Telefone', 'E-mail', 'Site', 'Cidade', 'Contatos', 'Criada em', ''], rows.map(x => `<tr><td><b>${h(x.name)}</b></td><td>${h(x.phone || '—')}</td><td>${h(x.email || '—')}</td><td>${x.website ? `<a class="text-link" href="${h(x.website)}" target="_blank" rel="noopener">${h(new URL(x.website).hostname)}</a>` : '—'}</td><td>${h([x.city, x.state].filter(Boolean).join(', ') || '—')}</td><td>${people(x)}</td><td>${date(x.created, c)}</td>${edit('companies', x.id)}</tr>`),
        empty('Nenhuma empresa cadastrada', 'Cadastre empresas e associe contatos a elas pelo campo Empresa.', 'users'))
  });
}

// ---- Opportunities ------------------------------------------------------------------------------
let forecastPipeline = '';
export function opportunitiesTab(c, tab) {
  const tabCfg = { key: 'opportunities', items: crmTabs.opportunities.filter(([key]) => key !== 'list'), current: tab, label: 'Seções de oportunidades' };
  const desc = 'Acompanhe negócios no pipeline, previsões de receita e etapas de vendas.';
  if (tab === 'bulk') return pageShell({ title: 'Oportunidades', desc, tabs: tabCfg, content: bulkLog(c, 'opportunities') });
  const f = forecast(c.s, { pipelineId: forecastPipeline });
  const stageName = id => tr(c.s.stages.find(st => st.id === id)?.name || '—');
  const riskRows = ['High', 'Medium', 'Low'].flatMap(level => f.risk[level].map(x => `<tr><td>${badge({ High: 'Alto', Medium: 'Médio', Low: 'Baixo' }[level], { High: 'red', Medium: 'gold', Low: '' }[level])}</td><td><button class="text-link" data-edit="opportunities" data-id="${x.deal.id}">${h(x.deal.title)}</button></td><td>${date(x.deal.closeDate, c)}</td><td>${x.deal.slips || 0}</td><td>${x.late ? `${x.late} dia(s)` : '—'}</td><td>${mt(x.deal.value, c)}</td></tr>`));
  const quality = (title, list, note) => `<section class="surface padded"><h2>${title} <span class="dim">${list.length}</span></h2><p class="dim">${note}</p>${list.slice(0, 6).map(d => `<div class="line-item"><span>${h(d.title)} <small class="dim">${h(stageName(d.stage))}</small></span><button class="secondary" data-edit="opportunities" data-id="${d.id}">Corrigir</button></div>`).join('')}</section>`;
  return pageShell({
    title: 'Oportunidades',
    desc,
    tabs: tabCfg,
    content: `<div class="toolbar"><label class="tag-filter"><span class="sr-only">Pipeline</span><select data-crm-forecast-pipeline><option value="">Todos os pipelines</option>${c.s.pipelines.map(p => `<option value="${p.id}" ${p.id === forecastPipeline ? 'selected' : ''}>${h(tr(p.name))}</option>`).join('')}</select></label></div>
      <div class="metrics">${metric('Receita potencial máxima', mt(f.potential, c), 'Se todas as oportunidades abertas fecharem')}${metric('Receita esperada', mt(f.expected, c), 'Pela probabilidade da oportunidade ou da etapa')}${metric('Receita ganha', mt(f.won, c), 'Oportunidades ganhas')}${metric('Oportunidades abertas', f.open, 'Em andamento')}</div>
      <h2 class="section-heading">Linha do tempo da previsão</h2>${table(['Mês de fechamento', 'Oportunidades', 'Valor', 'Receita esperada'], f.timeline.map(m => `<tr><td><b>${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m.month}-01T12:00:00Z`))}</b></td><td>${m.count}</td><td>${mt(m.value, c)}</td><td>${mt(m.expected, c)}</td></tr>`), empty('Sem datas de fechamento', 'Informe a data prevista de fechamento nas oportunidades abertas.', 'chart'))}
      <h2 class="section-heading">Oportunidades em risco</h2><p class="dim crm-intro">Alto: adiada 2+ vezes ou atrasada 14+ dias · Médio: adiada 1 vez ou atrasada 7+ dias · Baixo: atrasada 1+ dia.</p>${table(['Risco', 'Oportunidade', 'Fechamento previsto', 'Adiamentos', 'Atraso', 'Valor'], riskRows, empty('Nenhuma oportunidade em risco', 'As datas de fechamento das oportunidades abertas estão em dia.', 'check'))}
      <h2 class="section-heading">Corrija os dados da previsão</h2><div class="ag-two">${quality('Sem data de fechamento', f.missingClose, 'Não entram na linha do tempo.')}${quality('Sem probabilidade', f.missingChance, 'Contam como 0% na receita esperada. Defina na oportunidade ou na etapa.')}</div>`
  });
}

// ---- Payments ------------------------------------------------------------------------------------
export function paymentsTab(c, tab) {
  const tabCfg = { key: 'payments', items: crmTabs.payments, current: tab, label: 'Seções de pagamentos' };
  const s = c.s;
  const price = p => p ? `${mt(p.price, c)}${p.kind === 'Recurring' ? `/${{ Weekly: 'semana', Monthly: 'mês', Yearly: 'ano' }[p.interval]}` : ''}` : '—';
  if (tab === 'products') return pageShell({
    title: 'Pagamentos',
    desc: 'Produtos e preços usados em links de pagamento e assinaturas.',
    cta: primary('Novo produto', 'products'),
    tabs: tabCfg,
    content: `<div class="toolbar">${search(c, 'Buscar produtos…')}</div>` +
      table(['Produto', 'Tipo de preço', 'Preço', 'Status', 'Criado em', ''], s.products.filter(p => match(c, p.name, p.description)).map(p => `<tr><td><b>${h(p.name)}</b><br><small class="dim">${h(p.description.slice(0, 80))}</small></td><td>${p.kind === 'Recurring' ? 'Recorrente' : 'Pagamento único'}</td><td>${price(p)}</td><td>${badge(p.active ? 'Ativo' : 'Inativo', p.active ? 'green' : '')}</td><td>${date(p.created, c)}</td>${edit('products', p.id)}</tr>`), empty('Nenhum produto', 'Crie um produto para usar em links de pagamento e assinaturas.', 'box'))
  });
  if (tab === 'subscriptions') return pageShell({
    title: 'Pagamentos',
    desc: 'Acompanhe as assinaturas dos clientes.',
    cta: primary('Nova assinatura', 'subscriptions'),
    tabs: tabCfg,
    content: `<div class="toolbar">${search(c, 'Buscar assinaturas…')}</div>` +
      table(['Provedor', 'Cliente', 'Produto', 'Início', 'Valor', 'Status', ''], [...s.subscriptions].reverse().filter(x => match(c, who(x.contactId, c), product(x.productId, c)?.name)).map(x => `<tr><td>${h(x.provider === 'Manual' ? 'Manual' : x.provider)}</td><td><b>${h(who(x.contactId, c))}</b></td><td>${h(product(x.productId, c)?.name || '—')}</td><td>${date(x.start, c)}</td><td>${price(product(x.productId, c))}</td><td>${badge(x.status, { Active: 'green', Paused: 'gold', Canceled: 'red' }[x.status])}</td>${edit('subscriptions', x.id)}</tr>`), empty('Nenhuma assinatura ainda', 'Crie um produto recorrente e registre a assinatura de um contato.', 'pay'))
  });
  if (tab === 'links') return pageShell({
    title: 'Pagamentos',
    desc: 'Crie e gerencie links de pagamento.',
    cta: primary('Novo link', 'paymentLinks'),
    tabs: tabCfg,
    content: `<p class="surface padded ag-warn">O checkout dos links exige um gateway de pagamento conectado. Neste projeto local os links ficam registrados com produto e preço.</p><div class="toolbar">${search(c, 'Buscar links…')}</div>` +
      table(['Nome', 'Produto', 'Status', 'Preço', 'Criado em', ''], [...s.paymentLinks].reverse().filter(l => match(c, l.name, product(l.productId, c)?.name)).map(l => `<tr><td><b>${h(l.name)}</b></td><td>${h(product(l.productId, c)?.name || '—')}</td><td>${badge(l.active ? 'Ativo' : 'Inativo', l.active ? 'green' : '')}</td><td>${price(product(l.productId, c))}</td><td>${date(l.created, c)}</td>${edit('paymentLinks', l.id)}</tr>`), empty('Nenhum link de pagamento', 'Crie um produto e gere um link para ele.', 'link'))
  });
  if (tab === 'transactions') {
    const ok = s.transactions.filter(t => t.status === 'Succeeded'), refunded = s.transactions.filter(t => t.status === 'Refunded');
    return pageShell({
      title: 'Pagamentos',
      desc: 'Acompanhe os pagamentos dos clientes em um só lugar.',
      cta: primary('Registrar transação', 'transactions'),
      tabs: tabCfg,
      content: `<div class="metrics three">${metric('Recebido', mt(ok.reduce((n, t) => n + t.amount, 0), c), `${ok.length} transação(ões)`)}${metric('Reembolsado', mt(refunded.reduce((n, t) => n + t.amount, 0), c))}${metric('Total de transações', s.transactions.length)}</div><div class="toolbar">${search(c, 'Buscar transações…')}</div>` +
        table(['Cliente', 'Provedor', 'Origem', 'Data', 'Valor', 'Status', ''], [...s.transactions].sort((a, b) => b.date.localeCompare(a.date)).filter(t => match(c, who(t.contactId, c), t.note, t.source)).map(t => `<tr><td><b>${h(who(t.contactId, c))}</b>${t.note ? `<br><small class="dim">${h(t.note)}</small>` : ''}</td><td>${h(tr(t.method))}</td><td>${h({ Invoice: 'Fatura', Subscription: 'Assinatura', 'Payment link': 'Link de pagamento', Manual: 'Manual' }[t.source])}</td><td>${date(t.date, c)}</td><td>${mt(t.amount, c)}</td><td>${badge({ Succeeded: 'Concluída', Refunded: 'Reembolsada', Disputed: 'Em contestação', Failed: 'Falhou' }[t.status], { Succeeded: 'green', Refunded: 'gold', Disputed: 'red', Failed: 'red' }[t.status])}</td>${edit('transactions', t.id)}</tr>`),
          empty('Nenhuma transação ainda', 'Marcar uma fatura como paga registra a transação automaticamente.', 'pay'))
    });
  }
  const status = c.tag || '';
  const rows = [...s.coupons].reverse().filter(x => match(c, x.name, x.code) && (!status || couponStatus(x) === status));
  return pageShell({
    title: 'Pagamentos',
    desc: 'Gerencie cupons de desconto para aumentar a conversão.',
    cta: primary('Novo cupom', 'coupons'),
    tabs: tabCfg,
    content: `<div class="toolbar">${search(c, 'Buscar cupons…')}<label class="tag-filter">${i('filter', 15)}<select id="tag-filter" aria-label="Status do cupom"><option value="">Todos</option>${[['Active', 'Ativos'], ['Scheduled', 'Agendados'], ['Expired', 'Expirados'], ['Inactive', 'Inativos']].map(([v, l]) => `<option value="${v}" ${status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>` +
      table(['Cupom', 'Código', 'Desconto', 'Início', 'Status', 'Resgates', ''], rows.map(x => { const st = couponStatus(x); return `<tr><td><b>${h(x.name)}</b></td><td><code>${h(x.code)}</code></td><td>${x.kind === 'Percent' ? `${x.amount}%` : mt(x.amount, c)}</td><td>${x.start ? date(x.start, c) : '—'}${x.end ? ` → ${date(x.end, c)}` : ''}</td><td>${badge({ Active: 'Ativo', Scheduled: 'Agendado', Expired: 'Expirado', Inactive: 'Inativo' }[st], { Active: 'green', Scheduled: 'blue', Expired: 'red' }[st] || '')}</td><td>${x.redemptions || 0}${x.limit ? ` / ${x.limit}` : ''}</td>${edit('coupons', x.id)}</tr>`; }),
        empty('Nenhum cupom encontrado', 'Crie um cupom percentual ou de valor fixo.', 'gift'))
  });
}

// ---- Settings ------------------------------------------------------------------------------------
// The audit log comes from its own endpoint, newest first; the search looks into what is already on screen.
// After "load more" the list stays for longer, so a refresh does not drop the pages already opened.
const AUDIT_FRESH = 15000, AUDIT_PAGED = 300000;
let auditFeed = { key: '', at: 0, entries: [], next: '', error: '', busy: false }, fetchAudit = null, redrawAudit = () => {};
async function loadAudit(c, more = false) {
  if (!fetchAudit || (auditFeed.busy && auditFeed.key === c.workspace)) return;
  if (!more && auditFeed.key === c.workspace && Date.now() - auditFeed.at < (auditFeed.paged ? AUDIT_PAGED : AUDIT_FRESH)) return;
  if (auditFeed.key !== c.workspace) auditFeed = { key: c.workspace, at: 0, entries: [], next: '', error: '', busy: false };
  const mine = auditFeed;
  mine.busy = true;
  try {
    const page = await fetchAudit(mine.key, more ? mine.next : '');
    mine.entries = more ? [...mine.entries, ...page.entries] : page.entries;
    mine.next = page.next; mine.error = ''; mine.paged = more;
  } catch (error) { mine.error = error.message; }
  mine.busy = false; mine.at = Date.now();
  if (mine === auditFeed) redrawAudit();
}
export function settingsTab(c, tab) {
  const tabCfg = { key: 'settings', items: crmTabs.settings, current: tab, label: 'Seções de configurações' };
  const s = c.s;
  const wrapIt = (cta, body) => pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', cta, tabs: tabCfg, content: body });
  if (tab === 'fields') {
    const object = customObjects.includes(c.tag) ? c.tag : '';
    return wrapIt(primary('Novo campo', 'customFields', `data-object="${object || 'Contact'}"`), `<div class="toolbar"><label class="tag-filter">${i('filter', 15)}<select id="tag-filter" aria-label="Objeto"><option value="">Todos os objetos</option>${customObjects.map(o => `<option value="${o}" ${object === o ? 'selected' : ''}>${label(objectLabel, o)}</option>`).join('')}</select></label></div>` + fieldsTable(c, object));
  }
  if (tab === 'values') return wrapIt(primary('Novo valor', 'customValues'), `<p class="dim crm-intro">Valores reutilizáveis em mensagens e páginas com a chave <code>{{custom_values.…}}</code>.</p><div class="toolbar">${search(c, 'Buscar valores…')}</div>` +
    table(['Nome', 'Pasta', 'Chave', 'Valor', ''], s.customValues.filter(v => match(c, v.name, v.value, v.folder)).map(v => `<tr><td><b>${h(v.name)}</b></td><td>${h(v.folder || '—')}</td><td><code>{{${h(v.key)}}}</code></td><td><small>${h(v.value.slice(0, 90) || '—')}</small></td>${edit('customValues', v.id)}</tr>`), empty('Nenhum valor personalizado', 'Crie valores como links, nomes de promoções e telefones para reutilizar.', 'list')));
  if (tab === 'tags') {
    const used = new Map();
    for (const contact of s.contacts) for (const t of contact.tags) { const k = t.toLowerCase(); used.set(k, { name: used.get(k)?.name || t, count: (used.get(k)?.count || 0) + 1 }); }
    const rows = [...s.tags.map(t => ({ ...t, count: used.get(t.name.toLowerCase())?.count || 0 })), ...[...used.values()].filter(u => !s.tags.some(t => same(t.name, u.name))).map(u => ({ name: u.name, count: u.count, loose: true }))]
      .filter(t => match(c, t.name, t.description, t.category)).sort((a, b) => a.name.localeCompare(b.name));
    return wrapIt(primary('Nova tag', 'tags'), `<p class="dim crm-intro">Etiquetas para organizar contatos e disparar automações. Renomear uma tag atualiza os contatos; excluir remove dos contatos.</p><div class="toolbar">${search(c, 'Buscar tags…')}</div>` +
      table(['Tag', 'Descrição', 'Categoria', 'Contatos', 'Criada em', ''], rows.map(t => `<tr><td>${badge(t.name, 'blue')}</td><td>${h(t.description || '—')}</td><td>${h(t.category || 'Sem categoria')}</td><td>${t.count}</td><td>${t.loose ? '<small class="dim">Só nos contatos</small>' : date(t.created, c, true)}</td>${t.loose ? `<td class="right"><button class="secondary" data-edit="tags" data-name="${h(t.name)}">Registrar</button></td>` : edit('tags', t.id)}</tr>`), empty('Nenhuma tag', 'Crie uma tag ou adicione tags aos contatos.', 'tag')));
  }
  if (tab === 'users') {
    const users = (c.agency?.users || []).filter(u => u.role.startsWith('Agency') || u.accounts?.includes(c.workspace));
    return wrapIt(c.access?.agency ? `<a class="secondary" href="#agency/settings/users">${i('users', 16)} Gerenciar na agência</a>` : '', table(['Nome', 'Função', 'Acesso', 'Permissões'], users.map(u => `<tr><td><b>${h(u.name)}</b></td><td>${badge(u.role, u.role.startsWith('Agency') ? 'pink' : 'blue')}</td><td><small>${u.role.startsWith('Agency') ? 'Todas as subcontas' : 'Esta subconta'}</small></td><td><small>${u.permissions?.length ? `${u.permissions.length} módulos` : 'Todos os módulos'}</small></td></tr>`),
      empty('Nenhum usuário com acesso', 'Os usuários são criados em Agência → Configurações → Equipe.', 'users')));
  }
  if (tab === 'objects') {
    const cards = [['Contact', 'Contatos', 'Leads e clientes, seus dados e especificações.', s.contacts.length, '#contacts'], ['Opportunity', 'Oportunidades', 'Negócios, etapas, status e andamento no pipeline.', s.opportunities.length, '#opportunities/list'], ['Company', 'Empresas', 'Empresas, seus dados e informações de contato.', s.companies.length, '#contacts/companies']];
    return wrapIt('', `<p class="dim crm-intro">Objetos padrão deste workspace. Campos personalizados ampliam cada um deles.</p><div class="card-grid">${cards.map(([key, name, text, count, href]) => `<article class="surface padded resource"><div><h2>${name}</h2><p>${text}</p></div><div class="inline-gap">${badge(`${count} registro(s)`, 'blue')}${badge(`${s.customFields.filter(f => f.object === key).length} campo(s) personalizado(s)`)}</div><a class="text-link" href="${href}">Abrir ${i('arrow', 15)}</a></article>`).join('')}</div>`);
  }
  if (tab === 'import') return wrapIt(`<button class="primary" data-act="import">${i('upload', 16)} Importar CSV</button>`, `<div class="surface padded crm-intro"><h2>Importar registros de CSV</h2><p class="dim">Envie um arquivo CSV de contatos com nome, e-mail, telefone, empresa e tags. Contatos com e-mail já cadastrado são ignorados.</p></div>
    <h2 class="section-heading">Histórico de importações</h2>${table(['Data', 'Origem', 'Arquivo', 'Status', 'Importado por', 'Registros encontrados', 'Importados', 'Ignorados'], [...s.imports].reverse().map(x => `<tr><td>${date(x.created, c, true)}</td><td>${h(x.source)}</td><td>${h(x.file || '—')}</td><td>${badge('Concluído', 'green')}</td><td>${h(x.user || '—')}</td><td>${x.found}</td><td>${x.added}</td><td>${x.skipped}</td></tr>`), empty('Nenhuma importação', 'As importações de CSV aparecem aqui com o resultado.', 'upload'))}`);
  const auditModules = {
    blogPosts: 'Blogs', blogs: 'Blogs', contacts: 'Contatos', companies: 'Empresas',
    opportunities: 'Oportunidades', pipelines: 'Oportunidades', stages: 'Oportunidades',
    workflows: 'Automações', customFields: 'Campos personalizados', tags: 'Tags',
    tasks: 'Tarefas', forms: 'Formulários', chats: 'Sites', webinars: 'Sites',
    qrs: 'Sites', stores: 'Sites', pages: 'Sites', agents: 'Agentes de IA',
    agentRuns: 'Agentes de IA', integrations: 'Integrações', invoices: 'Pagamentos',
    appointments: 'Calendários', snippets: 'Conversas', snippetFolders: 'Conversas',
    triggerLinks: 'Conversas', messages: 'Conversas', manualActions: 'Conversas',
    files: 'Mídia Drive', courses: 'Assinaturas', reviews: 'Reputação',
    profile: 'Perfil', subaccounts: 'Subcontas', snapshots: 'Snapshots',
    marketplace: 'Marketplace', prospecting: 'Prospecção'
  };
  const auditLabels = {
    'Sub-account created': ['Subconta criada', 'Subcontas'],
    'Sub-account support viewed': ['Suporte à subconta acessado', 'Suporte'],
    'Snapshot created': ['Snapshot criado', 'Snapshots'],
    'Snapshot refreshed': ['Snapshot atualizado', 'Snapshots'],
    'Snapshot loaded': ['Snapshot carregado', 'Snapshots'],
    'Setup published to marketplace': ['Setup publicado no marketplace', 'Marketplace'],
    'Setup updated on marketplace': ['Setup atualizado no marketplace', 'Marketplace'],
    'Setup unpublished from marketplace': ['Setup despublicado do marketplace', 'Marketplace'],
    'Setup installed from marketplace': ['Setup instalado do marketplace', 'Marketplace'],
    'Template installed': ['Modelo instalado', 'Modelos'],
    'Prospects sent to CRM': ['Prospects enviados ao CRM', 'Prospecção']
  };
  const entityNamesSingular = {
    blogPosts: 'Post de blog', blogs: 'Blog', contacts: 'Contato', companies: 'Empresa',
    opportunities: 'Oportunidade', pipelines: 'Pipeline', stages: 'Etapa',
    workflows: 'Fluxo de trabalho', customFields: 'Campo personalizado', tags: 'Tag',
    tasks: 'Tarefa', forms: 'Formulário', chats: 'Chat', webinars: 'Webinar',
    qrs: 'QR code', stores: 'Loja', pages: 'Página', agents: 'Agente de IA',
    integrations: 'Integração', invoices: 'Fatura', appointments: 'Agendamento',
    snippets: 'Resposta rápida', snippetFolders: 'Pasta de respostas',
    triggerLinks: 'Link de rastreamento', files: 'Arquivo', courses: 'Curso',
    reviews: 'Avaliação'
  };
  const formatAudit = action => {
    if (!action) return { title: '—', module: '—' };
    if (auditLabels[action]) return { title: auditLabels[action][0], module: auditLabels[action][1] };
    if (action.startsWith('Deleted ')) {
      const key = action.slice(8).trim();
      const noun = entityNamesSingular[key] || key;
      return { title: `${noun} excluído(a)`, module: auditModules[key] || key };
    }
    if (action.startsWith('Saved ')) {
      const key = action.slice(6).trim();
      const noun = entityNamesSingular[key] || key;
      return { title: `${noun} salvo(a)`, module: auditModules[key] || key };
    }
    if (action.startsWith('Bulk ')) return { title: action.replace('Bulk ', 'Ação em massa: '), module: 'Ações em massa' };
    if (action.startsWith('Prospecting:')) return { title: `Prospecção: ${action.slice(12).trim()}`, module: 'Prospecção' };
    if (action.startsWith('Ran ')) return { title: `Execução: ${action.slice(4).trim()}`, module: 'Automações' };
    return { title: tr(action), module: auditModules[action] || action.split(' ').slice(1).join(' ') || '—' };
  };
  void loadAudit(c);
  const feed = auditFeed.key === c.workspace ? auditFeed : { entries: [], next: '', error: '', at: 0 };
  const rows = feed.entries.map(a => ({ ...a, ...formatAudit(a.action) }))
    .filter(a => match(c, a.actor, a.action, a.details, a.title, a.module));
  return wrapIt('', `<p class="dim crm-intro">Ações de usuários e alterações de dados neste workspace.</p><div class="toolbar">${search(c, 'Buscar no log…')}</div>` +
    table(['Ação', 'Módulo', 'Feito por', 'Data e hora'], rows.map(a => `<tr><td><b>${h(a.title)}</b>${a.details ? `<br><small class="dim">${h(a.details)}</small>` : ''}</td><td>${h(a.module)}</td><td>${h(a.actor)}</td><td>${date(a.at, c, true)}</td></tr>`),
      feed.error ? empty('Não foi possível carregar o log', h(feed.error), 'list') : !feed.at ? '<p class="dim" role="status">Carregando…</p>'
        : empty('Nenhuma atividade registrada', 'As gravações feitas neste workspace aparecem aqui.', 'list')) +
    (feed.next ? '<div class="inline-gap"><button type="button" class="secondary" data-crm-audit-more>Carregar mais registros</button></div>' : ''));
}

// ---- Record dialogs ------------------------------------------------------------------------------
const field = (text, key, v = '', type = 'text', required = false, extra = '') => type === 'textarea'
  ? `<label>${text}<textarea name="${key}"${required ? ' required' : ''} ${extra}>${h(v)}</textarea></label>`
  : type === 'check' ? `<label class="check"><input name="${key}" type="checkbox" ${v ? 'checked' : ''}> ${text}</label>`
    : `<label>${text}<input name="${key}" type="${type}" value="${h(v ?? '')}"${required ? ' required' : ''} ${extra}></label>`;
const pick = (text, key, v, options, required = true) => `<label>${text}<select name="${key}"${required ? ' required' : ''}>${options.map(o => Array.isArray(o) ? o : [o, o]).map(([id, l]) => `<option value="${h(id)}" ${String(id) === String(v ?? '') ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></label>`;
const grid = (...parts) => `<div class="field-grid">${parts.join('')}</div>`;
const people = c => [['', 'Selecione um contato'], ...c.s.contacts.map(r => [r.id, r.name])];

/** Inputs for the custom fields of an object, named cf_<fieldId>. */
export function customInputs(c, object, r = {}) {
  const list = c.s.customFields.filter(f => f.object === object);
  if (!list.length) return '';
  const value = f => r.custom?.[f.id];
  const one = f => {
    const n = `cf_${f.id}`, v = value(f);
    if (f.type === 'Multi line') return field(h(f.name), n, v, 'textarea');
    if (f.type === 'Checkbox') return field(h(f.name), n, v, 'check');
    if (f.type === 'Dropdown (single)') return pick(h(f.name), n, v, [['', '—'], ...f.options], false);
    const type = { Number: 'number', Monetary: 'number', Date: 'date', Email: 'email', Phone: 'tel' }[f.type] || 'text';
    return field(h(f.name), n, v, type, false, `${type === 'number' ? 'step="any"' : ''} placeholder="${h(f.placeholder || '')}"`);
  };
  return `<fieldset class="crm-custom"><legend>Campos personalizados</legend>${grid(...list.map(one))}</fieldset>`;
}

/** Body of the record dialog for the CRM record types, or '' for other keys. */
export function crmForm(c, key, r, preset = {}) {
  switch (key) {
    case 'customFields': return field('Nome do campo', 'name', r.name, 'text', true, 'maxlength="80"') + grid(pick('Objeto', 'object', r.object || preset.object || 'Contact', customObjects.map(o => [o, label(objectLabel, o)])), pick('Tipo', 'type', r.type || 'Single line', fieldTypes.map(t => [t, label(typeLabel, t)])))
      + grid(field('Pasta', 'folder', r.folder), field('Texto de exemplo', 'placeholder', r.placeholder)) + field('Opções da lista suspensa (uma por linha)', 'options', (r.options || []).join('\n'), 'textarea')
      + (r.key ? `<p class="dim">Chave: <code>{{${h(r.key)}}}</code>. Mudar o tipo apaga os valores já preenchidos.</p>` : '<p class="dim">A chave é gerada a partir do objeto e do nome.</p>');
    case 'customValues': return field('Nome', 'name', r.name, 'text', true, 'maxlength="80"') + field('Pasta', 'folder', r.folder) + field('Valor', 'value', r.value, 'textarea');
    case 'tags': return field('Nome da tag', 'name', r.name || preset.name, 'text', true, 'maxlength="48"') + field('Descrição', 'description', r.description) + field('Categoria', 'category', r.category);
    case 'companies': return field('Nome da empresa', 'name', r.name, 'text', true) + grid(field('Telefone', 'phone', r.phone, 'tel'), field('E-mail', 'email', r.email, 'email'), field('Site', 'website', r.website), field('Endereço', 'address', r.address), field('Cidade', 'city', r.city), field('Estado', 'state', r.state), field('CEP', 'postal', r.postal), field('País', 'country', r.country))
      + field('Descrição', 'description', r.description, 'textarea') + customInputs(c, 'Company', r);
    case 'products': return field('Nome do produto', 'name', r.name, 'text', true) + field('Descrição', 'description', r.description, 'textarea')
      + grid(field(`Preço (${c.s.profile.currency})`, 'price', r.price ?? 0, 'number', true, 'min="0" step="0.01"'), pick('Tipo de preço', 'kind', r.kind || 'One time', productKinds.map(k => [k, k === 'Recurring' ? 'Recorrente' : 'Pagamento único'])), pick('Cobrança (recorrente)', 'interval', r.interval || 'Monthly', intervals.map(k => [k, { Weekly: 'Semanal', Monthly: 'Mensal', Yearly: 'Anual' }[k]])))
      + field('Produto ativo', 'active', r.id ? r.active : true, 'check');
    case 'paymentLinks': return field('Nome do link', 'name', r.name, 'text', true) + pick('Produto', 'productId', r.productId, [['', 'Selecione um produto'], ...c.s.products.map(p => [p.id, p.name])]) + field('Link ativo', 'active', r.id ? r.active : true, 'check');
    case 'subscriptions': return pick('Cliente', 'contactId', r.contactId, people(c)) + pick('Produto recorrente', 'productId', r.productId, [['', 'Selecione um produto'], ...c.s.products.filter(p => p.kind === 'Recurring').map(p => [p.id, p.name])])
      + grid(field('Início', 'start', r.start || new Date().toISOString().slice(0, 10), 'date', true), pick('Status', 'status', r.status || 'Active', subscriptionStatuses.map(st => [st, { Active: 'Ativa', Paused: 'Pausada', Canceled: 'Cancelada' }[st]])));
    case 'transactions': return pick('Cliente', 'contactId', r.contactId, people(c)) + grid(field(`Valor (${c.s.profile.currency})`, 'amount', r.amount ?? '', 'number', true, 'min="0" step="0.01"'), field('Data', 'date', r.date || new Date().toISOString().slice(0, 10), 'date', true),
      pick('Forma de pagamento', 'method', r.method || 'Manual', paymentMethods.map(m => [m, tr(m)])), pick('Origem', 'source', r.source || 'Manual', transactionSources.map(m => [m, { Invoice: 'Fatura', Subscription: 'Assinatura', 'Payment link': 'Link de pagamento', Manual: 'Manual' }[m]])),
      pick('Status', 'status', r.status || 'Succeeded', transactionStatuses.map(m => [m, { Succeeded: 'Concluída', Refunded: 'Reembolsada', Disputed: 'Em contestação', Failed: 'Falhou' }[m]]))) + field('Observação', 'note', r.note) + `<input type="hidden" name="invoiceId" value="${h(r.invoiceId || '')}">`;
    case 'coupons': return grid(field('Nome do cupom', 'name', r.name, 'text', true), field('Código', 'code', r.code, 'text', true, 'maxlength="30" pattern="[A-Za-z0-9_\\-]{3,30}"'), pick('Tipo de desconto', 'kind', r.kind || 'Percent', couponKinds.map(k => [k, k === 'Percent' ? 'Percentual (%)' : `Valor fixo (${c.s.profile.currency})`])),
      field('Desconto', 'amount', r.amount ?? '', 'number', true, 'min="0" step="0.01"'), field('Início', 'start', r.start, 'date'), field('Fim', 'end', r.end, 'date'), field('Limite de resgates (0 = sem limite)', 'limit', r.limit ?? 0, 'number', false, 'min="0" step="1"')) + field('Cupom ativo', 'active', r.id ? r.active : true, 'check');
    default: return '';
  }
}

// ---- Events ----------------------------------------------------------------------------------------
export function crmEvents({ G, mutate, render, flash, dialog, close, c, api }) {
  const onAudit = () => c.view === 'settings' && c.tab === 'audit';
  fetchAudit = (workspace, before) => api(`/api/audit?${new URLSearchParams({ workspace, before, limit: '100' })}`);
  redrawAudit = () => {
    if (!onAudit()) return;
    const top = G('#screen')?.scrollTop || 0, field = G('#page-search'), focused = field && field === document.activeElement ? field.selectionStart : -1;
    render();
    if (G('#screen')) G('#screen').scrollTop = top;
    if (focused >= 0) { G('#page-search')?.focus(); G('#page-search')?.setSelectionRange(focused, focused); }
  };
  let pending = null;
  const run = async (object, operation, value, label = '') => {
    const ids = [...picked[object]];
    await mutate({ type: 'bulk', data: { object, ids, operation, value, label } });
    picked[object].clear(); close(); render(); flash(`Ação em massa aplicada a ${ids.length} registro(s).`);
  };
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.matches('[data-crm-pick]')) { if (el.checked) picked[el.dataset.crmPick].add(el.value); else picked[el.dataset.crmPick].delete(el.value); render(); G(`[data-crm-pick="${el.dataset.crmPick}"][value="${el.value}"]`)?.focus(); }
    if (el.matches('[data-crm-all]')) { for (const id of el.dataset.ids.split(',').filter(Boolean)) el.checked ? picked[el.dataset.crmAll].add(id) : picked[el.dataset.crmAll].delete(id); render(); G(`[data-crm-all="${el.dataset.crmAll}"]`)?.focus(); }
    if (el.matches('[data-crm-forecast-pipeline]')) { forecastPipeline = el.value; render(); G('[data-crm-forecast-pipeline]')?.focus(); }
  });
  document.addEventListener('click', async ev => {
    const more = ev.target.closest('[data-crm-audit-more]');
    if (more) { more.disabled = true; await loadAudit(c, true); return; }
    const clear = ev.target.closest('[data-crm-clear]');
    if (clear) { picked[clear.dataset.crmClear].clear(); render(); return; }
    if (ev.target.closest('[data-crm-confirm]') && pending) { const p = pending; pending = null; try { await run(...p); } catch (e) { flash(e.message, true); } }
  });
  document.addEventListener('submit', async ev => {
    const f = ev.target.closest('[data-crm-bulk]'); if (!f) return;
    ev.preventDefault();
    const object = f.dataset.crmBulk, [operation, choice] = f.elements.operation.value.split('|');
    const value = object === 'contacts' ? f.elements.value.value.trim() : choice;
    if (object === 'contacts' && operation !== 'delete' && !value) { flash('Informe a tag.', true); f.elements.value.focus(); return; }
    const option = f.elements.operation.selectedOptions[0];
    const label = operation === 'delete' ? `Excluir ${object === 'contacts' ? 'contatos' : 'oportunidades'}`
      : object === 'contacts' ? `${option.textContent} “${value}”` : `${option.parentElement.label || ''}: ${option.textContent}`.replace(/^Mover para · /, 'Mover para ');
    if (operation === 'delete') {
      pending = [object, operation, value, label];
      dialog(`Excluir ${picked[object].size} registro(s)?`, `<p>${object === 'contacts' ? 'Os contatos vão para a Lixeira por 60 dias, junto com as tarefas, oportunidades, mensagens, agendamentos e faturas deles, e podem ser restaurados.' : 'Esta ação não pode ser desfeita.'}</p><div class="inline-gap"><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary danger" type="button" data-crm-confirm>Excluir</button></div>`);
      return;
    }
    try { await run(object, operation, value, label); } catch (e) { flash(e.message, true); }
  });
}
