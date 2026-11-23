import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPage } from '../ui/portal-community.js';
import { defaultLayout, defaultTabs } from '../ui/community-data.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const ago = ms => new Date(NOW - ms).toISOString();
const author = name => ({ name, staff: false, level: 2, badges: [] });
const post = (id, extra = {}) => ({ id, channelId: 'c1', channel: 'Avisos', title: `Post ${id}`, titleAuto: false, body: 'Texto', link: '', image: '', pinned: false,
  created: ago(3600e3), author: author('Ana'), mine: false, canDelete: false, commentsEnabled: true, held: '', reports: 0, reported: false,
  likes: 0, liked: false, poll: null, comments: [], ...extra });

export function makeView({ widgets, tabs, membership = { status: 'active', role: 'member', onboardingDone: [] }, posts, academy = [], layout } = {}) {
  return {
    group: { id: 'g1', name: 'Clube', description: 'Gente boa', cover: '', visibility: 'public', welcome: '', memberPosts: true,
      channels: [{ id: 'c1', name: 'Avisos' }, { id: 'c2', name: 'Dúvidas' }], access: 'free', plans: [], trialDays: 0, questions: [], onboarding: [],
      theme: null, layout: layout || { ...defaultLayout(), ...(widgets ? { widgets } : {}) }, tabs: tabs || defaultTabs(), memberCount: 3, postCount: 3 },
    membership, academy,
    posts: posts || [post('p1'), post('p2'), post('p3')],
    events: [{ id: 'e1', title: 'Live de terça', start: new Date(NOW + 86400e3).toISOString(), end: new Date(NOW + 90000e3).toISOString(), past: false, recordings: [],
      attendees: [], going: 0, capacity: 0, color: '#155eef', priceLabel: 'Gratuito', access: 'free', description: '', cover: '', recordingCount: 0 }],
    leaderboard: { period: '30', levels: [{ level: 1, name: 'Nível 1', min: 0, share: 100 }], top: [{ name: 'Ana', points: 9, level: 2 }, { name: 'Bia', points: 3, level: 1 }], me: null },
    members: [{ name: 'Ana', role: 'member', joinedAt: ago(5 * 86400e3), level: 2, badges: [] }, { name: 'Bia', role: 'member', joinedAt: ago(86400e3), level: 1, badges: [] }],
    live: null
  };
}
export { post, NOW, ago };

const order = html => [...html.matchAll(/data-widget="([a-z]+)"/g)].map(match => match[1]);
const ui = { tab: 'discussion', channel: '', period: '30' };

test('aside shows only visible widgets in the chosen order', () => {
  const widgets = [{ key: 'ranking', visible: true }, { key: 'about', visible: false }, { key: 'events', visible: true }, { key: 'members', visible: true }];
  assert.deepEqual(order(communityPage(makeView({ widgets }), ui)), ['ranking', 'events', 'members']);
});

test('aside disappears with no widgets and hidden tabs drop their widget', () => {
  const none = defaultLayout().widgets.map(row => ({ ...row, visible: false }));
  assert.equal(communityPage(makeView({ widgets: none }), ui).includes('cp-cm-aside'), false);
  const tabs = defaultTabs().map(tab => tab.key === 'ranking' ? { ...tab, visible: false } : tab);
  assert.deepEqual(order(communityPage(makeView({ tabs }), ui)), ['about', 'events', 'members']);
});

test('visitor sees the hero and the join button', () => {
  const html = communityPage(makeView({ membership: null }), ui);
  assert.match(html, /cp-cm-hero/);
  assert.match(html, /data-cm-public="join"/);
  assert.doesNotMatch(communityPage(makeView(), ui), /cp-cm-hero/);
});

test('academy tab hidden when not visible', () => {
  const hidden = defaultTabs().map(tab => tab.key === 'academy' ? { ...tab, visible: false } : tab);
  assert.doesNotMatch(communityPage(makeView({ tabs: hidden }), ui), /data-value="academy"/);
  assert.match(communityPage(makeView(), ui), /data-cm-public="tab" data-value="academy"/);
});
