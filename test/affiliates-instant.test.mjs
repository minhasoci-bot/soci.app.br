// Comissão sem prazo de espera (holdDays 0) é aprovada na mesma operação, mesmo quando o relógio vira de
// milissegundo no meio dela. Antes, approveAfter lia o relógio de novo e saía 1 ms depois do instante da
// operação: a comissão ficava pendente e o teste de pagamentos (affiliates.test.mjs) falhava de vez em quando.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

// Relógio que avança 1 ms a cada leitura; execute() é síncrono, então ele é trocado e restaurado sem afetar outros testes.
function stepping(fn) {
  const RealDate = Date;
  let t = RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [t++])); }
    static now() { return t++; }
  };
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

function program() {
  const s = blank('Loja');
  const campaign = save(s, 'affiliateCampaigns', { name: 'Parceiros', destination: '/loja/demo/x', commissionType: 'fixed', commissionValue: 25, holdDays: 0, recurring: 'all' });
  const affiliate = save(s, 'affiliates', { name: 'Paula Souza', email: 'paula@example.test', campaignIds: [campaign] });
  execute(s, { type: 'save', key: 'contacts', data: { name: 'Assinante', email: 'a@example.test' } }, { affiliate: { affiliateId: affiliate, campaignId: campaign, at: Date.now() - 1000 } });
  return { s, contactId: s.contacts.at(-1).id };
}

test('comissão de venda paga sem prazo de espera sai aprovada na hora', () => {
  const { s, contactId } = program();
  stepping(() => save(s, 'invoices', { title: 'Mês 1', contactId, value: 100, due: '2026-12-01', status: 'Paid' }));
  const [commission] = s.affiliateCommissions;
  assert.ok(commission, 'comissão criada');
  assert.equal(commission.approveAfter, commission.created, 'a liberação usa o mesmo instante da operação');
  assert.equal(commission.status, 'approved');
});
