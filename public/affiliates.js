// Marketing → Afiliados: the business's own affiliate program (campaigns, affiliates, commissions,
// payouts and the public sign-up). Commissions come from paid invoices of referred contacts.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';

const sections = [['dashboard', 'Painel'], ['campaigns', 'Campanhas'], ['partners', 'Afiliados'], ['commissions', 'Comissões'], ['payouts', 'Pagamentos'], ['settings', 'Configurações']];
const commissionStatus = { pending: ['Em análise', ''], approved: ['Aprovada', 'blue'], paid: ['Paga', 'green'], reversed: ['Estornada', 'pink'] };
const partnerStatus = { active: ['Ativo', 'green'], pending: ['Aguardando aprovação', 'blue'], paused: ['Pausado', ''] };
const filters = { status: '' };
let portalLinks = {};
const brl = value => `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
const when = iso => (iso ? dateFormat.format(new Date(iso)) : '—');
const pill = ([text, tone]) => `<span class="badge ${tone}">${h(text)}</span>`;
const section = () => { const part = location.hash.split('/')[2] || 'dashboard'; return sections.some(([id]) => id === part) ? part : 'dashboard'; };
const referralLink = (c, row, campaignId = '') => `${location.origin}/r/${c.workspace}/${row.code}${campaignId ? `/${campaignId}` : ''}`;

function stats(c, affiliateId) {
  const s = c.s;
  const commissions = (s.affiliateCommissions || []).filter(row => !affiliateId || row.affiliateId === affiliateId);
  const sum = (list, key = 'value') => list.reduce((total, row) => total + Number(row[key] || 0), 0);
  const valid = commissions.filter(row => row.status !== 'reversed');
  return {
    leads: s.contacts.filter(row => row.affiliate && (!affiliateId || row.affiliate.affiliateId === affiliateId)).length,
    sales: valid.length, revenue: sum(valid, 'base'),
    pending: sum(commissions.filter(row => row.status === 'pending')), approved: sum(commissions.filter(row => row.status === 'approved')), paid: sum(commissions.filter(row => row.status === 'paid'))
  };
}

function shell(c, current, content, cta = '') {
  return pageShell({
    title: 'Afiliados', desc: 'Pessoas e parceiros que indicam clientes em troca de comissão.', className: 'af-page', cta,
    tabs: { key: 'marketing', items: c.marketingTabs, current: 'affiliates', label: 'Seções de marketing' },
    content: `<nav class="af-nav" aria-label="Seções de afiliados">${sections.map(([id, label]) => `<a href="#marketing/affiliates/${id}" ${id === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>${content}`
  });
}

const empty = (ico, title, text, cta = '') => `<div class="surface empty">${icon(ico, 26)}<strong>${h(title)}</strong><p>${h(text)}</p>${cta}</div>`;
const newCampaign = `<button type="button" class="primary" data-af-act="campaign">${icon('plus', 15)} Nova campanha</button>`;
const newPartner = `<button type="button" class="primary" data-af-act="partner">${icon('plus', 15)} Novo afiliado</button>`;

function dashboard(c) {
  const st = stats(c);
  const partners = c.s.affiliates || [];
  const clicks = partners.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const metric = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  if (!(c.s.affiliateCampaigns || []).length) return shell(c, 'dashboard', empty('users', 'Crie o seu programa de afiliados', 'Comece por uma campanha: para onde o link leva e quanto o afiliado ganha por venda. Depois cadastre os afiliados ou abra as inscrições.', newCampaign));
  const top = partners.map(row => ({ row, ...stats(c, row.id) })).sort((a, b) => b.revenue - a.revenue || (b.row.clicks || 0) - (a.row.clicks || 0)).slice(0, 8);
  return shell(c, 'dashboard', `
    <div class="metrics af-metrics">${metric('Afiliados ativos', partners.filter(row => row.status === 'active').length, `${partners.filter(row => row.status === 'pending').length} aguardando aprovação`)}
      ${metric('Cliques nos links', clicks)}${metric('Contatos indicados', st.leads)}${metric('Vendas indicadas', st.sales, brl(st.revenue))}
      ${metric('Comissões a pagar', brl(st.approved), `${brl(st.pending)} em análise`)}${metric('Já pago', brl(st.paid))}</div>
    <section class="surface table-shell"><table><thead><tr><th scope="col">Afiliado</th><th scope="col" class="num">Cliques</th><th scope="col" class="num">Indicados</th><th scope="col" class="num">Vendas</th><th scope="col" class="num">Receita</th><th scope="col" class="num">A pagar</th></tr></thead>
      <tbody>${top.map(({ row, leads, sales, revenue, approved }) => `<tr><td><b>${h(row.name)}</b> <small class="dim">${h(row.code)}</small></td><td class="num">${row.clicks || 0}</td><td class="num">${leads}</td><td class="num">${sales}</td><td class="num">${brl(revenue)}</td><td class="num">${brl(approved)}</td></tr>`).join('')}</tbody></table>
      ${top.length ? '' : '<p class="dim af-empty-row">Nenhum afiliado ainda.</p>'}</section>`, newPartner);
}

function campaigns(c) {
  const list = c.s.affiliateCampaigns || [];
  const cards = list.map(row => `<article class="surface af-card"><header><b>${h(row.name)}</b>${pill(row.active ? ['Ativa', 'green'] : ['Pausada', ''])}</header>
      <p class="dim">${row.commissionType === 'fixed' ? `${brl(row.commissionValue)} por venda` : `${row.commissionValue.toLocaleString('pt-BR')}% de cada venda`} · ${row.recurring === 'all' ? 'todos os pagamentos' : 'só a primeira compra'} · cookie de ${row.cookieDays} dias · libera em ${row.holdDays} dias</p>
      <p class="dim">Destino: <code>${h(row.destination)}</code></p>${row.description ? `<p>${h(row.description)}</p>` : ''}
      <div class="af-actions"><button type="button" class="secondary" data-af-act="campaign" data-id="${h(row.id)}">${icon('edit', 14)} Editar</button>
        <button type="button" class="icon-btn" data-af-act="delete" data-key="affiliateCampaigns" data-id="${h(row.id)}" aria-label="Excluir campanha ${h(row.name)}" title="Excluir">${icon('trash', 15)}</button></div></article>`).join('');
  return shell(c, 'campaigns', cards ? `<div class="af-grid">${cards}</div>` : empty('send', 'Nenhuma campanha', 'A campanha define o destino do link e a comissão.', newCampaign), newCampaign);
}

function partners(c) {
  const list = c.s.affiliates || [];
  const names = id => (c.s.affiliateCampaigns || []).find(row => row.id === id)?.name || '';
  const rows = list.map(row => {
    const st = stats(c, row.id);
    const portal = portalLinks[row.id];
    return `<tr><td><b>${h(row.name)}</b><br><small class="dim">${h(row.email)}${row.pix ? ` · PIX ${h(row.pix)}` : ''}</small></td>
      <td><code>${h(row.code)}</code></td><td>${pill(partnerStatus[row.status] || partnerStatus.active)}</td><td><small>${row.campaignIds.map(names).filter(Boolean).map(h).join(', ') || '—'}</small></td>
      <td class="num">${row.clicks || 0}</td><td class="num">${st.leads}</td><td class="num">${st.sales}</td><td class="num">${brl(st.approved)}</td>
      <td><div class="af-actions">${row.status === 'pending' ? `<button type="button" class="primary" data-af-act="approve" data-id="${h(row.id)}">Aprovar</button>` : ''}
        ${row.status === 'active' && row.campaignIds.length ? `<button type="button" class="secondary" data-af-act="copy" data-value="${h(referralLink(c, row))}">${icon('copy', 14)} Link</button>` : ''}
        <button type="button" class="secondary" data-af-act="portal" data-id="${h(row.id)}">Painel</button>
        <button type="button" class="icon-btn" data-af-act="partner" data-id="${h(row.id)}" aria-label="Editar ${h(row.name)}" title="Editar">${icon('edit', 15)}</button>
        <button type="button" class="icon-btn" data-af-act="delete" data-key="affiliates" data-id="${h(row.id)}" aria-label="Excluir ${h(row.name)}" title="Excluir">${icon('trash', 15)}</button></div>
        ${portal ? `<p class="af-portal"><small>Link do painel (copie agora, ele não aparece de novo):</small><code>${h(portal)}</code></p>` : ''}</td></tr>`;
  }).join('');
  return shell(c, 'partners', list.length ? `<section class="surface table-shell"><table><thead><tr><th scope="col">Afiliado</th><th scope="col">Código</th><th scope="col">Situação</th><th scope="col">Campanhas</th><th scope="col" class="num">Cliques</th><th scope="col" class="num">Indicados</th><th scope="col" class="num">Vendas</th><th scope="col" class="num">A pagar</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></section>`
    : empty('users', 'Nenhum afiliado ainda', 'Cadastre afiliados aqui, abra as inscrições em Configurações ou use a ação “Tornar afiliado” num workflow.', newPartner), newPartner);
}

function commissions(c) {
  const list = (c.s.affiliateCommissions || []).filter(row => !filters.status || row.status === filters.status);
  const partner = id => (c.s.affiliates || []).find(row => row.id === id)?.name || 'Afiliado excluído';
  const contact = id => c.s.contacts.find(row => row.id === id)?.name || 'Contato excluído';
  const rows = list.map(row => `<tr><td>${when(row.created)}</td><td><b>${h(partner(row.affiliateId))}</b></td><td>${h(contact(row.contactId))}</td><td class="num">${brl(row.base)}</td><td class="num"><b>${brl(row.value)}</b></td>
    <td>${pill(commissionStatus[row.status])}${row.status === 'pending' ? `<br><small class="dim">${row.manual ? 'segurada pela equipe' : `libera em ${when(row.approveAfter)}`}</small>` : ''}</td>
    <td><div class="af-actions">${row.status === 'pending' ? `<button type="button" class="secondary" data-af-act="review" data-id="${h(row.id)}" data-status="approved">Aprovar</button>` : ''}
      ${row.status === 'approved' ? `<button type="button" class="secondary" data-af-act="review" data-id="${h(row.id)}" data-status="pending">Segurar</button>` : ''}
      ${['pending', 'approved'].includes(row.status) ? `<button type="button" class="secondary" data-af-act="review" data-id="${h(row.id)}" data-status="reversed">Estornar</button>` : ''}</div></td></tr>`).join('');
  const select = `<label class="af-filter">Situação <select data-af-filter>${[['', 'Todas'], ...Object.entries(commissionStatus).map(([id, [label]]) => [id, label])].map(([id, label]) => `<option value="${id}" ${filters.status === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  return shell(c, 'commissions', (c.s.affiliateCommissions || []).length
    ? `${select}<section class="surface table-shell"><table><thead><tr><th scope="col">Data</th><th scope="col">Afiliado</th><th scope="col">Cliente</th><th scope="col" class="num">Venda</th><th scope="col" class="num">Comissão</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table>${rows ? '' : '<p class="dim af-empty-row">Nenhuma comissão com esse filtro.</p>'}</section>
      <p class="dim">Comissões nascem quando uma fatura de um contato indicado é paga. Ficam em análise pelo prazo da campanha (para cobrir devoluções) e são estornadas se a fatura for cancelada antes do pagamento ao afiliado.</p>`
    : empty('pay', 'Nenhuma comissão ainda', 'Quando um contato que chegou pelo link de um afiliado pagar uma fatura, a comissão aparece aqui.'));
}

function payouts(c) {
  const settings = c.s.affiliateSettings || {};
  const owed = (c.s.affiliates || []).map(row => ({ row, approved: stats(c, row.id).approved })).filter(item => item.approved > 0).sort((a, b) => b.approved - a.approved);
  const history = [...(c.s.affiliatePayouts || [])].reverse();
  const partner = id => (c.s.affiliates || []).find(row => row.id === id)?.name || 'Afiliado excluído';
  return shell(c, 'payouts', `
    <section class="surface padded af-section"><h2>A pagar</h2>
      ${owed.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Afiliado</th><th scope="col">PIX</th><th scope="col" class="num">Aprovado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
        ${owed.map(({ row, approved }) => `<tr><td><b>${h(row.name)}</b></td><td>${row.pix ? `<code>${h(row.pix)}</code> <button type="button" class="wf-text af-link" data-af-act="copy" data-value="${h(row.pix)}">Copiar</button>` : '<span class="dim">sem chave</span>'}</td>
          <td class="num"><b>${brl(approved)}</b>${approved < (settings.minPayout || 0) ? `<br><small class="dim">abaixo do mínimo de ${brl(settings.minPayout)}</small>` : ''}</td>
          <td><button type="button" class="primary" data-af-act="payout" data-id="${h(row.id)}" data-amount="${approved}">Registrar pagamento</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="dim">Nenhuma comissão aprovada esperando pagamento.</p>'}
      <p class="dim">Faça o PIX ou a transferência pelo seu banco e registre aqui. O afiliado vê o pagamento no painel dele.</p></section>
    <section class="surface padded af-section"><h2>Histórico</h2>
      ${history.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Data</th><th scope="col">Afiliado</th><th scope="col">Forma</th><th scope="col">Referência</th><th scope="col" class="num">Valor</th></tr></thead><tbody>
        ${history.map(row => `<tr><td>${when(row.paidAt)}</td><td>${h(partner(row.affiliateId))}</td><td>${{ pix: 'PIX', transfer: 'Transferência', other: 'Outro' }[row.method] || row.method}</td><td>${h(row.reference || '—')}</td><td class="num">${brl(row.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dim">Nenhum pagamento registrado.</p>'}</section>`);
}

function settings(c) {
  const st = c.s.affiliateSettings || {};
  const link = `${location.origin}/afiliados/${c.workspace}`;
  return shell(c, 'settings', `<form class="surface padded af-form" data-af-settings>
    <label class="rp-check"><input type="checkbox" name="signup" ${st.signup ? 'checked' : ''}> Aceitar inscrições pela página pública</label>
    <div class="af-copy"><input readonly value="${h(link)}" aria-label="Página de inscrição"><button type="button" class="secondary" data-af-act="copy" data-value="${h(link)}">${icon('copy', 14)} Copiar</button><a class="secondary" href="${h(link)}" target="_blank" rel="noopener">Abrir</a></div>
    <label class="rp-check"><input type="checkbox" name="autoApprove" ${st.autoApprove ? 'checked' : ''}> Aprovar inscrições automaticamente</label>
    <label>Valor mínimo para pagamento (R$)<input name="minPayout" type="number" min="0" step="0.01" value="${h(st.minPayout ?? 50)}"></label>
    <label>Termos do programa<textarea name="terms" rows="6" maxlength="4000" placeholder="Regras de divulgação, prazo de pagamento, o que não é permitido…">${h(st.terms || '')}</textarea><small class="dim">Com termos preenchidos, quem se inscreve precisa aceitá-los.</small></label>
    <div class="inline-gap"><button class="primary">Salvar</button><span class="form-status" role="status"></span></div>
  </form>`);
}

export function affiliatesScreen(c, ctx) {
  const view = { ...c, marketingTabs: ctx.marketingTabs };
  return { dashboard, campaigns, partners, commissions, payouts, settings }[section()](view);
}

function campaignForm(row = {}) {
  return `<form class="af-form" data-af-campaign data-id="${h(row.id || '')}">
    <label>Nome<input name="name" required maxlength="80" value="${h(row.name || '')}" placeholder="Ex.: Indique um amigo"></label>
    <label>Destino do link<input name="destination" required maxlength="500" value="${h(row.destination || '')}" placeholder="https://seusite.com.br ou /loja/…"><small class="dim">Página da loja, funil ou site. Os contatos criados pelos formulários, loja, chat, webinars e ofertas desta plataforma ficam ligados ao afiliado.</small></label>
    <div class="rp-two-fields"><label>Tipo de comissão<select name="commissionType"><option value="percent" ${row.commissionType !== 'fixed' ? 'selected' : ''}>Porcentagem da venda</option><option value="fixed" ${row.commissionType === 'fixed' ? 'selected' : ''}>Valor fixo por venda</option></select></label>
      <label>Valor (% ou R$)<input name="commissionValue" type="number" min="0.01" step="0.01" required value="${h(row.commissionValue ?? 10)}"></label></div>
    <div class="rp-two-fields"><label>Pagar sobre<select name="recurring"><option value="first" ${row.recurring !== 'all' ? 'selected' : ''}>Só a primeira compra do cliente</option><option value="all" ${row.recurring === 'all' ? 'selected' : ''}>Todos os pagamentos do cliente</option></select></label>
      <label>Validade do cookie (dias)<input name="cookieDays" type="number" min="1" max="365" value="${h(row.cookieDays ?? 60)}"></label></div>
    <label>Liberar comissões após (dias)<input name="holdDays" type="number" min="0" max="90" value="${h(row.holdDays ?? 7)}"><small class="dim">Prazo para devoluções antes de a comissão ficar disponível para pagamento.</small></label>
    <label>Descrição para os afiliados<textarea name="description" rows="2" maxlength="400">${h(row.description || '')}</textarea></label>
    <label class="rp-check"><input type="checkbox" name="active" ${row.active === false ? '' : 'checked'}> Campanha ativa</label>
    <div class="inline-gap"><button class="primary">Salvar campanha</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p>
  </form>`;
}

function partnerForm(c, row = {}) {
  const campaignsList = c.s.affiliateCampaigns || [];
  return `<form class="af-form" data-af-partner data-id="${h(row.id || '')}">
    <div class="rp-two-fields"><label>Nome<input name="name" required maxlength="80" value="${h(row.name || '')}"></label><label>E-mail<input name="email" type="email" required maxlength="160" value="${h(row.email || '')}"></label></div>
    <div class="rp-two-fields"><label>WhatsApp<input name="phone" maxlength="30" value="${h(row.phone || '')}"></label><label>Chave PIX<input name="pix" maxlength="120" value="${h(row.pix || '')}"></label></div>
    <div class="rp-two-fields"><label>Código do link<input name="code" maxlength="16" pattern="[a-z0-9]{3,16}" value="${h(row.code || '')}" placeholder="gerado pelo nome"><small class="dim">Letras minúsculas e números.</small></label>
      <label>Situação<select name="status">${Object.entries(partnerStatus).map(([id, [label]]) => `<option value="${id}" ${(row.status || 'active') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    <fieldset class="af-campaigns"><legend>Campanhas</legend>${campaignsList.map(item => `<label class="rp-check"><input type="checkbox" name="campaignIds" value="${h(item.id)}" ${(row.campaignIds || campaignsList.filter(x => x.active).map(x => x.id)).includes(item.id) ? 'checked' : ''}> ${h(item.name)}</label>`).join('') || '<p class="dim">Crie uma campanha primeiro.</p>'}</fieldset>
    <div class="inline-gap"><button class="primary">Salvar afiliado</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p>
  </form>`;
}

export function installAffiliates({ c, api, url, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'marketing' && c.tab === 'affiliates';
  window.addEventListener('hashchange', () => { if (!here()) portalLinks = {}; });
  document.addEventListener('change', event => { if (here() && event.target.matches('[data-af-filter]')) { filters.status = event.target.value; render(); } });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-af-act]');
    if (!el || !here()) return;
    const { afAct: act, id } = el.dataset;
    try {
      if (act === 'copy') { await navigator.clipboard.writeText(el.dataset.value); flash('Copiado.'); }
      if (act === 'campaign') dialog(id ? 'Editar campanha' : 'Nova campanha', campaignForm((c.s.affiliateCampaigns || []).find(row => row.id === id)));
      if (act === 'partner') {
        if (!(c.s.affiliateCampaigns || []).length) { flash('Crie uma campanha antes de cadastrar afiliados.', true); return; }
        dialog(id ? 'Editar afiliado' : 'Novo afiliado', partnerForm(c, (c.s.affiliates || []).find(row => row.id === id)));
      }
      if (act === 'approve') { const row = c.s.affiliates.find(item => item.id === id); await mutate({ type: 'save', key: 'affiliates', id, data: { ...row, status: 'active' } }); render(); flash('Afiliado aprovado. Envie o link do painel para ele.'); }
      if (act === 'portal') {
        if (!confirm('Gerar um novo link do painel? O link anterior deixa de funcionar.')) return;
        const result = await api(url('/api/action'), { type: 'affiliate-portal-link', id });
        c.s = result.state; c.m = result.metrics;
        portalLinks = { [id]: `${location.origin}/afiliados/${c.workspace}/${result.id.token}` };
        render(); await navigator.clipboard.writeText(portalLinks[id]).then(() => flash('Link do painel copiado.'), () => {});
      }
      if (act === 'review') { await mutate({ type: 'commission-review', id, data: { status: el.dataset.status } }); render(); }
      if (act === 'payout') {
        const row = c.s.affiliates.find(item => item.id === id);
        dialog(`Pagamento para ${row.name}`, `<form class="af-form" data-af-payout data-id="${h(id)}"><p>Valor aprovado: <b>${brl(el.dataset.amount)}</b>${row.pix ? ` · PIX <code>${h(row.pix)}</code>` : ''}</p>
          <label>Forma<select name="method"><option value="pix">PIX</option><option value="transfer">Transferência</option><option value="other">Outro</option></select></label>
          <label>Referência (opcional)<input name="reference" maxlength="120" placeholder="ID do PIX ou comprovante"></label>
          <p class="dim">Registre só depois de enviar o dinheiro. As comissões aprovadas ficam marcadas como pagas.</p>
          <div class="inline-gap"><button class="primary">Registrar pagamento</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p></form>`);
      }
      if (act === 'delete') {
        const what = el.dataset.key === 'affiliates' ? 'este afiliado? O link dele para de funcionar' : 'esta campanha? Os links dela param de funcionar';
        if (!confirm(`Excluir ${what}.`)) return;
        await mutate({ type: 'delete', key: el.dataset.key, id }); render(); flash('Excluído.');
      }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!here() || !form.matches('[data-af-campaign],[data-af-partner],[data-af-payout],[data-af-settings]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; if (status) status.textContent = '';
    try {
      const data = Object.fromEntries(new FormData(form));
      if (form.matches('[data-af-campaign]')) {
        data.active = form.elements.active.checked;
        await mutate({ type: 'save', key: 'affiliateCampaigns', ...(form.dataset.id && { id: form.dataset.id }), data });
        close(); render(); flash('Campanha salva.');
      } else if (form.matches('[data-af-partner]')) {
        data.campaignIds = [...form.querySelectorAll('[name="campaignIds"]:checked')].map(input => input.value);
        await mutate({ type: 'save', key: 'affiliates', ...(form.dataset.id && { id: form.dataset.id }), data });
        close(); render(); flash('Afiliado salvo.');
      } else if (form.matches('[data-af-payout]')) {
        await mutate({ type: 'affiliate-payout', data: { affiliateId: form.dataset.id, method: data.method, reference: data.reference } });
        close(); render(); flash('Pagamento registrado.');
      } else {
        await mutate({ type: 'affiliate-settings', data: { ...data, signup: form.elements.signup.checked, autoApprove: form.elements.autoApprove.checked } });
        render(); flash('Configurações salvas.');
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); button.disabled = false; }
  });
}
