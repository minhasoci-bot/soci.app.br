import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { makeCommunity } from '../community.mjs';
import { eventView, nextOccurrence, occurrences } from '../community-events.mjs';
import { createSqliteStore } from '../storage.mjs';
import { signBody } from '../abacatepay.mjs';
import { saveFiscal } from './helpers/fiscal.mjs';

const KEY = 'abc_dev_shopkey_0000cccc';
const HOUR = 3600000, DAY = 24 * HOUR;
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const iso = ms => new Date(ms).toISOString();

test('Community events validate dates, price, links and recordings, and go away with their community', () => {
  const s = blank();
  const group = save(s, 'communities', { name: 'Clube' });
  const start = Date.now() + 2 * DAY;
  const base = { communityId: group, title: 'Mentoria', start: iso(start), end: iso(start + HOUR) };
  assert.throws(() => save(s, 'communityEvents', { ...base, communityId: 'outra' }), /comunidade/);
  assert.throws(() => save(s, 'communityEvents', { ...base, end: iso(start - HOUR) }), /depois do início/);
  assert.throws(() => save(s, 'communityEvents', { ...base, access: 'paid', price: 0.5 }), /R\$ 1/);
  assert.throws(() => save(s, 'communityEvents', { ...base, liveUrl: 'http://inseguro.com' }), /https/);
  assert.throws(() => save(s, 'communityEvents', { ...base, recordings: [{ title: 'Aula' }] }), /link de cada gravação/);
  assert.throws(() => save(s, 'communityEvents', { ...base, recurrence: 'weekly', occurrences: 60 }), /1 a 52/);
  const id = save(s, 'communityEvents', { ...base, access: 'paid', price: 49.9, recordings: [{ title: 'Replay', url: 'https://youtu.be/abcdefghijk' }] });
  const event = s.communityEvents.find(row => row.id === id);
  assert.deepEqual([event.access, event.price, event.status, event.reminder, event.recurrence, event.recordings.length], ['paid', 49.9, 'published', true, 'none', 1]);
  execute(s, { type: 'delete', key: 'communities', id: group });
  assert.equal(s.communityEvents.length, 0);
});

test('Repeating events: weekly dates keep the length; monthly ones keep the day or use the month\'s last day', () => {
  const weekly = { start: '2026-01-05T22:00:00.000Z', end: '2026-01-05T23:30:00.000Z', recurrence: 'weekly', occurrences: 3 };
  assert.deepEqual(occurrences(weekly).map(row => [row.start.slice(0, 10), Date.parse(row.end) - Date.parse(row.start)]), [['2026-01-05', 5400000], ['2026-01-12', 5400000], ['2026-01-19', 5400000]]);
  const monthly = { start: '2026-01-31T15:00:00.000Z', end: '2026-01-31T16:00:00.000Z', recurrence: 'monthly', occurrences: 3 };
  assert.deepEqual(occurrences(monthly).map(row => row.start.slice(0, 10)), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(nextOccurrence(weekly, Date.parse('2026-01-10T00:00:00Z')).index, 1);
  assert.equal(nextOccurrence(weekly, Date.parse('2026-02-01T00:00:00Z')), null);
});

test('Only attendees see the place and the stream; recordings of paid events need a ticket', () => {
  const at = Date.parse('2026-03-10T12:00:00Z');
  const state = { files: [] };
  const event = { id: 'e1', title: 'Live', start: '2026-03-10T12:10:00Z', end: '2026-03-10T13:00:00Z', recurrence: 'none', occurrences: 1, access: 'paid', price: 30,
    locationType: 'online', location: 'https://meet.google.com/abc-defg-hij', liveUrl: 'https://www.youtube.com/live/abcdefghijk', recordings: [{ id: 'r1', title: 'Replay', url: 'https://vimeo.com/123456789' }], capacity: 1, hideAttendees: true };
  const record = { attendees: { ana: { status: 'going', paid: true }, bia: { status: 'pending' } } };
  const outsider = eventView(state, event, record, { viewer: 'bia', member: true, at });
  assert.deepEqual([outsider.location, outsider.liveUrl, outsider.recordings.length, outsider.myStatus, outsider.full, outsider.attendees], ['', '', 0, 'pending', true, []]);
  const ana = eventView(state, event, record, { viewer: 'ana', member: true, at });
  assert.equal(ana.location, 'https://meet.google.com/abc-defg-hij');
  assert.equal(ana.liveEmbed, 'https://www.youtube-nocookie.com/embed/abcdefghijk', 'the stream opens 15 minutes before');
  assert.equal(ana.recordings[0].embed, 'https://player.vimeo.com/video/123456789');
  assert.equal(eventView(state, event, record, { viewer: 'ana', member: true, at: at - HOUR }).liveEmbed, '', 'not yet: one hour before');
  assert.equal(eventView(state, event, record, { viewer: 'ana', member: true, at: at - HOUR, live: { eventId: 'e1' } }).liveEmbed !== '', true, 'live now opens it at once');
  const free = eventView(state, { ...event, access: 'free' }, record, { viewer: 'bia', member: true, at });
  assert.equal(free.recordings.length, 1, 'free events show recordings to every member');
});

test('Reminders go out once, one day before, to who confirmed', async () => {
  const store = createSqliteStore(':memory:');
  const joined = [];
  const community = makeCommunity({ store, onEventJoin: async (workspace, row) => joined.push(row) });
  const s = blank();
  const group = save(s, 'communities', { name: 'Clube', visibility: 'public' });
  const start = Date.now() + 30 * HOUR;
  const eventId = save(s, 'communityEvents', { communityId: group, title: 'Aula', start: iso(start), end: iso(start + HOUR) });
  const member = { id: 'm1' }, portal = { members: [{ id: 'm1', name: 'Ana', email: 'ana@x.test' }] };
  await community.act('w1', s, portal, member, group, { action: 'join' });
  const view = await community.act('w1', s, portal, member, group, { action: 'rsvp', eventId });
  assert.equal(view.events[0].myStatus, 'going');
  assert.deepEqual(joined, [{ eventId, memberId: 'm1', paid: false }]);
  assert.deepEqual(await community.dueReminders('w1', s, start - 25 * HOUR), [], 'too early');
  const due = await community.dueReminders('w1', s, start - 23 * HOUR);
  assert.deepEqual(due.map(row => row.memberId), ['m1']);
  assert.deepEqual(await community.dueReminders('w1', s, start - 22 * HOUR), [], 'only once');
  const written = execute(s, { type: 'community-event-reminders', data: { items: [{ eventId, start: due[0].start, email: 'ana@x.test', name: 'Ana Souza', link: 'https://x/portal/w1' }] } });
  assert.equal(written, 1);
  const message = s.messages.at(-1);
  assert.match(message.subject, /Amanhã: Aula/);
  assert.match(message.body, /Oi, Ana! Lembrete: “Aula”/);
  await assert.rejects(community.act('w1', s, portal, member, group, { action: 'rsvp', eventId: 'nada' }), /Evento não encontrado/);
});

function fakeAbacate() {
  let seq = 0;
  const ok = data => Response.json({ data, error: null, success: true });
  return { async request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    if (init.headers?.Authorization !== `Bearer ${KEY}`) return Response.json({ data: null, error: 'Invalid key', success: false }, { status: 401 });
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: 'Loja', balance: 0 });
    if (u.pathname === '/v2/products/create') return ok({ id: `prod_${++seq}`, ...body });
    if (u.pathname === '/v2/checkouts/create') { const id = `bill_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    return Response.json({ data: null, error: 'Not found', success: false }, { status: 404 });
  } };
}

test('Portal: free RSVP, paid ticket through AbacatePay, going live and the workflow trigger', async t => {
  const gateway = fakeAbacate();
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false,
    openAISecret: 'abacate-test-seal-secret-32-chars!!', abacatePayRequest: gateway.request });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  const portal = '/api/client-portal/demo';
  const signIn = async email => {
    const { body } = await call(`${portal}/admin`, { action: 'invite', email });
    return (await call(`${portal}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0];
  };
  const saveRemote = async (key, data) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const group = await saveRemote('communities', { name: 'Clube', visibility: 'public' });
  const start = Date.now() + 10 * 60000;
  const free = await saveRemote('communityEvents', { communityId: group, title: 'Café online', start: iso(start), end: iso(start + HOUR), location: 'https://meet.google.com/aaa-bbbb-ccc' });
  const paid = await saveRemote('communityEvents', { communityId: group, title: 'Workshop', start: iso(start + DAY), end: iso(start + DAY + HOUR), access: 'paid', price: 97,
    liveUrl: 'https://youtu.be/abcdefghijk', recordings: [{ title: 'Replay', url: 'https://youtu.be/zyxwvutsrqp' }] });
  await saveRemote('communityEvents', { communityId: group, title: 'Rascunho', start: iso(start), end: iso(start + HOUR), status: 'draft' });
  const flow = await saveRemote('workflows', { name: 'Ingresso pago', active: true, triggers: [{ type: 'community_event_registered', config: { paid: 'yes' } }], steps: [{ type: 'internal_notification', config: { body: 'Vendeu {{trigger.title}}' } }] });

  const ana = await signIn('ana@example.test'), bia = await signIn('bia@example.test');
  const act = (cookie, body) => call(`${portal}/community/${group}`, body, { Cookie: cookie });
  await act(ana, { action: 'join' }); await act(bia, { action: 'join' });
  const before = (await call(`${portal}/community/${group}`, undefined, { Cookie: ana })).body.community;
  assert.deepEqual(before.events.map(row => row.title), ['Café online', 'Workshop'], 'drafts stay hidden; soonest first');
  assert.equal(before.events[0].location, '', 'the place is hidden before confirming');

  const rsvp = (await act(ana, { action: 'rsvp', eventId: free })).body.community.events[0];
  assert.deepEqual([rsvp.myStatus, rsvp.location, rsvp.liveUrl], ['going', 'https://meet.google.com/aaa-bbbb-ccc', 'https://meet.google.com/aaa-bbbb-ccc'], 'within 15 minutes the link opens');
  assert.ok((await state()).contacts.some(row => row.email === 'ana@example.test'), 'the attendee becomes a contact');

  assert.equal((await act(ana, { action: 'rsvp', eventId: paid })).status, 402);
  assert.equal((await act(ana, { action: 'ticket', eventId: paid })).status, 409, 'no AbacatePay yet');
  await call('/api/action?workspace=demo', saveFiscal);
  const connected = (await call('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY })).body;
  const ticket = await act(ana, { action: 'ticket', eventId: paid });
  assert.equal(ticket.status, 200, JSON.stringify(ticket.body));
  assert.match(ticket.body.payUrl, /^https:\/\/app\.abacatepay\.com\/pay\/bill_/);
  assert.equal(ticket.body.community.events.find(row => row.id === paid).myStatus, 'pending');
  const invoice = (await state()).invoices.find(row => row.eventTicket?.eventId === paid);
  assert.deepEqual([invoice.title, invoice.value, invoice.status], ['Ingresso: Workshop', 97, 'Open']);

  const raw = JSON.stringify({ id: 'log_ticket_1', event: 'checkout.completed', data: { checkout: { id: invoice.payment.checkoutId, frequency: 'ONE_TIME', status: 'PAID', paidAmount: Math.round(invoice.value * 100) }, payerInformation: { method: 'PIX' } } });
  assert.equal((await fetch(`${connected.webhookUrl}?webhookSecret=${connected.webhookSecret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signBody(raw) }, body: raw })).status, 200);
  const after = (await call(`${portal}/community/${group}`, undefined, { Cookie: ana })).body.community.events.find(row => row.id === paid);
  assert.deepEqual([after.myStatus, after.recordings.length], ['going', 1]);
  assert.equal((await call(`${portal}/community/${group}`, undefined, { Cookie: bia })).body.community.events.find(row => row.id === paid).recordings.length, 0, 'no ticket, no recording');
  const s = await state();
  assert.ok(s.invoices.find(row => row.id === invoice.id).ticketGrantedAt);
  assert.equal(s.runs.filter(row => row.workflowId === flow).length, 1, 'only the paid ticket fires the "paid" workflow');

  const admin = (body) => call(`${portal}/community-admin/${group}`, body);
  const live = (await admin({ action: 'live-start', eventId: paid })).body;
  assert.equal(live.live.title, 'Workshop');
  assert.deepEqual(live.events.find(row => row.id === paid).people.map(row => [row.status, row.paid]), [['going', true]]);
  const watching = (await call(`${portal}/community/${group}`, undefined, { Cookie: ana })).body.community;
  assert.equal(watching.live.eventId, paid);
  assert.equal(watching.events.find(row => row.id === paid).liveEmbed, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  assert.equal((await call(`${portal}/community/${group}`, undefined, { Cookie: bia })).body.community.events.find(row => row.id === paid).liveEmbed, '', 'live, but only for ticket holders');
  assert.equal((await admin({ action: 'live-end' })).body.live, null);
  assert.equal((await admin({ action: 'live-start', eventId: free })).status, 200, 'an online place also works as the stream');
});
