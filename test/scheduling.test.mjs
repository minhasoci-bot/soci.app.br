import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { availableSlots, bookingView, fieldRoute, zonedInstant } from '../scheduling-model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
// A Monday a few days from "now" (the tests pass `at`).
const at = Date.parse('2026-12-07T06:00:00Z'); // Mon 03:00 in São Paulo
const day = '2026-12-07';

function setup() {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  execute(s, { type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, staff: [{ name: 'Ana' }, { name: 'Bruno' }],
    hours: { 0: [], 1: ['09:00', '12:00'], 2: ['09:00', '12:00'], 3: [], 4: [], 5: [], 6: [] } } });
  const [ana, bruno] = s.scheduling.staff.map(p => p.id);
  return { s, ana, bruno };
}

test('Services: slots per professional, buffer, and conflicts only per professional and resource', () => {
  const { s, ana, bruno } = setup();
  assert.equal(zonedInstant(day, '09:00', 'America/Sao_Paulo'), Date.parse('2026-12-07T12:00:00Z'));
  assert.throws(() => save(s, 'services', { name: '', duration: 30 }), /nome/);
  assert.throws(() => save(s, 'services', { name: 'X', duration: 2 }), /de 5 a 720/);
  const cut = save(s, 'services', { name: 'Corte', duration: 60, buffer: 30, price: 80, staffIds: [ana] });
  assert.deepEqual(availableSlots(s, cut, day, { at }).map(x => x.time), ['09:00', '10:00', '11:00']);
  const first = availableSlots(s, cut, day, { at })[0];
  save(s, 'appointments', { title: 'Corte', contactId: '', start: first.start, end: first.end, serviceId: cut, staffId: ana });
  // 10:00 is inside the 30-minute buffer after 09:00–10:00.
  assert.deepEqual(availableSlots(s, cut, day, { at }).map(x => x.time), ['11:00']);
  assert.throws(() => save(s, 'appointments', { title: 'Outro', start: first.start, end: first.end, staffId: ana }), /profissional já tem/);
  // Another professional at the same time is fine, and so is an appointment with no professional.
  save(s, 'appointments', { title: 'Com Bruno', start: first.start, end: first.end, staffId: bruno });
  save(s, 'appointments', { title: 'Sem equipe', start: first.start, end: first.end });
  assert.throws(() => save(s, 'appointments', { title: 'Sem equipe 2', start: first.start, end: first.end }), /overlaps/);
  // Editing with the generic form (no service fields) keeps the service and the professional.
  const booked = s.appointments.find(a => a.serviceId === cut);
  save(s, 'appointments', { title: 'Corte (editado)', contactId: '', start: booked.start, end: booked.end, status: 'Confirmed', notes: 'ok' }, booked.id);
  assert.deepEqual([booked.id, s.appointments.find(a => a.id === booked.id).staffId, s.appointments.find(a => a.id === booked.id).serviceId], [booked.id, ana, cut]);
  // A closed day and a day past the horizon have no slots.
  assert.deepEqual(availableSlots(s, cut, '2026-12-09', { at }), []);
  assert.deepEqual(availableSlots(s, cut, '2027-03-01', { at }), []);
});

test('Rentals use the resource quantity; field jobs need an address and move through their statuses', () => {
  const { s, ana } = setup();
  const bikes = save(s, 'resources', { name: 'Bicicleta', kind: 'rental', quantity: 3 });
  assert.throws(() => save(s, 'services', { name: 'Aluguel', kind: 'rental', resourceIds: [] }), /exatamente um recurso/);
  const rent = save(s, 'services', { name: 'Aluguel de bicicleta', kind: 'rental', rentalUnit: 'hour', maxUnits: 3, price: 20, resourceIds: [bikes] });
  assert.equal(availableSlots(s, rent, day, { at, units: 2, quantity: 3 }).length, 2, '09:00 and 10:00 fit two hours before noon');
  const slot = availableSlots(s, rent, day, { at, units: 2, quantity: 2 })[0];
  save(s, 'appointments', { title: 'Aluguel', start: slot.start, end: slot.end, serviceId: rent, quantity: 2 });
  assert.equal(availableSlots(s, rent, day, { at, units: 1, quantity: 2 })[0].time, '11:00', 'only one bike left until 11:00');
  assert.equal(availableSlots(s, rent, day, { at, units: 1, quantity: 1 })[0].time, '09:00');
  assert.throws(() => save(s, 'appointments', { title: 'Mais', start: slot.start, end: slot.end, serviceId: rent, quantity: 2 }), /Bicicleta: sem disponibilidade/);

  const visit = save(s, 'services', { name: 'Instalação', kind: 'field', duration: 60, buffer: 60, staffIds: [ana] });
  const flow = save(s, 'workflows', { name: 'A caminho', active: true, triggers: [{ type: 'field_status_changed', config: { status: 'en_route' } }], steps: [{ type: 'internal_notification', config: { body: 'x' } }] });
  const free = availableSlots(s, visit, day, { at })[0];
  assert.throws(() => save(s, 'appointments', { title: 'Visita', start: free.start, end: free.end, serviceId: visit, staffId: ana }), /endereço/);
  const job = save(s, 'appointments', { title: 'Visita', start: free.start, end: free.end, serviceId: visit, staffId: ana, address: 'Rua A, 10' });
  assert.equal(s.appointments.find(a => a.id === job).fieldStatus, 'scheduled');
  execute(s, { type: 'field-status', data: { id: job, status: 'en_route' } });
  assert.equal(s.runs.filter(r => r.workflowId === flow).length, 1);
  execute(s, { type: 'field-status', data: { id: job, status: 'done' } });
  const row = s.appointments.find(a => a.id === job);
  assert.deepEqual([row.fieldStatus, row.status, row.fieldLog.length], ['done', 'Completed', 2]);
  const route = fieldRoute(s, day, ana);
  assert.equal(route.jobs.length, 1);
  assert.equal(route.mapsUrl, 'https://www.google.com/maps/dir/Rua%20A%2C%2010');
});

test('The public page lists services, books a free slot, creates the contact and refuses a taken slot', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const act = body => fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  assert.equal((await fetch(`${base}/agendar/demo`)).status, 404, 'off until the page is turned on');
  await act({ type: 'scheduling-settings', data: { enabled: true, leadMinutes: 0, staff: [{ name: 'Ana' }] } });
  const staff = (await fetch(`${base}/api/state?workspace=demo`).then(r => r.json())).state.scheduling.staff[0].id;
  const service = (await act({ type: 'save', key: 'services', data: { name: 'Consulta', duration: 45, price: 120, staffIds: [staff] } })).id;
  const list = await fetch(`${base}/agendar/demo`);
  assert.equal(list.status, 200);
  assert.match(await list.text(), /Consulta/);
  const page = await (await fetch(`${base}/agendar/demo?servico=${service}`)).text();
  const start = page.match(/name="inicio" value="([^"]+)"/)?.[1];
  assert.ok(start, 'shows free times');
  const form = new URLSearchParams({ servico: service, inicio: start, nome: 'Paula Reis', email: 'paula@x.test', telefone: '', notas: '' });
  const booked = await fetch(`${base}/agendar/demo?servico=${service}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: form });
  assert.equal(booked.status, 200);
  assert.match(await booked.text(), /Agendado!/);
  const state = (await fetch(`${base}/api/state?workspace=demo`).then(r => r.json())).state;
  const appointment = state.appointments.find(a => a.serviceId === service);
  assert.equal(appointment.staffId, staff);
  assert.equal(state.contacts.find(c => c.id === appointment.contactId).email, 'paula@x.test');
  const again = await fetch(`${base}/agendar/demo?servico=${service}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: form });
  assert.equal(again.status, 409);
  assert.match(await again.text(), /acabou de ser ocupado/);
  assert.ok(bookingView({ ...blank(), scheduling: { enabled: true } }).services.length === 0);
});
