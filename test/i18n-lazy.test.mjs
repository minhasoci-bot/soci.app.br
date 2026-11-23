// O catálogo em espanhol (locales/es.js, ~440 KB) só é baixado no navegador quando o idioma é espanhol.
// O cenário de navegador roda num processo à parte para não alterar window/document dos outros testes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRANSLATIONS, PT_TO_ES, setLanguage, tr, getLanguage } from '../ui/i18n.js';

const i18nUrl = pathToFileURL(fileURLToPath(new URL('../ui/i18n.js', import.meta.url))).href;

function browser(saved) {
  const script = `
    const stub = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    stub('window', { dispatchEvent(e) { (globalThis.__langEvents ||= []).push(e.detail.lang); } });
    stub('localStorage', { getItem: () => ${JSON.stringify(saved)}, setItem() {} });
    stub('NodeFilter', { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 });
    stub('document', { documentElement: {}, body: {}, querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => null }) });
    const i18n = await import(${JSON.stringify(i18nUrl)});
    const out = { loadedAtStart: Boolean(i18n.TRANSLATIONS.es), langAtStart: i18n.getLanguage(), trAtStart: i18n.tr('Salvar') };
    const pending = i18n.setLanguage('es');
    out.langWhileLoading = i18n.getLanguage();
    await pending;
    Object.assign(out, { langAfter: i18n.getLanguage(), trAfter: i18n.tr('Salvar'), ptToEs: i18n.PT_TO_ES.Salvar, events: globalThis.__langEvents });
    console.log(JSON.stringify(out));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').pop());
}

test('no navegador em português o catálogo espanhol não é baixado; ao trocar, carrega e só então muda', () => {
  const out = browser(null);
  assert.deepEqual([out.loadedAtStart, out.langAtStart, out.trAtStart], [false, 'pt', 'Salvar']);
  assert.equal(out.langWhileLoading, 'pt', 'o idioma só muda depois que o catálogo chegou');
  assert.deepEqual([out.langAfter, out.trAfter, out.ptToEs], ['es', 'Guardar', 'Guardar']);
  assert.deepEqual(out.events, ['es'], 'o aviso de troca de idioma sai uma vez, já com o catálogo');
});

test('no navegador com espanhol salvo o catálogo já vem carregado na abertura', () => {
  const out = browser('es');
  assert.deepEqual([out.loadedAtStart, out.langAtStart, out.trAtStart], [true, 'es', 'Guardar']);
});

test('no servidor (sem window) o espanhol continua síncrono, como nos relatórios compartilhados', () => {
  assert.ok(TRANSLATIONS.es && PT_TO_ES.Salvar === 'Guardar');
  assert.equal(setLanguage('es'), undefined, 'sem promessa quando o catálogo já está carregado');
  assert.equal(getLanguage(), 'es');
  assert.equal(tr('Salvar'), 'Guardar');
  setLanguage('pt');
});

test('i18n.js não importa o catálogo espanhol de forma estática', () => {
  const src = readFileSync(new URL('../ui/i18n.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s[^;]*locales\/es\.js/m);
  assert.match(src, /import\(\s*['"]\.\/locales\/es\.js['"]\s*\)/);
});
