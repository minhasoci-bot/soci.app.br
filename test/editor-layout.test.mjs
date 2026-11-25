import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Specificity [ids, classes, elements] of one selector, enough for the selectors the app uses:
// :has/:is/:not take the most specific argument, :where counts zero, every other pseudo-class counts as a class.
function specificity(selector) {
  let s = selector.trim(), out = [0, 0, 0];
  const add = v => { out = [out[0] + v[0], out[1] + v[1], out[2] + v[2]]; };
  const max = list => list.map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b), [0, 0, 0]);
  s = s.replace(/:(has|is|not|where)\(((?:[^()]|\([^()]*\))*)\)/g, (_, fn, args) => { if (fn !== 'where') add(max(args.split(','))); return ' '; });
  out[0] += (s.match(/#[\w-]+/g) || []).length;
  out[1] += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
  out[2] += (s.replace(/[.#:[][^\s>+~]*/g, ' ').match(/\b[a-z][\w-]*\b/gi) || []).length;
  return out;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// Selectors of every rule (also inside @media) that set grid-template-columns.
async function gridSelectors(file) {
  const css = (await readFile(new URL(`../ui/${file}`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/grid-template-columns/.test(body)) found.push(...selectors.split(',').map(sel => sel.trim()).filter(Boolean));
  }
  return found;
}

test('Full-screen editors take the whole width: their one-column grid beats the Liquid Glass shell grid', async () => {
  const glass = (await gridSelectors('liquid-glass.css')).filter(sel => /\.shell\b/.test(sel) && !/dw-workspace/.test(sel));
  const editor = (await gridSelectors('design-workspace.css')).filter(sel => /\.shell\b/.test(sel) && /dw-workspace/.test(sel));
  assert.ok(glass.length, 'Liquid Glass sets the shell columns');
  assert.ok(editor.length, 'the editor sets its own shell columns');
  const strongestGlass = glass.map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
  for (const sel of editor) {
    assert.ok(cmp(specificity(sel), strongestGlass) > 0, `"${sel}" ${specificity(sel)} must beat ${strongestGlass}, or the editor lands in the 72 px sidebar column`);
  }
});

test('The specificity helper counts like the browser for the selectors in use', () => {
  assert.deepEqual(specificity('.shell:has(.dw-workspace)'), [0, 2, 0]);
  assert.deepEqual(specificity(':root:root .shell.wide'), [0, 4, 0]);
  assert.deepEqual(specificity(':root:root .shell'), [0, 3, 0]);
  assert.deepEqual(specificity('#screen > main a'), [1, 0, 2]);
});
