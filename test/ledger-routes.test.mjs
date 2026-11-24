import test from 'node:test';
import assert from 'node:assert/strict';
import { staticFiles } from '../server.mjs';
import { ledgerCsv, ledgerTotals } from '../ledger-report.mjs';
import { ledgerView } from '../ui/ledger.js';
import { startBilling } from './helpers/abacate.mjs';

let seq = 0;
const row = (extra = {}) => ({ key: `k${++seq}`, layer: 'account', agency_id: 'agency', workspace_id: 'demo', kind: 'sale', amount_cents: 15000, fee_cents: 80, usage_micros: null, method: 'Pix', provider: 'abacatepay', provider_ref: 'bill_1',
  source: { type: 'invoice', id: 'i1' }, seller: { name: 'Loja', taxId: '11222333000181' }, payer: { name: 'Ana', taxId: '52998224725' }, detail: {}, occurred_at: '2026-11-15T12:00:00.000Z', ...extra });
const november = 'from=2026-11-01&to=2026-11-30';

async function setup(t, rows) {
  const b = await startBilling(t);
  await b.send('/api/agency');
  await b.store.ledgerAppend(rows);
  const raw = async (path, headers) => { const r = await fetch(b.base + path, { headers }); return { status: r.status, type: r.headers.get('content-type'), file: r.headers.get('content-disposition'), text: await r.text() }; };
  const person = async data => ({ 'X-Go-User': (await b.send('/api/agency/action', { type: 'save', key: 'users', data: { first: 'Lia', last: 'Melo', email: `u${++seq}@example.test`, ...data } })).body.result });
  return { ...b, raw, person, account: (query = november, headers) => b.send(`/api/billing/ledger?workspace=demo&${query}`, undefined, headers), agencyLedger: (query = november, headers) => b.send(`/api/billing/agency-ledger?${query}`, undefined, headers) };
}

test('Cada um vê só o seu: subconta a camada dela, agência a camada da agência', async t => {
  const c = await setup(t, [row(), row({ workspace_id: 'outra' }), row({ layer: 'agency', kind: 'plan_payment' }), row({ agency_id: 'agency-2' }), row({ agency_id: 'agency-2', layer: 'agency', kind: 'plan_payment' })]);
  const mine = (await c.account()).body;
  assert.deepEqual(mine.rows.map(item => [item.kind, item.amount]), [['sale', 150]]);
  const agency = (await c.agencyLedger()).body;
  assert.deepEqual(agency.rows.map(item => item.kind), ['plan_payment']);
  assert.equal((await c.agencyLedger(`${november}&layer=account&agencyId=agency-2&agency_id=agency-2`)).body.rows.length, 1, 'camada e agência não vêm do navegador');
  assert.equal((await c.account(`${november}&layer=agency&workspaceId=outra`)).body.rows.length, 1);
  assert.equal((await c.send(`/api/billing/ledger?workspace=00000000-0000-4000-8000-000000000000&${november}`)).status, 403);
  assert.equal((await c.agencyLedger(`${november}&account=00000000-0000-4000-8000-000000000000`)).status, 404);
  assert.equal((await c.agencyLedger(`${november}&account=demo`)).status, 200);
});

test('Permissões: subconta precisa de Pagamentos, agência precisa de Configurações', async t => {
  const c = await setup(t, [row()]);
  const noPay = await c.person({ role: 'Account User', accounts: ['demo'], permissionMode: 'restricted', permissions: ['contacts'] });
  assert.equal((await c.account(november, noPay)).status, 403);
  const clerk = await c.person({ role: 'Agency User' });
  assert.equal((await c.agencyLedger(november, clerk)).status, 403);
  assert.equal((await c.raw(`/api/billing/agency-ledger.csv?${november}`, clerk)).status, 403);
  assert.equal((await c.send(`/api/billing/ledger?workspace=demo&${november}`, {})).status, 405, 'o livro só se lê');
});

test('O mês é o do fuso da conta', async t => {
  const c = await setup(t, [row({ key: 'nov', occurred_at: '2026-12-01T02:30:00.000Z' }), row({ key: 'out', occurred_at: '2026-11-01T02:59:59.000Z' }), row({ key: 'ini', occurred_at: '2026-11-01T03:00:00.000Z' })]);
  assert.deepEqual((await c.account()).body.rows.map(item => item.key), ['nov', 'ini']);
  assert.equal((await c.account()).body.rows[0].date, '2026-11-30T23:30');
});

test('Totais: recebido, taxas, devolvido e movimento de saldo, cada um na sua conta', () => {
  const totals = ledgerTotals([row({ amount_cents: 10000, fee_cents: 80 }), row({ amount_cents: 5000, fee_cents: null }), row({ kind: 'refund', amount_cents: -2000, fee_cents: null }), row({ kind: 'dispute_opened', amount_cents: 0, fee_cents: null }),
    row({ kind: 'adjustment', amount_cents: -500, fee_cents: null }), row({ kind: 'wallet_topup', amount_cents: 3000, fee_cents: 30 }), row({ kind: 'wallet_credit', amount_cents: 700, fee_cents: null }), row({ kind: 'wallet_usage', amount_cents: -1, usage_micros: -9000, fee_cents: null })]);
  assert.deepEqual(totals, { gross: 180, refunds: -20, adjustments: -5, fees: 1.1, net: 153.9, unknownFees: 1, walletMovement: 6.991 });
});

test('CSV para o contador', () => {
  const csv = ledgerCsv([row({ payer: { name: '=HYPERLINK("x")', taxId: '52998224725' }, detail: { note: 'a;b' } }), row({ kind: 'refund', amount_cents: -2000, fee_cents: null, detail: { imported: true } }), row({ kind: 'wallet_usage', amount_cents: -1, usage_micros: -9000, fee_cents: null })], { timezone: 'America/Sao_Paulo', accounts: { demo: 'Loja da Ana' } });
  const [head, first, second, third] = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(csv[0], '﻿');
  assert.equal(head, 'Data;Tipo;Subconta;Bruto;Taxa do gateway;Líquido estimado;Movimento de saldo;Vendedor;CPF/CNPJ do vendedor;Comprador;CPF/CNPJ do comprador;Método;Gateway;Cobrança;Origem;Importado');
  assert.equal(first, `15/11/2026 09:00;Venda;Loja da Ana;150,00;0,80;149,20;;Loja;11.222.333/0001-81;"'=HYPERLINK(""x"")";529.982.247-25;Pix;abacatepay;bill_1;invoice i1;Não`);
  assert.match(second, /^15\/11\/2026 09:00;Reembolso;Loja da Ana;-20,00;;-20,00;;/, 'taxa desconhecida fica vazia; número negativo não ganha apóstrofo');
  assert.match(second, /;Sim$/);
  assert.match(third, /;Consumo da carteira;Loja da Ana;;;;-0,009000;/);
});

test('Venda sem taxa conhecida não vira líquido', () => {
  const [, line] = ledgerCsv([row({ fee_cents: null })], { timezone: 'America/Sao_Paulo', accounts: {} }).trim().split('\r\n');
  assert.equal(line.split(';').slice(3, 6).join('|'), '150,00||');
});

test('Na tela o CPF do comprador vem mascarado; no arquivo, inteiro; datas e período conferidos', async t => {
  const c = await setup(t, [row()]);
  const { body } = await c.account();
  assert.equal(body.rows[0].payer.taxId, '***.982.247-**');
  assert.doesNotMatch(JSON.stringify(body), /52998224725/);
  const file = await c.raw(`/api/billing/ledger.csv?workspace=demo&${november}`);
  assert.deepEqual([file.status, file.type], [200, 'text/csv; charset=utf-8']);
  assert.match(file.file, /attachment; filename="livro-2026-11-01-a-2026-11-30\.csv"/);
  assert.match(file.text, /529\.982\.247-25/);
  for (const bad of ['', 'from=2026-11-01', 'from=01/11/2026&to=2026-11-30', 'from=2026-12-01&to=2026-11-01', 'from=2025-01-01&to=2026-11-30', 'from=2026-02-31&to=2026-03-01', `${november}&kind=x`]) assert.equal((await c.account(bad)).status, 400, bad);
  assert.equal((await c.account('from=2025-11-24&to=2026-11-24')).status, 200, '366 dias');
});

test('Páginas seguem de onde a anterior parou e os totais valem para o período todo', async t => {
  const c = await setup(t, Array.from({ length: 250 }, (_, i) => row({ key: `p${i}`, amount_cents: 100, fee_cents: 0 })));
  const first = (await c.account()).body;
  assert.equal(first.rows.length, 100);
  assert.equal(first.totals.gross, 250);
  const second = (await c.account(`${november}&after=${encodeURIComponent(first.next)}`)).body, third = (await c.account(`${november}&after=${encodeURIComponent(second.next)}`)).body;
  assert.equal(new Set([...first.rows, ...second.rows, ...third.rows].map(item => item.key)).size, 250);
  assert.equal(third.next, '');
});

test('Sem a tabela, a tela avisa em vez de quebrar', async t => {
  const c = await setup(t, []);
  c.store.ledgerList = async () => { throw Object.assign(new Error('sem tabela'), { code: 'ledger_unavailable' }); };
  const response = await c.account();
  assert.deepEqual([response.status, /livro/i.test(response.body.error)], [503, true]);
});

test('A tela escapa o que veio de fora e é servida', () => {
  const html = ledgerView({ rows: [{ key: 'a', date: '2026-11-15T09:00', kind: 'sale', label: 'Venda', amount: 1, payer: { name: '<img src=x>', taxId: '' }, seller: { name: 'x' }, account: '', method: 'Pix', ref: '' }], totals: { gross: 1, refunds: 0, adjustments: 0, fees: 0, net: 1, unknownFees: 0, walletMovement: 0 }, next: '', completeSince: '2026-11-24T00:00:00.000Z' }, { from: '2026-11-01', to: '2026-11-30', scope: 'account', accounts: [] });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Venda/);
  assert.ok(staticFiles.has('/ledger.js'));
});
