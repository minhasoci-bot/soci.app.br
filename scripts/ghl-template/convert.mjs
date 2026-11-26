// Lê uma extração do GHL gravada em pasta (para os templates de setup) e usa o conversor do servidor (ghl-convert/).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export { convert, htmlToText, pagesOf } from '../../ghl-convert/convert.mjs';

/* ───────── Leitura da extração ───────── */

export function loadSource(dir, locationId) {
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const dump = read(`${locationId}.json`);
  const triggers = read('triggers.json')[locationId] || {};
  const surveys = read('surveys.json')[locationId] || [];
  const page = id => { const file = join(dir, 'pages', `${id}.html`); return existsSync(file) ? readFileSync(file, 'utf8') : ''; };
  return { dump, triggers, surveys, page };
}
