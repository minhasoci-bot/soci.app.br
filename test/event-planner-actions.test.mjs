import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank, execute } from '../model.mjs';
import { checkItem, installEventPlanner, itemDialogBody, itemFromValues } from '../ui/event-planner.js';
import { applyMark, replaceText } from '../ui/event-copy-editor.js';
import { channels, launchEventPlan } from '../ui/event-planner-data.js';

// A suíte roda num processo só: o documento falso não pode sobrar para os outros testes.
const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
test.afterEach(() => { if (realDocument) Object.defineProperty(globalThis, 'document', realDocument); else delete globalThis.document; });

// Liga os handlers reais da tela a um documento mínimo e ao modelo real, com a latência de uma rede de verdade.
function mount(scrollTop = 0) {
  // #screen tem scroll-behavior: smooth: atribuir scrollTop anima a partir do topo, então só vale a rolagem instantânea.
  const screen = {};
  Object.defineProperty(screen, 'scrollTop', { get: () => scrollTop, set: () => {} });
  screen.scrollTo = ({ top, behavior }) => { if (behavior === 'instant') scrollTop = top; };
  const s = blank(), handlers = {}, messages = [];
  execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Aula', eventDate: '2026-12-10', plan: launchEventPlan('2026-12-10') } });
  const c = { s: structuredClone(s), agency: { users: [] }, workspace: 'w' };
  const opened = [];
  globalThis.document = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    querySelector: selector => selector === '#screen' ? screen : null,
    querySelectorAll: () => []
  };
  installEventPlanner({
    c, close() {}, dialog: (_title, body) => opened.push(body),
    flash: (message, error) => messages.push((error ? 'ERRO ' : 'ok ') + message),
    render: () => { scrollTop = 0; },
    mutate: async command => {
      await new Promise(done => setTimeout(done, 30));
      const id = execute(s, command);
      c.s = structuredClone(s);
      return id;
    }
  });
  const event = () => s.eventPlans[0];
  const status = (item, value) => handlers.change({ target: { value, dataset: { epEvent: event().id, epItemStatus: item.id }, matches: selector => selector === '[data-ep-item-status]' } });
  const click = dataset => handlers.click({ target: { closest: () => ({ dataset }) } });
  return { event, status, click, messages, opened, screen };
}

test('Quick status changes in a row are all saved', async () => {
  const app = mount(), [first, second, third] = app.event().plan.items;
  await Promise.all([app.status(first, 'feito'), app.status(second, 'feito'), app.status(third, 'andamento')]);
  assert.deepEqual(app.event().plan.items.slice(0, 3).map(row => row.status), ['feito', 'feito', 'andamento']);
  assert.deepEqual(app.messages, ['ok Status atualizado.', 'ok Status atualizado.', 'ok Status atualizado.']);
});

test('A dialog opened during a save carries the saved revision', async () => {
  const app = mount(), item = app.event().plan.items[0];
  const saving = app.status(item, 'feito');
  await app.click({ epItemEdit: item.id, epEvent: app.event().id });
  await saving;
  assert.match(app.opened[0], /data-revision="2"/);
  assert.match(app.opened[0], /<option value="feito" selected>/);
});

test('Saving an item keeps the scroll position', async () => {
  const app = mount(840);
  await app.status(app.event().plan.items[0], 'feito');
  assert.equal(app.screen.scrollTop, 840);
});

test('Marks stay next to the words the way a double click selects them', () => {
  assert.deepEqual(applyMark('uma palavra aqui', 4, 12, 'bold'), { text: 'uma *palavra* aqui', start: 5, end: 12 });
  assert.equal(applyMark('olá *mundo*', 4, 11, 'bold').text, 'olá mundo');
  assert.equal(applyMark('a\n\nb ', 0, 5, 'bold').text, '*a*\n\n*b* ');
  assert.equal(applyMark('*a*\n*b*', 0, 7, 'bold').text, 'a\nb');
  assert.equal(applyMark('- item', 0, 6, 'italic').text, '- _item_');
  assert.equal(applyMark('  ', 0, 2, 'bold').text, '  ');
  assert.equal(applyMark('', 0, 0, 'bold').text, '**');
});

test('Toolbar edits go through the browser so Ctrl+Z works, with a fallback', () => {
  const calls = [];
  const input = { value: 'antes', focus() {}, setSelectionRange: (...range) => calls.push(range), dispatchEvent: () => calls.push('input') };
  globalThis.document = { execCommand: (...args) => { calls.push(args); input.value = args[2]; return true; } };
  replaceText(input, 'depois', 2, 4);
  assert.deepEqual(calls, [[0, 5], ['insertText', false, 'depois'], [2, 4]]);
  globalThis.document = { execCommand: () => false };
  calls.length = 0;
  replaceText(input, 'fim', 3, 3);
  assert.equal(input.value, 'fim');
  assert.ok(calls.includes('input'), 'sem execCommand a prévia também precisa atualizar');
});

test('The Instagram channel is not called private while Orquestrar drafts feed posts from it', () => {
  assert.equal(channels.find(([id]) => id === 'instagram')[1], 'Instagram');
});

test('Owner is free text where there are no users to choose from', () => {
  const event = { id: 'e', plan: { brief: {}, items: [] } }, item = { kind: 'task', title: 'T', owner: 'Dani', ownerId: '' };
  const html = itemDialogBody({ agency: {} }, event, 'task', item);
  assert.match(html, /<input name="ownerText"[^>]*value="Dani"/);
  assert.doesNotMatch(html, /<select name="owner"/);
  const saved = itemFromValues('task', { title: 'T', ownerText: 'Lia' }, { ...item, ownerId: 'u9' }, []);
  assert.deepEqual([saved.owner, saved.ownerId, 'ownerText' in saved], ['Lia', '', false]);
  assert.equal(itemFromValues('task', { title: 'T', ownerText: 'Dani' }, { ...item, ownerId: 'u9' }, []).ownerId, 'u9', 'sem mudança, o vínculo fica');
});

test('Old agenda blocks with zero order or duration still save', () => {
  const html = itemDialogBody({ agency: {} }, { id: 'e', plan: { brief: {}, items: [] } }, 'agenda', { kind: 'agenda', title: 'B', order: 0, duration: 0 });
  assert.match(html, /name="order"[^>]*value="0"[^>]*min="0"/);
  assert.match(html, /name="duration"[^>]*value="0"[^>]*min="0"/);
});

test('A group message with a contact variable can still be cancelled', () => {
  const message = { kind: 'message', channel: 'grupos', notes: 'Oi {{contact.first_name}}', date: '', time: '' };
  assert.doesNotThrow(() => checkItem({ ...message, status: 'cancelado' }));
  assert.doesNotThrow(() => checkItem({ ...message, status: 'enviado' }));
  assert.throws(() => checkItem({ ...message, status: 'pronto' }), /variáveis de contato/);
});

test('The conflict message tells people to keep what they typed', () => {
  const s = blank(), id = execute(s, { type: 'save', key: 'eventPlans', id: '', data: { title: 'A', plan: { brief: {}, items: [] } } });
  assert.throws(() => execute(s, { type: 'save', key: 'eventPlans', id, data: { title: 'B', revision: 9 } }), /outra sessão\. Copie o que ainda não foi salvo e recarregue/);
});

test('Gallery card actions wrap on narrow cards', () => {
  assert.match(readFileSync(new URL('../ui/event-planner.css', import.meta.url), 'utf8'), /\.ep-card-actions \{[^}]*flex-wrap:wrap/);
});
