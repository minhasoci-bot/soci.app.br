// White Label: o domínio de envio da agência (Agência → Serviços de e-mail). Antes ele só era guardado como texto:
// nunca era criado na Resend, não tinha registros de DNS e as subcontas escolhidas continuavam saindo pelo
// endereço da plataforma. Agora ele é criado e conferido na Resend e, verificado, vira o remetente delas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { agencySender } from '../email-domain.mjs';

function fakeResend() {
  const calls = [];
  let status = 'not_started';
  const records = [{ record: 'DKIM', type: 'TXT', name: 'resend._domainkey.mail.agencia.com.br', value: 'p=abc', priority: null, ttl: 'Auto', status: 'not_started' }];
  return {
    calls, verifyNext: () => { status = 'verified'; },
    configured: true,
    async add(name) { calls.push(['add', name]); if (!/\./.test(name)) throw Object.assign(new Error('Informe um domínio válido.'), { status: 400 }); return { id: `d-${calls.length}`, name, region: 'sa-east-1', status: 'not_started', records }; },
    async verify(id) { calls.push(['verify', id]); },
    async get(id) { calls.push(['get', id]); return { id, name: 'mail.agencia.com.br', region: 'sa-east-1', status, records: records.map(r => ({ ...r, status })) }; },
    async remove(id) { calls.push(['remove', id]); }
  };
}

async function start(emailDomainApi) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, emailDomainApi });
  await new Promise(resolve => server.listen(0, host, resolve));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)) };
}

test('The agency domain is created in Resend, verified there, and becomes the sender of the chosen sub-accounts', async t => {
  const resend = fakeResend();
  const local = await start(resend); t.after(local.close);
  const ws = (await local.call('/api/agency')).body.overview.accounts[0].id;
  const action = body => local.call('/api/agency/action', body);

  const added = await action({ type: 'email-domain', data: { domain: 'mail.agencia.com.br', localPart: 'Avisos' } });
  assert.equal(added.status, 200);
  const mail = added.body.agency.emailServices;
  assert.deepEqual([mail.domain, mail.localPart, mail.resendId, mail.status], ['mail.agencia.com.br', 'avisos', 'd-1', 'not_started']);
  assert.equal(mail.records[0].name, 'resend._domainkey.mail.agencia.com.br', 'a agência recebe os registros para publicar');

  assert.equal((await action({ type: 'email-domain-accounts', data: { accounts: [ws] } })).status, 200);
  let view = (await local.call(`/api/email/workspace/status?workspace=${ws}`)).body;
  assert.equal(view.agencyAddress, '', 'sem verificação a subconta segue pelo endereço da plataforma');

  resend.verifyNext();
  const checked = await action({ type: 'email-domain-status' });
  assert.equal(checked.body.agency.emailServices.status, 'verified');
  assert.deepEqual(resend.calls.slice(-2), [['verify', 'd-1'], ['get', 'd-1']]);
  view = (await local.call(`/api/email/workspace/status?workspace=${ws}`)).body;
  assert.equal(view.agencyAddress, 'avisos@mail.agencia.com.br');

  assert.equal((await action({ type: 'email-domain-remove' })).status, 200);
  assert.deepEqual(resend.calls.at(-1), ['remove', 'd-1'], 'o domínio removido sai da Resend');
});

test('A bad address is refused before anything is created in Resend; without Resend the domain is not saved', async t => {
  const resend = fakeResend();
  const local = await start(resend); t.after(local.close);
  assert.equal((await local.call('/api/agency/action', { type: 'email-domain', data: { domain: 'mail.agencia.com.br', localPart: 'com espaço' } })).status, 400);
  assert.equal(resend.calls.length, 0);

  const off = await start({ ...fakeResend(), configured: false, add: async () => { throw Object.assign(new Error('O envio de e-mail não está configurado nesta instalação (RESEND_API_KEY).'), { status: 503 }); } });
  t.after(off.close);
  const refused = await off.call('/api/agency/action', { type: 'email-domain', data: { domain: 'mail.agencia.com.br' } });
  assert.equal(refused.status, 503);
  assert.equal((await off.call('/api/agency')).body.agency.emailServices.domain, '');
});

test('A sub-account with its own verified domain is not the agency sender; others only when chosen', () => {
  const services = { domain: 'mail.agencia.com.br', localPart: 'avisos', status: 'verified', accounts: ['ws-1'] };
  assert.equal(agencySender(services, 'ws-1'), 'avisos@mail.agencia.com.br');
  assert.equal(agencySender(services, 'ws-2'), '');
  assert.equal(agencySender({ ...services, status: 'pending' }, 'ws-1'), '');
  assert.equal(agencySender(undefined, 'ws-1'), '');
});
