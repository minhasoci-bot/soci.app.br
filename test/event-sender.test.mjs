import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { createEventSender } from '../event-sender.mjs';

const itemId = '6ccf69dd-f808-4258-b12c-9d5de1f06c88';
const START = Date.parse('2026-12-01T13:00:00.000Z');

function setup({ contacts = 3, outcome = () => ({ outcome: 'sent', id: 'P', error: '' }), active = async () => true, schedule = true } = {}) {
  const s = blank(); s.profile.timezone = 'America/Sao_Paulo';
  for (let n = 1; n <= contacts; n++) execute(s, { type: 'save', key: 'contacts', id: '', data: { name: `P${n}`, phone: `551198888000${n}`, tags: ['lead'] } });
  const id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'A', eventDate: '2026-12-10', plan: { brief: {}, items: [
    { id: itemId, kind: 'message', title: 'M', channel: 'privado', status: 'pronto', date: '2026-12-01', time: '10:00', notes: 'Oi', targets: { tags: ['lead'], excludeTags: [] } }] } } });
  execute(s, { type: 'event-send-settings', data: { minGapSeconds: 20, maxGapSeconds: 20, dailyCap: 100 } });
  if (schedule) execute(s, { type: 'event-message-schedule', id, data: { itemId } });
  const app = { s, now: START, sent: [], writes: 0, sleeps: [], breakWrite: () => false };
  app.deps = {
    load: async () => structuredClone(s),
    change: async (workspace, command) => {
      app.writes++;
      if (app.breakWrite(command)) throw Error('banco fora do ar');
      return { id: execute(s, command) };
    },
    active, now: () => app.now, sleep: async ms => { app.sleeps.push(ms); app.now += ms; },
    send: async (workspace, message) => { app.sent.push(message.to); return outcome(app.sent.length, app); }
  };
  app.sender = createEventSender(app.deps);
  return app;
}

test('Sends while the waits fit the round and leaves the rest for the next minute', async () => {
  const app = setup({ contacts: 5 });
  assert.equal(await app.sender.run('w'), 3, '0, 20 e 40 s cabem em 45 s; 60 s não');
  assert.deepEqual(app.sleeps, [20000, 20000]);
  app.now = START + 60_000;
  assert.equal(await app.sender.run('w'), 2);
  assert.equal(new Set(app.sent).size, 5);
});

test('Without anything due nothing is written', async () => {
  const app = setup(); app.now = START - 60_000;
  assert.equal(await app.sender.run('w'), 0);
  assert.equal(app.writes, 0);
  const empty = setup({ schedule: false });
  assert.equal(await empty.sender.run('w'), 0);
  assert.equal(empty.writes, 0);
});

test('A disconnected number ends the round at once', async () => {
  const app = setup({ outcome: () => ({ outcome: 'waiting', id: '', error: 'WhatsApp desconectado.' }) });
  assert.equal(await app.sender.run('w'), 0);
  assert.equal(app.sent.length, 1);
  assert.equal(app.s.eventSends[0].status, 'queued');
});

test('Two runs at the same time do not send twice', async () => {
  const app = setup({ contacts: 2 });
  const other = createEventSender(app.deps);
  const counts = await Promise.all([app.sender.run('w'), app.sender.run('w'), other.run('w')]);
  assert.equal(counts[1], 0, 'a mesma subconta não roda duas vezes no mesmo processo');
  assert.deepEqual([...app.sent].sort(), ['5511988880001', '5511988880002']);
});

test('A failed write does not lock the sub-account nor repeat the message', async () => {
  const app = setup({ contacts: 1 });
  app.breakWrite = command => command.type === 'event-send-result';
  await assert.rejects(() => app.sender.run('w'), /banco fora do ar/);
  app.breakWrite = () => false;
  app.now += 60_000;
  assert.equal(await app.sender.run('w'), 0);
  assert.equal(app.sent.length, 1);
  app.now += 6 * 60_000;
  await app.sender.run('w');
  assert.equal(app.sent.length, 1);
  assert.equal(app.s.eventSends[0].unconfirmed, true);
});

test('A short glitch while recording is retried before giving up', async () => {
  const app = setup({ contacts: 1 });
  let failures = 2;
  app.breakWrite = command => command.type === 'event-send-result' && failures-- > 0;
  assert.equal(await app.sender.run('w'), 1);
  assert.equal(app.s.eventSends[0].status, 'sent');
});

test('Suspended accounts do not send', async () => {
  const app = setup({ active: async () => false });
  assert.equal(await app.sender.run('w'), 0);
  assert.equal(app.sent.length, 0);
});

test('A crash inside the sender becomes unconfirmed', async () => {
  const app = setup({ contacts: 1, outcome: () => { throw Error('inesperado'); } });
  await app.sender.run('w');
  assert.deepEqual([app.s.eventSends[0].status, app.s.eventSends[0].unconfirmed], ['failed', true]);
});
