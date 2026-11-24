import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank, execute } from '../model.mjs';
import { pageShell, utabs } from '../ui/screens.js';
import { eventDialogBody, eventPlanner, newEventPlan } from '../ui/event-planner.js';
import { launchEventPlan } from '../ui/event-planner-data.js';

const marketingTabs = [['social', 'Planejador social'], ['events', 'Eventos']];
const helpers = { pageShell, utabs, marketingTabs };
let spaces = 0;
function context(events = [], users = []) {
  const s = blank();
  for (const data of events) execute(s, { type: 'save', key: 'eventPlans', id: '', data });
  return { s, agency: { users }, workspace: `ep-${++spaces}` };
}

test('Event planner stylesheet uses only theme tokens', () => {
  const css = readFileSync(new URL('../ui/event-planner.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.doesNotMatch(css, /\.ep-hero|\.ep-kpis|\.ep-intro|\.ep-subtabs/);
});

test('Gallery cards open, rename, duplicate and delete events without the legacy hero', () => {
  const c = context([{ title: 'Aula <b>1</b>', eventDate: '2026-12-10', plan: launchEventPlan('2026-12-10') }]);
  const html = eventPlanner(c, helpers), id = c.s.eventPlans[0].id;
  assert.match(html, new RegExp(`data-ep-open="${id}"`));
  for (const action of ['rename', 'duplicate', 'delete']) assert.match(html, new RegExp(`data-ep-manage="${action}" data-id="${id}"`));
  assert.match(html, /0 de 12 tarefas concluídas/);
  assert.match(html, /10 de dez\. de 2026/);
  assert.match(html, /Aula &lt;b&gt;1&lt;\/b&gt;/);
  assert.doesNotMatch(html, /ep-hero|ep-intro/);
});

test('Gallery hides archived events by default and offers a status filter', () => {
  const c = context([
    { title: 'Ativo', eventDate: '2026-12-10', plan: { brief: {}, items: [] } },
    { title: 'Guardado', eventDate: '2026-12-11', status: 'arquivado', plan: { brief: {}, items: [] } }
  ]);
  const html = eventPlanner(c, helpers);
  assert.match(html, /data-ep-status-filter/);
  assert.match(html, />Ativo</);
  assert.doesNotMatch(html, />Guardado</);
});

test('Empty gallery invites to create an event', () => {
  assert.match(eventPlanner(context(), helpers), /class="empty"[\s\S]*data-ep-new/);
});

test('New event dialog asks how to start; editing does not', () => {
  const fresh = eventDialogBody(null);
  assert.match(fresh, /<select name="template"[^>]*>\s*<option value="launch" selected>Modelo de lançamento<\/option>\s*<option value="blank"\s*>Evento em branco/);
  assert.match(fresh, /O modelo usa essa data para montar o cronograma de tarefas, mensagens, roteiro e validação de links\./);
  assert.match(fresh, /name="eventDate"[^>]*required/);
  const c = context([{ title: 'Aula', eventDate: '', plan: { brief: {}, items: [] } }]);
  const edit = eventDialogBody(c.s.eventPlans[0]);
  assert.doesNotMatch(edit, /name="template"/);
  assert.doesNotMatch(edit, /name="eventDate"[^>]*required/);
  assert.match(edit, /data-revision="1"/);
});

test('A launch template needs a valid event date; a blank event does not', () => {
  assert.throws(() => newEventPlan('launch', ''), /Informe uma data válida para montar o cronograma\./);
  assert.throws(() => newEventPlan('launch', '2026-02-31'), /Informe uma data válida/);
  assert.equal(newEventPlan('launch', '2026-12-10').items.length, 66);
  assert.deepEqual(newEventPlan('blank', '').items, []);
});
