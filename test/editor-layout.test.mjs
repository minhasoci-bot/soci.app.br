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

// Selectors of every rule (also inside @media) whose body matches the property pattern.
async function selectorsSetting(file, property) {
  const css = (await readFile(new URL(`../ui/${file}`, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (property.test(body)) found.push(...selectors.split(',').map(sel => sel.trim()).filter(Boolean));
  }
  return found;
}
const gridSelectors = file => selectorsSetting(file, /grid-template-columns/);

test('Full-screen editors start at the top: no room kept for the top bar they hide', async () => {
  const glass = (await selectorsSetting('liquid-glass.css', /padding-top/)).filter(sel => /\.screen\b/.test(sel));
  const editor = (await selectorsSetting('design-workspace.css', /padding-top:\s*0/)).filter(sel => /\.screen\b/.test(sel) && /dw-workspace/.test(sel));
  assert.ok(glass.length, 'Liquid Glass keeps room for the top bar above the screen');
  assert.ok(editor.length, 'the editor takes that room back');
  const strongestGlass = glass.map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
  for (const sel of editor) {
    assert.ok(cmp(specificity(sel), strongestGlass) > 0, `"${sel}" ${specificity(sel)} must beat ${strongestGlass}, or an empty band sits above the editor`);
  }
});

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

// Strongest selector among the rules of these files whose body matches the pattern.
async function strongest(files, property, filter = () => true) {
  const all = (await Promise.all(files.map(file => selectorsSetting(file, property)))).flat().filter(filter);
  return all.length ? all.map(specificity).reduce((a, b) => (cmp(a, b) >= 0 ? a : b)) : null;
}

test('Switches look like switches: their pill track beats the Liquid Glass checkbox box', async () => {
  const box = await strongest(['liquid-glass.css'], /border-radius/, sel => /input\[type=checkbox\]/.test(sel) && !/role=switch/.test(sel) && !/::/.test(sel));
  const pill = await strongest(['liquid-glass.css', 'agents.css'], /border-radius:\s*999px/, sel => /\[role=switch\]/.test(sel) && !/::/.test(sel));
  assert.ok(box && pill, 'both rules exist');
  assert.ok(cmp(pill, box) > 0, `switch track ${pill} must beat the checkbox box ${box}, or the switch shows as a pink dot`);
  const knobGlass = await strongest(['liquid-glass.css'], /background/, sel => /input\[type=checkbox\]::before/.test(sel) && !/role=switch/.test(sel));
  const knob = await strongest(['liquid-glass.css', 'agents.css'], /background:\s*#fff/, sel => /\[role=switch\]::before/.test(sel));
  assert.ok(cmp(knob, knobGlass) > 0, `switch knob ${knob} must beat ${knobGlass}`);
});

test('A switch row keeps the switch beside its text, not under it', async () => {
  const globalLabel = specificity('label:not(.search,.tag-filter,.check)');
  const row = await strongest(['liquid-glass.css', 'opportunities.css'], /display:\s*flex/, sel => /switch-row/.test(sel));
  assert.ok(row && cmp(row, globalLabel) > 0, `switch-row ${row} must beat the global label grid ${globalLabel}`);
});

test('The specificity helper counts like the browser for the selectors in use', () => {
  assert.deepEqual(specificity('.shell:has(.dw-workspace)'), [0, 2, 0]);
  assert.deepEqual(specificity(':root:root .shell.wide'), [0, 4, 0]);
  assert.deepEqual(specificity(':root:root .shell'), [0, 3, 0]);
  assert.deepEqual(specificity('#screen > main a'), [1, 0, 2]);
});
