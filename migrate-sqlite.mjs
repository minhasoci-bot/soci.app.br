import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { copyTrackingEvents, isDocument, supabaseFromEnv } from './storage.mjs';
import { hydrateWorkspace } from './model.mjs';

async function migrate() {
  const target = supabaseFromEnv();
  if (!target) throw new Error('Set the destination Supabase environment first.');
  const path = process.argv[2] || fileURLToPath(new URL('./.data/go.sqlite', import.meta.url));
  const source = new DatabaseSync(path, { readOnly: true });
  let imported = 0;
  let identical = 0;
  let events = 0;
  try {
    for (const { id, state } of source.prepare('SELECT id, state FROM workspaces ORDER BY rowid').all()) {
      const parsed = JSON.parse(state);
      const snapshot = isDocument(id) ? parsed : hydrateWorkspace(parsed);
      const inserted = await target.insert(id, snapshot);
      if (!isDeepStrictEqual(await target.load(id), snapshot)) {
        throw new Error(`Workspace ${id} differs in Supabase. Existing data was preserved.`);
      }
      if (inserted) imported++;
      else identical++;
    }
    events = await copyTrackingEvents(source, target);
  } finally {
    source.close();
  }
  console.log(`Supabase: ${imported} imported, ${identical} already identical; ${events} tracking events copied.`);
}

try {
  await migrate();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
