// Uma operação grava um único instante: as datas que ela muda saem iguais, mesmo quando o relógio vira de
// milissegundo no meio dela. Antes, model.mjs chamava now() mais de uma vez por operação e o teste de CRM
// (crm.test.mjs) falhava de vez em quando no CI por 1 ms de diferença entre updated e stageChangedAt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';

// Relógio que avança 1 ms a cada leitura: torna visível qualquer segunda chamada a now() na mesma operação.
// execute() é síncrono, então o relógio é trocado e restaurado sem afetar outros testes.
function stepping(fn, start = '2026-11-23T20:59:41.516Z') {
  const RealDate = Date;
  let t = RealDate.parse(start);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [t++])); }
    static now() { return t++; }
  };
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

function workspace() {
  const s = blank();
  const save = (key, data, id) => execute(s, { type: 'save', key, id, data });
  const contact = save('contacts', { name: 'Ana', email: 'ana@example.test' });
  return { s, save, contact };
}

test('mover de etapa grava updated e stageChangedAt com o mesmo instante', () => {
  const { s, save, contact } = workspace();
  const id = save('opportunities', { contactId: contact, stage: 'new', value: 0, title: 'A' });
  stepping(() => execute(s, { type: 'opportunity-move', id, data: { stage: 'qualified' } }));
  const row = s.opportunities.find(r => r.id === id);
  assert.equal(row.stage, 'qualified');
  assert.equal(row.stageChangedAt, row.updated);
});

test('salvar oportunidade nova usa a criação como data de status e de etapa', () => {
  const { s, save, contact } = workspace();
  const id = stepping(() => save('opportunities', { contactId: contact, stage: 'new', value: 0, title: 'B' }));
  const row = s.opportunities.find(r => r.id === id);
  assert.equal(row.statusChangedAt, row.created);
  assert.equal(row.stageChangedAt, row.created);
});

test('salvar oportunidade existente grava updated e as datas que mudaram com o mesmo instante', () => {
  const { s, save, contact } = workspace();
  const id = save('opportunities', { contactId: contact, stage: 'new', value: 0, title: 'C' });
  const before = { ...s.opportunities.find(r => r.id === id) };
  stepping(() => save('opportunities', { ...before, status: 'Won', stage: 'qualified' }, id));
  const row = s.opportunities.find(r => r.id === id);
  assert.equal(row.statusChangedAt, row.updated);
  assert.equal(row.stageChangedAt, row.updated);
  const changed = { status: row.statusChangedAt, stage: row.stageChangedAt };
  // Só o título muda: as datas de status e de etapa ficam as anteriores; updated avança.
  stepping(() => save('opportunities', { ...row, title: 'C2' }, id), '2026-11-24T09:00:00.000Z');
  const again = s.opportunities.find(r => r.id === id);
  assert.equal(again.updated, '2026-11-24T09:00:00.000Z');
  assert.equal(again.statusChangedAt, changed.status);
  assert.equal(again.stageChangedAt, changed.stage);
});

test('arquivo novo da Prancheta sai com created e updated iguais', () => {
  const { s } = workspace();
  const id = stepping(() => execute(s, { type: 'prancheta-save', data: { name: 'Arte', format: 'post', width: 1080, height: 1080, document: { pages: [] } } }));
  const file = s.pranchetaFiles.find(f => f.id === id);
  assert.ok(file, 'arquivo criado');
  assert.equal(file.updated, file.created);
});
