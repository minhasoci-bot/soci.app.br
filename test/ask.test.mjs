// Nenhum confirm(), prompt() ou alert() do navegador: as perguntas usam ui/ask.js (pedido de 24/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staticFiles } from '../server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const native = /(?<![\w$.'"`-])(?:(?:window|globalThis|self|parent|top)\s*\.\s*)?(?:confirm|prompt|alert)\s*\(/g;

function files(dir, pattern) {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name))
    .filter(path => !/node_modules/.test(path));
}

/** Tira comentários de linha inteira; URLs e textos seguem no código. */
const code = path => readFileSync(path, 'utf8').split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

test('the native dialog detector catches every spelling', () => {
  for (const line of ["if (!confirm('x')) return;", 'window.confirm("x")', "const a = prompt('x');", '!window.alert (1)']) assert.match(line, new RegExp(native.source), line);
  for (const line of ['askConfirm(x)', 'api.confirm(x)', 'confirmDelete(button)', 'await ask(title)']) assert.doesNotMatch(line, new RegExp(native.source), line);
});

test('no screen opens a native browser dialog', () => {
  const found = [];
  for (const path of [...files('ui', /\.(js|html)$/), ...files('prancheta-editor/src', /\.tsx?$/)]) {
    const text = code(path);
    const vendor = /[\/]vendor[\/]/.test(path);
    // Pacotes minificados têm funções locais com esses nomes; neles só a chamada em window é o diálogo nativo.
    const hits = vendor ? text.match(/\bwindow\.(?:confirm|prompt|alert)\s*\(/g) : text.match(native);
    if (hits) found.push(`${path.slice(root.length)}: ${hits.join(' ')}`);
  }
  assert.deepEqual(found, [], 'use ask, askText ou tell de ui/ask.js');
});

test('every ask() is awaited, so a pending promise never counts as a yes', () => {
  const loose = [];
  for (const path of files('ui', /\.js$/)) {
    if (/[\/](vendor|ask\.js)/.test(path)) continue;
    const text = code(path);
    if (!/from '\.\/ask\.js'/.test(text)) continue;
    for (const match of text.matchAll(/(?<![\w$.'"-])(?:ask|askText|tell|showCopy)\(/g)) {
      const before = text.slice(Math.max(0, match.index - 160), match.index);
      if (!/await\s+$/.test(before) && !/await \([^;]*$/.test(before)) loose.push(`${path.slice(root.length)}: ${text.slice(match.index, match.index + 60)}`);
    }
  }
  assert.deepEqual(loose, []);
});

test('the dialog is served and styled on every page that uses it', () => {
  assert.match(staticFiles.get('/ask.js') || '', /javascript/);
  assert.match(staticFiles.get('/ask.css') || '', /css/);
  for (const page of ['app.html', 'client-portal.html', 'prancheta-editor.html']) assert.match(readFileSync(join(root, 'ui', page), 'utf8'), /href="\/ask\.css"/, page);
});
