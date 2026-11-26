import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_DAYS, agencyAccess, hydrateBilling, startTrial } from '../agency-billing-model.mjs';
import { AGENCY_ID, blankAgency, hydrateAgency } from '../agency-model.mjs';

const now = new Date('2026-12-10T12:00:00Z');
const base = hydrateBilling({}, { root: false });
const pick = ({ canUse, gate }) => ({ canUse, gate });

test('Agência nova nasce sem celular confirmado; a raiz é isenta', () => {
  assert.equal(TRIAL_DAYS, 15);
  const fresh = hydrateBilling({ plan: 'Starter', wallet: [{ id: 'w' }] }, { root: false });
  assert.equal(fresh.status, 'Unverified');
  assert.equal(fresh.plan, 'Starter');
  assert.deepEqual(fresh.wallet, [{ id: 'w' }]);
  assert.deepEqual([fresh.trialEndsAt, fresh.extended, fresh.subscription, fresh.failures, fresh.phone, fresh.referredBy, fresh.verify], ['', false, null, [], '', null, null]);
  assert.equal(hydrateBilling({ status: 'Trial' }, { root: true }).status, 'Exempt');
  assert.equal(hydrateBilling({ status: 'Active' }, { root: false }).status, 'Active');
});

test('Confirmar começa 15 dias de teste', () => {
  const b = hydrateBilling({}, { root: false });
  startTrial(b, new Date('2026-12-01T12:00:00Z'));
  assert.deepEqual([b.status, b.trialEndsAt], ['Trial', '2026-12-16T12:00:00.000Z']);
  assert.equal(agencyAccess(b, new Date('2026-12-13T12:00:00Z')).daysLeft, 3);
  assert.equal(agencyAccess(b, new Date('2026-12-13T12:00:00Z')).canUse, true);
});

test('Sem celular ou bloqueada não usa; teste vencido ainda usa até a varredura', () => {
  assert.deepEqual(pick(agencyAccess(hydrateBilling({}, { root: false }), now)), { canUse: false, gate: 'PHONE_REQUIRED' });
  assert.deepEqual(pick(agencyAccess({ ...base, status: 'Blocked' }, now)), { canUse: false, gate: 'AGENCY_BLOCKED' });
  const expired = agencyAccess({ ...base, status: 'Trial', trialEndsAt: '2026-01-01T00:00:00.000Z' }, now);
  assert.equal(expired.canUse, true);
  assert.equal(expired.daysLeft, 0);
  assert.deepEqual(pick(agencyAccess({ ...base, status: 'Exempt' }, now)), { canUse: true, gate: '' });
  assert.equal(agencyAccess({ ...base, status: 'Active', plan: 'Agency Pro' }, now).plan, 'Agency Pro');
});

test('A agência raiz carregada pelo id fica isenta; as outras esperam o celular', () => {
  assert.equal(hydrateAgency(blankAgency(), AGENCY_ID).billing.status, 'Exempt');
  assert.equal(hydrateAgency(blankAgency(), 'agency-123').billing.status, 'Unverified');
  const old = blankAgency(); old.billing = { plan: 'Unlimited', wallet: [], autoRecharge: { enabled: false, threshold: 10, amount: 25 } };
  assert.equal(hydrateAgency(old, 'agency-123').billing.plan, 'Unlimited');
});
