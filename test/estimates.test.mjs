import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { estimateTokenHash } from '../estimate-model.mjs';
import { requireWorkspaceCommand } from '../authorization.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data, actor: 'Bia' }, { workspace: 'demo' });
const hashOf = path => estimateTokenHash(path.split('#')[1]);

function setup(extra = {}) {
  const s = blank();
  const contactId = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@exemplo.com.br', company: 'Padaria Bom Pão' });
  save(s, 'workflows', { name: 'Aceite', active: true, triggers: [{ type: 'estimate_status', config: { status: 'accepted' } }], steps: [{ type: 'add_tag', config: { tag: 'orcamento-aceito' } }] });
  const id = save(s, 'estimates', { title: 'Redes sociais', contactId, issueDate: '2026-11-20', notes: 'Inclui 12 posts.', terms: 'Pagamento em 7 dias.',
    items: [{ id: 'item-base1', name: 'Gestão', qty: 1, price: 1000 }, { id: 'item-extra', name: 'Anúncios', qty: 1, price: 500, optional: true, selected: false }], ...extra });
  return { s, id, contactId, est: () => s.estimates.find(row => row.id === id) };
}

test('Estimates get a sequential number, a server-computed total and stay editable only as drafts', () => {
  const { s, id, est } = setup();
  assert.deepEqual([est().number, est().total, est().status, est().autoInvoice], ['ORC-0001', 1000, 'draft', true]);
  const second = save(s, 'estimates', { title: 'Site', items: [{ name: 'Site', qty: 1, price: 3000 }] });
  assert.equal(s.estimates.find(row => row.id === second).number, 'ORC-0002');
  save(s, 'estimates', { ...est(), title: 'Redes sociais e anúncios' }, id);
  assert.equal(est().number, 'ORC-0001', 'editing keeps the number');
  assert.throws(() => save(s, 'estimates', { title: '' }), /nome ao orçamento/);
  assert.throws(() => save(s, 'estimates', { title: 'X', issueDate: '2026-11-20', expiresAt: '2026-11-01' }), /validade/);
  act(s, 'estimate-send', id);
  assert.throws(() => save(s, 'estimates', { ...est(), title: 'Mudou' }, id), /Revisar/);
  assert.throws(() => execute(s, { type: 'delete', key: 'estimates', id }), /Revise/);
  act(s, 'estimate-revise', id);
  assert.equal(est().status, 'draft');
  assert.deepEqual(est().tokens, [], 'revising closes the old link');
});

test('Sending needs a client with e-mail and items; the client accepts with optional items and the invoice is created', () => {
  const { s, id, est } = setup();
  const empty = save(s, 'estimates', { title: 'Sem cliente', items: [{ name: 'A', qty: 1, price: 10 }] });
  assert.throws(() => act(s, 'estimate-send', empty), /cliente/);
  const { path } = act(s, 'estimate-send', id, { message: 'Segue.' });
  assert.match(path, /^\/orcamento\/demo#[0-9a-f]{48}$/);
  const mail = s.workflowOutbox.find(item => item.what === 'estimate');
  assert.deepEqual([mail.email, mail.title, mail.message], ['ana@exemplo.com.br', 'ORC-0001 · Redes sociais', 'Segue.']);

  const view = act(s, 'estimate-open', '', { tokenHash: hashOf(path), ip: '203.0.113.7' });
  assert.equal(view.canAnswer, true);
  assert.match(view.html, /ORC-0001/);
  assert.match(view.html, /data-item="item-extra"/);
  assert.ok(est().viewedAt);
  assert.throws(() => act(s, 'estimate-accept', '', { tokenHash: hashOf(path) }), /seu nome/);
  const done = act(s, 'estimate-accept', '', { tokenHash: hashOf(path), name: 'Ana Souza', items: ['item-extra'], ip: '203.0.113.7' });
  assert.equal(done.status, 'invoiced');
  assert.equal(est().total, 1500, 'the optional item chosen by the client counts');
  assert.equal(est().acceptedBy, 'Ana Souza');
  const invoice = s.invoices.find(row => row.estimateId === id);
  assert.deepEqual([invoice.title, invoice.value, invoice.status], ['ORC-0001 · Redes sociais', 1500, 'Open']);
  assert.ok(s.contacts[0].tags.includes('orcamento-aceito'), 'estimate_status trigger ran');
  assert.equal(done.payable, true);
  assert.deepEqual(act(s, 'estimate-payable', '', { tokenHash: hashOf(path) }), { invoiceId: invoice.id });

  save(s, 'invoices', { title: invoice.title, contactId: invoice.contactId, value: invoice.value, due: invoice.due, status: 'Paid' }, invoice.id);
  assert.ok(est().paidAt);
  assert.deepEqual(est().audit.map(entry => entry.event), ['sent', 'viewed', 'accepted', 'invoiced', 'paid']);
  assert.equal(act(s, 'estimate-open', '', { tokenHash: hashOf(path) }).payable, false);
});

test('Declining, manual answers, manual invoicing, expiry and new links', () => {
  const a = setup();
  const pathA = act(a.s, 'estimate-send', a.id).path;
  const declined = act(a.s, 'estimate-decline', '', { tokenHash: hashOf(pathA), reason: 'Caro demais' });
  assert.deepEqual([declined.status, declined.declinedReason], ['declined', 'Caro demais']);
  assert.equal(act(a.s, 'estimate-accept', '', { tokenHash: hashOf(pathA), name: 'Ana' }).status, 'declined', 'an answered estimate does not change');

  const b = setup({ autoInvoice: false });
  act(b.s, 'estimate-send', b.id);
  act(b.s, 'estimate-status', b.id, { status: 'accepted' });
  assert.equal(b.est().status, 'accepted');
  assert.equal(b.s.invoices.length, 0, 'without automatic invoicing nothing is billed yet');
  act(b.s, 'estimate-invoice', b.id);
  assert.equal(b.est().status, 'invoiced');
  assert.equal(b.s.invoices.length, 1);
  assert.throws(() => act(b.s, 'estimate-invoice', b.id), /Fature/);

  const c = setup({ expiresAt: '2026-12-31' });
  const old = act(c.s, 'estimate-send', c.id).path;
  const fresh = act(c.s, 'estimate-link', c.id).path;
  assert.throws(() => act(c.s, 'estimate-open', '', { tokenHash: hashOf(old) }), /substituído/);
  c.est().expiresAt = '2020-01-01';
  assert.equal(act(c.s, 'estimate-open', '', { tokenHash: hashOf(fresh) }).status, 'expired');
  c.est().expiresAt = '';
  act(c.s, 'estimate-send', c.id);
  assert.equal(c.est().status, 'sent', 'an expired estimate can be sent again');
});

test('Workflow action sends a copy of a model estimate to the enrolled contact; commands belong to Payments', () => {
  const { s, id } = setup();
  const lead = save(s, 'contacts', { name: 'Rafa Lima', email: 'rafa@exemplo.com.br' });
  save(s, 'workflows', { name: 'Orçamento automático', active: true, triggers: [{ type: 'contact_tag', config: { tag: 'quer-orcamento' } }],
    steps: [{ type: 'send_estimate', config: { estimateId: id, channel: 'email', expiresDays: 10 } }] });
  save(s, 'contacts', { name: 'Rafa Lima', email: 'rafa@exemplo.com.br', tags: ['quer-orcamento'] }, lead);
  const copy = s.estimates.find(row => row.contactId === lead);
  assert.deepEqual([copy?.status, copy?.number, copy?.total], ['sent', 'ORC-0002', 1000]);
  assert.equal(s.estimates.find(row => row.id === id).status, 'draft', 'the model stays a draft');
  for (const type of ['estimate-send', 'estimate-link', 'estimate-revise', 'estimate-status', 'estimate-invoice']) {
    assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }));
    assert.throws(() => requireWorkspaceCommand({ modules: ['contacts'] }, { type }), /permissão/);
  }
  assert.throws(() => requireWorkspaceCommand({ modules: null }, { type: 'estimate-accept' }), /Unknown operation/, 'public actions are not app commands');
});

test('Public estimate page: strict CSP, answer by token, nothing else from the workspace', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, csp: r.headers.get('content-security-policy') };
  };
  const action = command => call('/api/action?workspace=demo', command);
  const contactId = (await action({ type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@exemplo.com.br', notes: 'SEGREDO-INTERNO' } })).body.id;
  await action({ type: 'save', key: 'contacts', data: { name: 'Outro cliente', email: 'outro@exemplo.com.br' } });
  const id = (await action({ type: 'save', key: 'estimates', data: { title: 'Site', contactId, items: [{ name: 'Site', qty: 1, price: 3000 }] } })).body.id;
  const path = (await action({ type: 'estimate-send', id })).body.id.path;
  const token = path.split('#')[1];
  const page = await call(path.split('#')[0]);
  assert.equal(page.status, 200);
  assert.match(page.text, /estimate-view\.js/);
  assert.doesNotMatch(page.csp, /unsafe-inline/);
  assert.equal((await call('/api/orcamento/demo', { action: 'open', token: '0'.repeat(48) })).status, 404);
  const opened = await call('/api/orcamento/demo', { action: 'open', token });
  assert.equal(opened.status, 200);
  assert.doesNotMatch(opened.text, /SEGREDO-INTERNO|outro@exemplo/);
  const accepted = await call('/api/orcamento/demo', { action: 'accept', token, name: 'Ana' });
  assert.equal(accepted.body.status, 'invoiced');
  assert.equal(accepted.body.online, false);
  assert.equal((await call('/api/orcamento/demo', { action: 'pay', token })).status, 409, 'no gateway connected');
});
