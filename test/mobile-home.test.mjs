// App móvel da agência: a tela Início (dados e permissões), a barra de abas, as peças desenhadas e a caixa de
// conversas, que no celular abre na lista.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appStyle, barSplit, entryView, headerView, homeView, sampleHome, sheetView, tabsView } from '../ui/mobile-app-view.js';
import { homeData, shortAgo } from '../ui/mobile-home-data.js';
import { accentText, contrast, themeFromColor, themeMode, themePresets } from '../ui/community-data.js';

const now = new Date('2026-11-25T14:00:00.000Z'); // 11:00 in São Paulo
const state = () => ({
  profile: { name: 'Clínica', timezone: 'America/Sao_Paulo', currency: 'BRL' },
  contacts: Array.from({ length: 8 }, (_, k) => ({ id: `c${k}`, name: `Contato ${k}` })),
  messages: [], appointments: [], tasks: [], opportunities: []
});
const message = (contactId, created, extra = {}) => ({ id: `${contactId}${created}`, contactId, created, direction: 'Inbound', read: false, body: 'Oi', ...extra });

test('Início: greeting follows the sub-account clock and uses the first name', () => {
  const at = hour => homeData(state(), { now: new Date(`2026-11-25T${hour}:00:00.000Z`) }).greeting;
  assert.deepEqual([at('11'), at('16'), at('22'), at('05')], ['morning', 'afternoon', 'night', 'night'], '08h, 13h, 19h and 02h in São Paulo');
  assert.equal(homeData(state(), { now, name: 'Marina Souza' }).name, 'Marina');
  assert.equal(homeData(state(), { now }).name, '');
});

test('Início: only unread inbound messages wait for an answer, newest first, up to five', () => {
  const s = state();
  s.messages = [
    message('c0', '2026-11-25T13:51:00.000Z', { body: 'Primeira' }), message('c0', '2026-11-25T13:55:00.000Z', { body: 'Segunda' }),
    message('c1', '2026-11-25T13:59:00.000Z', { read: true }), message('c2', '2026-11-25T13:58:00.000Z', { direction: 'Outbound' }),
    message('gone', '2026-11-25T13:58:00.000Z'), message('c3', '2026-11-24T13:00:00.000Z', { body: '' }),
    ...['c4', 'c5', 'c6', 'c7'].map((id, k) => message(id, `2026-11-25T12:0${k}:00.000Z`))
  ];
  const { replies } = homeData(s, { now });
  assert.deepEqual(replies.map(row => row.id), ['c0', 'c7', 'c6', 'c5', 'c4']);
  assert.deepEqual([replies[0].text, replies[0].ago], ['Segunda', '5 min']);
  assert.deepEqual([shortAgo('2026-11-25T13:59:50.000Z', now), shortAgo('2026-11-25T11:30:00.000Z', now), shortAgo('2026-11-22T11:30:00.000Z', now)], ['agora', '2 h', '3 d']);
  s.messages = [message('c3', '2026-11-24T13:00:00.000Z', { body: '' })];
  assert.equal(homeData(s, { now }).replies[0].text, 'Anexo');
});

test('Início: "today" is the sub-account day, even near midnight, without canceled appointments', () => {
  const s = state();
  s.appointments = [
    { id: 'late', title: 'Retorno', contactId: 'c1', start: '2026-11-26T02:30:00.000Z', status: 'Confirmed' }, // 23:30 on the 25th
    { id: 'early', title: 'Avaliação', contactId: 'c0', start: '2026-11-25T12:00:00.000Z', status: 'Confirmed' },
    { id: 'yesterday', title: 'Ontem', start: '2026-11-25T02:30:00.000Z', status: 'Confirmed' }, // 23:30 on the 24th
    { id: 'canceled', title: 'Cancelado', start: '2026-11-25T15:00:00.000Z', status: 'Canceled' }
  ];
  const { agenda } = homeData(s, { now });
  assert.deepEqual(agenda.map(row => [row.id, row.time, row.day, row.contact]), [['early', '09:00', '25', 'Contato 0'], ['late', '23:30', '25', 'Contato 1']]);
  assert.equal(homeData({ ...s, profile: { timezone: 'Asia/Tokyo' } }, { now }).agenda.map(row => row.id).join(), 'yesterday,early', 'another timezone, another day');
});

test('Início: open tasks due today or late, and the open pipeline', () => {
  const s = state();
  s.tasks = [{ id: 'a', title: 'Hoje', due: '2026-11-25T00:00:00.000Z', contactId: 'c0' }, { id: 'b', title: 'Atrasada', due: '2026-11-20T00:00:00.000Z' },
    { id: 'c', title: 'Amanhã', due: '2026-11-26T00:00:00.000Z' }, { id: 'd', title: 'Feita', due: '2026-11-25T00:00:00.000Z', done: true }, { id: 'e', title: 'Sem prazo', due: '' }];
  s.opportunities = [{ status: 'Open', value: 1500 }, { status: 'Open', value: 500.5 }, { status: 'Won', value: 9000 }];
  const data = homeData(s, { now });
  assert.deepEqual(data.tasks.map(row => [row.id, row.late]), [['b', true], ['a', false]]);
  assert.equal(data.deals.count, 2);
  assert.match(data.deals.value, /R\$\s2\.000,50/);
  assert.equal(data.empty, false);
});

test('Início: each block follows the permission, and nothing pending is one empty state', () => {
  const s = state();
  s.tasks = [{ id: 'a', title: 'Hoje', due: '2026-11-25T00:00:00.000Z' }];
  s.opportunities = [{ status: 'Open', value: 10 }];
  const only = homeData(s, { now, allowed: view => view === 'conversations' });
  assert.deepEqual([only.blocks, only.tasks, only.deals.count, only.empty], [['replies'], [], 0, true]);
  const html = homeView(only);
  assert.match(html, /Tudo em dia/);
  assert.match(html, /new-thread/);
  assert.doesNotMatch(html, /data-edit="contacts"|data-edit="appointments"|Oportunidades abertas/);
  assert.match(homeView(homeData(s, { now })), /Oportunidades abertas/);
});

test('Tab bar: Início and three modules, or four without it; forbidden modules never show', () => {
  const modules = ['conversations', 'contacts', 'calendars', 'opportunities', 'payments'].map(key => ({ key, route: key, label: key, icon: 'grid' }));
  const keys = out => [out.tabs.map(m => m.key).join(), out.more.map(m => m.key).join()];
  assert.deepEqual(keys(barSplit({ modules, home: true })), ['home,conversations,contacts,calendars', 'opportunities,payments']);
  assert.deepEqual(keys(barSplit({ modules, home: false })), ['conversations,contacts,calendars,opportunities', 'payments']);
  assert.deepEqual(keys(barSplit({ modules }, route => route === 'conversations')), ['home,conversations', ''], 'an app saved before Início has it on');
  const bar = tabsView({ name: 'App', tabs: barSplit({ modules }).tabs, current: 'contacts' });
  assert.match(bar, /href="#contacts" aria-current="page"/);
  assert.match(tabsView({ name: 'App', tabs: [], current: 'payments' }), /data-ma-more[^>]*data-on/, 'a module outside the bar marks "Mais"');
});

test('The pieces escape what people type', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = [entryView({ name: evil, phrase: evil }), headerView({ name: evil, account: evil, unread: 2 }), sheetView({ account: evil, links: [{ label: evil, url: 'https://a.test/"' }] }),
    homeView({ ...sampleHome(), name: evil, replies: [{ id: '"', name: evil, text: evil, ago: '1 h' }], agenda: [{ id: '1', title: evil, contact: evil, weekday: 'qua', day: '25', time: '10:00' }], tasks: [{ id: '1', title: evil, contact: evil }] })].join('');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('Theme: any color stays readable in both modes', () => {
  for (const color of ['#ffe600', '#ffffff', '#000000', '#1570ef', '#ff4f9a']) for (const mode of ['', 'light', 'dark']) {
    const shown = themeMode(themeFromColor(color), mode), t = shown.tokens;
    assert.ok(contrast(t.primary, t.onPrimary) >= 4.5, `${color} ${mode}: text on the button`);
    assert.ok(contrast(accentText(shown), t.surface) >= 4.5, `${color} ${mode}: links`);
    assert.ok(contrast(t.font, t.background) >= 4.5, `${color} ${mode}: text`);
  }
  for (const preset of themePresets) for (const mode of ['', 'light', 'dark']) {
    const shown = themeMode({ preset: preset.id, tokens: preset.tokens }, mode);
    assert.ok(contrast(accentText(shown), shown.tokens.surface) >= 4.5, `${preset.id} ${mode}: links`);
  }
  assert.match(appStyle(themeFromColor('#ffe600'), 'dark'), /color-scheme:dark/);
});

test('Conversations open on the list on a phone, with the folders on a wide screen', async () => {
  const { inboxState } = await import('../ui/inbox.js');
  const before = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(inboxState({}).nav, false);
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(inboxState({}).nav, true);
  } finally { globalThis.matchMedia = before; }
});
