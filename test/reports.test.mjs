import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { reportCsv } from '../ui/report-data.js';

const stamp = '2026-11-19T18:00:00.000Z';

function command(state, type, data = {}, id = '') {
  return execute(state, { type, id, data });
}

test('Custom reports create from templates, preserve widget isolation, and export a safe CSV', () => {
  const state = blank('Reports workspace');
  const source = command(state, 'report-create', { name: 'Comercial', source: 'template', sourceId: 'sales' });
  const report = state.customReports.find(item => item.id === source);
  assert.equal(report.pages.length, 1);
  assert.deepEqual(report.pages[0].widgets.map(item => item.kind), ['status', 'value', 'conversion', 'funnel', 'source']);
  assert.equal(new Set(report.pages[0].widgets.map(item => item.id)).size, report.pages[0].widgets.length);

  const csv = reportCsv(state, report);
  assert.match(csv, /^\uFEFF"Página","Widget","Métrica","Valor"/);
  assert.match(csv, /"Página 1"/);

  const copy = command(state, 'report-create', { name: 'Comercial · cópia', source: 'clone', sourceId: source });
  const cloned = state.customReports.find(item => item.id === copy);
  assert.notEqual(cloned.pages[0].id, report.pages[0].id);
  assert.notEqual(cloned.pages[0].widgets[0].id, report.pages[0].widgets[0].id);
});

test('Custom reports validate versions, pages, and remote URLs before persisting', () => {
  const state = blank();
  const id = command(state, 'report-create', { name: 'Seguro' });
  const report = state.customReports.find(item => item.id === id);
  const page = report.pages[0];
  const valid = {
    ...report,
    summary: 'Resumo do período',
    pages: [{ ...page, name: 'Resultados', widgets: [{ id: 'metric-1', kind: 'm-contacts-count', title: 'Contatos', width: 4, pipeline: '', dateField: 'status', note: '', url: '' }] }]
  };
  command(state, 'report-save', valid, id);
  assert.equal(state.customReports[0].version, 2);
  assert.equal(state.customReports[0].pages[0].name, 'Resultados');

  assert.throws(() => command(state, 'report-save', valid, id), { status: 409 });
  const current = state.customReports[0];
  const badUrl = structuredClone(current);
  badUrl.pages[0].widgets = [{ id: 'embed-1', kind: 'embed', title: 'Inseguro', width: 12, pipeline: '', dateField: 'status', note: '', url: 'http://localhost:4317' }];
  assert.throws(() => command(state, 'report-save', badUrl, id), /https/i);
});
