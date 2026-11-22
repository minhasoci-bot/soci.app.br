import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { checkEmailAddress } from '../email-verify.mjs';

// A fake DNS: MX for empresa.test, only an address for semmx.test, a null MX for nulo.test, a broken lookup for lento.test.
const failure = code => Promise.reject(Object.assign(new Error(code), { code }));
const resolver = {
  resolveMx: domain => ({ 'empresa.test': () => Promise.resolve([{ exchange: 'mx.empresa.test', priority: 10 }]), 'nulo.test': () => Promise.resolve([{ exchange: '.', priority: 0 }]),
    'semmx.test': () => failure('ENODATA'), 'lento.test': () => failure('ETIMEOUT') }[domain] || (() => failure('ENOTFOUND')))(),
  resolve4: domain => domain === 'semmx.test' ? Promise.resolve(['203.0.113.7']) : failure('ENOTFOUND')
};

test('T.1 email check: format, MX, address record, null MX and lookup failures', async () => {
  const check = email => checkEmailAddress(email, resolver).then(row => row.status);
  assert.equal(await check('Ana@Empresa.test'), 'valid');
  assert.equal(await check('ana@semmx.test'), 'valid', 'a domain with an address record receives mail');
  assert.equal(await check('ana@nulo.test'), 'invalid', 'a null MX refuses mail');
  assert.equal(await check('ana@naoexiste.test'), 'invalid');
  assert.equal(await check('ana@empresa'), 'invalid', 'bad format');
  assert.equal(await check('ana@lento.test'), 'unknown', 'a failed lookup is not an invalid address');
  const slow = { resolveMx: () => new Promise(() => {}), resolve4: () => new Promise(() => {}) };
  assert.equal((await checkEmailAddress('ana@demora.test', slow, { timeout: 30 })).status, 'unknown');
});

test('T.1 verify e-mail action: the run waits for the check, then branches on the result', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, emailResolver: resolver });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const saveRemote = async (key, data, id) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, id, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const until = async check => {
    for (let i = 0; i < 150; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the e-mail check');
  };

  const id = await saveRemote('workflows', { name: 'Verificar', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'email_verify', config: { invalidTag: 'email-invalido' } },
    { type: 'if_else', config: { conditions: [{ subject: 'var', op: 'equals', key: 'email_status', value: 'valid' }] },
      yes: [{ type: 'add_tag', config: { tag: 'email-ok' } }], no: [{ type: 'add_note', config: { body: 'E-mail {{vars.email_status}}: {{vars.email_motivo}}' } }] }
  ] });
  const good = await saveRemote('contacts', { name: 'Ana', email: 'ana@empresa.test', tags: [], custom: {} });
  const bad = await saveRemote('contacts', { name: 'Bia', email: 'bia@naoexiste.test', tags: [], custom: {} });
  const none = await saveRemote('contacts', { name: 'Caio', phone: '+5511900001111', tags: [], custom: {} });
  const s = await until(s => s.runs.filter(run => run.workflowId === id && run.status === 'Completed').length === 3);
  const contact = cid => s.contacts.find(row => row.id === cid);
  assert.equal(contact(good).emailStatus, 'valid');
  assert.ok(contact(good).tags.includes('email-ok'));
  assert.equal(contact(bad).emailStatus, 'invalid');
  assert.deepEqual(contact(bad).tags, ['email-invalido'], 'the invalid address gets the tag and goes to the other branch');
  assert.ok(s.messages.some(row => row.contactId === bad && row.body === 'E-mail invalid: o domínio não existe'));
  const noEmail = s.runs.find(run => run.workflowId === id && run.contactId === none);
  assert.match(noEmail.results.join(' | '), /contato sem e-mail/);
});
