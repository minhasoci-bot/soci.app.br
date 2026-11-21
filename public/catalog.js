// Pagamentos → Coleções, Estoque, Avaliações e Cartões-presente (GoHighLevel's Products → Collections,
// Inventory, Reviews and Gift cards).
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { crmTabs } from './crm.js';

const cv = { review: 'pending' };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const tabsOf = current => ({ key: 'payments', items: crmTabs.payments, current, label: 'Seções de pagamentos' });
const lower = value => String(value || '').toLocaleLowerCase('pt-BR');
const matches = (c, ...values) => { const q = lower(c.query).trim(); return !q || values.some(value => lower(value).includes(q)); };
const stars = n => `<span class="ct-stars" aria-label="${n} de 5 estrelas">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const formEnd = (label, tone = 'primary') => `<p class="form-status" role="alert" data-ct-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="${tone}" type="submit">${label}</button></div>`;
const oneTime = c => c.s.products.filter(row => row.kind !== 'Recurring');
const cardStatus = card => card.status === 'disabled' ? ['Desativado', ''] : card.expiresAt && card.expiresAt < new Date().toISOString().slice(0, 10) ? ['Vencido', 'gold'] : card.balance <= 0 ? ['Usado', 'blue'] : ['Ativo', 'green'];
const reviewTabs = [['pending', 'Pendentes'], ['approved', 'Aprovadas'], ['unapproved', 'Reprovadas'], ['trash', 'Lixeira']];
const empty = (title, text) => `<div class="surface empty">${icon('box', 26)}<strong>${title}</strong><p>${text}</p></div>`;

/* ───────── Coleções ───────── */

function collectionsScreen(c) {
  const all = c.s.productCollections || [], rows = all.filter(row => matches(c, row.name, row.description));
  return pageShell({ title: 'Pagamentos', desc: 'Grupos de produtos que viram filtros nas lojas.',
    cta: `<button type="button" class="primary" data-ct-act="collection">${icon('plus', 16)} Nova coleção</button>`, tabs: tabsOf('collections'),
    content: `<div class="toolbar">${search(c.query, 'Buscar coleções…')}</div>${rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Coleção</th><th scope="col">Produtos</th><th scope="col">Endereço na loja</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${rows.map(row => `<tr><td><b data-no-translate="1">${h(row.name)}</b>${row.description ? `<small class="dim" data-no-translate="1">${h(row.description)}</small>` : ''}</td><td>${row.productIds.length}</td><td><code>?colecao=${h(row.slug)}</code></td>
        <td class="right dc-actions"><button type="button" class="icon-btn" data-ct-act="collection" data-id="${h(row.id)}" aria-label="Editar ${h(row.name)}" title="Editar">${icon('edit', 16)}</button>
          <button type="button" class="icon-btn" data-ct-act="delete" data-key="productCollections" data-id="${h(row.id)}" aria-label="Excluir ${h(row.name)}" title="Excluir">${icon('trash', 16)}</button></td></tr>`).join('')}</tbody></table></div>`
      : empty(all.length ? 'Nenhuma coleção encontrada' : 'Organize os produtos em coleções', all.length ? 'Tente outra busca.' : 'Ex.: Lançamentos, Kits, Presentes. Na loja, cada coleção vira um filtro ao lado das categorias.')}` });
}

/* ───────── Estoque ───────── */

function inventoryScreen(c) {
  const all = oneTime(c), rows = all.filter(row => matches(c, row.name, row.sku));
  const low = all.filter(row => row.trackInventory && (Number(row.quantity) || 0) <= (Number(row.lowStock) || 0));
  return pageShell({ title: 'Pagamentos', desc: 'Quantidade disponível de cada produto, conferida e baixada pelas lojas.', tabs: tabsOf('inventory'),
    content: `<div class="metrics three"><div class="surface metric"><span>Produtos com estoque controlado</span><b>${all.filter(row => row.trackInventory).length}</b></div>
      <div class="surface metric"><span>Estoque baixo ou zerado</span><b>${low.length}</b></div><div class="surface metric"><span>Unidades disponíveis</span><b>${all.filter(row => row.trackInventory).reduce((n, row) => n + Math.max(0, Number(row.quantity) || 0), 0)}</b></div></div>
      <div class="toolbar">${search(c.query, 'Buscar por produto ou SKU…')}</div>
      ${rows.length ? `<div class="surface table-shell"><table class="ct-inv"><thead><tr><th scope="col">Produto</th><th scope="col">SKU</th><th scope="col">Disponível</th><th scope="col">Controlar estoque</th>
        <th scope="col">Vender sem estoque</th><th scope="col">Alertar com</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${rows.map(row => { const qty = Number(row.quantity) || 0, warn = row.trackInventory && qty <= (Number(row.lowStock) || 0);
        return `<tr data-ct-inv="${h(row.id)}"><td><b data-no-translate="1">${h(row.name)}</b>${warn ? ` ${badge(qty <= 0 ? 'Sem estoque' : 'Estoque baixo', qty <= 0 ? 'red' : 'gold')}` : ''}</td>
          <td><input data-ct-field="sku" maxlength="40" value="${h(row.sku || '')}" aria-label="SKU de ${h(row.name)}"></td>
          <td><input type="number" data-ct-field="quantity" min="-100000" max="1000000" value="${h(qty)}" aria-label="Quantidade de ${h(row.name)}"${row.trackInventory ? '' : ' disabled'}></td>
          <td><input type="checkbox" data-ct-field="trackInventory" ${row.trackInventory ? 'checked' : ''} aria-label="Controlar estoque de ${h(row.name)}"></td>
          <td><input type="checkbox" data-ct-field="allowBackorder" ${row.allowBackorder ? 'checked' : ''} aria-label="Vender ${h(row.name)} sem estoque"${row.trackInventory ? '' : ' disabled'}></td>
          <td><input type="number" data-ct-field="lowStock" min="0" max="100000" value="${h(row.lowStock ?? 0)}" aria-label="Alerta de estoque de ${h(row.name)}"${row.trackInventory ? '' : ' disabled'}></td>
          <td class="right dc-actions"><button type="button" class="secondary" data-ct-act="save-inv" data-id="${h(row.id)}" disabled>Salvar</button>
            <button type="button" class="icon-btn" data-ct-act="inv-log" data-id="${h(row.id)}" aria-label="Histórico de ${h(row.name)}" title="Histórico">${icon('clock', 16)}</button></td></tr>`; }).join('')}</tbody></table></div>
        <p class="dim ct-note">O limite de estoque por loja (Sites → Lojas) continua valendo: a loja vende até o menor dos dois. Pedidos cancelados devolvem as unidades.</p>`
      : empty(all.length ? 'Nenhum produto encontrado' : 'Nenhum produto de pagamento único', all.length ? 'Tente outra busca.' : 'Crie produtos em Pagamentos → Produtos para controlar o estoque.')}` });
}

/* ───────── Avaliações ───────── */

function reviewsScreen(c) {
  const products = new Map(c.s.products.map(row => [row.id, row.name])), stores = new Map((c.s.stores || []).map(row => [row.id, row.name]));
  const all = (c.s.productReviews || []).filter(row => matches(c, row.name, row.email, row.title, row.body, products.get(row.productId)));
  const rows = all.filter(row => row.status === cv.review).sort((a, b) => b.created.localeCompare(a.created));
  const actions = row => ({
    pending: [['approved', 'Aprovar', 'primary'], ['unapproved', 'Reprovar', 'secondary']],
    approved: [['unapproved', 'Reprovar', 'secondary']],
    unapproved: [['approved', 'Aprovar', 'secondary']],
    trash: [['pending', 'Restaurar', 'secondary']]
  }[row.status] || []).map(([status, label, tone]) => `<button type="button" class="${tone}" data-ct-act="review" data-status="${status}" data-id="${h(row.id)}">${label}</button>`).join('')
    + (row.status === 'trash' ? `<button type="button" class="icon-btn" data-ct-act="delete" data-key="productReviews" data-id="${h(row.id)}" aria-label="Excluir de vez" title="Excluir de vez">${icon('trash', 16)}</button>`
      : `<button type="button" class="icon-btn" data-ct-act="reply" data-id="${h(row.id)}" aria-label="Responder" title="Responder">${icon('chat', 16)}</button><button type="button" class="icon-btn" data-ct-act="review" data-status="trash" data-id="${h(row.id)}" aria-label="Mover para a lixeira" title="Lixeira">${icon('trash', 16)}</button>`);
  const pending = all.filter(row => row.status === 'pending');
  return pageShell({ title: 'Pagamentos', desc: 'Avaliações enviadas pela página dos produtos nas lojas. Só as aprovadas aparecem.',
    cta: pending.length ? `<button type="button" class="primary" data-ct-act="approve-all">Aprovar ${pending.length} pendente${pending.length === 1 ? '' : 's'}</button>` : '', tabs: tabsOf('reviews'),
    content: `<div class="dc-page"><div class="dc-segment" role="group" aria-label="Situação das avaliações">${reviewTabs.map(([value, text]) =>
      `<button type="button" data-ct-review="${value}" aria-pressed="${cv.review === value}">${text} <span>${all.filter(row => row.status === value).length}</span></button>`).join('')}</div>
      <div class="toolbar dc-toolbar">${search(c.query, 'Buscar por autor, texto ou produto…')}</div>
      ${rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Autor</th><th scope="col">Avaliação</th><th scope="col">Nota</th><th scope="col">Data</th><th scope="col">Produto e loja</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${rows.map(row => `<tr><td>${h(row.name)}<small class="dim">${h(row.email)}</small></td><td class="ct-review" data-no-translate="1">${row.title ? `<b>${h(row.title)}</b>` : ''}<p>${h(row.body)}</p>${row.reply ? `<small class="dim">Resposta: ${h(row.reply)}</small>` : ''}</td>
          <td>${stars(row.rating)}</td><td>${h(fmt(row.created, c.s.profile.timezone))}</td><td data-no-translate="1">${h(products.get(row.productId) || '—')}<small class="dim">${h(stores.get(row.storeId) || '')}</small></td>
          <td class="right dc-actions">${actions(row)}</td></tr>`).join('')}</tbody></table></div>`
        : empty('Nenhuma avaliação aqui', (c.s.productReviews || []).length ? 'Veja as outras abas.' : 'Na página de cada produto da loja há um formulário de avaliação. As novas chegam aqui como pendentes.')}</div>` });
}

/* ───────── Cartões-presente ───────── */

function giftCardsScreen(c) {
  const all = c.s.giftCards || [], rows = all.filter(row => matches(c, row.code, row.recipientName, row.recipientEmail)).sort((a, b) => b.created.localeCompare(a.created));
  const active = all.filter(row => cardStatus(row)[0] === 'Ativo'), selling = c.s.products.filter(row => row.giftCard);
  return pageShell({ title: 'Pagamentos', desc: 'Cartões com saldo para usar no carrinho das lojas.',
    cta: `<button type="button" class="secondary" data-ct-act="gift-products">${icon('box', 15)} Vender como produto</button><button type="button" class="primary" data-ct-act="gift-new">${icon('plus', 16)} Novo cartão-presente</button>`, tabs: tabsOf('gift-cards'),
    content: `<div class="metrics three"><div class="surface metric"><span>Cartões ativos</span><b>${active.length}</b></div><div class="surface metric"><span>Saldo em aberto</span><b>${money(active.reduce((n, row) => n + row.balance, 0))}</b></div>
      <div class="surface metric"><span>Já usado nas lojas</span><b>${money(all.reduce((n, row) => n + (row.history || []).filter(entry => entry.kind === 'redeemed').reduce((m, entry) => m - entry.amount, 0) - (row.history || []).filter(entry => entry.kind === 'refunded').reduce((m, entry) => m + entry.amount, 0), 0))}</b></div></div>
      <p class="dim ct-note">${selling.length ? `Vendidos como produto: ${selling.map(row => h(row.name)).join(', ')}. Cada unidade paga vira um cartão enviado ao comprador.` : 'Marque produtos em “Vender como produto” para que cada unidade paga vire um cartão-presente.'}</p>
      <div class="toolbar">${search(c.query, 'Buscar por código ou destinatário…')}</div>
      ${rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Código</th><th scope="col">Para</th><th scope="col" class="right">Valor</th><th scope="col" class="right">Saldo</th><th scope="col">Validade</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${rows.map(row => { const [label, tone] = cardStatus(row);
          return `<tr><td><code data-no-translate="1">${h(row.code)}</code><small class="dim">${row.source === 'order' ? 'Vendido na loja' : 'Emitido manualmente'}</small></td><td>${h(row.recipientName || '—')}<small class="dim">${h(row.recipientEmail || '')}</small></td>
            <td class="right">${money(row.initialValue)}</td><td class="right"><b>${money(row.balance)}</b></td><td>${h(day(row.expiresAt))}</td><td>${badge(label, tone)}</td>
            <td class="right dc-actions">${label === 'Ativo' && row.recipientEmail ? `<button type="button" class="secondary" data-ct-act="gift-send" data-id="${h(row.id)}">${icon('send', 14)} Enviar</button>` : ''}
              <button type="button" class="icon-btn" data-ct-act="gift-adjust" data-id="${h(row.id)}" aria-label="Ajustar saldo de ${h(row.code)}" title="Ajustar saldo">${icon('edit', 16)}</button>
              <button type="button" class="icon-btn" data-ct-act="gift-log" data-id="${h(row.id)}" aria-label="Histórico de ${h(row.code)}" title="Histórico">${icon('clock', 16)}</button>
              <button type="button" class="secondary" data-ct-act="gift-toggle" data-id="${h(row.id)}">${row.status === 'disabled' ? 'Ativar' : 'Desativar'}</button>
              ${row.balance >= row.initialValue ? `<button type="button" class="icon-btn" data-ct-act="delete" data-key="giftCards" data-id="${h(row.id)}" aria-label="Excluir ${h(row.code)}" title="Excluir">${icon('trash', 16)}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
        : empty(all.length ? 'Nenhum cartão encontrado' : 'Nenhum cartão-presente ainda', all.length ? 'Tente outra busca.' : 'Crie um cartão com saldo e envie por e-mail. O cliente usa o código no carrinho da loja, no campo “Cartão-presente”.')}` });
}

export const catalogTabs = ['collections', 'inventory', 'reviews', 'gift-cards'];
export const catalogScreen = c => ({ collections: collectionsScreen, inventory: inventoryScreen, reviews: reviewsScreen, 'gift-cards': giftCardsScreen })[c.tab](c);

/* ───────── Ações ───────── */

const historyNames = { issued: 'Emitido', redeemed: 'Usado', refunded: 'Estornado', adjusted: 'Ajuste' };

export function installCatalog({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'payments' && catalogTabs.includes(c.tab);
  document.addEventListener('change', event => {
    const el = event.target;
    if (!here() || !el.matches('[data-ct-field]')) return;
    const row = el.closest('[data-ct-inv]');
    row.querySelector('[data-ct-act="save-inv"]').disabled = false;
    if (el.dataset.ctField === 'trackInventory') for (const input of row.querySelectorAll('[data-ct-field="quantity"],[data-ct-field="allowBackorder"],[data-ct-field="lowStock"]')) input.disabled = !el.checked;
  });
  document.addEventListener('input', event => {
    if (here() && event.target.matches('[data-ct-field]')) event.target.closest('[data-ct-inv]').querySelector('[data-ct-act="save-inv"]').disabled = false;
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ct-act],[data-ct-review]');
    if (!el || !(here() || el.closest('#overlay'))) return;
    const ds = el.dataset;
    try {
      if (ds.ctReview) { cv.review = ds.ctReview; render(); return; }
      const card = (c.s.giftCards || []).find(row => row.id === ds.id);
      switch (ds.ctAct) {
        case 'collection': {
          const row = (c.s.productCollections || []).find(item => item.id === ds.id) || { name: '', description: '', productIds: [] };
          dialog(ds.id ? 'Editar coleção' : 'Nova coleção', `<form class="co-form" data-ct-form="collection" data-id="${h(ds.id || '')}"><label>Nome<input name="name" required maxlength="80" value="${h(row.name)}" placeholder="Ex.: Presentes"></label>
            <label>Descrição (opcional)<input name="description" maxlength="400" value="${h(row.description)}"></label>
            <fieldset class="ct-pick"><legend>Produtos</legend>${oneTime(c).map(product => `<label><input type="checkbox" name="productIds" value="${h(product.id)}"${row.productIds.includes(product.id) ? ' checked' : ''}> <span data-no-translate="1">${h(product.name)}</span></label>`).join('') || '<p class="dim">Nenhum produto de pagamento único.</p>'}</fieldset>
            ${formEnd(ds.id ? 'Salvar' : 'Criar coleção')}</form>`);
          return;
        }
        case 'delete':
          dialog('Excluir', `<form class="co-form" data-ct-form="delete" data-key="${h(ds.key)}" data-id="${h(ds.id)}"><p>${ds.key === 'productReviews' ? 'A avaliação será excluída de vez.' : ds.key === 'giftCards' ? 'O cartão-presente será excluído. O código deixa de funcionar.' : 'A coleção será excluída. Os produtos continuam na loja.'}</p>${formEnd('Excluir', 'danger')}</form>`);
          return;
        case 'save-inv': {
          const row = el.closest('[data-ct-inv]'), value = name => row.querySelector(`[data-ct-field="${name}"]`);
          el.disabled = true;
          await mutate({ type: 'catalog-inventory', data: { productId: ds.id, sku: value('sku').value, trackInventory: value('trackInventory').checked, allowBackorder: value('allowBackorder').checked,
            quantity: value('quantity').value, lowStock: value('lowStock').value } });
          render(); flash('Estoque salvo.'); return;
        }
        case 'inv-log': {
          const product = c.s.products.find(row => row.id === ds.id);
          const log = (c.s.inventoryLog || []).filter(row => row.productId === ds.id).reverse().slice(0, 100);
          dialog(`Histórico de estoque · ${product?.name || ''}`, `<div class="co-form">${log.length ? `<ol class="dc-trail">${log.map(row => `<li><b>${row.delta > 0 ? '+' : ''}${row.delta}</b> → ${row.quantity} · ${h(row.reason)} · ${h(fmt(row.at, c.s.profile.timezone, true))}${row.by ? ` · ${h(row.by)}` : ''}</li>`).join('')}</ol>` : '<p class="dim">Nenhuma movimentação ainda.</p>'}
            <div class="co-form-actions"><button type="button" class="primary" data-act="close">Fechar</button></div></div>`);
          return;
        }
        case 'review': await mutate({ type: 'catalog-reviews', data: { ids: [ds.id], status: ds.status } }); render(); flash({ approved: 'Avaliação aprovada.', unapproved: 'Avaliação reprovada.', trash: 'Avaliação na lixeira.', pending: 'Avaliação restaurada.' }[ds.status]); return;
        case 'approve-all': {
          const ids = (c.s.productReviews || []).filter(row => row.status === 'pending').map(row => row.id);
          await mutate({ type: 'catalog-reviews', data: { ids, status: 'approved' } }); render(); flash(`${ids.length} avaliaç${ids.length === 1 ? 'ão aprovada' : 'ões aprovadas'}.`); return;
        }
        case 'reply': {
          const row = (c.s.productReviews || []).find(item => item.id === ds.id);
          dialog('Responder avaliação', `<form class="co-form" data-ct-form="reply" data-id="${h(row.id)}"><blockquote class="ct-quote" data-no-translate="1">${stars(row.rating)} ${h(row.body)}</blockquote>
            <label>Resposta da loja (aparece abaixo da avaliação)<textarea name="reply" rows="3" maxlength="1000">${h(row.reply || '')}</textarea></label>${formEnd('Salvar resposta')}</form>`);
          return;
        }
        case 'gift-new':
          dialog('Novo cartão-presente', `<form class="co-form" data-ct-form="gift"><label>Valor (R$)<input name="value" type="number" min="0.01" max="100000" step="0.01" required></label>
            <div class="field-grid"><label>Para (nome)<input name="recipientName" maxlength="120"></label><label>E-mail<input name="recipientEmail" type="email" maxlength="160"></label></div>
            <label>Mensagem (opcional)<textarea name="message" rows="2" maxlength="500"></textarea></label><label>Validade (opcional)<input name="expiresAt" type="date"></label>
            <fieldset class="dc-channels"><label><input type="checkbox" name="send" checked><span><b>Enviar por e-mail agora</b><small>Com o código e a mensagem.</small></span></label></fieldset>${formEnd('Criar cartão')}</form>`);
          return;
        case 'gift-send': await mutate({ type: 'catalog-giftcard-send', id: ds.id }); render(); flash(`Cartão enviado para ${card.recipientEmail}.`); return;
        case 'gift-toggle': await mutate({ type: 'save', key: 'giftCards', id: ds.id, data: { ...card, status: card.status === 'disabled' ? 'active' : 'disabled' } }); render(); flash(card.status === 'disabled' ? 'Cartão ativado.' : 'Cartão desativado.'); return;
        case 'gift-adjust':
          dialog(`Ajustar saldo · ${card.code}`, `<form class="co-form" data-ct-form="adjust" data-id="${h(card.id)}"><p>Saldo atual: <b>${money(card.balance)}</b>. Use um valor negativo para descontar.</p>
            <label>Ajuste (R$)<input name="amount" type="number" step="0.01" required></label><label>Motivo<input name="reason" maxlength="120"></label>${formEnd('Ajustar')}</form>`);
          return;
        case 'gift-log':
          dialog(`Histórico · ${card.code}`, `<div class="co-form"><ol class="dc-trail">${[...(card.history || [])].reverse().map(row => `<li><b>${historyNames[row.kind] || row.kind}</b> ${row.amount > 0 ? '+' : ''}${money(row.amount)} · ${h(fmt(row.at, c.s.profile.timezone, true))}${row.detail ? ` · ${h(row.detail)}` : ''}</li>`).join('')}</ol>
            <div class="co-form-actions"><button type="button" class="primary" data-act="close">Fechar</button></div></div>`);
          return;
        case 'gift-products':
          dialog('Vender cartões-presente como produto', `<form class="co-form" data-ct-form="gift-products"><p>Marque os produtos que, quando pagos, viram um cartão-presente com o valor do produto, enviado ao comprador. Coloque-os numa loja para vender.</p>
            <fieldset class="ct-pick"><legend>Produtos</legend>${c.s.products.filter(row => row.kind === 'One time').map(product => `<label><input type="checkbox" name="productIds" value="${h(product.id)}"${product.giftCard ? ' checked' : ''}> <span data-no-translate="1">${h(product.name)} · ${money(product.price)}</span></label>`).join('') || '<p class="dim">Crie um produto de pagamento único, por exemplo “Cartão-presente R$ 100”.</p>'}</fieldset>${formEnd('Salvar')}</form>`);
          return;
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ct-form]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-ct-error]');
    submit.disabled = true; error.textContent = '';
    try {
      const id = form.dataset.id;
      switch (form.dataset.ctForm) {
        case 'collection': await mutate({ type: 'save', key: 'productCollections', id: id || undefined, data: { name: fields.get('name'), description: fields.get('description'), productIds: fields.getAll('productIds') } }); flash('Coleção salva.'); break;
        case 'delete': await mutate({ type: 'delete', key: form.dataset.key, id }); flash('Excluído.'); break;
        case 'reply': { const row = c.s.productReviews.find(item => item.id === id); await mutate({ type: 'save', key: 'productReviews', id, data: { status: row.status, reply: fields.get('reply') } }); flash('Resposta salva.'); break; }
        case 'gift': {
          const created = await mutate({ type: 'save', key: 'giftCards', data: { value: fields.get('value'), recipientName: fields.get('recipientName'), recipientEmail: fields.get('recipientEmail'), message: fields.get('message'), expiresAt: fields.get('expiresAt') } });
          if (fields.has('send') && fields.get('recipientEmail')) await mutate({ type: 'catalog-giftcard-send', id: created });
          flash(fields.has('send') && fields.get('recipientEmail') ? 'Cartão criado e enviado.' : 'Cartão criado.'); break;
        }
        case 'adjust': await mutate({ type: 'catalog-giftcard-adjust', id, data: { amount: fields.get('amount'), reason: fields.get('reason') } }); flash('Saldo ajustado.'); break;
        case 'gift-products': await mutate({ type: 'catalog-giftcard-products', data: { productIds: fields.getAll('productIds') } }); flash('Produtos de cartão-presente salvos.'); break;
      }
      close(); render();
    } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
  });
}
