// Criador do aplicativo móvel (Visão da agência): o rascunho, o que vai para o servidor ao salvar e o estado de cada parte.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mobileDefaults, saveMobileLook } from '../agency-mobile.mjs';
import { creatorDraft, draftConfig, draftTheme, lookChanges, sectionStatus, storeChanges, storeChecklist } from '../ui/agency-mobile.js';
import { themeFromColor } from '../ui/community-data.js';

const ICON = 'data:image/png;base64,iVBORw0KGgo=';
const saved = (extra = {}) => ({ ...mobileDefaults(), appName: 'Agência Demo', loginTitle: 'Bem-vindo', ...extra });

test('creator: an untouched draft changes nothing', () => {
  const app = saved(), draft = creatorDraft(app);
  assert.equal(lookChanges(creatorDraft(app), draft), null);
  assert.equal(storeChanges(creatorDraft(app), draft), null);
  draft.custom.push({ label: ' ', url: '' });
  assert.equal(lookChanges(creatorDraft(app), draft), null, 'an empty link row is not a change');
});

test('creator: saving sends only what changed and the server takes it', () => {
  const app = saved(), base = creatorDraft(app), draft = creatorDraft(app);
  draft.home = false;
  draft.hidden = ['payments'];
  draft.custom = [{ label: ' Ajuda ', url: ' https://example.com/ajuda ' }];
  draft.cover = 'data:image/jpeg;base64,/9j/2Q==';
  const look = lookChanges(base, draft);
  assert.deepEqual(Object.keys(look).sort(), ['appName', 'cover', 'custom', 'hidden', 'home']);
  assert.deepEqual(look.custom, [{ label: 'Ajuda', url: 'https://example.com/ajuda' }]);
  const after = saveMobileLook({ mobileApp: app }, look);
  assert.equal(after.home, false);
  assert.deepEqual(after.hidden, ['payments']);
  assert.equal(lookChanges({ ...draft, custom: look.custom }, creatorDraft(after)), null, 'what was saved is what the draft had');

  const without = creatorDraft(after);
  without.cover = '';
  assert.equal(lookChanges(creatorDraft(after), without).cover, 'remove');
});

test('creator: an app saved before the themes keeps its color until a theme is chosen', () => {
  const app = saved({ theme: null, primary: '#0a7d4f' }), draft = creatorDraft(app);
  assert.deepEqual(draftTheme(draft), themeFromColor('#0a7d4f'));
  draft.loginTitle = 'Olá';
  assert.equal('theme' in lookChanges(creatorDraft(app), draft), false);
});

test('creator: modules the app does not know are dropped and new ones go to the end', () => {
  const draft = creatorDraft(saved({ order: ['payments', 'old-module', 'payments'], hidden: ['old-module', 'contacts'] }));
  assert.equal(draft.order[0], 'payments');
  assert.equal(draft.order.length, 7);
  assert.deepEqual(draft.hidden, ['contacts']);
  assert.equal(draftConfig(draft).modules.some(row => row.key === 'contacts'), false);
});

test('creator: store data and the icon travel together', () => {
  const app = saved({ icon: ICON }), draft = creatorDraft(app);
  draft.store.developer = 'Agência Demo Ltda';
  assert.equal(storeChanges(creatorDraft(app), draft).developer, 'Agência Demo Ltda');
  draft.icon = '';
  assert.equal(storeChanges(creatorDraft(app), draft).icon, 'remove');
});

test('creator: each part says what is missing', () => {
  const app = saved(), draft = creatorDraft(app);
  assert.deepEqual(sectionStatus(app, draft).identity, ['Falta o ícone', false]);
  draft.icon = ICON;
  draft.hidden = ['payments'];
  const status = sectionStatus({ ...app, status: 'published' }, draft);
  assert.deepEqual(status.identity, ['Pronto', true]);
  assert.match(status.modules[0], /^6 \S+ 7$/);
  assert.deepEqual(status.links, ['0', null]);
  assert.deepEqual(status.publish, ['No ar', true]);
  draft.hidden = [...draft.order];
  draft.home = false;
  assert.equal(sectionStatus(app, draft).modules[1], false, 'an app with nothing to open is not ready');

  const list = storeChecklist(app, draft);
  assert.equal(list.find(row => row.field === 'icon').done, true);
  assert.deepEqual(list.filter(row => !row.done).map(row => row.section), Array(7).fill('publish'));
});
