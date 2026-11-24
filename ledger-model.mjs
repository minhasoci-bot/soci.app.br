// Livro da cobrança: every money fact is queued in the state's `ledgerOutbox` in the same write that changes the
// state, and ledger-flush.mjs moves it to the append-only table. Facts never change: a correction is another fact.
// Keys name the money itself (the gateway's charge, the transaction), so re-deliveries and retries count once.
// They are local to the workspace or agency; the flush prefixes them with its id.
import { randomUUID } from 'node:crypto';

export const cents = value => Math.round(Number((Number(value || 0) * 100).toFixed(4)));

/** Queues a fact once. False when its key is already waiting. */
export function postFact(state, fact) {
  state.ledgerOutbox ??= [];
  if (state.ledgerOutbox.some(item => item.key === fact.key)) return false;
  const at = fact.at || new Date().toISOString();
  state.ledgerSince ||= new Date().toISOString();
  state.ledgerOutbox.push({ ...fact, at });
  return true;
}

// What the gateway said about this money: on the transaction itself or on its invoice.
export const gatewayOf = (state, row) => row.gateway || (row.invoiceId && (state.invoices || []).find(item => item.id === row.invoiceId)?.payment) || null;
const gatewayRef = payment => payment && ['PAID', 'MISMATCH', 'REFUNDED', 'DISPUTED'].includes(payment.status) ? String(payment.paymentId || payment.checkoutId || '') : '';
const keyOf = (kind, payment, txId) => { const ref = gatewayRef(payment); return ref ? `${kind}:${payment.provider || 'abacatepay'}:${ref}` : `${kind}:tx:${txId}`; };
export const saleKey = (payment, txId) => keyOf('sale', payment, txId);
export const refundKey = (payment, txId) => keyOf('refund', payment, txId);

const counts = row => row.status === 'Succeeded' || row.status === 'Disputed';
const sourceOf = row => row.invoiceId ? { type: 'invoice', id: row.invoiceId } : { type: 'transaction', id: row.id };
// A date typed by a person counts as noon in Brazil; today's payments keep the exact moment.
const momentOf = (row, now) => /^\d{4}-\d{2}-\d{2}$/.test(row.date || '') && row.date !== now.slice(0, 10) ? `${row.date}T15:00:00.000Z` : now;

function base(state, row, at) {
  const payment = gatewayOf(state, row), ref = gatewayRef(payment);
  return { layer: 'account', method: row.method || '', provider: ref ? payment.provider || 'abacatepay' : 'manual', ref, source: sourceOf(row), contactId: row.contactId || '', at };
}

function postSale(state, row, { amount = row.amount, imported = false, now = new Date().toISOString() } = {}) {
  const payment = gatewayOf(state, row), ref = gatewayRef(payment), amountCents = ref && payment.receivedCents ? payment.receivedCents : cents(amount);
  row.booked = amountCents;
  row.bookedFor = cents(amount);
  postFact(state, { ...base(state, row, imported ? momentOf(row, row.created || now) : momentOf(row, now)), key: saleKey(payment, row.id), kind: ref ? 'sale' : 'manual_sale', amountCents,
    feeCents: ref ? payment.feeCents ?? null : null, detail: { ...(row.note ? { note: row.note } : {}), ...(imported ? { imported: true } : {}) } });
}

function adjust(state, row, amountCents, detail, key) {
  if (!amountCents) return;
  row.ledgerRev = (row.ledgerRev || 0) + 1;
  postFact(state, { ...base(state, row), key: key || `adj:${row.id}:${row.ledgerRev}`, kind: 'adjustment', amountCents, feeCents: null, detail });
  row.booked += amountCents;
}

/** Called for a transaction that was created (prior = null) or changed; `row` is the new record. */
export function transactionFact(state, prior, row, { refundKind = 'refund' } = {}) {
  if (row.booked === undefined && gatewayOf(state, row)?.devMode) row.test = true;
  if (row.test) return;
  if (row.booked === undefined) {
    if (!prior) { if (counts(row)) postSale(state, row); return; }
    if (counts(prior)) {
      const known = { ...prior, ...row, amount: prior.amount, date: prior.date, status: prior.status };
      postSale(state, known, { imported: true });
      Object.assign(row, { booked: known.booked, bookedFor: known.bookedFor });
    } else if (counts(row)) { postSale(state, row); return; }
    else return;
  }
  if (counts(row)) {
    if (!counts(prior)) { adjust(state, row, cents(row.amount) - row.booked, { reason: 'Transação reativada' }); row.bookedFor = cents(row.amount); return; }
    const diff = cents(row.amount) - row.bookedFor;
    if (diff) { adjust(state, row, diff, { reason: 'Valor alterado' }); row.bookedFor = cents(row.amount); }
    return;
  }
  if (!row.booked) return;
  if (row.status === 'Refunded' && !row.refundBooked) {
    postFact(state, { ...base(state, row), key: refundKey(gatewayOf(state, row), row.id), kind: refundKind, amountCents: -row.booked, feeCents: null, detail: {} });
    row.refundBooked = true;
    row.booked = 0;
    return;
  }
  adjust(state, row, -row.booked, { reason: row.status === 'Refunded' ? 'Reembolso' : 'Transação não concluída' });
}

export function transactionDeleted(state, row) {
  if (row.test || (row.booked === undefined && gatewayOf(state, row)?.devMode)) return;
  if (row.booked === undefined) {
    if (!counts(row)) return;
    postSale(state, row, { imported: true });
  }
  adjust(state, row, -row.booked, { reason: 'Transação excluída' }, `adj:${row.id}:deleted`);
}

/** A transaction from before the ledger (scripts/ledger-backfill.mjs): its sale and, when it was refunded, the refund. */
export function importTransaction(state, row) {
  if (row.test || row.booked !== undefined || gatewayOf(state, row)?.devMode || !(counts(row) || row.status === 'Refunded')) return;
  postSale(state, row, { imported: true });
  if (row.status !== 'Refunded') return;
  const payment = gatewayOf(state, row);
  postFact(state, { ...base(state, row, payment?.refundedAt || row.updated || row.created), key: refundKey(payment, row.id), kind: 'refund', amountCents: -row.booked, feeCents: null, detail: { imported: true } });
  Object.assign(row, { refundBooked: true, booked: 0 });
}

/** The one way the server adds a transaction without the generic `add` of model.mjs. */
export function bookTransaction(state, data) {
  const row = { id: randomUUID(), created: new Date().toISOString(), ...data };
  state.transactions ??= [];
  state.transactions.push(row);
  transactionFact(state, null, row);
  return row;
}
