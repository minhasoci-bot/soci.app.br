import test from 'node:test';
import assert from 'node:assert/strict';
import { eventGroups, galleryGroups, installTimeline, leavesNow, movable, shiftDay, timelineHtml, timelineRange } from '../ui/event-timeline.js';

const task = (id, data = {}) => ({ id, kind: 'task', title: id, phase: 'captura', status: 'pendente', date: '2026-12-01', ...data });
const message = (id, data = {}) => ({ id, kind: 'message', title: id, phase: 'vendas', status: 'pronto', channel: 'grupos', date: '2026-12-03', time: '10:00', ...data });
const event = (items, data = {}) => ({ id: 'e1', title: 'Aula <1>', eventDate: '2026-12-10', status: 'planejado', plan: { brief: {}, items }, deliveries: {}, ...data });
const draw = (groups, extra = {}) => timelineHtml({ groups, zoom: 'day', today: '2026-12-02', users: [], ...extra });

test('Days move without slipping on daylight saving, months and leap years', () => {
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDay('2018-11-03', 1), '2018-11-04');
  assert.equal(shiftDay('2018-11-04', -1), '2018-11-03');
});

test('The range leaves room around the items and always fits the screen', () => {
  assert.deepEqual(timelineRange(['2026-12-01', '2027-02-01'], '2026-12-02'), { start: '2026-11-24', days: 84, hasToday: true });
  assert.equal(timelineRange([], '2026-12-02').days, 42);
  assert.equal(timelineRange(['2027-12-01'], '2026-12-02').hasToday, false, 'hoje longe demais não estica a linha');
  const far = timelineRange(['2020-01-01', '2026-12-01', '2026-12-05', '2026-12-09'], '2026-12-02');
  assert.equal(far.days, 550);
  assert.ok(far.start < '2026-12-01' && shiftDay(far.start, far.days) > '2026-12-09');
});

test('An event groups tasks and messages by phase, in order', () => {
  const groups = eventGroups(event([message('m1'), task('t2', { date: '2026-12-05' }), task('t1'), { id: 'l', kind: 'link', phase: 'captura', title: 'x' }, task('sem', { date: '' })]));
  assert.deepEqual(groups.map(group => [group.label, group.rows.map(row => row.item.id)]), [['Captação', ['t1', 't2', 'sem']], ['Vendas', ['m1']]]);
});

test('The gallery groups by event and leaves archived ones out', () => {
  const groups = galleryGroups([event([task('b')], { id: 'b', eventDate: '2026-12-20' }), event([task('a')], { id: 'a' }), event([task('c')], { id: 'c', status: 'arquivado' })]);
  assert.deepEqual(groups.map(group => [group.eventId, group.mark]), [['a', '2026-12-10'], ['b', '2026-12-20']]);
});

test('Sent messages stay put', () => {
  const sent = event([message('m1')], { deliveries: { m1: { state: 'done', sent: 3 } } });
  assert.match(movable(sent, sent.plan.items[0]), /já foi enviada/);
  assert.equal(movable(event([message('m1')]), message('m1')), '');
  assert.match(movable(event([]), message('m1', { status: 'enviado' })), /já foi enviada/);
});

test('A scheduled message dragged to the past would leave now', () => {
  const active = event([message('m1')], { deliveries: { m1: { state: 'scheduled' } } }), item = active.plan.items[0];
  const now = Date.parse('2026-12-02T13:30:00Z'); // 10:30 em São Paulo
  const leaves = date => leavesNow(active, item, date, 'America/Sao_Paulo', now);
  assert.deepEqual([leaves('2026-12-01'), leaves('2026-12-02'), leaves('2026-12-03')], [true, true, false]);
  assert.equal(leavesNow(active, { ...item, time: '11:00' }, '2026-12-02', 'America/Sao_Paulo', now), false);
  assert.equal(leavesNow(event([item]), item, '2026-12-01', 'America/Sao_Paulo', now), false, 'sem envio agendado, nada sai');
});

test('The drawing is escaped, labelled and places each item on its day', () => {
  const html = draw(eventGroups(event([task('t<1>', { date: '2026-12-01' }), message('m1'), task('sem', { date: '' })])));
  assert.match(html, /--ep-day:36px/);
  assert.match(html, />Novembro de 2026</);
  assert.match(html, /t&lt;1&gt;/);
  assert.doesNotMatch(html, /<1>/);
  assert.match(html, /data-ep-tl-bar="t&lt;1&gt;"[^>]*style="--at:7"/);
  assert.match(html, /ep-tl-bar is-message[^>]*data-ep-tl-bar="m1"/);
  assert.match(html, /aria-label="t&lt;1&gt;, 1 de dez\. de 2026\. Setas movem um dia, Enter abre\."/);
  assert.match(html, /ep-tl-today" style="--at:8"/);
  assert.match(html, /sem[\s\S]*Sem data/);
  assert.match(draw(eventGroups(event([task('a')])), { zoom: 'week' }), /--ep-day:14px/);
});

test('Items outside the range are told apart instead of stretching the drawing', () => {
  const html = draw(eventGroups(event([task('velha', { date: '2019-01-01' }), task('a'), task('b'), task('c')])));
  assert.match(html, /velha[\s\S]*1 de jan\. de 2019/);
  assert.equal((html.match(/data-ep-tl-bar=/g) || []).length, 3);
});

test('A locked item has no drag handle and says why', () => {
  const sent = event([message('m1', { status: 'enviado' })]);
  assert.match(draw(eventGroups(sent)), /ep-tl-bar is-message is-done is-locked[^>]*title="A mensagem já foi enviada\."/);
});

/* ── Arrastar e teclado, com um documento mínimo ── */
function mount({ items = [task('t1')], deliveries = {}, saveFails = false, answer = true, now = Date.parse('2026-11-25T12:00:00Z') } = {}) {
  const handlers = {}, log = [], plan = event(items, { deliveries });
  const timers = [];
  const listen = (type, fn) => { handlers[type] = [...(handlers[type] || []), fn]; };
  const bar = { dataset: { epTlBar: items[0].id, epEvent: 'e1' }, classList: { contains: () => false, add() {}, remove() {} }, style: { setProperty: (key, value) => log.push(`${key}=${value}`), removeProperty: key => log.push(`-${key}`) }, setPointerCapture() {}, closest(selector) { return selector.includes('data-ep-tl-bar') ? bar : selector.includes('data-ep-timeline') ? { dataset: { day: '36' } } : null; }, setAttribute() {} };
  installTimeline({
    listen, now: () => now, zone: () => 'America/Sao_Paulo', later: fn => { timers.push(fn); return timers.length - 1; }, drop: id => { timers[id] = null; },
    ask: async title => { log.push(`pergunta: ${title}`); return answer; },
    find: () => plan, itemOf: (_event, id) => plan.plan.items.find(row => row.id === id),
    savePlan: async (_id, change) => { if (saveFails) throw Error('Conflito'); change(plan.plan); log.push(`salvo: ${plan.plan.items[0].date}`); },
    openItem: (_event, kind) => log.push(`abre: ${kind}`), repaint: () => log.push('redesenha'), flash: (text, error) => log.push(`${error ? 'ERRO ' : ''}${text}`)
  });
  const fire = async (type, data) => { for (const fn of handlers[type] || []) await fn({ target: bar, button: 0, pointerId: 1, preventDefault() {}, ...data }); };
  return { fire, log, plan, bar, flush: async () => { for (const fn of timers.splice(0)) await fn?.(); } };
}
const saved = app => app.log.filter(line => line.startsWith('salvo'));

test('Dragging saves the new day once and does not open the item', async () => {
  const app = mount();
  await app.fire('pointerdown', { clientX: 100 });
  await app.fire('pointermove', { clientX: 100 + 36 * 3 + 5 });
  await app.fire('pointerup', { clientX: 100 + 36 * 3 + 5 });
  await app.fire('click', {});
  assert.deepEqual(saved(app), ['salvo: 2026-12-04']);
  assert.ok(!app.log.some(line => line.startsWith('abre')));
});

test('A click without dragging opens the item, and a tiny move does not save', async () => {
  const app = mount();
  await app.fire('pointerdown', { clientX: 100 });
  await app.fire('pointermove', { clientX: 104 });
  await app.fire('pointerup', { clientX: 104 });
  await app.fire('click', {});
  assert.deepEqual(saved(app), []);
  assert.ok(app.log.includes('abre: task'));
});

test('Escape, a cancelled pointer and a move back to the same day save nothing', async () => {
  for (const end of [app => app.fire('keydown', { key: 'Escape' }), app => app.fire('pointercancel', {}), app => app.fire('pointermove', { clientX: 100 })]) {
    const app = mount();
    await app.fire('pointerdown', { clientX: 100 });
    await app.fire('pointermove', { clientX: 300 });
    await end(app);
    await app.fire('pointerup', { clientX: 100 });
    assert.deepEqual(saved(app), []);
  }
});

test('A failed save puts the bar back and warns', async () => {
  const app = mount({ saveFails: true });
  await app.fire('pointerdown', { clientX: 0 }); await app.fire('pointermove', { clientX: 72 }); await app.fire('pointerup', { clientX: 72 });
  assert.equal(app.plan.plan.items[0].date, '2026-12-01');
  assert.ok(app.log.includes('redesenha'));
  assert.ok(app.log.includes('ERRO Conflito'));
});

test('Moving a scheduled message to the past asks first', async () => {
  const past = { items: [message('m1')], deliveries: { m1: { state: 'scheduled' } }, now: Date.parse('2026-12-02T13:30:00Z') };
  const drag = async app => { await app.fire('pointerdown', { clientX: 200 }); await app.fire('pointermove', { clientX: 200 - 36 * 2 }); await app.fire('pointerup', { clientX: 200 - 36 * 2 }); };
  const no = mount({ ...past, answer: false }); await drag(no);
  assert.ok(no.log.some(line => /pergunta: Enviar agora\?/.test(line)));
  assert.deepEqual(saved(no), []);
  assert.ok(no.log.includes('redesenha'));
  const yes = mount({ ...past, answer: true }); await drag(yes);
  assert.deepEqual(saved(yes), ['salvo: 2026-12-01']);
});

test('Arrow keys add up and save once; Enter opens', async () => {
  const app = mount();
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) await app.fire('keydown', { key });
  assert.deepEqual(saved(app), []);
  await app.flush();
  assert.deepEqual(saved(app), ['salvo: 2026-12-03']);
  await app.fire('keydown', { key: 'Enter' });
  assert.ok(app.log.includes('abre: task'));
});

test('A sent message cannot be dragged nor moved by key', async () => {
  const app = mount({ items: [message('m1', { status: 'enviado' })] });
  await app.fire('pointerdown', { clientX: 0 }); await app.fire('pointermove', { clientX: 200 }); await app.fire('pointerup', { clientX: 200 });
  await app.fire('keydown', { key: 'ArrowRight' }); await app.flush();
  assert.deepEqual(saved(app), []);
  assert.ok(app.log.some(line => /já foi enviada/.test(line)));
});
