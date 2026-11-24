// Livro da cobrança: the read-only list of money facts, for the agency (Configurações → Faturamento) and for a
// sub-account (Pagamentos → Livro), with the period, the totals and the CSV for the accountant. The server decides
// whose ledger it is; this screen only asks for a period.
import { icon } from './icons.js';

export const ledgerKinds = { sale: 'Venda', manual_sale: 'Venda manual', refund: 'Reembolso', dispute_opened: 'Contestação aberta', dispute_won: 'Contestação ganha', dispute_lost: 'Contestação perdida',
  adjustment: 'Ajuste', plan_payment: 'Plano', wallet_topup: 'Recarga da carteira', wallet_credit: 'Crédito na carteira', wallet_debit: 'Débito na carteira', wallet_usage: 'Consumo da carteira' };
const kindsOf = { account: ['sale', 'manual_sale', 'refund', 'dispute_opened', 'dispute_won', 'dispute_lost', 'adjustment'],
  agency: ['plan_payment', 'wallet_topup', 'refund', 'dispute_opened', 'dispute_won', 'dispute_lost', 'wallet_credit', 'wallet_debit', 'wallet_usage'] };

const methods = { Card: 'Cartão', Cash: 'Dinheiro', 'Bank transfer': 'Transferência' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const brl = (value, digits = 2) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: digits }).format(value || 0);
const when = at => `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} ${at.slice(11)}`;
const metric = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
const option = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
const person = p => `${esc(p.name || '—')}${p.taxId ? `<br><small class="dim">${esc(p.taxId)}</small>` : ''}`;

export const ledgerQuery = ({ scope, workspace, from, to, kind = '', account = '', after = '' }, file = '') =>
  `/api/billing/${scope === 'agency' ? 'agency-ledger' : 'ledger'}${file}?${new URLSearchParams({ ...(scope === 'account' && { workspace }), from, to, ...(kind && { kind }), ...(account && { account }), ...(after && { after }) })}`;

export function ledgerView(data, view) {
  const t = data.totals, agency = view.scope === 'agency';
  const filters = `<form class="surface padded settings-form ledger-filters" data-ledger-form="${view.scope}"><div class="field-grid"><label>De<input type="date" name="from" required value="${esc(view.from)}"></label><label>Até<input type="date" name="to" required value="${esc(view.to)}"></label>
    <label>Tipo<select name="kind">${option('', 'Todos', view.kind || '')}${kindsOf[view.scope].map(key => option(key, ledgerKinds[key], view.kind)).join('')}</select></label>
    ${agency ? `<label>Subconta<select name="account" data-no-translate="1">${option('', 'Todas', view.account || '')}${(view.accounts || []).map(item => option(item.id, item.name, view.account)).join('')}</select></label>` : ''}
    </div><div class="inline-gap"><button class="secondary">Filtrar</button><a class="secondary" href="${esc(ledgerQuery(view, '.csv'))}" download>${icon('download', 16)} Exportar CSV</a></div></form>`;
  const rows = data.rows.map(row => `<tr><td>${esc(when(row.date))}</td><td><span class="badge">${esc(row.label)}</span>${row.imported ? ' <small class="dim">Importado</small>' : ''}</td>${agency ? `<td data-no-translate="1">${esc(row.account || '—')}</td>` : ''}
    <td data-no-translate="1">${person(row.payer)}</td><td>${row.amount === null ? '—' : brl(row.amount)}</td><td>${row.fee === null || row.fee === undefined ? '—' : brl(row.fee)}</td>${agency ? `<td>${row.movement === null || row.movement === undefined ? '—' : brl(row.movement, 6)}</td>` : ''}<td>${esc(methods[row.method] || row.method || '—')}</td></tr>`).join('');
  return `<p class="dim">Cada pagamento, devolução e contestação entra uma vez e não muda. ${data.completeSince ? `Registro completo desde ${esc(when(`${data.completeSince.slice(0, 10)}T00:00`).slice(0, 10))}.` : ''}</p>
    ${filters}
    <div class="metrics">${metric('Recebido', brl(t.gross))}${metric('Devolvido', brl(t.refunds))}${t.adjustments ? metric('Ajustes', brl(t.adjustments)) : ''}${metric('Taxas do gateway', brl(t.fees), t.unknownFees ? `${t.unknownFees} sem taxa informada` : '')}${metric('Líquido estimado', brl(t.net))}${agency ? metric('Movimento de saldo', brl(t.walletMovement, 6), 'Créditos e consumo das carteiras') : ''}</div>
    ${data.rows.length ? `<div class="surface table-shell"><table><thead><tr>${['Data', 'Tipo', ...(agency ? ['Subconta'] : []), 'Comprador', 'Valor', 'Taxa', ...(agency ? ['Saldo'] : []), 'Método'].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="surface"><div class="empty"><strong>Nenhum lançamento no período</strong><p>Os pagamentos aparecem aqui assim que são confirmados.</p></div></div>'}
    ${data.next ? `<button type="button" class="secondary" data-ledger-more="${view.scope}">Carregar mais</button>` : ''}`;
}

// ---- the live panel -----------------------------------------------------------------------
const hosts = {}, views = {};
const firstDay = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

async function load(view, after = '') {
  const host = hosts[view.scope], turn = view.turn = (view.turn || 0) + 1;
  view.loading = true;
  try {
    const data = await host.api(ledgerQuery({ ...view, after }));
    if (view.turn !== turn) return;
    view.data = after ? { ...data, rows: [...view.data.rows, ...data.rows] } : data;
    view.error = '';
  } catch (error) { if (view.turn === turn) view.error = error.message; }
  if (view.turn !== turn) return;
  view.loading = false;
  if (views[view.scope] === view) host.render();
}

export function ledgerPanel({ scope, workspace = '', accounts = [] }) {
  let view = views[scope];
  if (!view || view.workspace !== workspace) view = views[scope] = { scope, workspace, from: firstDay(), to: today(), kind: '', account: '', data: null, error: '' };
  view.accounts = accounts;
  if (!view.data && !view.error && !view.loading) void load(view);
  if (view.error) return `<p class="surface padded ag-warn" role="alert">${esc(view.error)}</p><button type="button" class="secondary" data-ledger-retry="${scope}">Tentar novamente</button>`;
  return view.data ? ledgerView(view.data, view) : '<p class="dim" role="status">Abrindo o livro…</p>';
}

export function installLedger(scope, host) {
  const wired = Object.keys(hosts).length > 0;
  hosts[scope] = host;
  if (wired) return;
  document.addEventListener('submit', event => {
    const form = event.target.closest?.('[data-ledger-form]');
    if (!form) return;
    event.preventDefault();
    const view = views[form.dataset.ledgerForm];
    Object.assign(view, { account: '', ...Object.fromEntries(new FormData(form)) });
    void load(view);
  }, true);
  document.addEventListener('click', event => {
    const more = event.target.closest?.('[data-ledger-more]'), retry = event.target.closest?.('[data-ledger-retry]');
    if (more) { more.disabled = true; const view = views[more.dataset.ledgerMore]; void load(view, view.data.next); }
    if (retry) { const view = views[retry.dataset.ledgerRetry]; Object.assign(view, { error: '', data: null, from: firstDay(), to: today() }); hosts[view.scope].render(); }
  });
}
