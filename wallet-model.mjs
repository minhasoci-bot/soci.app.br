// Reselling com margem (7.1): each sub-account has a wallet of credits in reais. The agency chooses, per product,
// what it pays (unit cost) and the markup, and which sub-accounts are rebilled. Usage of a rebilled product is
// charged to the wallet as cost × markup; the agency's profit is the difference. The prices live in the workspace
// as a copy pushed by the server (pricingFor) so every send can charge without loading the agency.
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const money = value => Math.round(value * 1e6) / 1e6;
const cents = value => Math.round(value * 100) / 100;

import { cents as toCents, postFact } from './ledger-model.mjs';
import { walletProducts } from './ui/agency-data.js';
import { localDay } from './ui/invoice-data.js';
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

const day = (s, at) => localDay(Date.parse(at), s.profile?.timezone);
const micros = value => Math.round(value * 1e6);
const entryId = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
// Consumption and recharges belong to the agency: it sells the credits, the sub-account buys them.
const post = (s, fact) => postFact(s, { layer: 'agency', provider: 'wallet', source: { type: 'wallet', id: fact.key }, ...fact });
function postUsage(s, entry, extra = {}) {
  entry.posted = true;
  post(s, { key: `usage:${entry.id}`, kind: 'wallet_usage', amountCents: -toCents(entry.amount), usageMicros: -micros(entry.amount), at: entry.at,
    detail: { product: entry.product, day: entry.day, units: entry.units, costMicros: micros(entry.cost), ...extra } });
}
// Lines dropped from the statement go to the ledger first. Lines from before the ledger (no `posted`) wait for the import.
function trim(s) {
  const w = s.wallet;
  if (w.entries.length <= walletLimits.entries) return;
  for (const entry of w.entries.slice(walletLimits.entries)) if (entry.posted === false) postUsage(s, entry);
  w.entries = w.entries.slice(0, walletLimits.entries);
}
const openUsage = (s, today) => (s.wallet?.entries || []).filter(entry => entry.kind === 'usage' && entry.posted === false && entry.day < today);
/** Sends to the ledger the consumption of the days already over (`today` is the sub-account's calendar day). */
export function closeUsage(s, today) {
  const open = openUsage(s, today);
  for (const entry of open) postUsage(s, entry);
  return open.length;
}
/** The statement from before the ledger (scripts/ledger-backfill.mjs). Keys are the same of the live facts, so nothing repeats. */
export function importWallet(s, at = Date.now()) {
  const today = localDay(at, s.profile?.timezone), imported = { imported: true };
  for (const entry of s.wallet?.entries || []) {
    if (entry.kind === 'usage') { if (entry.posted === undefined && entry.day < today) postUsage(s, entry, imported); continue; }
    const topup = entry.checkoutId && s.wallet.topups?.find(row => row.checkoutId === entry.checkoutId);
    if (entry.posted || topup?.devMode || topup?.test) continue;
    entry.posted = true;
    if (topup && entry.kind === 'credit') post(s, { key: `topup:${entry.checkoutId}`, kind: 'wallet_topup', amountCents: toCents(entry.amount), method: entry.method || '', provider: 'abacatepay', ref: entry.checkoutId, at: entry.at, detail: imported });
    else post(s, { key: `wallet:${entry.id}`, kind: entry.kind === 'credit' ? 'wallet_credit' : 'wallet_debit', amountCents: toCents(entry.kind === 'credit' ? entry.amount : -entry.amount), at: entry.at, detail: { note: entry.note || '', by: entry.by || '', ...imported } });
  }
}
/** The sub-account's calendar day when there is consumption of earlier days to close, or ''. */
export function usageToClose(s, at = Date.now()) {
  const today = localDay(at, s.profile?.timezone);
  return openUsage(s, today).length ? today : '';
}

/** Charges rebilled usage; same day and product add up in one statement line. Returns the amount charged. */
export function walletCharge(s, product, units, at = new Date().toISOString()) {
  const price = s?.wallet?.pricing?.[product];
  const n = Number(units);
  if (!price || !(n > 0)) return 0;
  const w = s.wallet, cost = money(n * price.unit), amount = money(cost * price.markup);
  const on = day(s, at), line = w.entries.find(entry => entry.kind === 'usage' && entry.product === product && entry.day === on && entry.posted !== true);
  if (line) Object.assign(line, { units: money(line.units + n), cost: money(line.cost + cost), amount: money(line.amount + amount), at });
  else { w.entries.unshift({ id: entryId(), kind: 'usage', product, day: on, units: money(n), cost, amount, at, posted: false }); trim(s); }
  w.balance = money(w.balance - amount);
  return amount;
}

/** A credit (recharge) or a manual debit by the agency. */
export function walletAdjust(s, { kind = 'credit', amount, note = '', by = '', method = '', checkoutId = '', at = new Date().toISOString(), silent = false }) {
  const value = cents(Number(amount));
  if (!(value > 0) || value > walletLimits.credit) fail('Informe um valor entre R$ 0,01 e R$ 100.000.');
  if (!['credit', 'debit'].includes(kind)) fail('Tipo de lançamento inválido.');
  const w = walletOf(s);
  const entry = { id: entryId(), kind, amount: value, note: String(note || '').trim().slice(0, 200),
    by: String(by || '').slice(0, 120), method: String(method || '').slice(0, 40), checkoutId: String(checkoutId || '').slice(0, 120), day: day(s, at), at, posted: true };
  w.entries.unshift(entry);
  trim(s);
  if (!silent) post(s, { key: `wallet:${entry.id}`, kind: kind === 'credit' ? 'wallet_credit' : 'wallet_debit', amountCents: toCents(kind === 'credit' ? value : -value), at, detail: { note: entry.note, by: entry.by } });
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
/** Credits a paid Pix/card recharge once: the amount recorded when it was created, or less when less was paid. */
export function paidTopup(s, { checkoutId, method = 'Pix', paidCents = null, feeCents = null, devMode = false, at = new Date().toISOString() }) {
  const w = walletOf(s);
  const topup = w.topups.find(row => row.checkoutId === checkoutId);
  if (!topup || ['PAID', 'REFUNDED'].includes(topup.status)) return false;
  const amount = paidCents > 0 ? Math.min(topup.amount, paidCents / 100) : topup.amount;
  Object.assign(topup, { status: 'PAID', paidAt: at, method, received: amount, test: Boolean(devMode || topup.devMode) });
  walletAdjust(s, { kind: 'credit', amount, note: 'Recarga paga', method, checkoutId, at, silent: true });
  if (!topup.test) post(s, { key: `topup:${checkoutId}`, kind: 'wallet_topup', amountCents: toCents(amount), feeCents, method, provider: 'abacatepay', ref: checkoutId, at });
  return amount;
}
/** A recharge refunded or lost in a dispute leaves the wallet, even below zero. Once. */
export function reverseTopup(s, { checkoutId, kind = 'refund', at = new Date().toISOString() }) {
  const topup = walletOf(s).topups.find(row => row.checkoutId === checkoutId);
  if (topup?.status !== 'PAID') return false;
  const amount = topup.received ?? topup.amount;
  Object.assign(topup, { status: 'REFUNDED', refundedAt: at });
  walletAdjust(s, { kind: 'debit', amount, note: kind === 'dispute_lost' ? 'Recarga perdida em contestação' : 'Recarga devolvida', method: topup.method, checkoutId, at, silent: true });
  if (!topup.test) post(s, { key: `topup-refund:${checkoutId}`, kind, amountCents: -toCents(amount), method: topup.method || '', provider: 'abacatepay', ref: checkoutId, at });
  return true;
}
/** A dispute that opened, or that the agency won: the balance stays as it is until it is lost. */
export function disputeTopup(s, { checkoutId, opened, at = new Date().toISOString() }) {
  const topup = walletOf(s).topups.find(row => row.checkoutId === checkoutId);
  if (topup?.status !== 'PAID') return false;
  if (!topup.test) post(s, { key: `topup-${opened ? 'dispute' : 'dispute-won'}:${checkoutId}`, kind: opened ? 'dispute_opened' : 'dispute_won', amountCents: 0, provider: 'abacatepay', ref: checkoutId, at });
  return true;
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
