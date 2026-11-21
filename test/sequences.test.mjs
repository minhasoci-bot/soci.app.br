import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { inWindow, sequenceStats } from '../sequence-model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const text = body => [{ type: 'text', text: body }];
const H = 3600000;

test('Sequences validate steps and the sending window; the window moves sends to allowed hours', () => {
  const s = blank();
  assert.throws(() => save(s, 'emailSequences', { name: 'X', steps: [] }), /pelo menos um e-mail/);
  assert.throws(() => save(s, 'emailSequences', { name: 'X', steps: [{ subject: '', blocks: text('Oi') }] }), /assunto do e-mail 1/);
  assert.throws(() => save(s, 'emailSequences', { name: 'X', steps: [{ subject: 'Oi', blocks: text('Oi') }], window: { days: [1], startHour: 18, endHour: 9 } }), /janela/);
  const id = save(s, 'emailSequences', { name: 'Boas-vindas', steps: [{ subject: 'Oi', blocks: text('Bem-vindo') }, { subject: 'Dica', delayDays: 2, blocks: text('Dica 1') }] });
  const seq = s.emailSequences.find(row => row.id === id);
  assert.deepEqual([seq.status, seq.window, seq.exitOnReply, seq.steps.length], ['draft', { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 20 }, true, 2]);
  // Saturday 23:00 in São Paulo (Sunday 02:00 UTC) → next Monday 08:00 local (11:00 UTC).
  const moved = inWindow(Date.parse('2026-11-22T02:00:00Z'), { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 20 }, 'America/Sao_Paulo');
  assert.equal(new Date(moved).toISOString(), '2026-11-23T11:00:00.000Z');
});

test('Enrolled contacts get each step in order through the campaign pipeline; replies and unsubscribes stop them', () => {
  const s = blank();
  s.profile.timezone = 'UTC';
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['lead'] });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: ['lead'] });
  save(s, 'contacts', { name: 'Sem e-mail', tags: ['lead'] });
  const done = save(s, 'workflows', { name: 'Fim', active: true, triggers: [{ type: 'email_sequence_completed', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'fim' } }] });
  const id = save(s, 'emailSequences', { name: 'Nutrição', status: 'active', window: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24 },
    steps: [{ subject: 'Oi {{contact.first_name}}', blocks: text('Bem-vindo') }, { subject: 'Segundo', delayDays: 1, blocks: [{ type: 'button', label: 'Ver', url: 'https://exemplo.com' }] }] });
  const draft = save(s, 'emailSequences', { name: 'Rascunho', steps: [{ subject: 'x', blocks: text('x') }] });
  assert.throws(() => execute(s, { type: 'sequence-enroll', id: draft, data: { tag: 'lead' } }), /Ative/);
  assert.equal(execute(s, { type: 'sequence-enroll', id, data: { tag: 'lead' } }), 2, 'only contacts with e-mail');
  assert.equal(execute(s, { type: 'sequence-enroll', id, data: { contactIds: [ana] } }), 0, 'not twice while active');
  const now = Date.now();
  assert.equal(execute(s, { type: 'email-tick', data: { at: new Date(now).toISOString() } }), 2);
  let batch = execute(s, { type: 'email-take', data: { at: new Date(now).toISOString(), limit: 100 } });
  assert.deepEqual(batch.items.map(item => item.email).sort(), ['ana@x.test', 'bia@x.test']);
  const key = batch.items[0].campaignId;
  assert.match(key, /^seq:/);
  assert.equal(batch.campaigns[key].A.subject, 'Oi {{contact.first_name}}');
  execute(s, { type: 'email-result', data: { at: new Date(now).toISOString(), results: batch.items.map(item => ({ campaignId: item.campaignId, token: item.token, ok: true })) } });
  assert.equal(execute(s, { type: 'email-tick', data: { at: new Date(now + H).toISOString() } }), 0, 'step 2 waits one day');
  const seq = s.emailSequences.find(row => row.id === id);
  const biaToken = seq.enrolled.find(row => row.c === bia).sends[0].t;
  execute(s, { type: 'email-track', data: { token: biaToken, event: 'open' } });
  execute(s, { type: 'message', data: { contactId: bia, channel: 'Email', direction: 'Inbound', body: 'Pode parar' } });
  assert.deepEqual(seq.enrolled.map(row => [row.c === ana ? 'ana' : 'bia', row.status, row.reason || '']).sort(), [['ana', 'active', ''], ['bia', 'exited', 'replied']]);
  batch = execute(s, { type: 'email-take', data: { at: new Date(now + 25 * H).toISOString(), limit: 100 } });
  assert.deepEqual(batch.items.map(item => item.email), ['ana@x.test']);
  execute(s, { type: 'email-result', data: { at: new Date(now + 25 * H).toISOString(), results: [{ campaignId: batch.items[0].campaignId, token: batch.items[0].token, ok: true }] } });
  const click = execute(s, { type: 'email-track', data: { token: batch.items[0].token, event: 'click', index: 0 } });
  assert.equal(click.url, 'https://exemplo.com/');
  assert.equal(seq.enrolled.find(row => row.c === ana).status, 'completed');
  assert.equal(s.runs.filter(row => row.workflowId === done).length, 1);
  const stats = sequenceStats(seq);
  assert.deepEqual([stats.completed, stats.exited, stats.steps[0].sent, stats.steps[0].opened, stats.steps[1].clicked], [1, 1, 2, 1, 1]);
  // Unsubscribing from a sequence e-mail marks the contact and stops the sequence.
  const cid = save(s, 'contacts', { name: 'Caio', email: 'caio@x.test', tags: [] });
  execute(s, { type: 'sequence-enroll', id, data: { contactIds: [cid] } });
  batch = execute(s, { type: 'email-take', data: { at: new Date(now + 26 * H).toISOString(), limit: 100 } });
  execute(s, { type: 'email-result', data: { results: [{ campaignId: batch.items[0].campaignId, token: batch.items[0].token, ok: true }] } });
  execute(s, { type: 'email-track', data: { token: batch.items[0].token, event: 'unsubscribe' } });
  assert.equal(s.contacts.find(row => row.id === cid).emailUnsubscribed, true);
  assert.equal(seq.enrolled.find(row => row.c === cid).reason, 'unsubscribed');
});

test('Workflows add and remove contacts from a sequence', () => {
  const s = blank();
  const seq = save(s, 'emailSequences', { name: 'Nutrição', status: 'active', steps: [{ subject: 'Oi', blocks: text('Oi') }] });
  save(s, 'workflows', { name: 'Entra', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'nutrir' } }], steps: [{ type: 'add_to_sequence', config: { sequenceId: seq } }] });
  save(s, 'workflows', { name: 'Sai', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'cliente' } }], steps: [{ type: 'remove_from_sequence', config: { sequenceId: seq } }] });
  const id = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [] });
  const contact = () => s.contacts.find(row => row.id === id);
  save(s, 'contacts', { ...contact(), tags: ['nutrir'] }, id);
  for (let i = 0; i < 3; i++) execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + i * 1000).toISOString() } });
  const row = () => s.emailSequences[0].enrolled.find(item => item.c === id);
  assert.equal(row().status, 'active');
  save(s, 'contacts', { ...contact(), tags: ['nutrir', 'cliente'] }, id);
  for (let i = 0; i < 3; i++) execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 5000 + i * 1000).toISOString() } });
  assert.deepEqual([row().status, row().reason], ['exited', 'removed']);
});
