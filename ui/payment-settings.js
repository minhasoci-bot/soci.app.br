// Pagamentos → Configurações: the receipt (title, prefix and start number, sender name, reply-to, subject and
// message with variables, plus a preview of the e-mail) and the tax list used on the lines of invoices,
// templates, recurring invoices and estimates. Follows GoHighLevel's /payments/settings/receipts.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { crmTabs } from './crm.js';
import { paymentDefaults, receiptVariables } from './invoice-data.js';

const ps = { draft: null, rev: '', dirty: false };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const field = (label, control, hint = '') => `<label class="es-field">${h(label)}${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
const newId = () => `tax-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const fill = (template, values) => String(template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);

function load(c) {
  const saved = c.s.paymentSettings || paymentDefaults();
  const rev = JSON.stringify(saved);
  if (!ps.draft || (!ps.dirty && ps.rev !== rev)) Object.assign(ps, { rev, draft: { receipts: { ...paymentDefaults().receipts, ...saved.receipts }, taxes: structuredClone(saved.taxes || []) }, dirty: false });
  return ps.draft;
}
const nextReceipt = (c, r) => `${r.prefix}${String(Math.max(Number(c.s.receiptSeq) || 0, (Number(r.startNumber) || 1) - 1) + 1).padStart(4, '0')}`;

function previewMail(c, r) {
  const values = { numero_recibo: nextReceipt(c, r), titulo: r.title, fatura: 'FAT-0001 · Gestão de redes sociais', valor: money(1200), cliente: 'Ana Souza',
    empresa: c.s.profile.name, data_pagamento: new Date().toLocaleDateString('pt-BR') };
  return `<div class="ps-mail" data-no-translate="1"><p class="ps-mail-head"><b>De:</b> ${h(r.fromName || c.s.profile.name)}${r.replyTo ? ` · <b>Responder para:</b> ${h(r.replyTo)}` : ''}</p>
    <p class="ps-mail-head"><b>Assunto:</b> ${h(fill(r.subject, values))}</p><div class="ps-mail-body">${h(fill(r.message, values)).replace(/\n/g, '<br>')}<br><br>Veja o recibo e a fatura:<br><span class="ps-link">${h(location.origin)}/fatura/…</span></div></div>`;
}

export function paymentSettingsScreen(c) {
  const d = load(c), r = d.receipts;
  const taxes = d.taxes.length ? `<div class="table-shell"><table class="ps-taxes"><thead><tr><th scope="col">Nome</th><th scope="col">Alíquota (%)</th><th scope="col">Descrição</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${d.taxes.map((tax, index) => `<tr><td><input data-ps-tax="name" data-index="${index}" maxlength="60" value="${h(tax.name)}" aria-label="Nome do imposto"></td>
      <td><input type="number" data-ps-tax="rate" data-index="${index}" min="0.01" max="100" step="0.01" value="${h(tax.rate)}" aria-label="Alíquota de ${h(tax.name)}"></td>
      <td><input data-ps-tax="description" data-index="${index}" maxlength="200" value="${h(tax.description || '')}" aria-label="Descrição de ${h(tax.name)}"></td>
      <td class="right"><button type="button" class="icon-btn" data-ps-act="remove-tax" data-index="${index}" aria-label="Remover ${h(tax.name)}" title="Remover">${icon('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="dim">Nenhum imposto cadastrado. Sem impostos, o total das faturas é a soma dos itens.</p>';
  return pageShell({ title: 'Pagamentos', desc: 'Recibos enviados quando uma fatura é paga e os impostos dos itens.',
    cta: `<button type="button" class="primary" data-ps-save${ps.dirty ? '' : ' disabled'}>Salvar configurações</button>`,
    tabs: { key: 'payments', items: crmTabs.payments, current: 'payment-settings', label: 'Seções de pagamentos' },
    content: `<div class="ps-grid"><section class="surface padded es-form" aria-labelledby="ps-receipts"><h2 id="ps-receipts">Recibos</h2>
        <fieldset class="dc-channels"><label><input type="checkbox" data-ps="enabled" ${r.enabled ? 'checked' : ''}><span><b>Enviar o recibo por e-mail quando a fatura for paga</b>
          <small>Vale para pagamentos pelo AbacatePay, baixas manuais e pedidos da loja. O número do recibo é dado mesmo com o envio desligado.</small></span></label></fieldset>
        <div class="es-two">${field('Título', `<input data-ps="title" maxlength="40" value="${h(r.title)}">`, 'Aparece no e-mail e na página da fatura paga.')}
          ${field('Prefixo', `<input data-ps="prefix" maxlength="12" value="${h(r.prefix)}">`)}</div>
        <div class="es-two">${field('Número inicial', `<input type="number" data-ps="startNumber" min="1" max="9999999" value="${h(r.startNumber)}">`, `Próximo recibo: <b data-ps-next>${h(nextReceipt(c, r))}</b>`)}
          ${field('Nome do remetente', `<input data-ps="fromName" maxlength="80" value="${h(r.fromName)}" placeholder="${h(c.s.profile.name)}">`)}</div>
        ${field('Responder para', `<input type="email" data-ps="replyTo" maxlength="160" value="${h(r.replyTo)}" placeholder="financeiro@suaempresa.com.br">`, 'O e-mail sai pelo endereço da plataforma; as respostas do cliente vão para este endereço.')}
        ${field('Assunto', `<input data-ps="subject" maxlength="200" value="${h(r.subject)}">`)}
        ${field('Mensagem', `<textarea data-ps="message" rows="5" maxlength="3000">${h(r.message)}</textarea>`, 'O link para a fatura paga entra no fim da mensagem.')}
        <p class="ps-vars"><span class="dim">Variáveis:</span> ${receiptVariables.map(([key, label]) => `<button type="button" class="chip" data-ps-var="${key}" title="${h(label)}">{{${key}}}</button>`).join(' ')}</p>
        <h3>Prévia do e-mail</h3><div data-ps-preview>${previewMail(c, r)}</div></section>
      <section class="surface padded" aria-labelledby="ps-taxes"><div class="inline-gap ps-head"><h2 id="ps-taxes">Impostos</h2><button type="button" class="secondary" data-ps-act="add-tax">${icon('plus', 14)} Adicionar imposto</button></div>
        <p class="dim">O imposto é somado ao valor do item. Escolha-o em cada item de faturas, modelos, faturas recorrentes e orçamentos. Mudar uma alíquota vale para o que você salvar depois; o que já foi enviado ou emitido mantém a alíquota de quando foi salvo.</p>
        ${taxes}</section></div>` });
}

export function installPaymentSettings({ c, mutate, flash, render }) {
  const here = () => c.view === 'payments' && c.tab === 'payment-settings' && ps.draft;
  const touch = () => {
    if (!ps.dirty) { ps.dirty = true; const save = document.querySelector('[data-ps-save]'); if (save) save.disabled = false; }
    const preview = document.querySelector('[data-ps-preview]'); if (preview) preview.innerHTML = previewMail(c, ps.draft.receipts);
    const next = document.querySelector('[data-ps-next]'); if (next) next.textContent = nextReceipt(c, ps.draft.receipts);
  };
  let focused = null;
  window.addEventListener('beforeunload', event => { if (ps.dirty && here()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('focusin', event => { if (here() && event.target.matches('[data-ps="subject"], [data-ps="message"]')) focused = event.target; });
  document.addEventListener('input', event => {
    if (!here()) return;
    const el = event.target;
    if (el.matches('[data-ps]') && el.type !== 'checkbox') { ps.draft.receipts[el.dataset.ps] = el.type === 'number' ? Number(el.value) : el.value; touch(); }
    if (el.matches('[data-ps-tax]')) { const tax = ps.draft.taxes[Number(el.dataset.index)]; if (tax) { tax[el.dataset.psTax] = el.type === 'number' ? Number(el.value) : el.value; touch(); } }
  });
  document.addEventListener('change', event => {
    if (!here() || !event.target.matches('input[type=checkbox][data-ps]')) return;
    ps.draft.receipts[event.target.dataset.ps] = event.target.checked; touch();
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ps-act],[data-ps-save],[data-ps-var]');
    if (!el || !here()) return;
    try {
      if (el.dataset.psVar) {
        const target = focused || document.querySelector('[data-ps="message"]');
        const token = `{{${el.dataset.psVar}}}`, at = target.selectionStart ?? target.value.length;
        target.value = `${target.value.slice(0, at)}${token}${target.value.slice(target.selectionEnd ?? at)}`;
        ps.draft.receipts[target.dataset.ps] = target.value; target.focus(); target.setSelectionRange(at + token.length, at + token.length); touch(); return;
      }
      if (el.dataset.psAct === 'add-tax') { ps.draft.taxes.push({ id: newId(), name: 'ISS', rate: 5, description: '' }); ps.dirty = true; render(); document.querySelector('[data-ps-tax="name"]:last-of-type')?.focus(); return; }
      if (el.dataset.psAct === 'remove-tax') { ps.draft.taxes.splice(Number(el.dataset.index), 1); ps.dirty = true; render(); return; }
      if ('psSave' in el.dataset) {
        el.disabled = true;
        await mutate({ type: 'payment-settings', data: ps.draft });
        ps.dirty = false; ps.draft = null; render(); flash('Configurações de pagamento salvas.');
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });
}
