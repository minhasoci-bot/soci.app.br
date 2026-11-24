// What the payment gateway's events change in a sub-account: the settlement, refund and dispute of a charge, with the
// ledger fact in the same write. Pure functions over the workspace state; abacatepay.mjs verifies and routes the events.
import { execute } from './model.mjs';
import { cents, gatewayOf, postFact, refundKey, transactionFact } from './ledger-model.mjs';

const stamp = () => new Date().toISOString();
const provider = 'abacatepay';

/** The sub-account's invoice behind a charge. The metadata is only trusted when it names this very sub-account. */
export function chargedInvoice(state, { checkoutId, metadata }, workspace) {
  const byCharge = checkoutId && state.invoices.find(item => item.payment?.checkoutId === checkoutId);
  if (byCharge) return byCharge;
  return metadata?.workspace === workspace && metadata.invoiceId ? state.invoices.find(item => item.id === metadata.invoiceId) || null : null;
}
const orphanSource = metadata => metadata?.invoiceId ? { type: 'invoice', id: String(metadata.invoiceId).slice(0, 60) } : { type: 'charge', id: '' };
const ours = (charge, workspace) => charge.metadata?.workspace === workspace;

/** Returns the invoice that was settled, or null when nothing was (unknown charge or amount below the invoice). */
export function settleCharge(state, charge, workspace) {
  const { checkoutId, method, receiptUrl, paidCents, feeCents, devMode } = charge, at = stamp();
  const sale = extra => postFact(state, { layer: 'account', kind: 'sale', key: `sale:${provider}:${checkoutId}`, amountCents: paidCents, feeCents, method, provider, ref: checkoutId, at, ...extra });
  const invoice = chargedInvoice(state, charge, workspace);
  if (!invoice) {
    // The invoice is gone, but the money is in: it counts, and nothing else changes.
    if (ours(charge, workspace) && checkoutId && paidCents > 0 && !devMode) sale({ source: orphanSource(charge.metadata) });
    return null;
  }
  const enough = paidCents !== null && paidCents >= cents(invoice.value);
  if (['REFUNDED', 'DISPUTED'].includes(invoice.payment?.status) && invoice.payment.checkoutId === checkoutId) return null;
  invoice.payment = { ...(invoice.payment || {}), provider, checkoutId: checkoutId || invoice.payment?.checkoutId || '', status: enough ? 'PAID' : 'MISMATCH', paidAt: invoice.payment?.paidAt || at, method,
    receiptUrl: receiptUrl || '', receivedCents: paidCents ?? 0, received: (paidCents ?? 0) / 100, feeCents: feeCents ?? null, devMode: Boolean(devMode || invoice.payment?.devMode) };
  if (!enough) {
    if (invoice.status === 'Paid') invoice.payment.status = 'PAID';
    if (paidCents > 0 && !invoice.payment.devMode) sale({ source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId });
    return null;
  }
  if (invoice.status === 'Paid') {
    // Already closed by hand and now paid online too: a second receipt of money, with its own fact.
    if (!invoice.payment.devMode) sale({ source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId });
    return invoice;
  }
  invoice.paidMethod = method;
  const order = state.orders?.find(item => item.invoiceId === invoice.id && item.status === 'Pending');
  if (order) {
    order.paidMethod = method;
    execute(state, { type: 'save', key: 'orders', id: order.id, data: { id: order.id, status: 'Paid', note: order.note, tracking: order.tracking } }, { workspace });
  } else {
    execute(state, { type: 'save', key: 'invoices', id: invoice.id, data: { title: invoice.title, contactId: invoice.contactId, value: invoice.value, due: invoice.due, status: 'Paid' } }, { workspace });
  }
  return state.invoices.find(item => item.id === invoice.id);
}

// The transactions a charge settled: those of its invoice or, in a subscription, the latest payment of that checkout.
function chargedTransactions(state, invoice, checkoutId) {
  if (invoice) return (state.transactions || []).filter(row => row.invoiceId === invoice.id);
  return (state.transactions || []).filter(row => checkoutId && row.gateway?.checkoutId === checkoutId).slice(-1);
}
function moveTransaction(state, tx, status, options) {
  if (tx.status === status) return;
  const prior = { ...tx };
  tx.status = status;
  transactionFact(state, prior, tx, options);
}

function reversed(state, charge, workspace, kind) {
  const invoice = chargedInvoice(state, charge, workspace), txs = chargedTransactions(state, invoice, charge.checkoutId), at = stamp();
  if (invoice) invoice.payment = { ...invoice.payment, status: 'REFUNDED', refundedAt: invoice.payment?.refundedAt || at };
  for (const tx of txs) moveTransaction(state, tx, 'Refunded', { refundKind: kind });
  if (invoice && !txs.length && invoice.payment.receivedCents > 0 && !invoice.payment.devMode) {
    postFact(state, { layer: 'account', kind, key: refundKey(invoice.payment, invoice.id), amountCents: -invoice.payment.receivedCents, method: invoice.payment.method || '', provider, ref: charge.checkoutId,
      source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId, at });
  }
  if (!invoice && !txs.length && ours(charge, workspace) && charge.checkoutId && charge.paidCents > 0 && !charge.devMode) {
    postFact(state, { layer: 'account', kind, key: `refund:${provider}:${charge.checkoutId}`, amountCents: -charge.paidCents, method: charge.method, provider, ref: charge.checkoutId, source: orphanSource(charge.metadata), at });
  }
  return Boolean(invoice || txs.length);
}

export const refundCharge = (state, charge, workspace) => reversed(state, charge, workspace, 'refund');

/** checkout.disputed carries the outcome in the charge's status: UNDER_DISPUTE (opened), PAID (won) or REFUNDED (lost). */
export function disputeCharge(state, charge, workspace) {
  if (charge.status === 'REFUNDED' || charge.lost) return reversed(state, charge, workspace, 'dispute_lost');
  const invoice = chargedInvoice(state, charge, workspace), txs = chargedTransactions(state, invoice, charge.checkoutId), opened = charge.status === 'UNDER_DISPUTE';
  if ((!invoice && !txs.length) || (!opened && charge.status !== 'PAID')) return false;
  const payment = invoice?.payment || gatewayOf(state, txs[0] || {}), at = stamp();
  if (payment?.status === 'REFUNDED') return true;
  if (invoice) {
    if (opened) invoice.payment = { ...invoice.payment, status: 'DISPUTED', beforeDispute: invoice.payment.status === 'DISPUTED' ? invoice.payment.beforeDispute : invoice.payment.status, disputedAt: at };
    else invoice.payment = { ...invoice.payment, status: invoice.payment.beforeDispute || 'PAID' };
  }
  for (const tx of txs) if (tx.status === 'Succeeded' || tx.status === 'Disputed') moveTransaction(state, tx, opened ? 'Disputed' : 'Succeeded');
  if (!payment?.devMode && !charge.devMode) {
    postFact(state, { layer: 'account', kind: opened ? 'dispute_opened' : 'dispute_won', key: `${opened ? 'dispute' : 'dispute_won'}:${provider}:${payment?.paymentId || charge.checkoutId}`, amountCents: 0,
      method: payment?.method || charge.method, provider, ref: charge.checkoutId, source: invoice ? { type: 'invoice', id: invoice.id } : { type: 'transaction', id: txs[0].id }, contactId: invoice?.contactId || txs[0]?.contactId || '', at });
  }
  return true;
}
