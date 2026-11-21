import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMirrorPlan } from '../scripts/sync-public.mjs';

// On Vercel the browser gets the front-end from public/; a ui/ module missing there answers 500 and the
// app never leaves "Abrindo a soci…" (2026-11-21: invoices.js, orders.js, estimates.js and 37 others).
test('public/ mirrors every front-end module and stylesheet in ui/', () => {
  const pending = publicMirrorPlan().map(row => row.path);
  assert.deepEqual(pending, [], `Fora de sincronia com ui/ — rode "node scripts/sync-public.mjs": ${pending.join(', ')}`);
});
