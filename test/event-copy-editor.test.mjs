import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMark, copyEditorField, insertAt, whatsappHtml } from '../ui/event-copy-editor.js';

test('applyMark wraps and unwraps inline marks', () => {
  assert.deepEqual(applyMark('olá mundo', 4, 9, 'bold'), { text: 'olá *mundo*', start: 5, end: 10 });
  assert.deepEqual(applyMark('olá *mundo*', 5, 10, 'bold'), { text: 'olá mundo', start: 4, end: 9 });
  assert.equal(applyMark('ok', 0, 2, 'italic').text, '_ok_');
  assert.equal(applyMark('ok', 0, 2, 'strike').text, '~ok~');
});

test('applyMark prefixes each selected line for lists', () => {
  assert.equal(applyMark('a\nb', 0, 3, 'number').text, '1. a\n2. b');
  assert.equal(applyMark('x\na\nb', 2, 5, 'bullet').text, 'x\n- a\n- b');
});

test('insertAt places a variable at the cursor', () => {
  assert.deepEqual(insertAt('Oi, !', 4, 4, '{{contact.first_name}}'), { text: 'Oi, {{contact.first_name}}!', start: 26, end: 26 });
});

test('whatsappHtml escapes and renders WhatsApp marks', () => {
  assert.equal(whatsappHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.match(whatsappHtml('é *muito* bom'), /é <strong>muito<\/strong> bom/);
  assert.match(whatsappHtml('_leve_ e ~velho~'), /<em>leve<\/em> e <s>velho<\/s>/);
  assert.doesNotMatch(whatsappHtml('5 * 3 = 15 e 2 * 2'), /<strong>/);
  assert.doesNotMatch(whatsappHtml('só *meio'), /<strong>/);
  assert.match(whatsappHtml('- um\n- dois'), /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
  assert.match(whatsappHtml('1. um\n2. dois'), /<ol><li>um<\/li><li>dois<\/li><\/ol>/);
  assert.match(whatsappHtml('## Mensagem 1 · Convite'), /<h4>Mensagem 1 · Convite<\/h4>/);
  assert.match(whatsappHtml('linha 1\nlinha 2\n\nnovo'), /<p>linha 1<br>linha 2<\/p><p>novo<\/p>/);
});

test('copyEditorField renders toolbar, textarea and preview', () => {
  const html = copyEditorField({ name: 'notes', value: 'Oi *você*', variables: [['{{contact.first_name}}', 'Primeiro nome']] });
  for (const mark of ['bold', 'italic', 'strike', 'bullet', 'number']) assert.match(html, new RegExp(`data-ec-mark="${mark}"`));
  assert.match(html, /<textarea[^>]*name="notes"[^>]*>Oi \*você\*<\/textarea>/);
  assert.match(html, /data-ec-var/);
  assert.match(html, /class="ec-preview"[^>]*>.*<strong>você<\/strong>/s);
});
