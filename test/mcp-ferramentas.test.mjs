// O que cada ferramenta do servidor MCP faz de verdade: lê, grava e envia pelos mesmos caminhos das telas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

async function start(t, options = {}) {
  const store = createSqliteStore(':memory:');
  const { server, host, ready } = makeServer({ store, auth: null, allowLocalAccess: true, socialScheduler: false, port: 0, ...options });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const raw = (body, { path = '/api/mcp/demo', headers = {} } = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  const rpc = async (method, params, options) => (await raw({ jsonrpc: '2.0', id: 1, method, params }, options)).json();
  const tool = async (name, args = {}) => {
    const { result, error } = await rpc('tools/call', { name, arguments: args });
    assert.equal(error, undefined, JSON.stringify(error));
    const text = result.content[0].text;
    return result.isError ? { failed: text } : JSON.parse(text);
  };
  return { base, store, raw, rpc, tool, state: () => store.load('demo') };
}

test('MCP: e-mail sai de verdade e o resultado diz se saiu', async t => {
  const sent = [];
  const { tool, state } = await start(t, { documentMail: { email: async (to, content) => { sent.push([to, content.subject, content.text]); return `e-mail enviado para ${to}`; } } });
  const contact = state().contacts.find(row => row.email);
  const result = await tool('send_social_message', { contactId: contact.id, body: 'Seu orçamento chegou', subject: 'Orçamento', channel: 'Email' });
  assert.deepEqual(sent, [[contact.email, 'Orçamento', 'Seu orçamento chegou']]);
  assert.equal(result.sent, true);
  assert.equal(state().messages.find(row => row.id === result.messageId).body, 'Seu orçamento chegou');
});

test('MCP: mensagem que não saiu volta como não enviada e fica marcada na conversa', async t => {
  const { tool, state } = await start(t);
  const contact = state().contacts.find(row => row.phone);
  for (const channel of ['WhatsApp', 'Instagram']) {
    const result = await tool('send_social_message', { contactId: contact.id, body: 'oi', channel });
    assert.equal(result.sent, false, channel);
    assert.ok(result.reason, channel);
    assert.ok(state().messages.find(row => row.id === result.messageId).failed, channel);
  }
});

test('MCP: canal sem envio pela plataforma é recusado, em vez de fingir que enviou', async t => {
  const { tool, state } = await start(t);
  const before = state().messages.length;
  for (const channel of ['SMS', 'Live chat']) {
    assert.match((await tool('send_social_message', { contactId: state().contacts[0].id, body: 'oi', channel })).failed, /canal/i);
  }
  assert.equal(state().messages.length, before);
});

test('MCP: nota interna fica na conversa e não é enviada', async t => {
  const { tool, state } = await start(t);
  const { messageId } = await tool('add_contact_note', { contactId: state().contacts[0].id, body: 'Ligou hoje' });
  const row = state().messages.find(message => message.id === messageId);
  assert.equal(row.channel, 'Note');
});

test('MCP: contatos são criados, lidos e atualizados sem apagar o que não foi informado', async t => {
  const { tool, state } = await start(t);
  const { contactId } = await tool('create_contact', { name: 'Nina Reis', email: 'nina@example.test', phone: '+55 11 98888-0000', tags: ['vip'], company: 'Reis' });
  await tool('update_contact', { contactId, phone: '+55 11 97777-0000', addTags: ['quente'], removeTags: ['vip'] });
  const row = state().contacts.find(contact => contact.id === contactId);
  assert.equal(row.email, 'nina@example.test');
  assert.equal(row.company, 'Reis');
  assert.equal(row.phone, '+55 11 97777-0000');
  assert.deepEqual(row.tags, ['quente']);
  const { contact } = await tool('get_contact', { contactId });
  assert.equal(contact.name, 'Nina Reis');
  assert.match((await tool('get_contact', { contactId: 'nada' })).failed, /Contato não encontrado/);
});

test('MCP: a lista de contatos é paginada e informa o total', async t => {
  const { tool, state } = await start(t);
  const first = await tool('list_crm_contacts', { limit: 2 });
  assert.equal(first.contacts.length, 2);
  assert.equal(first.total, state().contacts.length);
  assert.equal(first.nextOffset, 2);
  const last = await tool('list_crm_contacts', { limit: 2, offset: 2 });
  assert.equal(last.contacts.length, state().contacts.length - 2);
  assert.equal(last.nextOffset, undefined);
});

test('MCP: oportunidades são criadas, movidas e fechadas', async t => {
  const { tool, state } = await start(t);
  const contactId = state().contacts[0].id;
  const { pipelines } = await tool('list_pipelines');
  const [from, to] = pipelines[0].stages;
  const { opportunityId } = await tool('create_opportunity', { title: 'Plano anual', contactId, stageId: from.id, value: 1200 });
  await tool('move_opportunity', { opportunityId, stageId: to.id });
  assert.equal(state().opportunities.find(row => row.id === opportunityId).stage, to.id);
  await tool('set_opportunity_status', { opportunityId, status: 'Won' });
  const row = state().opportunities.find(item => item.id === opportunityId);
  assert.equal(row.status, 'Won');
  assert.equal(row.value, 1200);
  assert.ok((await tool('list_opportunities', { status: 'Won' })).opportunities.some(item => item.id === opportunityId));
});

test('MCP: tarefas são criadas e concluídas sem perder os dados', async t => {
  const { tool, state } = await start(t);
  const { taskId } = await tool('create_task', { title: 'Ligar para a Nina', notes: 'Depois das 14h' });
  assert.ok((await tool('list_tasks', { status: 'open' })).tasks.some(row => row.id === taskId));
  await tool('complete_task', { taskId });
  const row = state().tasks.find(task => task.id === taskId);
  assert.equal(row.done, true);
  assert.equal(row.notes, 'Depois das 14h');
});

test('MCP: compromissos são marcados, listados por período e cancelados', async t => {
  const { tool, state } = await start(t);
  const { appointmentId } = await tool('create_appointment', { title: 'Reunião', contactId: state().contacts[0].id, start: '2027-01-10T13:00:00Z', end: '2027-01-10T14:00:00Z' });
  assert.deepEqual((await tool('list_appointments', { from: '2027-01-10T00:00:00Z', to: '2027-01-11T00:00:00Z' })).appointments.map(row => row.id), [appointmentId]);
  assert.equal((await tool('list_appointments', { from: '2027-02-01T00:00:00Z' })).appointments.length, 0);
  await tool('cancel_appointment', { appointmentId });
  const row = state().appointments.find(item => item.id === appointmentId);
  assert.equal(row.status, 'Canceled');
  assert.equal(row.title, 'Reunião');
});

test('MCP: conversas mostram a última mensagem e o histórico do contato', async t => {
  const { tool, state } = await start(t);
  const contactId = state().contacts[0].id;
  await tool('add_contact_note', { contactId, body: 'primeira' });
  await tool('add_contact_note', { contactId, body: 'segunda' });
  const { conversations } = await tool('list_conversations');
  assert.equal(conversations.find(row => row.contactId === contactId).lastMessage, 'segunda');
  const { messages } = await tool('get_conversation', { contactId });
  assert.deepEqual(messages.slice(-2).map(row => row.body), ['primeira', 'segunda']);
});

test('MCP: posts aceitam mídia e podem ser revisados e reagendados', async t => {
  const { tool, store, state } = await start(t);
  await store.change('demo', s => { s.socialAccounts.push({ id: 'acc-1', provider: 'facebook', name: 'Página', status: 'connected' }); });
  const soon = hours => new Date(Date.now() + hours * 3600e3).toISOString();
  const { postId, status } = await tool('create_social_post', { summary: 'Oferta', accountIds: ['acc-1'], mediaUrls: ['https://cdn.example.test/a.jpg'], scheduleDate: soon(24), needsApproval: true });
  assert.equal(status, 'in_review');
  assert.equal(state().socialPosts[0].media[0].url, 'https://cdn.example.test/a.jpg');
  await tool('review_social_post', { postId, decision: 'approved' });
  assert.equal(state().socialPosts[0].status, 'scheduled');
  const when = soon(48);
  await tool('reschedule_social_post', { postId, scheduleDate: when });
  assert.equal(state().socialPosts[0].scheduleDate, when);
});

test('MCP: só inscreve contato em fluxo publicado', async t => {
  const { tool, state } = await start(t);
  const { workflows } = await tool('list_workflows');
  assert.equal(workflows.length, state().workflows.length);
  assert.match((await tool('enroll_contact_in_workflow', { workflowId: workflows[0]?.id || 'x', contactId: 'nada' })).failed, /./);
});

test('MCP: nenhuma leitura devolve segredo, token ou a fila de cobrança', async t => {
  const { rpc, tool, store } = await start(t);
  await store.change('demo', s => { s.socialAccounts.push({ id: 'acc-1', provider: 'facebook', name: 'Página', status: 'connected', accessToken: 'SEGREDO' }); });
  const { result } = await rpc('tools/list');
  for (const item of result.tools.filter(row => row.annotations.readOnlyHint && !row.inputSchema.required?.length)) {
    assert.doesNotMatch(JSON.stringify(await tool(item.name)), /SEGREDO|ledgerOutbox|tokenHash/, item.name);
  }
});

test('MCP: toda ferramenta tem título, esquema fechado e diz se só lê', async t => {
  const { rpc } = await start(t);
  const { result } = await rpc('tools/list');
  assert.ok(result.tools.length >= 25);
  for (const item of result.tools) {
    assert.ok(item.title && item.description, item.name);
    assert.equal(item.inputSchema.additionalProperties, false, item.name);
    assert.equal(typeof item.annotations.readOnlyHint, 'boolean', item.name);
  }
});

test('MCP: argumento desconhecido ou do tipo errado é recusado com o nome do campo', async t => {
  const { tool } = await start(t);
  assert.match((await tool('list_crm_contacts', { limite: 3 })).failed, /limite/);
  assert.match((await tool('create_contact', {})).failed, /name/);
  assert.match((await tool('list_tasks', { status: 'talvez' })).failed, /status/);
});

test('MCP: protocolo segue a especificação de transporte HTTP', async t => {
  const { base, raw, rpc } = await start(t);
  for (const version of ['2025-11-25', '2025-06-18', '2024-11-05']) assert.equal((await rpc('initialize', { protocolVersion: version })).result.protocolVersion, version);
  const started = (await rpc('initialize', { protocolVersion: '1999-01-01' })).result;
  assert.equal(started.protocolVersion, '2025-11-25');
  assert.deepEqual(Object.keys(started.capabilities), ['tools']);
  for (const method of ['notifications/initialized', 'notifications/cancelled']) {
    const response = await raw({ jsonrpc: '2.0', method });
    assert.equal(response.status, 202, method);
    assert.equal(await response.text(), '', method);
  }
  assert.equal((await rpc('prompts/get', { name: 'x' })).error.code, -32601);
  assert.equal((await rpc('tools/call', { name: 'nao_existe' })).error.code, -32602);
  const stream = await fetch(`${base}/api/mcp/demo`, { headers: { Accept: 'text/event-stream' } });
  assert.equal(stream.status, 405);
  assert.equal(stream.headers.get('allow'), 'POST');
  const invalid = await (await raw({ id: 1 })).json();
  assert.equal(invalid.error.code, -32600);
});

test('MCP: o endereço aceita a subconta no caminho, no parâmetro ou no cabeçalho', async t => {
  const { rpc } = await start(t);
  for (const options of [{ path: '/api/mcp/demo' }, { path: '/api/mcp?workspace=demo' }, { path: '/api/mcp', headers: { 'X-Workspace': 'demo' } }]) {
    assert.ok((await rpc('tools/list', {}, options)).result.tools.length, JSON.stringify(options));
  }
  assert.match((await rpc('tools/list', {}, { path: '/api/mcp' })).error, /subconta/i);
});

test('MCP: contato em não perturbe não recebe mensagem', async t => {
  const { tool, state } = await start(t);
  const contact = state().contacts.find(row => row.email);
  await tool('update_contact', { contactId: contact.id, dnd: true });
  const before = state().messages.length;
  assert.match((await tool('send_social_message', { contactId: contact.id, body: 'oi', channel: 'Email' })).failed, /não perturbe/);
  assert.equal(state().messages.length, before);
});
