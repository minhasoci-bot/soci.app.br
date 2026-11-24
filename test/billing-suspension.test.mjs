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

async function suspended(t) {
  const c = await planBilling(t);
  await c.paid();
  await c.deliver(c.event('subscription.cancelled', { subscription: { cancelledDueTo: ENDED[0] } }));
  const person = async (role, email) => (await c.action({ type: 'save', key: 'users', data: { first: 'Lia', last: 'Melo', email, role, accounts: ['demo'] } })).body.result;
  const admin = { 'X-Go-User': await person('Account Admin', 'lia@loja.com') }, user = { 'X-Go-User': await person('Account User', 'caio@loja.com') };
  return { ...c, admin, user, pay: headers => c.send('/api/billing/reactivate?workspace=demo', {}, headers) };
}
const creations = c => c.gateway.calls.filter(call => call.path === '/v2/subscriptions/create').length;

test('Administrador da subconta pausada por cobrança recebe o link, sem novo teste, e o mesmo na segunda vez', async t => {
  const c = await suspended(t);
  const seen = await c.send('/api/state?workspace=demo', undefined, c.admin);
  assert.deepEqual([seen.status, seen.body.code, seen.body.account.canReactivate], [403, 'ACCOUNT_SUSPENDED', true]);
  const first = await c.pay(c.admin);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.match(first.body.url, /^https:\/\/app\.abacatepay\.com\/pay\//);
  const before = creations(c);
  assert.equal((await c.pay(c.admin)).body.url, first.body.url);
  assert.equal(creations(c), before, 'reaproveita o link pendente');
  const product = [...c.gateway.products.values()].at(-1);
  assert.equal('trialDays' in product, false);
  const call = c.gateway.calls.filter(item => item.path === '/v2/subscriptions/create').at(-1);
  assert.deepEqual(call.body.retryPolicy, { maxRetry: 3, retryEvery: 1 });
  assert.doesNotMatch(JSON.stringify(first.body), /webhookSecret|keySealed/);
  const fresh = (await c.account()).billing.checkoutId;
  await c.paid('card_2', { subscriptionId: 'subs_2', checkoutId: fresh });
  assert.equal((await c.account()).status, 'Active');
  assert.equal((await c.send('/api/state?workspace=demo', undefined, c.admin)).status, 200);
  assert.equal((await c.pay(c.admin)).status, 409, 'conta ativa não precisa');
});

test('Quem não administra, pausa manual e conta encerrada não reativam', async t => {
  const c = await suspended(t);
  assert.equal((await c.pay(c.user)).status, 403);
  assert.notEqual((await c.send('/api/state?workspace=demo', undefined, c.user)).body.account.canReactivate, true);
  await c.action({ type: 'account-reactivate', id: 'demo', data: {} });
  for (const status of ['Paused', 'Closed']) {
    await c.action({ type: 'account-meta', id: 'demo', data: { plan: c.planId, status, suspendedReason: 'Contrato' } });
    assert.equal((await c.pay(c.admin)).status, 403, status);
    assert.notEqual((await c.send('/api/state?workspace=demo', undefined, c.admin)).body.account.canReactivate, true);
  }
  assert.equal((await c.send('/api/billing/reactivate?workspace=nao-existe', {}, c.admin)).status, 403);
  assert.equal((await c.send('/api/billing/reactivate?workspace=demo', undefined, c.admin)).status, 405);
});

test('Sem plano ou sem gateway da agência, manda falar com a agência', async t => {
  const c = await suspended(t);
  await c.send('/api/abacatepay/agency/disconnect', {});
  const off = await c.pay(c.admin);
  assert.deepEqual([off.status, /Fale com a sua agência/.test(off.body.error)], [409, true]);
  const other = await suspended(t);
  await other.action({ type: 'delete', key: 'plans', id: other.planId });
  const noPlan = await other.pay(other.admin);
  assert.deepEqual([noPlan.status, /Fale com a sua agência/.test(noPlan.body.error)], [409, true]);
});

test('Depois de reativar, a devolução e o pagamento tardio da assinatura antiga ainda entram no livro', async t => {
  const c = await suspended(t);
  await c.pay(c.admin);
  const fresh = (await c.account()).billing.checkoutId;
  await c.paid('card_2', { subscriptionId: 'subs_2', checkoutId: fresh });
  await c.deliver({ event: 'checkout.disputed', data: { checkout: { id: c.checkout, frequency: 'SUBSCRIPTION', status: 'REFUNDED', amount: 29700 } } });
  let rows = await c.rows('agency');
  assert.deepEqual(rows.map(row => [row.kind, row.amount_cents, row.provider_ref]).sort(), [['dispute_lost', -29700, 'card_1'], ['plan_payment', 29700, 'card_1'], ['plan_payment', 29700, 'card_2']]);
  await c.deliver(c.event('subscription.renewed', { payment: { id: 'card_9', amount: 29700 } }));
  rows = await c.rows('agency');
  assert.equal(rows.length, 4);
  assert.deepEqual([(await c.account()).status, (await c.account()).billing.checkoutId], ['Active', fresh]);
});
