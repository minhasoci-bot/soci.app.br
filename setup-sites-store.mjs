// Páginas de setup guardadas fora do estado da agência (setups importados do GHL, que podem ter dezenas de páginas).
// Uma linha por projeto (setup-sites-<setup>-<projeto>) e uma linha índice (setup-sites-<setup>) com a lista de projetos.
// Um setup com sitesStored: true não tem studioSites no estado da agência; o servidor lê daqui antes de copiar as páginas.

const indexId = snapshotId => `setup-sites-${snapshotId}`;
const rowId = (snapshotId, projectId) => `setup-sites-${snapshotId}-${projectId}`;

/** A linha, ou null quando não existe. */
export async function readRow(store, id) {
  try { return await store.load(id); } catch (e) { if (e.status === 404) return null; throw e; }
}

/**
 * Grava a linha inteira, criando ou trocando o conteúdo (também usado pelas linhas temporárias da importação do GHL).
 * Toda linha precisa de profile.name: no Supabase a coluna name de go_workspaces sai dele e não pode ser nula.
 */
export async function putRow(store, id, value) {
  const doc = typeof value?.profile?.name === 'string' ? value : { ...value, profile: { name: 'Dados de setup' } };
  if (await store.insert(id, doc)) return;
  // A linha já existe (ou ficou vazia num remove sem DELETE no Supabase): troca o conteúdo inteiro.
  await store.change(id, state => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, structuredClone(doc));
  });
}

/** Guarda os sites de um setup ({ [projectId]: siteDoc }), trocando o que havia antes. */
export async function saveSetupSites(store, snapshotId, sites) {
  await removeSetupSites(store, snapshotId);
  const projects = Object.keys(sites || {});
  for (const projectId of projects) await putRow(store, rowId(snapshotId, projectId), sites[projectId]);
  await putRow(store, indexId(snapshotId), { snapshotId, projects });
}

/** Os sites de um setup, no mesmo formato de studioSites; {} quando o setup não tem linhas. */
export async function loadSetupSites(store, snapshotId) {
  const index = await readRow(store, indexId(snapshotId));
  const sites = {};
  for (const projectId of index?.projects || []) {
    const doc = await readRow(store, rowId(snapshotId, projectId));
    if (doc) sites[projectId] = doc;
  }
  return sites;
}

/** Apaga as linhas de um setup (ao excluir o setup). */
export async function removeSetupSites(store, snapshotId) {
  const index = await readRow(store, indexId(snapshotId));
  if (!index) return;
  for (const projectId of index.projects || []) await store.remove(rowId(snapshotId, projectId));
  await store.remove(indexId(snapshotId));
}
