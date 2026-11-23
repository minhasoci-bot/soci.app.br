import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Event planner stylesheet uses only theme tokens', () => {
  const css = readFileSync(new URL('../ui/event-planner.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.doesNotMatch(css, /\.ep-hero|\.ep-kpis|\.ep-intro|\.ep-subtabs/);
});
