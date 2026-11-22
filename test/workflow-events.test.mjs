import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

// T.1, eventos da comunidade: gatilho de check-in (pela equipe) e ação de inscrever em evento gratuito.
test('T.1 community events: check-in trigger and registering a member for a free event', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const saveRemote = async (key, data, id) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, id, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
  const access = (s, id, contactId) => (runsOf(s, id).find(run => run.contactId === contactId)?.results || []).filter(row => row.startsWith('Acesso:'));
  const notes = (s, name) => s.teamMessages.filter(row => row.body.startsWith(`${name}:`)).map(row => row.body);
  const until = async check => {
    for (let i = 0; i < 150; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.fail('timed out waiting for the workflow delivery');
  };

  const club = await saveRemote('communities', { name: 'Clube', visibility: 'public' });
  const start = Date.now() + 2 * 864e5, iso = at => new Date(at).toISOString();
  const event = { communityId: club, start: iso(start), end: iso(start + 36e5), locationType: 'online', location: 'https://meet.example.test/sala' };
  const meetup = await saveRemote('communityEvents', { ...event, title: 'Encontro mensal', capacity: 1 });
  const paid = await saveRemote('communityEvents', { ...event, title: 'Workshop pago', access: 'paid', price: 50 });
  const flow = (name, trigger, steps = [{ type: 'internal_notification', config: { body: '{{trigger.title}}' } }]) => saveRemote('workflows', { name, active: true, triggers: [trigger], steps });
  const join = await flow('Entrar', { type: 'contact_tag', config: { change: 'added', tag: 'membro' } }, [{ type: 'grant_community_access', config: { communityId: club } }]);
  const register = await flow('Inscrever', { type: 'contact_tag', config: { change: 'added', tag: 'evento' } }, [{ type: 'register_event', config: { eventId: meetup } }]);
  const registerPaid = await flow('Inscrever pago', { type: 'contact_tag', config: { change: 'added', tag: 'pago' } }, [{ type: 'register_event', config: { eventId: paid } }]);
  await flow('Inscrito', { type: 'community_event_registered', config: { eventId: meetup } });
  await flow('Presente', { type: 'community_event_checked_in', config: { communityId: club, eventId: meetup } });

  // Registering: only active members, once, within the seats; paid events need a ticket.
  const ana = await saveRemote('contacts', { name: 'Ana', email: 'ana.evento@example.test', tags: ['evento'], custom: {} });
  let s = await until(s => access(s, register, ana).length);
  assert.deepEqual(access(s, register, ana), ['Acesso: Encontro mensal: contato não é membro ativo da comunidade']);
  const bia = await saveRemote('contacts', { name: 'Bia', email: 'bia.evento@example.test', tags: ['membro'], custom: {} });
  s = await until(s => access(s, join, bia).length);
  await saveRemote('contacts', { ...s.contacts.find(row => row.id === bia), tags: ['membro', 'evento', 'pago'] }, bia);
  s = await until(s => access(s, register, bia).length && notes(s, 'Inscrito').length);
  assert.deepEqual(access(s, register, bia), ['Acesso: Encontro mensal: presença confirmada']);
  assert.deepEqual(notes(s, 'Inscrito'), ['Inscrito: Encontro mensal'], 'registering fires "Inscrição em evento da comunidade"');
  assert.match(runsOf(s, registerPaid).find(run => run.contactId === bia).results.join(' | '), /evento pago/);
  const caio = await saveRemote('contacts', { name: 'Caio', email: 'caio.evento@example.test', tags: ['membro'], custom: {} });
  s = await until(s => access(s, join, caio).length);
  await saveRemote('contacts', { ...s.contacts.find(row => row.id === caio), tags: ['membro', 'evento'] }, caio);
  s = await until(s => access(s, register, caio).length);
  assert.deepEqual(access(s, register, caio), ['Acesso: Encontro mensal: vagas esgotadas']);

  // Check-in by the team: fires once per check-in; undoing clears it, so checking in again fires again.
  const api = `/api/client-portal/demo/community-admin/${club}`;
  const person = (await call(api)).body.events.find(row => row.id === meetup).people[0];
  assert.equal(person.checkedInAt, '');
  assert.equal((await call(api, { action: 'attendee-checkin', eventId: meetup, memberId: person.id })).status, 200);
  s = await until(s => notes(s, 'Presente').length);
  assert.deepEqual(notes(s, 'Presente'), ['Presente: Encontro mensal']);
  assert.ok(runsOf(s, s.workflows.find(row => row.name === 'Presente').id).every(run => run.contactId === bia));
  assert.ok((await call(api)).body.events.find(row => row.id === meetup).people[0].checkedInAt);
  assert.equal((await call(api, { action: 'attendee-checkin', eventId: meetup, memberId: person.id, undo: true })).status, 200);
  assert.equal((await call(api)).body.events.find(row => row.id === meetup).people[0].checkedInAt, '');
  assert.equal((await call(api, { action: 'attendee-checkin', eventId: meetup, memberId: person.id })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(notes(await state(), 'Presente').length, 2, 'a new check-in after undoing fires again');
  assert.equal((await call(api, { action: 'attendee-checkin', eventId: meetup, memberId: 'ninguem' })).status, 400);
});
