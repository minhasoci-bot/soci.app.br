// Offers admin: list with filters, create/edit, public link, and the sales that came from each offer.
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { portalTabs } from './client-portal.js';

const list = { status: 'all' };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const typeLabel = { free: 'Gratuita', one_time: 'Pagamento único' };
const priceOf = offer => offer.priceLabel || (offer.type === 'free' ? 'Gratuito' : money(offer.price));
const linkOf = (c, offer) => `${location.origin}/oferta/${encodeURIComponent(c.workspace)}/${encodeURIComponent(offer.id)}`;
const products = (c, offer) => [...offer.courseIds.map(id => c.s.courses.find(row => row.id === id)?.name),
  ...offer.communityIds.map(id => c.s.communities?.find(row => row.id === id)?.name)].filter(Boolean);

export function offersScreen(c) {
  const query = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const rows = c.s.offers.filter(offer => (list.status === 'all' || offer.status === list.status) && (!query || offer.title.toLocaleLowerCase('pt-BR').includes(query)));
  const sales = c.s.invoices.filter(invoice => invoice.offerId).sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 50);
  const contact = id => c.s.contacts.find(row => row.id === id);
  return pageShell({ title: 'Assinaturas', desc: 'Gerencie o portal do cliente, permissões de acesso, cursos e comunidades deste workspace.', className: 'cp-admin',
    tabs: { key: 'memberships', items: portalTabs(), current: 'offers', label: 'Seções de assinaturas' },
    content: `<div class="cp-section-title"><div><h2>Ofertas</h2><p>Crie um preço para um curso ou junte cursos e comunidades em um pacote. Ofertas pagas usam o AbacatePay conectado em Pagamentos.</p></div>
      <button type="button" class="primary" data-of="edit">${icon('plus',16)} Criar oferta</button></div>
    <div class="co-toolbar">${search(c.query,'Buscar ofertas')}
      <div class="of-segment" role="group" aria-label="Situação">${[['published','Publicadas'],['draft','Rascunhos'],['all','Todas']].map(([value, label]) =>
        `<button type="button" data-of="status" data-id="${value}" aria-pressed="${list.status === value}">${label}</button>`).join('')}</div></div>
    ${rows.length ? `<div class="surface of-table"><table><thead><tr><th scope="col">Título</th><th scope="col">Produtos</th><th scope="col">Tipo</th><th scope="col">Preço</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${rows.map(offer => `<tr><td><button type="button" class="of-title" data-of="edit" data-id="${h(offer.id)}">${h(offer.title)}</button></td>
        <td>${products(c, offer).map(name => `<span class="badge">${h(name)}</span>`).join(' ') || '<span class="of-muted">Nada incluído</span>'}</td>
        <td>${typeLabel[offer.type]}</td><td><strong>${h(priceOf(offer))}</strong></td>
        <td>${offer.status === 'published' ? '<span class="badge green">Publicada</span>' : '<span class="badge">Rascunho</span>'}</td>
        <td class="of-actions">${offer.status === 'published' ? `<button type="button" class="icon-btn" data-of="copy" data-id="${h(offer.id)}" aria-label="Copiar link de ${h(offer.title)}" title="Copiar link">${icon('copy',16)}</button>
          <a class="icon-btn" href="${h(linkOf(c, offer))}" target="_blank" rel="noopener" aria-label="Abrir página de ${h(offer.title)}" title="Abrir página">${icon('external',16)}</a>` : ''}
          <button type="button" class="icon-btn" data-of="edit" data-id="${h(offer.id)}" aria-label="Editar ${h(offer.title)}" title="Editar">${icon('edit',16)}</button>
          <button type="button" class="icon-btn" data-of="delete" data-id="${h(offer.id)}" aria-label="Excluir ${h(offer.title)}" title="Excluir">${icon('trash',16)}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="co-empty">${icon('tag',28)}<strong>${query || list.status !== 'all' ? 'Nenhuma oferta encontrada' : 'Crie sua primeira oferta'}</strong>
        <p>${query || list.status !== 'all' ? 'Tente outra busca ou outra situação.' : 'Uma oferta gera uma página pública com preço e formulário. Quem compra recebe acesso no portal automaticamente.'}</p></div>`}
    <section class="of-sales"><h2>Vendas recentes</h2>
      ${sales.length ? `<div class="surface of-table"><table><thead><tr><th scope="col">Comprador</th><th scope="col">Oferta</th><th scope="col">Valor</th><th scope="col">Pagamento</th><th scope="col">Acesso</th></tr></thead>
        <tbody>${sales.map(invoice => { const buyer = contact(invoice.contactId), offer = c.s.offers.find(row => row.id === invoice.offerId);
          return `<tr><td><strong>${h(buyer?.name || 'Contato removido')}</strong><small>${h(buyer?.email || '')}</small></td><td>${h(offer?.title || invoice.title)}</td>
          <td>${money(invoice.value)}</td><td>${invoice.status === 'Paid' ? '<span class="badge green">Pago</span>' : invoice.status === 'Void' ? '<span class="badge">Cancelado</span>' : '<span class="badge blue">Aguardando</span>'}
          <small>${h(fmt(invoice.created, c.s.profile.timezone, true))}</small></td>
          <td>${invoice.offerGrantedAt ? `<span class="badge green">Liberado</span>` : `<button type="button" class="secondary" data-of="grant" data-id="${h(invoice.id)}" ${buyer?.email && offer ? '' : 'disabled'}>Liberar acesso</button>`}</td></tr>`; }).join('')}</tbody></table></div>`
        : '<p class="of-muted">As compras pelas páginas de oferta aparecem aqui, com o pagamento e a liberação do acesso.</p>'}</section>` });
}

function editor(c, offer) {
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  const option = (name, rows, chosen, empty) => rows.length ? rows.map(row => `<label class="cp-checkbox"><input type="checkbox" name="${name}" value="${h(row.id)}" ${chosen.includes(row.id) ? 'checked' : ''}>
    <span>${h(row.name)}${row.active === false ? ' · Rascunho' : ''}</span></label>`).join('') : `<p class="of-muted">${empty}</p>`;
  return `<form class="co-form" data-of-form="save" data-id="${h(offer?.id || '')}">
    <label>Título<input name="title" required maxlength="255" value="${h(offer?.title || '')}" placeholder="Ex.: Pacote completo"></label>
    <label>Descrição<textarea name="description" rows="3" maxlength="2000">${h(offer?.description || '')}</textarea></label>
    <fieldset class="cp-permissions"><legend>Cursos</legend>${option('courseIds', c.s.courses, offer?.courseIds || [], 'Nenhum curso criado ainda.')}</fieldset>
    <fieldset class="cp-permissions"><legend>Comunidades</legend>${option('communityIds', c.s.communities || [], offer?.communityIds || [], 'Nenhuma comunidade criada ainda.')}</fieldset>
    <fieldset class="co-kinds"><legend>Tipo</legend>
      <label><input type="radio" name="type" value="free" ${offer?.type !== 'one_time' ? 'checked' : ''}><span>Gratuita</span></label>
      <label><input type="radio" name="type" value="one_time" ${offer?.type === 'one_time' ? 'checked' : ''}><span>Pagamento único</span></label></fieldset>
    <label data-of-price ${offer?.type === 'one_time' ? '' : 'hidden'}>Preço (R$)<input name="price" type="number" min="1" step="0.01" value="${offer?.type === 'one_time' ? offer.price : ''}"></label>
    <label>Texto do preço (opcional)<input name="priceLabel" maxlength="255" value="${h(offer?.priceLabel || '')}" placeholder="Ex.: Aula grátis, Oferta de lançamento"></label>
    <label>Capa (imagem da Mídia Drive)<select name="coverFileId"><option value="">Sem capa</option>${images.map(file => `<option value="${h(file.id)}" ${file.id === offer?.coverFileId ? 'selected' : ''}>${h(file.name)}</option>`).join('')}</select></label>
    <label class="cp-checkbox co-check"><input type="checkbox" name="published" ${offer?.status === 'published' ? 'checked' : ''}><span>Publicada<small>A página pública só funciona com a oferta publicada.</small></span></label>
    <p class="form-status" role="alert" data-of-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Salvar oferta</button></div></form>`;
}

export function installOffers({ c, api, mutate, flash, dialog, close, render }) {
  const active = () => c.view === 'memberships' && c.tab === 'offers';
  const copy = async text => { try { await navigator.clipboard.writeText(text); flash('Link copiado.'); } catch { dialog('Link da oferta', `<label>Link<input readonly value="${h(text)}"></label>`); } };

  document.addEventListener('click', async event => {
    if (!active()) return;
    const control = event.target.closest('[data-of]');
    if (!control) return;
    const { of: action, id } = control.dataset;
    const offer = c.s.offers.find(row => row.id === id);
    try {
      if (action === 'status') { list.status = id; render(); document.querySelector(`[data-of="status"][data-id="${id}"]`)?.focus(); }
      if (action === 'edit') dialog(offer ? 'Editar oferta' : 'Criar oferta', editor(c, offer));
      if (action === 'copy') await copy(`${location.origin}/oferta/${encodeURIComponent(c.workspace)}/${encodeURIComponent(id)}`);
      if (action === 'delete') dialog('Excluir oferta', `<form class="co-form" data-of-form="delete" data-id="${h(id)}"><p>A página de “${h(offer.title)}” deixa de funcionar. Quem já comprou continua com acesso.</p>
        <p class="form-status" role="alert" data-of-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir oferta</button></div></form>`);
      if (action === 'grant') {
        control.disabled = true;
        const result = await api(`/api/client-portal/${encodeURIComponent(c.workspace)}/offer-grant/${encodeURIComponent(id)}`, {});
        const fresh = await api(`/api/state?workspace=${encodeURIComponent(c.workspace)}`);
        c.s = fresh.state; if (fresh.metrics) c.m = fresh.metrics;
        render();
        flash(result.alreadyGranted ? 'O acesso já estava liberado.' : result.emailed ? 'Acesso liberado e link enviado por e-mail.' : 'Acesso liberado. Envie o link de entrada pela aba Clientes.');
      }
    } catch (error) { control.disabled = false; flash(error.message, true); }
  });

  document.addEventListener('change', event => {
    const form = event.target.closest('[data-of-form="save"]');
    if (form && event.target.name === 'type') form.querySelector('[data-of-price]').hidden = event.target.value !== 'one_time';
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-of-form]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-of-error]');
    submit.disabled = true;
    error.textContent = '';
    try {
      if (form.dataset.ofForm === 'delete') { await mutate({ type: 'delete', key: 'offers', id: form.dataset.id }); close(); render(); flash('Oferta excluída.'); return; }
      await mutate({ type: 'save', key: 'offers', id: form.dataset.id || undefined, data: {
        title: fields.get('title'), description: fields.get('description'), courseIds: fields.getAll('courseIds'), communityIds: fields.getAll('communityIds'),
        type: fields.get('type'), price: Number(fields.get('price') || 0), priceLabel: fields.get('priceLabel'), coverFileId: fields.get('coverFileId'),
        status: fields.has('published') ? 'published' : 'draft' } });
      close(); render(); flash('Oferta salva.');
    } catch (failure) {
      error.textContent = failure.message;
      submit.disabled = false;
    }
  });
}
