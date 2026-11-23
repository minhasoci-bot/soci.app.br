import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PUBLIC_HTML, publicMirrorPlan, syncPublic } from '../scripts/sync-public.mjs';
import { staticFiles } from '../server.mjs';

// public/ não é versionado: nasce de ui/ no build da Vercel (npm run vercel-build). Na Vercel ele é servido
// antes da função, e um módulo de ui/ que falte nele responde 500 (21/11/2026: invoices.js e outros 39).
test('o build gera em public/ todo módulo, estilo e página estática que o app serve', t => {
  const out = mkdtempSync(join(tmpdir(), 'soci-public-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));

  const copied = syncPublic(out);
  assert.ok(copied.length > 100, `copiou ${copied.length} arquivos`);
  assert.deepEqual(publicMirrorPlan(out), [], 'depois de gerar, nada fica pendente');

  const missing = [...staticFiles.keys()]
    .filter(path => !path.startsWith('/setup-art/'))
    .filter(path => !/\.html$/.test(path) || PUBLIC_HTML.includes(path.slice(1)))
    .filter(path => !existsSync(join(out, path)));
  assert.deepEqual(missing, [], 'todo estático servido pelo app também sai em public/');
  for (const page of PUBLIC_HTML) assert.ok(existsSync(join(out, page)), page);
  assert.ok(existsSync(join(out, 'brand', 'soci-isotipo-1x1.png')), 'as imagens da marca vão junto');
  assert.equal(readFileSync(join(out, 'app.js'), 'utf8'), readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8'));
});
