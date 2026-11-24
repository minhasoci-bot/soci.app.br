// Regras do design system (Liquid Glass) que não podem regredir sem alguém perceber.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(resolve(root, 'ui', file), 'utf8').replace(/\r\n/g, '\n');
const tokens = read('tokens.css');

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const block = selector => {
  const start = tokens.indexOf(`\n${selector}{`);
  assert.ok(start >= 0, `bloco ${selector} em tokens.css`);
  return tokens.slice(start, tokens.indexOf('\n}', start));
};
const value = (css, name) => new RegExp(`${name}:(#[0-9a-f]{6})\\b`).exec(css)?.[1];
const light = block(':root');
const dark = block(':root[data-theme=dark]');

test('Texto e ação principal passam de 4,5:1 nos dois temas', () => {
  for (const [name, css] of [['claro', light], ['escuro', dark]]) {
    const pick = token => value(css, token) || value(light, token);
    for (const text of ['--g-ink', '--g-ink-2', '--g-dim', '--g-faint', '--g-brand-text', '--g-red', '--g-mint', '--g-blue'])
      for (const surface of ['--g-surface', '--g-canvas'])
        assert.ok(contrast(pick(text), pick(surface)) >= 4.5, `${name}: ${text} sobre ${surface} = ${contrast(pick(text), pick(surface)).toFixed(2)}`);
    assert.ok(contrast(pick('--g-brand-on'), pick('--g-brand-fill')) >= 4.5, `${name}: texto do botão principal`);
    assert.ok(contrast(pick('--g-brand-on'), pick('--g-brand-fill-hover')) >= 4.5, `${name}: texto do botão principal no hover`);
  }
});

test('Só tokens.css define cor, material e forma', () => {
  const owned = /(?:^|[;{\s])(--(?:lg-(?:regular|thick|clear|blur|sat|rim|shadow)|r-(?:chip|control|group|card|sheet|pill)|g-(?:ink|canvas|surface|fill|field|menu-bg)))\s*:/;
  for (const file of readdirSync(resolve(root, 'ui')).filter(f => f.endsWith('.css') && f !== 'tokens.css'))
    assert.equal(owned.exec(read(file))?.[1], undefined, `${file} redefine um token`);
});

test('Reduzir transparência e aumentar contraste cobrem os materiais nos dois temas', () => {
  for (const query of ['prefers-reduced-transparency:reduce', 'prefers-contrast:more']) {
    const start = tokens.indexOf(`@media (${query})`);
    assert.ok(start >= 0, query);
    const css = tokens.slice(start, tokens.indexOf('\n}', start));
    assert.equal(css.match(/--lg-regular:#[0-9a-f]{3,6}\b/g)?.length, 2, `${query}: material opaco em claro e escuro`);
    assert.equal(css.match(/--lg-thick:#[0-9a-f]{3,6}\b/g)?.length, 2, `${query}: material espesso opaco em claro e escuro`);
  }
});

test('As páginas carregam tokens no começo e o vidro por último', () => {
  for (const file of ['app.html', 'document-sign.html', 'estimate-view.html', 'invoice-view.html', 'social-approve.html', 'social-connect.html']) {
    const sheets = [...read(file).matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\/([a-z-]+\.css)/g)].map(m => m[1]);
    assert.ok(sheets.indexOf('tokens.css') === sheets.indexOf('style.css') + 1, `${file}: tokens.css logo depois de style.css`);
    assert.equal(sheets.at(-1), 'liquid-glass.css', `${file}: liquid-glass.css por último`);
  }
});
