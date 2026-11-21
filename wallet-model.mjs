// Reselling com margem (7.1): each sub-account has a wallet of credits in reais. The agency chooses, per product,
// what it pays (unit cost) and the markup, and which sub-accounts are rebilled. Usage of a rebilled product is
// charged to the wallet as cost × markup; the agency's profit is the difference. The prices live in the workspace
// as a copy pushed by the server (pricingFor) so every send can charge without loading the agency.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const money = value => Math.round(value * 1e6) / 1e6;
const cents = value => Math.round(value * 100) / 100;

import { walletProducts } from './ui/agency-data.js';
export { walletProducts };
export const walletKeys = walletProducts.map(([key]) => key);
export const walletLimits = { entries: 500, topups: 50, minTopup: 10, maxTopup: 5000, credit: 100000 };
export const walletDefaults = () => ({ balance: 0, pricing: {}, lowAt: 20, entries: [], topups: [] });
export const walletOf = s => { s.wallet = { ...walletDefaults(), ...(s.wallet || {}) }; return s.wallet; };

/** The agency's prices for one sub-account: only the products rebilled there, per single unit. */
export function pricingFor(agency, accountId) {
  const saas = agency?.saas || {};
  const on = new Set(saas.rebill?.[accountId] || []);
  const pricing = {};
  for (const [key, , , fallback] of walletProducts) {
    if (!on.has(key)) continue;
    const typed = Number(saas.unitCosts?.[key] ?? fallback);
    pricing[key] = { unit: money((Number.isFinite(typed) ? typed : fallback) / (key === 'email' ? 1000 : 1)), markup: Math.max(1, Number(saas.rebilling?.[key]) || 1) };
  }
  return { pricing, lowAt: Math.max(0, Number(saas.lowBalance ?? 20) || 0) };
}
export function setPricing(s, { pricing, lowAt }) {
  const w = walletOf(s);
  w.pricing = pricing || {};
  w.lowAt = lowAt ?? w.lowAt;
  return w;
}

const day = at => String(at).slice(0, 10);
const trim = w => { if (w.entries.length > walletLimits.entries) w.entries = w.entries.slice(0, walletLimits.entries); };

/** Charges rebilled usage; same day and product add up in one statement line. Returns the amount charged. */
export function walletCharge(s, product, units, at = new Date().toISOString()) {
  const price = s?.wallet?.pricing?.[product];
  const n = Number(units);
  if (!price || !(n > 0)) return 0;
  const w = s.wallet, cost = money(n * price.unit), amount = money(cost * price.markup);
  const line = w.entries.find(entry => entry.kind === 'usage' && entry.product === product && entry.day === day(at));
  if (line) Object.assign(line, { units: money(line.units + n), cost: money(line.cost + cost), amount: money(line.amount + amount), at });
  else { w.entries.unshift({ id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind: 'usage', product, day: day(at), units: money(n), cost, amount, at }); trim(w); }
  w.balance = money(w.balance - amount);
  return amount;
}

/** A credit (recharge) or a manual debit by the agency. */
export function walletAdjust(s, { kind = 'credit', amount, note = '', by = '', method = '', checkoutId = '', at = new Date().toISOString() }) {
  const value = cents(Number(amount));
  if (!(value > 0) || value > walletLimits.credit) fail('Informe um valor entre R$ 0,01 e R$ 100.000.');
  if (!['credit', 'debit'].includes(kind)) fail('Tipo de lançamento inválido.');
  const w = walletOf(s);
  w.entries.unshift({ id: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind, amount: value, note: String(note || '').trim().slice(0, 200),
    by: String(by || '').slice(0, 120), method: String(method || '').slice(0, 40), checkoutId: String(checkoutId || '').slice(0, 120), day: day(at), at });
  trim(w);
  w.balance = money(w.balance + (kind === 'credit' ? value : -value));
  return w.balance;
}

/** Is this product rebilled here with no credit left? (AI stops; sends keep going and the balance turns negative.) */
export const walletEmpty = (s, product) => Boolean(s?.wallet?.pricing?.[product]) && s.wallet.balance <= 0;
export function requireCredit(s, product) {
  if (walletEmpty(s, product)) fail('Os créditos desta subconta acabaram. Recarregue a carteira em Configurações → Carteira para voltar a usar a IA.', 402);
}

export function addTopup(s, payment) {
  const w = walletOf(s);
  w.topups = [{ ...payment, status: 'PENDING' }, ...w.topups.filter(row => row.checkoutId !== payment.checkoutId)].slice(0, walletLimits.topups);
  return payment;
}
/** Credits a paid Pix/card recharge once, with the amount recorded when it was created (never the webhook's). */
export function paidTopup(s, { checkoutId, method = 'Pix', at = new Date().toISOString() }) {
  const w = walletOf(s);
  const topup = w.topups.find(row => row.checkoutId === checkoutId);
  if (!topup || topup.status === 'PAID') return false;
  Object.assign(topup, { status: 'PAID', paidAt: at, method });
  walletAdjust(s, { kind: 'credit', amount: topup.amount, note: 'Recarga paga', method, checkoutId, at });
  return topup.amount;
}

export function walletSummary(s, month = new Date().toISOString().slice(0, 7)) {
  const w = s?.wallet || walletDefaults();
  const usage = (w.entries || []).filter(entry => entry.kind === 'usage' && entry.day?.startsWith(month));
  const sum = (list, key) => cents(list.reduce((total, entry) => total + (entry[key] || 0), 0));
  const byProduct = walletKeys.map(key => { const list = usage.filter(entry => entry.product === key); return { key, units: money(list.reduce((t, e) => t + e.units, 0)), amount: sum(list, 'amount'), cost: sum(list, 'cost') }; });
  const amount = sum(usage, 'amount'), cost = sum(usage, 'cost');
  return { balance: cents(w.balance || 0), lowAt: w.lowAt ?? 20, low: Object.keys(w.pricing || {}).length > 0 && (w.balance || 0) < (w.lowAt ?? 20),
    products: Object.keys(w.pricing || {}), month: { amount, cost, profit: cents(amount - cost), byProduct } };
}
