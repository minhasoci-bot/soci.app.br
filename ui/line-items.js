// Price list editor shared by estimates (and ready for invoices): one fieldset per item with name,
// description, quantity, price, discount and the optional flag, plus "add from catalog" and "custom item".
// The math lives in document-data.js (lineTotal, itemCounts), the same the server uses.
import { h } from './screens.js';
import { icon } from './icons.js';
import { itemsSummary, lineTotal, newId } from './document-data.js';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const box = (label, attributes, value, type = 'text', extra = '') => `<label class="li-field">${h(label)}<input type="${type}" ${attributes} value="${h(value ?? '')}" ${extra}></label>`;
export const itemsTotal = items => itemsSummary(items).total;
const totalText = items => { const sum = itemsSummary(items); return sum.tax ? `${money(sum.total)} (impostos ${money(sum.tax)})` : money(sum.total); };

export function lineItemsEditor(items, products, { optional = true, taxes = [] } = {}) {
  return `<div class="li-list">${items.map((item, index) => `<fieldset class="li-item"><legend>${h(item.name || `Item ${index + 1}`)}</legend>
      <div class="li-row li-main">${box('Nome', `data-li="name" data-index="${index}"`, item.name, 'text', 'maxlength="160"')}${box('Descrição', `data-li="description" data-index="${index}"`, item.description, 'text', 'maxlength="600"')}</div>
      <div class="li-row li-nums">${box('Qtd.', `data-li="qty" data-index="${index}"`, item.qty, 'number', 'min="0.01" step="any"')}${box('Preço (R$)', `data-li="price" data-index="${index}"`, item.price, 'number', 'min="0" step="0.01"')}
        ${box('Desc. %', `data-li="discount" data-index="${index}"`, item.discount, 'number', 'min="0" max="100" step="any"')}<span class="li-line" data-li-line="${index}">${money(lineTotal(item))}</span></div>
      ${taxes.length || item.taxId ? `<div class="li-row"><label class="li-field">Imposto<select data-li="taxId" data-index="${index}"><option value="">Sem imposto</option>${taxes.map(tax =>
        `<option value="${h(tax.id)}"${tax.id === item.taxId ? ' selected' : ''}>${h(tax.name)} · ${h(String(tax.rate).replace('.', ','))}%</option>`).join('')}${item.taxId && !taxes.some(tax => tax.id === item.taxId) ? `<option value="${h(item.taxId)}" selected>${h(item.taxName || 'Imposto')} · ${h(item.taxRate)}% (removido)</option>` : ''}</select></label></div>` : ''}
      <div class="li-row li-flags">${optional ? `<label class="li-check"><input type="checkbox" data-li="optional" data-index="${index}" ${item.optional ? 'checked' : ''}> Opcional (o cliente escolhe)</label>` : ''}
        ${optional && item.optional ?`<label class="li-check"><input type="checkbox" data-li="selected" data-index="${index}" ${item.selected ? 'checked' : ''}> Vem marcado</label>` : ''}
        <span class="li-tools"><button type="button" class="icon-btn" data-li-move="-1" data-index="${index}" aria-label="Mover para cima" title="Mover para cima"${index ? '' : ' disabled'}>↑</button>
        <button type="button" class="icon-btn" data-li-move="1" data-index="${index}" aria-label="Mover para baixo" title="Mover para baixo"${index < items.length - 1 ? '' : ' disabled'}>↓</button>
        <button type="button" class="icon-btn" data-li-del="${index}" aria-label="Remover ${h(item.name)}" title="Remover">${icon('trash', 15)}</button></span></div></fieldset>`).join('')}</div>
    <div class="li-add"><label class="li-field">Adicionar produto do catálogo<select data-li-add><option value="">Escolha um produto…</option>${products.filter(p => p.active !== false)
      .map(p => `<option value="${h(p.id)}">${h(p.name)} · ${money(p.price)}</option>`).join('')}</select></label>
      <button type="button" class="secondary" data-li-blank>${icon('plus', 14)} Item avulso</button></div>
    <p class="li-total">Total: <b data-li-total>${totalText(items)}</b></p>`;
}

/** Applies a typed value; returns true when the totals changed (the caller repaints the preview). */
export function lineItemInput(items, el) {
  const item = items[Number(el.dataset.index)], key = el.dataset.li;
  if (!item || el.type === 'checkbox' || el.tagName === 'SELECT') return false;
  item[key] = ['qty', 'price', 'discount'].includes(key) ? Number(el.value) : el.value;
  const line = document.querySelector(`[data-li-line="${el.dataset.index}"]`); if (line) line.textContent = money(lineTotal(item));
  const total = document.querySelector('[data-li-total]'); if (total) total.textContent = totalText(items);
  return true;
}

/** Checkboxes, the catalog picker and the buttons; returns true when the list changed (the caller re-renders). */
export function lineItemAction(items, el, products, taxes = []) {
  if (el.matches('select[data-li="taxId"]')) {
    const item = items[Number(el.dataset.index)], tax = taxes.find(row => row.id === el.value);
    if (!item) return false;
    if (tax) Object.assign(item, { taxId: tax.id, taxName: tax.name, taxRate: tax.rate });
    else if (el.value !== item.taxId) { delete item.taxId; delete item.taxName; delete item.taxRate; }
    return true;
  }
  if (el.matches('[data-li="optional"], [data-li="selected"]')) {
    const item = items[Number(el.dataset.index)];
    item[el.dataset.li] = el.checked;
    if (el.dataset.li === 'optional') item.selected = true;
    return true;
  }
  if (el.matches('[data-li-add]') && el.value) {
    const product = products.find(row => row.id === el.value);
    if (product) items.push({ id: newId(), productId: product.id, name: product.name, description: product.description || '', qty: 1, price: product.price, discount: 0,
      interval: product.kind === 'Recurring' ? product.interval : '', optional: false, selected: true });
    return true;
  }
  if (el.matches('[data-li-blank]')) { items.push({ id: newId(), productId: '', name: 'Novo item', description: '', qty: 1, price: 0, discount: 0, interval: '', optional: false, selected: true }); return true; }
  if (el.matches('[data-li-del]')) { items.splice(Number(el.dataset.liDel), 1); return true; }
  if (el.matches('[data-li-move]')) {
    const from = Number(el.dataset.index), to = from + Number(el.dataset.liMove);
    if (to < 0 || to >= items.length) return false;
    [items[from], items[to]] = [items[to], items[from]];
    return true;
  }
  return false;
}
