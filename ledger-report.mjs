// What people read from the billing ledger: the period, the rows of a screen, the totals and the accountant's CSV.
// Money received, money returned and the wallet's balance movement are different things and never share a column.
import { zonedInstant } from './scheduling-model.mjs';
import { ledgerKinds } from './ui/ledger.js';
import { formatTaxId, maskTaxId } from './ui/tax-id.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const DAY = 86_400_000, MAX_DAYS = 366;
const received = new Set(['sale', 'manual_sale', 'plan_payment', 'wallet_topup']), returned = new Set(['refund', 'dispute_lost']);
const movement = new Set(['wallet_credit', 'wallet_debit', 'wallet_usage']);
const round = (value, places = 2) => { const p = 10 ** places; return Math.round(value * p) / p; };
const movementOf = row => row.usage_micros === null || row.usage_micros === undefined ? row.amount_cents / 100 : row.usage_micros / 1e6;

const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dayNumber = value => Date.parse(`${value}T00:00:00Z`) / DAY;
/** The calendar days of the account's time zone as a range of instants ([from, to)). */
export function ledgerPeriod({ from, to, kind = '' }, timezone) {
  let ok = false;
  try { ok = validDay(from) && validDay(to); } catch { ok = false; }
  if (!ok) fail('Informe o período com data inicial e final.');
  const days = dayNumber(to) - dayNumber(from) + 1;
  if (days < 1) fail('A data final vem depois da inicial.');
  if (days > MAX_DAYS) fail('Escolha um período de até 366 dias.');
  if (kind && !Object.hasOwn(ledgerKinds, kind)) fail('Tipo de lançamento inválido.');
  const start = day => new Date(zonedInstant(day, '00:00', timezone)).toISOString();
  return { from: start(from), to: start(new Date(Date.parse(`${to}T00:00:00Z`) + DAY).toISOString().slice(0, 10)), kind };
}

function local(at, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A row as a screen shows it: the buyer's CPF is masked. */
export const ledgerRow = (row, { timezone, accounts = {} }) => ({ key: row.key, date: local(row.occurred_at, timezone), kind: row.kind, label: ledgerKinds[row.kind] || row.kind, account: accounts[row.workspace_id] || '',
  amount: movement.has(row.kind) ? null : row.amount_cents / 100, fee: row.fee_cents === null || row.fee_cents === undefined ? null : row.fee_cents / 100, movement: movement.has(row.kind) ? movementOf(row) : null,
  seller: { name: row.seller?.name || '', taxId: formatTaxId(row.seller?.taxId || '') }, payer: { name: row.payer?.name || '', taxId: maskTaxId(row.payer?.taxId || '') },
  method: row.method, provider: row.provider, ref: row.provider_ref, imported: Boolean(row.detail?.imported) });

export function ledgerTotals(rows) {
  const t = { gross: 0, refunds: 0, adjustments: 0, fees: 0, net: 0, unknownFees: 0, walletMovement: 0 };
  for (const row of rows) {
    if (received.has(row.kind)) {
      t.gross += row.amount_cents / 100;
      if (row.fee_cents === null || row.fee_cents === undefined) { if (row.provider !== 'manual') t.unknownFees++; } else t.fees += row.fee_cents / 100;
    } else if (returned.has(row.kind)) t.refunds += row.amount_cents / 100;
    else if (row.kind === 'adjustment') t.adjustments += row.amount_cents / 100;
    else if (movement.has(row.kind)) t.walletMovement += movementOf(row);
  }
  t.net = t.gross + t.refunds + t.adjustments - t.fees;
  return { gross: round(t.gross), refunds: round(t.refunds), adjustments: round(t.adjustments), fees: round(t.fees), net: round(t.net), unknownFees: t.unknownFees, walletMovement: round(t.walletMovement, 6) };
}

const number = (value, places = 2) => value === null ? '' : value.toFixed(places).replace('.', ',');
// A cell that starts like a formula is shown as text by the spreadsheet instead of being run.
function text(value) {
  let cell = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
const HEAD = ['Data', 'Tipo', 'Subconta', 'Bruto', 'Taxa do gateway', 'Líquido estimado', 'Movimento de saldo', 'Vendedor', 'CPF/CNPJ do vendedor', 'Comprador', 'CPF/CNPJ do comprador', 'Método', 'Gateway', 'Cobrança', 'Origem', 'Importado'];

export function ledgerCsv(rows, { timezone, accounts = {} }) {
  const lines = rows.map(row => {
    const moves = movement.has(row.kind), gross = moves ? null : row.amount_cents / 100, feeKnown = row.fee_cents !== null && row.fee_cents !== undefined;
    const fee = feeKnown ? row.fee_cents / 100 : null;
    // Only a sale through the gateway has a fee; without knowing it there is no net to show.
    const net = moves ? null : feeKnown ? gross - fee : received.has(row.kind) && row.provider !== 'manual' ? null : gross;
    const at = local(row.occurred_at, timezone);
    return [text(`${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} ${at.slice(11)}`), text(ledgerKinds[row.kind] || row.kind), text(accounts[row.workspace_id] || ''), number(gross), number(fee), number(net),
      moves ? number(movementOf(row), row.kind === 'wallet_usage' ? 6 : 2) : '', text(row.seller?.name), text(formatTaxId(row.seller?.taxId || '')), text(row.payer?.name), text(formatTaxId(row.payer?.taxId || '')),
      text(row.method), text(row.provider), text(row.provider_ref), text([row.source?.type, row.source?.id].filter(Boolean).join(' ')), row.detail?.imported ? 'Sim' : 'Não'].join(';');
  });
  return `﻿${[HEAD.join(';'), ...lines].join('\r\n')}\r\n`;
}
