// Configurações → Carteira (7.1): the sub-account's credits for what the agency resells (AI, e-mails, WhatsApp),
// the prices it pays, a recharge by Pix or card paid to the agency, and the statement.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { walletProducts } from './agency-data.js';

const brl = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const fine = n => n >= 1 ? brl(n) : `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '—';
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;
const metric = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
const label = key => walletProducts.find(([k]) => k === key)?.[1] || key;
const per = { ai: 'por US$ 1 de consumo de IA', email: 'por 1.000 e-mails', whatsapp: 'por mensagem' };
const quantity = (key, units) => key === 'ai' ? `US$ ${units.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} de consumo` : `${Math.round(units).toLocaleString('pt-BR')} ${key === 'email' ? 'e-mail(s)' : 'mensagem(ns)'}`;
const busy = { topup: false };

function line(entry) {
  if (entry.kind === 'usage') return `<tr><td>${h(entry.day.split('-').reverse().join('/'))}</td><td>${h(label(entry.product))} <small class="dim">· ${h(quantity(entry.product, entry.units))}</small></td><td class="wl-out">− ${fine(entry.amount)}</td></tr>`;
  const what = entry.checkoutId ? `Recarga paga${entry.method ? ` (${h(entry.method)})` : ''}` : entry.kind === 'credit' ? `Crédito lançado pela agência${entry.note ? ` · ${h(entry.note)}` : ''}` : `Ajuste da agência${entry.note ? ` · ${h(entry.note)}` : ''}`;
  return `<tr><td>${h(when(entry.at))}</td><td>${what}</td><td class="${entry.kind === 'credit' ? 'wl-in' : 'wl-out'}">${entry.kind === 'credit' ? '+' : '−'} ${brl(entry.amount)}</td></tr>`;
}

export function walletScreen(c, tabs) {
  const w = c.s.wallet || { balance: 0, pricing: {}, entries: [], topups: [] };
  const products = Object.keys(w.pricing || {});
  const shell = content => pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, content });
  if (!products.length) return shell(`<section class="surface padded"><h2>Carteira de créditos</h2><p class="dim">Esta subconta não tem carteira de créditos. Quando a agência revender IA, e-mails ou WhatsApp para esta conta, o saldo, os preços e o extrato aparecem aqui.</p></section>`);
  const month = new Date().toISOString().slice(0, 7);
  const spent = (w.entries || []).filter(e => e.kind === 'usage' && e.day?.startsWith(month)).reduce((t, e) => t + e.amount, 0);
  const low = w.balance < (w.lowAt ?? 20);
  const pending = (w.topups || []).filter(t => t.status === 'PENDING').slice(0, 3);
  return shell(`
    ${w.balance <= 0 && products.includes('ai') ? `<p class="surface padded wl-alert" role="alert">${icon('alert', 16)} Os créditos acabaram: os recursos de IA estão pausados até a recarga. E-mails e WhatsApp continuam e o saldo fica negativo.</p>` : ''}
    <div class="metrics">${metric('Saldo', `<span class="${w.balance < 0 ? 'wl-out' : ''}">${brl(w.balance)}</span>`, low ? 'Saldo baixo' : 'Disponível')}${metric('Gasto neste mês', brl(spent))}${metric('Produtos na carteira', products.length, products.map(label).map(x => x.split(' (')[0]).join(', '))}</div>
    <div class="stack">
      <form class="surface settings-form set-form" data-wl-form="topup"><section class="set-section"><header class="set-head"><h2>Recarregar</h2><p class="dim">Pague por Pix ou cartão. O crédito entra assim que o pagamento é confirmado.</p></header><div class="set-body">
        <div class="wl-amounts" role="group" aria-label="Valores sugeridos">${[50, 100, 200, 500].map(v => `<button type="button" class="secondary" data-wl="amount" data-value="${v}">${brl(v)}</button>`).join('')}</div>
        <label>Valor (R$)<input name="amount" type="number" min="10" max="5000" step="1" required value="100"></label>
        ${pending.length ? `<p class="dim">Pagamentos em aberto: ${pending.map(t => `<a href="${h(t.url)}" target="_blank" rel="noopener">${brl(t.amount)} · ${h(when(t.createdAt))}</a>`).join(' · ')}</p>` : ''}</div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary"${busy.topup ? ' disabled' : ''}>${icon('pay', 15)} ${busy.topup ? 'Gerando pagamento…' : 'Pagar com Pix ou cartão'}</button></footer></form>
      <section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Preços</h2><p class="dim">O uso é somado por dia no extrato. Os preços são definidos pela sua agência.</p></header><div class="set-body"><ul class="wl-prices">${products.map(key => { const p = w.pricing[key]; const unit = p.unit * p.markup * (key === 'email' ? 1000 : 1); return `<li><span>${h(label(key))}</span><b>${fine(unit)}</b><small class="dim">${per[key] || ''}</small></li>`; }).join('')}</ul></div></div></section>
    </div>
    <section class="surface padded"><h2>Extrato</h2>${(w.entries || []).length ? `<div class="table-shell"><table><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Valor</th></tr></thead><tbody>${w.entries.slice(0, 100).map(line).join('')}</tbody></table></div>` : '<p class="dim">Nenhum lançamento ainda.</p>'}</section>`);
}

export function installWallet({ c, api, url, flash, render }) {
  const here = () => c.view === 'settings' && c.tab === 'wallet';
  document.addEventListener('click', event => {
    const el = event.target.closest('[data-wl]');
    if (!el || !here()) return;
    if (el.dataset.wl === 'amount') { const input = document.querySelector('[data-wl-form="topup"] input[name="amount"]'); if (input) { input.value = el.dataset.value; input.focus(); } }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-wl-form="topup"]');
    if (!form || !here()) return;
    event.preventDefault();
    // Opened now, inside the click, so the browser does not block it; the address comes after the checkout exists.
    const tab = window.open('', '_blank');
    busy.topup = true; render();
    try {
      const result = await api(url('/api/wallet/topup'), { amount: Number(new FormData(form).get('amount')) });
      const fresh = await api(url('/api/state')); c.s = fresh.state;
      if (tab) tab.location.href = result.url; else location.href = result.url;
      flash('Pagamento gerado. Conclua no AbacatePay; o crédito entra quando for confirmado.');
    } catch (error) {
      tab?.close();
      flash(error.message, true);
    } finally { busy.topup = false; render(); }
  });
}
