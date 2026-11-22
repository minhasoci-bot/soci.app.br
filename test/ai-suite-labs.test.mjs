import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { blankAgency, executeAgency, hydrateAgency } from '../agency-model.mjs';
import { agencyAiUsage, checkAiBudget, recordAiUsage, setAiAccess, setAiLimit } from '../ai-model.mjs';
import { setLabsOffer } from '../labs-model.mjs';
import { labOn } from '../ui/labs-data.js';
import { conversationRequest } from '../conversation-ai.mjs';
import { makeServer } from '../server.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Labs: the agency mode decides; a sub-account turns on only what is left to it', () => {
  const s = blank();
  assert.equal(labOn(s, 'contact-duplicates'), false, 'everything starts off');
  assert.throws(() => execute(s, { type: 'labs-toggle', data: { key: 'contact-duplicates', on: true } }), err => err.status === 403);
  setLabsOffer(s, { 'contact-duplicates': 'optin', 'conversation-reply': 'all', 'conversation-summary': 'bogus' });
  assert.deepEqual(s.labs.offered, { 'conversation-reply': 'all', 'conversation-summary': 'off', 'contact-duplicates': 'optin' });
  assert.equal(labOn(s, 'conversation-reply'), true, 'on in every sub-account');
  assert.throws(() => execute(s, { type: 'labs-toggle', data: { key: 'conversation-reply', on: false } }), err => err.status === 409);
  assert.throws(() => execute(s, { type: 'labs-toggle', data: { key: 'nope', on: true } }), err => err.status === 404);
  assert.equal(execute(s, { type: 'labs-toggle', data: { key: 'contact-duplicates', on: true } }), true);
  assert.equal(labOn(s, 'contact-duplicates'), true);
  setLabsOffer(s, { 'contact-duplicates': 'off' });
  assert.deepEqual(s.labs.on, {}, 'withdrawn by the agency, the switch is dropped');
  setLabsOffer(s, { 'contact-duplicates': 'optin' });
  assert.equal(labOn(s, 'contact-duplicates'), false, 'offered again, it starts from off');
});

test('Labs "Bloquear contatos duplicados" refuses a repeated e-mail or phone, only when on', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', phone: '+55 11 91234-5678', tags: [] });
  save(s, 'contacts', { name: 'Ana de novo', email: 'ANA@x.test', tags: [] });
  assert.equal(s.contacts.length, 2, 'off: duplicates are allowed as before');
  setLabsOffer(s, { 'contact-duplicates': 'all' });
  assert.throws(() => save(s, 'contacts', { name: 'Outra', email: ' Ana@X.test ', tags: [] }), err => err.status === 409 && /ana@x\.test: Ana/.test(err.message));
  assert.throws(() => save(s, 'contacts', { name: 'Outra', phone: '(11) 91234-5678', tags: [] }), /telefone: Ana/, 'same number without the country code');
  save(s, 'contacts', { name: 'Bruno', phone: '(11) 3456-7890', email: 'bruno@x.test', tags: [] });
  const twin = s.contacts.find(row => row.name === 'Ana de novo');
  save(s, 'contacts', { ...twin, name: 'Ana Paula' }, twin.id);
  assert.equal(s.contacts.find(row => row.id === twin.id).name, 'Ana Paula', 'an old duplicate can still be edited');
  assert.throws(() => save(s, 'contacts', { ...s.contacts.find(row => row.id === ana), email: 'bruno@x.test' }, ana), /bruno@x\.test/);
});

test('Central de IA: switch, limit crossings fire the workflow trigger once, agency usage sums the period', () => {
  const s = blank();
  const flow = save(s, 'workflows', { name: 'Avisa IA', active: true, triggers: [{ type: 'ai_usage_alert', config: { level: 'alert' } }], steps: [{ type: 'internal_notification', config: { body: 'IA em {{trigger.cost}}' } }] });
  const any = save(s, 'workflows', { name: 'Qualquer', active: true, triggers: [{ type: 'ai_usage_alert', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'IA' } }] });
  setAiLimit(s, { limit: 1, alertAt: 0.5 });
  const spend = tokens => recordAiUsage(s, { kind: 'conversations', model: 'gpt-5', usage: { input_tokens: tokens, output_tokens: 0 } });
  spend(200_000); // US$ 0,25
  assert.equal(s.runs.length, 0, 'below the alert line');
  spend(240_000); // 0,55: crosses 50%
  spend(100_000); // 0,675: still between the lines
  assert.deepEqual([s.runs.filter(r => r.workflowId === flow).length, s.runs.filter(r => r.workflowId === any).length], [1, 1], 'alert fires once');
  assert.equal(s.runs.find(r => r.workflowId === flow).context.level, 'alert');
  spend(400_000); // 1,175: crosses the limit
  assert.deepEqual([s.runs.filter(r => r.workflowId === flow).length, s.runs.filter(r => r.workflowId === any).length], [1, 2], 'limit fires only the "any" workflow');
  assert.throws(() => checkAiBudget(s), err => err.status === 402 && /Central de IA/.test(err.message));
  setAiLimit(s, { limit: 0 });
  checkAiBudget(s);
  setAiAccess(s, false);
  assert.throws(() => checkAiBudget(s), err => err.status === 403 && /desligada pela agência/.test(err.message));
  setAiAccess(s, true);
  checkAiBudget(s);

  const today = '2026-11-21';
  const ledger = (rows) => ({ ledger: rows.map(([at, kind, cost, error]) => ({ at: `${at}T12:00:00.000Z`, kind, model: 'gpt-5-mini', inputTokens: 10, outputTokens: 5, cost, ...(error ? { error } : {}) })) });
  const usage = agencyAiUsage([
    { id: 'a', name: 'Clínica', ai: ledger([['2026-11-21', 'conversations', 0.5], ['2026-11-15', 'email', 0.25, 'falhou'], ['2026-10-01', 'email', 9]]) },
    { id: 'b', name: 'Loja', ai: ledger([['2026-11-20', 'blog', 1]]) },
    { id: 'c', name: 'Parada', ai: ledger([]) }
  ], '7', today);
  assert.equal(usage.from, '2026-11-15');
  assert.equal(Object.keys(usage.byDay).length, 7, 'every day of the period, even empty ones');
  assert.deepEqual([usage.totals.calls, usage.totals.errors, usage.totals.cost], [3, 1, 1.75]);
  assert.deepEqual(usage.byAccount.map(row => [row.name, row.cost]), [['Loja', 1], ['Clínica', 0.75]], 'sub-accounts without usage are left out');
  assert.equal(usage.byKind.email.cost, 0.25);
  assert.equal(agencyAiUsage([{ id: 'a', name: 'A', ai: ledger([['2026-11-01', 'blog', 2]]) }], 'month', today).totals.cost, 2);
  assert.equal(agencyAiUsage([], 'bogus', today).period, '30');
});

test('Agency: Labs modes, AI defaults and the old Labs switches', () => {
  const agency = blankAgency();
  executeAgency(agency, { type: 'labs', data: { 'conversation-reply': 'optin' } }, { accountIds: [] });
  assert.equal(agency.labs['conversation-reply'], 'optin');
  assert.equal(agency.labs['contact-duplicates'], 'off', 'features not sent keep their mode');
  assert.throws(() => executeAgency(agency, { type: 'labs', data: { 'conversation-reply': 'sometimes' } }, { accountIds: [] }), /valid mode/);
  executeAgency(agency, { type: 'ai-defaults', data: { limit: '25', alertAt: '0.9', enabled: false } }, { accountIds: [] });
  assert.deepEqual(agency.aiDefaults, { limit: 25, alertAt: 0.9, enabled: false });
  assert.throws(() => executeAgency(agency, { type: 'ai-defaults', data: { limit: -1 } }, { accountIds: [] }), /limite/);
  assert.throws(() => executeAgency(agency, { type: 'ai-defaults', data: { limit: 5, alertAt: 0.2 } }, { accountIds: [] }), /alerta/);
  const legacy = { ...blankAgency(), labs: { workflowAi: true, darkSidebar: false } };
  hydrateAgency(legacy);
  assert.deepEqual(legacy.labs, { 'conversation-reply': 'off', 'conversation-summary': 'off', 'contact-duplicates': 'off' });
});

test('Conversation AI request: transcript in order, notes only in the summary, nothing to answer refused', () => {
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', tags: [] });
  assert.throws(() => conversationRequest(s, ana), err => err.status === 409);
  s.messages.push({ id: 'm2', contactId: ana, body: 'Vocês abrem sábado?', direction: 'Inbound', channel: 'WhatsApp', created: '2026-11-20T10:00:00Z' },
    { id: 'm1', contactId: ana, body: 'Olá!', direction: 'Outbound', channel: 'WhatsApp', created: '2026-11-20T09:00:00Z' },
    { id: 'm3', contactId: ana, body: 'Cliente VIP', direction: 'Outbound', channel: 'Note', created: '2026-11-20T11:00:00Z' });
  const reply = conversationRequest(s, ana);
  assert.equal(reply.channel, 'WhatsApp');
  assert.match(reply.transcript, /Empresa\] Olá![\s\S]*Cliente\] Vocês abrem sábado\?/);
  assert.doesNotMatch(reply.transcript, /VIP/);
  assert.match(conversationRequest(s, ana, { mode: 'summary' }).transcript, /Nota interna\] Cliente VIP/);
  assert.throws(() => conversationRequest(s, 'x'), err => err.status === 404);
});

test('Over HTTP: Labs reach the sub-account, AI buttons in Conversas, Central de IA limits and usage', async t => {
  const asked = [];
  const contentAI = {
    async writeConversationReply(connection, request) { asked.push(request); await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 500, output_tokens: 80 } }); return { text: 'Abrimos sim, das 9h às [[horário]].' }; },
    async writeConversationSummary(connection, request) { asked.push(request); await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 900, output_tokens: 200 } }); return { summary: 'Quer saber do sábado.', requests: ['Horário de sábado'], agreed: [], pending: ['Responder o horário'], sentiment: 'neutral' }; }
  };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false, contentAI, agentModel: 'gpt-4.1-mini' });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => { const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const state = async (ws = 'demo') => (await send(`/api/state?workspace=${ws}`)).body.state;

  const ana = (await send('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Ana', phone: '+5511900001111', tags: [] } })).body.id;
  await send('/api/action?workspace=demo', { type: 'message', data: { contactId: ana, channel: 'WhatsApp', direction: 'Inbound', body: 'Vocês abrem sábado?' } });
  assert.equal((await send('/api/conversations/ai/reply?workspace=demo', { contactId: ana })).status, 403, 'off until the agency offers it');

  const labs = await send('/api/agency/action', { type: 'labs', data: { 'conversation-reply': 'optin', 'conversation-summary': 'all' } });
  assert.equal(labs.status, 200, JSON.stringify(labs.body));
  assert.deepEqual((await state()).labs.offered, { 'conversation-reply': 'optin', 'conversation-summary': 'all', 'contact-duplicates': 'off' });
  assert.equal((await send('/api/conversations/ai/reply?workspace=demo', { contactId: ana })).status, 403, 'optin: the sub-account must turn it on');
  assert.equal((await send('/api/action?workspace=demo', { type: 'labs-toggle', data: { key: 'conversation-reply', on: true } })).status, 200);
  const reply = await send('/api/conversations/ai/reply?workspace=demo', { contactId: ana, language: 'es' });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  assert.match(reply.body.text, /Abrimos/);
  assert.equal(asked[0].language, 'es');
  const summary = await send('/api/conversations/ai/summary?workspace=demo', { contactId: ana });
  assert.deepEqual(summary.body.pending, ['Responder o horário']);
  assert.equal((await state()).ai.ledger.filter(row => row.kind === 'conversations').length, 2, 'both metered as Conversas');
  const overview = (await send('/api/agency')).body.overview.accounts.find(a => a.id === 'demo');
  assert.deepEqual(overview.labsOn, ['conversation-reply']);

  assert.equal((await send('/api/agency/ai-access', { workspace: 'demo', on: false })).status, 200);
  assert.equal((await send('/api/conversations/ai/summary?workspace=demo', { contactId: ana })).status, 403, 'AI switched off by the agency');
  await send('/api/agency/ai-access', { workspace: 'demo', on: true });
  assert.equal((await send('/api/agency/ai-access', { workspace: 'nope', on: true })).status, 404);

  const limited = await send('/api/agency/ai-limit', { workspace: 'demo', limit: 12.5, alertAt: 0.7 });
  assert.equal(limited.status, 200);
  assert.deepEqual([(await state()).ai.limit, (await state()).ai.alertAt], [12.5, 0.7]);
  assert.equal((await send('/api/agency/ai-limit', { workspace: 'demo', limit: 5, alertAt: 0.1 })).status, 400);

  const usage = await send('/api/agency/ai-usage', { period: '7' });
  assert.equal(usage.body.result.totals.calls, 2);
  assert.equal(usage.body.result.byAccount[0].id, 'demo');

  await send('/api/agency/action', { type: 'ai-defaults', data: { limit: 30, alertAt: 0.8, enabled: false } });
  const created = await send('/api/agency/accounts', { name: 'Nova Clínica' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const fresh = await state(created.body.result);
  assert.deepEqual([fresh.ai.limit, fresh.ai.disabled, fresh.labs.offered['conversation-summary']], [30, true, 'all'], 'defaults and Labs start with the new sub-account');
  const applied = await send('/api/agency/ai-apply-defaults', { scope: 'unlimited' });
  assert.equal(applied.body.result, 0, 'every sub-account already has a limit');
  assert.equal((await send('/api/agency/ai-apply-defaults', { scope: 'all' })).body.result, 2);
  assert.equal((await state()).ai.limit, 30);
});
