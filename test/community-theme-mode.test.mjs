import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, themeIsDark, themeMode, themePresets } from '../ui/community-data.js';

const preset = id => ({ preset: id, tokens: { ...themePresets.find(row => row.id === id).tokens } });

test('Each preset knows whether it is dark', () => {
  assert.equal(themeIsDark(preset('default')), false);
  assert.equal(themeIsDark(preset('noite-neon')), true);
  assert.equal(themeIsDark(null), false, 'no theme is the light default');
});

test('The dark variant of every light preset stays readable', () => {
  for (const row of themePresets.filter(item => !themeIsDark({ tokens: item.tokens }))) {
    const dark = themeMode({ tokens: row.tokens }, 'dark').tokens;
    assert.ok(themeIsDark({ tokens: dark }), `${row.id} turns dark`);
    assert.ok(contrast(dark.font, dark.background) >= 7, `${row.id} text`);
    assert.ok(contrast(dark.primary, dark.background) >= 4.5, `${row.id} primary on the page`);
    assert.ok(contrast(dark.onPrimary, dark.primary) >= 4.5, `${row.id} button text`);
  }
});

test('The light variant of a dark theme stays readable, and the own mode keeps the theme', () => {
  for (const id of ['meia-noite', 'grafite', 'noite-neon']) {
    const light = themeMode(preset(id), 'light').tokens;
    assert.equal(themeIsDark({ tokens: light }), false, `${id} turns light`);
    assert.ok(contrast(light.primary, light.background) >= 4.5, `${id} primary on the page`);
    assert.ok(contrast(light.onPrimary, light.primary) >= 4.5, `${id} button text`);
  }
  assert.deepEqual(themeMode(preset('oceano'), 'light'), preset('oceano'));
  assert.deepEqual(themeMode(preset('noite-neon'), 'dark'), preset('noite-neon'));
  assert.deepEqual(themeMode(preset('oceano'), ''), preset('oceano'), 'no choice keeps the owner theme');
});
