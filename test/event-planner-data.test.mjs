import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { briefFields, briefGroups, channels, launchEventPlan, messageTemplates } from '../ui/event-planner-data.js';

test('Launch template mirrors the Parceiras structure', () => {
  const p = launchEventPlan('2026-12-10');
  const count = kind => p.items.filter(row => row.kind === kind).length;
  assert.equal(count('task'), 12);
  assert.equal(count('agenda'), 7);
  assert.equal(count('link'), 13);
  const messages = messageTemplates('2026-12-10');
  assert.equal(messages.filter(m => m.channel === 'grupos').length, 27);
  assert.equal(messages.filter(m => m.channel === 'privado').length, 7);
  assert.equal(count('message'), 34);
  assert.equal(new Set(messages.map(m => m.code)).size, 34);
  assert.ok(messages.some(m => m.code === 'GRUPO-01') && messages.some(m => m.code === 'PRIVADO-07'));
  assert.equal(p.items.find(r => r.title === 'Definir objetivo, metas, narrativa e oferta').date, '2026-11-28');
  assert.ok(Object.values(p.brief).every(Boolean), 'brief inteiro preenchido com marcadores');
});

test('Launch template copy is niche-neutral and uses Soci variables', () => {
  const messages = messageTemplates('2026-12-10');
  const all = messages.map(m => m.notes).join('\n');
  assert.doesNotMatch(all, /\[nome\]|social media|\bposts?\b|cliente pede/i);
  assert.match(messages.filter(m => m.channel === 'privado').map(m => m.notes).join(''), /\{\{contact\.first_name\}\}/);
  assert.doesNotMatch(messages.filter(m => m.channel === 'grupos').map(m => m.notes).join(''), /\{\{contact\./);
  assert.match(all, /10 de dez\. de 2026/);
  assert.doesNotMatch(all, /\[data do evento\]/);
});

test('Launch template passes server-side validation', () => {
  const state = blank();
  execute(state, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Lançamento', eventDate: '2026-12-10', plan: launchEventPlan('2026-12-10') } });
  const saved = state.eventPlans[0].plan.items;
  assert.equal(saved.length, 66);
  assert.equal(saved.find(r => r.code === 'GRUPO-01').time, '18:00');
  assert.ok(saved.filter(r => r.kind === 'agenda').every(r => r.time && r.duration > 0), 'roteiro com horário para a agenda');
});

test('Brief groups cover every brief field once', () => {
  assert.deepEqual(briefGroups.map(([key]) => key), ['direction', 'communication', 'operation']);
  assert.deepEqual(briefGroups.flatMap(([, , fields]) => fields.map(([k]) => k)).sort(), ['audience', 'followup', 'goal', 'identity', 'logistics', 'narrative', 'offer']);
  assert.deepEqual(briefFields.map(([k]) => k), briefGroups.flatMap(([, , fields]) => fields.map(([k]) => k)));
  assert.equal(channels.find(([id]) => id === 'grupos')[1], 'WhatsApp · grupos');
});
