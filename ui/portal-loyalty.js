// Client portal → Fidelidade (6b.3): balance, level, the rewards to redeem and the latest movements.
import { icon } from './icons.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = n => new Intl.NumberFormat('pt-BR').format(n);
const when = iso => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(iso));

export function loyaltyCard(l, redeemed = null) {
  if (!l) return '';
  return `<section class="cp-library cp-loyalty" id="fidelidade"><h2>${h(l.name)}</h2>
    <div class="cp-public-card cp-loyalty-head"><div><small class="cp-meta">Seu saldo</small><b>${fmt(l.balance)} ${h(l.pointsName)}</b>
      <small class="cp-meta">Nível <b>${h(l.tier)}</b>${l.next ? ` · faltam ${fmt(l.next.missing)} para ${h(l.next.name)}` : ''}</small></div>
      <small class="cp-meta">Você ganha ${fmt(l.perReal)} ${h(l.pointsName)} a cada R$ 1 em compras.</small></div>
    ${redeemed ? `<p class="cp-public-card cp-loyalty-code" role="status">${icon('gift', 18)} Resgate feito: <b>${h(redeemed.reward)}</b>. Seu código: <code>${h(redeemed.code)}</code>${redeemed.kind?.startsWith('coupon') ? ' (use no checkout em até 90 dias)' : ' (mostre à equipe)'}.</p>` : ''}
    ${l.rewards.length ? `<div class="cp-course-grid">${l.rewards.map(r => `<article class="cp-public-card cp-reward"><strong>${h(r.name)}</strong>${r.description ? `<p>${h(r.description)}</p>` : ''}
      <span class="cp-tag">${fmt(r.cost)} ${h(l.pointsName)}</span>
      <button type="button" class="${l.balance >= r.cost ? 'cp-public-primary' : 'cp-public-ghost'}" data-loyalty-redeem="${h(r.id)}" ${l.balance >= r.cost ? '' : 'disabled'}>${l.balance >= r.cost ? 'Resgatar' : `Faltam ${fmt(r.cost - l.balance)}`}</button></article>`).join('')}</div>` : ''}
    ${l.history.length ? `<details class="cp-public-card"><summary>Extrato</summary><ul class="cp-loyalty-history">${l.history.map(row => `<li><span>${h(row.reason)}${row.code ? ` · <code>${h(row.code)}</code>` : ''}</span><small>${h(when(row.at))}</small><b class="${row.points < 0 ? 'neg' : ''}">${row.points > 0 ? '+' : ''}${fmt(row.points)}</b></li>`).join('')}</ul></details>` : ''}</section>`;
}
