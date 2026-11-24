import test from 'node:test';
import assert from 'node:assert/strict';
import { accountLifecycle, blankAgency, executeAgency, hydrateAgency, restoreFromBilling, suspendForBilling } from '../agency-model.mjs';
import { requireAgencyCommand } from '../authorization.mjs';
import { planBilling } from './helpers/abacate.mjs';

const ENDED = ['max_payment_retries_exceeded', 'dispute_opened', 'pix_automatic_authorization_refused'];

test('Agência nova liga a suspensão; agência existente continua desligada; limites das tentativas', () => {
  assert.deepEqual(blankAgency().saas.autoSuspend, { enabled: true, maxRetry: 3, retryEvery: 1 });
  const old = blankAgency(); delete old.saas.autoSuspend;
  assert.deepEqual(hydrateAgency(old).saas.autoSuspend, { enabled: false, maxRetry: 3, retryEvery: 1 });
  const agency = blankAgency();
  const set = data => executeAgency(agency, { type: 'saas-suspension', data }, { actor: 'Dono' });
  set({ enabled: 'on', maxRetry: 10, retryEvery: 30 });
  assert.deepEqual(agency.saas.autoSuspend, { enabled: true, maxRetry: 10, retryEvery: 30 });
  for (const bad of [{ maxRetry: 0, retryEvery: 1 }, { maxRetry: 11, retryEvery: 1 }, { maxRetry: 3, retryEvery: 0 }, { maxRetry: 3, retryEvery: 31 }, { maxRetry: 'x', retryEvery: 1 }, { maxRetry: 1.5, retryEvery: 1 }]) assert.throws(() => set({ enabled: true, ...bad }), /tentativas|intervalo/i);
  set({ enabled: '', maxRetry: 3, retryEvery: 1 });
  assert.equal(agency.saas.autoSuspend.enabled, false);
  assert.throws(() => requireAgencyCommand({ settings: false }, { type: 'saas-suspension' }, agency), error => error.status === 403);
});

test('A cobrança só pausa conta ativa e só desfaz a própria pausa', () => {
  const agency = blankAgency();
  agency.accounts.demo = { status: 'Active', name: 'Loja' };
  assert.equal(suspendForBilling(agency, 'demo'), true);
  assert.equal(suspendForBilling(agency, 'demo'), false);
  assert.deepEqual([accountLifecycle(agency, 'demo').status, accountLifecycle(agency, 'demo').suspendedBy], ['Paused', 'billing']);
  assert.match(accountLifecycle(agency, 'demo').suspendedReason, /Pagamento do plano não confirmado/);
  assert.equal(restoreFromBilling(agency, 'demo'), true);
  assert.equal(accountLifecycle(agency, 'demo').status, 'Active');
  const manual = status => executeAgency(agency, { type: 'account-meta', id: 'demo', data: { status, suspendedReason: 'Contrato', plan: '' } }, { accountIds: ['demo'], actor: 'Dono' });
  manual('Paused');
  assert.equal(restoreFromBilling(agency, 'demo'), false, 'pausa da agência fica');
  executeAgency(agency, { type: 'account-reactivate', id: 'demo', data: {} }, { accountIds: ['demo'], actor: 'Dono' });
  suspendForBilling(agency, 'demo');
  manual('Closed');
  assert.equal(restoreFromBilling(agency, 'demo'), false, 'encerrada nunca volta sozinha');
  assert.equal(suspendForBilling(agency, 'desconhecida'), false);
});

test('A assinatura leva as tentativas configuradas e, em atraso, não gera outra', async t => {
  const c = await planBilling(t);
  const body = c.gateway.calls.find(call => call.path === '/v2/subscriptions/create').body;
  assert.deepEqual(body.retryPolicy, { maxRetry: 3, retryEvery: 1 });
  await c.paid();
  await c.deliver(c.event('subscription.payment_failed', { retryNumber: 1 }));
  assert.equal((await c.account()).billing.status, 'PastDue');
  assert.equal((await c.subscribe()).status, 409);
});

test('Recusa deixa em atraso, avisa uma vez por tentativa e a renovação limpa', async t => {
  const c = await planBilling(t);
  await c.paid();
  await c.deliver(c.event('subscription.payment_failed', { retryNumber: 1 }));
  await c.deliver(c.event('subscription.payment_failed', { retryNumber: 1 }));
  await c.deliver(c.event('subscription.payment_failed', { retryNumber: 2 }));
  let account = await c.account();
  assert.deepEqual([account.status, account.billing.status, account.billing.failures.map(item => item.retryNumber)], ['Active', 'PastDue', [1, 2]]);
  const toRui = c.mails.filter(mail => mail.to === 'rui@agencia.com');
  assert.deepEqual(toRui.map(mail => mail.idempotency), ['plan-failed-subs_1-1-rui@agencia.com', 'plan-failed-subs_1-2-rui@agencia.com']);
  assert.match(toRui[0].text, /Pro/);
  assert.equal((await c.send('/api/state?workspace=demo')).body.billingNotice, 'past_due');
  await c.deliver(c.event('subscription.renewed', { payment: { id: 'card_2', amount: 29700 } }));
  account = await c.account();
  assert.deepEqual([account.billing.status, account.billing.failures], ['Active', []]);
  assert.equal((await c.send('/api/state?workspace=demo')).body.billingNotice, undefined);
});

for (const reason of ENDED) {
  test(`Fim por ${reason}: suspende com a opção ligada e não com ela desligada`, async t => {
    const on = await planBilling(t);
    await on.paid();
    await on.deliver(on.event('subscription.cancelled', { subscription: { cancelledDueTo: reason } }));
    assert.deepEqual([(await on.account()).status, (await on.account()).suspendedBy, (await on.account()).billing.status], ['Paused', 'billing', 'Cancelled']);
    const off = await planBilling(t, { enabled: false });
    await off.paid();
    await off.deliver(off.event('subscription.cancelled', { subscription: { cancelledDueTo: reason } }));
    assert.deepEqual([(await off.account()).status, (await off.account()).billing.status], ['Active', 'Cancelled']);
  });
}

test('Cancelamento pela agência ou pelo cliente no portal não suspende', async t => {
  for (const cancelledDueTo of [null, 'Cancelada pelo cliente no portal: caro', 'Cancelada pelo reembolso pedido pelo cliente no portal']) {
    const c = await planBilling(t);
    await c.paid();
    await c.deliver(c.event('subscription.cancelled', { subscription: { cancelledDueTo } }));
    assert.equal((await c.account()).status, 'Active', String(cancelledDueTo));
  }
});

test('Aviso da assinatura antiga não suspende a nova, nem um atrasado reabre a cancelada', async t => {
  const c = await planBilling(t);
  await c.paid();
  await c.send('/api/abacatepay/agency/cancel', { workspace: 'demo' });
  await c.deliver(c.event('subscription.renewed', { payment: { id: 'card_9', amount: 29700 } }));
  assert.equal((await c.account()).billing.status, 'Cancelled');
  assert.equal((await c.subscribe()).status, 200);
  const fresh = (await c.account()).billing.checkoutId;
  assert.notEqual(fresh, c.checkout);
  await c.paid('card_2', { subscriptionId: 'subs_2', checkoutId: fresh });
  await c.deliver(c.event('subscription.cancelled', { subscription: { cancelledDueTo: ENDED[0] } }));
  assert.deepEqual([(await c.account()).status, (await c.account()).billing.status], ['Active', 'Active']);
});

test('Pagar desfaz a pausa da cobrança; conta encerrada continua encerrada e o dinheiro entra no livro', async t => {
  const c = await planBilling(t);
  await c.paid();
  await c.deliver(c.event('subscription.cancelled', { subscription: { cancelledDueTo: ENDED[0] } }));
  await c.subscribe();
  const fresh = (await c.account()).billing.checkoutId;
  await c.paid('card_2', { subscriptionId: 'subs_2', checkoutId: fresh });
  assert.deepEqual([(await c.account()).status, (await c.account()).suspendedBy], ['Active', '']);
  await c.action({ type: 'account-meta', id: 'demo', data: { plan: c.planId, status: 'Closed' } });
  await c.deliver(c.event('subscription.renewed', { subscriptionId: 'subs_2', checkoutId: fresh, payment: { id: 'card_3', amount: 29700 } }));
  assert.equal((await c.account()).status, 'Closed');
  assert.equal((await c.rows('agency')).filter(row => row.kind === 'plan_payment').length, 3);
});

test('Troca de plano só entra no histórico da assinatura', async t => {
  const c = await planBilling(t);
  await c.paid();
  await c.deliver(c.event('subscription.plan_changed', { status: 'PENDING', newAmount: 49700 }));
  const { billing } = await c.account();
  assert.equal(billing.status, 'Active');
  assert.equal(billing.history.at(-1).event, 'subscription.plan_changed');
  assert.equal(billing.amount, 297);
});
