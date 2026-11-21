import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { transcriptFromCaptions } from '../meeting-model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const aiResult = { summary: 'Cliente quer o plano anual.', keyPoints: ['Plano anual', 'Desconto de 10%'], decisions: ['Fechar na sexta'],
  actionItems: [{ text: 'Enviar proposta', owner: 'Marina', due: '2026-12-04' }, { text: 'Agendar onboarding', owner: '', due: 'amanhã' }],
  nextSteps: 'Enviar a proposta.', sentiment: 'positive', followUpEmail: { subject: 'Resumo da nossa conversa', body: 'Olá {{contact.first_name}}, ...' } };

test('Captions become plain text; summary, tasks from action items and the contact note', () => {
  assert.equal(transcriptFromCaptions('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<v Ana>Bom dia.\n\n2\n00:00:02.000 --> 00:00:04.000\nVamos começar.'), 'Bom dia.\nVamos começar.');
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@x.test', tags: [], notes: 'Cliente desde 2024.' });
  assert.throws(() => save(s, 'meetings', { title: '' }), /título/);
  const id = save(s, 'meetings', { title: 'Reunião de proposta', contactId: ana, date: '2026-11-20T14:00:00Z', transcript: '1\n00:00:01,000 --> 00:00:03,000\nOlá Ana.' });
  assert.equal(s.meetings.find(m => m.id === id).transcript, 'Olá Ana.');
  assert.throws(() => execute(s, { type: 'meeting-tasks', data: { id } }), /resumo antes/);
  const flow = save(s, 'workflows', { name: 'Resumo', active: true, triggers: [{ type: 'meeting_summarized', config: { sentiment: 'positive' } }], steps: [{ type: 'internal_notification', config: { body: 'x' } }] });
  execute(s, { type: 'meeting-summary', data: { id, result: aiResult } });
  const m = s.meetings.find(row => row.id === id);
  assert.deepEqual([m.summary.sentiment, m.summary.actionItems.length, m.summary.actionItems[1].due], ['positive', 2, ''], 'a due date that is not a date is dropped');
  assert.equal(s.runs.filter(r => r.workflowId === flow).length, 1);
  assert.equal(execute(s, { type: 'meeting-tasks', data: { id, items: [0] } }), 1);
  assert.equal(execute(s, { type: 'meeting-tasks', data: { id } }), 1, 'the rest, never twice');
  assert.equal(execute(s, { type: 'meeting-tasks', data: { id } }), 0);
  const task = s.tasks.find(t => t.title === 'Enviar proposta');
  assert.deepEqual([task.contactId, task.owner, task.due.slice(0, 10)], [ana, 'Marina', '2026-12-04']);
  // Editing the meeting keeps the summary; the note goes on top of the contact's notes.
  save(s, 'meetings', { title: 'Reunião de proposta (editada)', contactId: ana, date: m.date }, id);
  assert.equal(s.meetings.find(row => row.id === id).summary.summary, 'Cliente quer o plano anual.');
  execute(s, { type: 'meeting-note', data: { id } });
  assert.match(s.contacts.find(c => c.id === ana).notes, /^Reunião: Reunião de proposta \(editada\)[\s\S]*Cliente desde 2024\.$/);
});

test('Transcribe audio and summarize through the metered AI endpoints', async t => {
  const calls = [];
  const contentAI = {
    transcribeAudio: async (connection, { buffer, mime }) => { calls.push(['audio', mime, buffer.length]); return { text: 'Ana: queremos o plano anual com desconto. Marina: envio a proposta até sexta.' }; },
    summarizeMeeting: async (connection, input) => { calls.push(['summary', input.title, input.transcript.length > 40]); return aiResult; }
  };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, contentAI });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const act = body => fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const id = (await act({ type: 'save', key: 'meetings', data: { title: 'Ligação com Ana' } })).id;
  const summarizeEmpty = await fetch(`${base}/api/meetings/summarize?workspace=demo&meeting=${id}`, { method: 'POST' });
  assert.equal(summarizeEmpty.status, 409);
  assert.equal((await fetch(`${base}/api/meetings/transcribe?workspace=demo&meeting=${id}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
  const audio = await fetch(`${base}/api/meetings/transcribe?workspace=demo&meeting=${id}&source=recording`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array(2048) });
  assert.equal(audio.status, 200, await audio.clone().text());
  const summary = await fetch(`${base}/api/meetings/summarize?workspace=demo&meeting=${id}`, { method: 'POST' });
  assert.equal(summary.status, 200, await summary.clone().text());
  const state = (await fetch(`${base}/api/state?workspace=demo`).then(r => r.json())).state;
  const meeting = state.meetings.find(m => m.id === id);
  assert.deepEqual([meeting.source, meeting.summary.decisions[0]], ['recording', 'Fechar na sexta']);
  assert.deepEqual(calls.map(c => c[0]), ['audio', 'summary']);
  assert.ok(state.ai.ledger.filter(e => e.kind === 'meetings').length >= 2, 'both calls metered as meetings');
});
