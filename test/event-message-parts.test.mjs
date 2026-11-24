import test from 'node:test';
import assert from 'node:assert/strict';
import { messageParts, openMarkers, partsProblem, renderPart } from '../ui/event-message-parts.js';
import { messageTemplates } from '../ui/event-planner-data.js';

test('Copy splits into messages and drops internal notes', () => {
  assert.deepEqual(messageParts('## Mensagem 1 · A\n\nOi\n\n## Mensagem 2\n\nTchau'), [{ kind: 'text', text: 'Oi' }, { kind: 'text', text: 'Tchau' }]);
  assert.deepEqual(messageParts('Sem título'), [{ kind: 'text', text: 'Sem título' }]);
  assert.deepEqual(messageParts('Antes\r\n## Convite\r\nOi'), [{ kind: 'text', text: 'Antes' }, { kind: 'text', text: 'Oi' }]);
  for (const note of ['Roteiro do áudio', 'Orientação para o vídeo', 'Antes de enviar', 'Nota da equipe']) {
    assert.deepEqual(messageParts(`## ${note}\nfala\n## Mensagem\nOi`), [{ kind: 'text', text: 'Oi' }], note);
  }
  assert.deepEqual(messageParts('   \n'), []);
  assert.deepEqual(messageParts(undefined), []);
});

test('A poll section becomes a poll and the text around it stays a message', () => {
  assert.deepEqual(messageParts('Oi\n## Enquete · Vai?\n- Sim\n- *Não*\n\nResponde aí'), [
    { kind: 'text', text: 'Oi' }, { kind: 'poll', question: 'Vai?', options: ['Sim', 'Não'] }, { kind: 'text', text: 'Responde aí' }
  ]);
});

test('Open markers and limits block sending', () => {
  assert.deepEqual(openMarkers(messageParts('Veja [link do grupo] e [link do grupo], [x y]')), ['[link do grupo]', '[x y]']);
  assert.match(partsProblem(messageParts('Veja [x y]'), 'grupos'), /Preencha os marcadores: \[x y\]/);
  assert.match(partsProblem(messageParts('## Enquete · [tema]?\n- a\n- b'), 'grupos'), /Preencha os marcadores: \[tema\]/);
  assert.equal(partsProblem(messageParts('## Nota\n[interno]\n## Mensagem\nOi'), 'grupos'), '');
  assert.match(partsProblem(messageParts('## Nota\ninterno'), 'grupos'), /não tem texto para enviar/);
  assert.match(partsProblem(messageParts('## Enquete · Vai?\n- Sim\n- Não'), 'privado'), /Enquete só pode ir para grupo/);
  assert.match(partsProblem(messageParts('## Enquete · Vai?\n- Sim'), 'grupos'), /de 2 a 12 opções/);
  assert.match(partsProblem(messageParts('Oi {{contact.name}}'), 'grupos'), /variáveis de contato/);
  assert.equal(partsProblem(messageParts('Oi {{contact.name}}'), 'privado'), '');
  assert.match(partsProblem(messageParts('Oi {{contact.email}}'), 'privado'), /\{\{contact\.email\}\}/);
  assert.match(partsProblem([{ kind: 'text', text: 'a'.repeat(4001) }], 'privado'), /4\.000 caracteres/);
});

test('Contact variables never leave a hole', () => {
  const part = { kind: 'text', text: 'Oi, {{contact.first_name}}! Tudo bem?' };
  assert.equal(renderPart(part, { name: 'Ana Lima' }).text, 'Oi, Ana! Tudo bem?');
  assert.equal(renderPart(part, { name: '  ' }).text, 'Oi! Tudo bem?');
  assert.equal(renderPart({ kind: 'text', text: '{{contact.first_name}}, hoje é o dia' }, null).text, 'Hoje é o dia');
  assert.equal(renderPart({ kind: 'text', text: 'Para {{ contact.name }} e só' }, { name: 'Ana Lima' }).text, 'Para Ana Lima e só');
  assert.equal(renderPart(part, { name: '$& {{contact.name}}' }).text, 'Oi, $&! Tudo bem?');
});

test('Every message of the launch template splits into something to send', () => {
  for (const m of messageTemplates('2026-12-10')) assert.ok(messageParts(m.notes).length, m.code);
  assert.equal(messageParts(messageTemplates('').find(m => m.code === 'MVWF003').notes).filter(p => p.kind === 'poll').length, 1);
});
