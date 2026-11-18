import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveAccess, hasModule } from '../authorization.mjs';
import { moduleOfRecord, subAccountModules } from '../ui/agency-data.js';
import { nav } from '../ui/screens.js';

const agency = plans => ({ plans, accounts: { w1: { plan: plans[0]?.id, status: 'Active' } } });

test('The AI Studio is part of Sites: no separate menu or module', () => {
  assert.ok(!nav.some(([id]) => id === 'studio'), 'the sidebar has no AI Studio entry');
  assert.ok(!subAccountModules.some(([id]) => id === 'studio'), 'agencies no longer grant a separate AI Studio module');
  assert.equal(moduleOfRecord.studioProjects, 'sites');
});

test('Users and plans saved with the old AI Studio permission keep access as Sites', () => {
  const user = effectiveAccess(agency([]), { role: 'Account User', modules: ['contacts', 'studio'] }, 'w1', true);
  assert.ok(hasModule(user, 'sites'));
  assert.ok(!user.modules.includes('studio'));
  const planned = effectiveAccess(agency([{ id: 'p', modules: ['contacts', 'studio'] }]), { role: 'Account Admin', modules: ['contacts', 'sites'] }, 'w1');
  assert.ok(hasModule(planned, 'sites'), 'a plan that listed AI Studio still includes Sites');
  const without = effectiveAccess(agency([]), { role: 'Account User', modules: ['contacts'] }, 'w1', true);
  assert.ok(!hasModule(without, 'sites'), 'nobody gains Sites without having had Sites or AI Studio');
  assert.equal(effectiveAccess(agency([]), { role: 'Agency Owner', modules: null }, 'w1', true).modules, null, 'unrestricted users stay unrestricted');
});
