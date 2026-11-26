// Importar do GHL: a conversão em passos curtos (cada chamada da janela da soci roda um passo de menos de 20 s).
// received → pages (pré-visualizações das páginas, 10 por passo) → converting (o conversor de ghl-convert/) →
// images (cópia das imagens para os assets da soci, 20 por passo) → done (setup em Importados). Erro: failed.
// Tudo o que o passo lê e grava passa por `io` (routes/ghl-import.mjs), para o módulo não conhecer o banco.
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { isPrivateAddress } from './ai-gateway/ssrf.mjs';
import { uid } from './model.mjs';
import { convert, pagesOf } from './ghl-convert/convert.mjs';
import { imageUrls, replaceUrls } from './ghl-convert/page-html.mjs';
import { newSiteDoc, SITE_LIMITS } from './studio-site.mjs';

export const PAGES_PER_STEP = 10;
export const IMAGES_PER_STEP = 20;
const IMAGE_MAX = 5 * 1024 * 1024;
const TIMEOUT = 10_000;
const PREVIEW = id => `https://sites.leadconnectorhq.com/preview/${encodeURIComponent(id)}`;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

const note = (job, text) => { if (!job.notes.includes(text)) job.notes.push(text); };
const stamp = () => new Date().toISOString();

async function download(io, url) {
  try {
    const response = await io.fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    return response.ok ? response : null;
  } catch { return null; }
}

/** Só http(s) nas portas padrão, sem usuário/senha, e o host não pode cair em rede interna (as páginas são do cliente). */
async function publicUrl(io, raw) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return false;
  const host = url.hostname.replace(/^[|]$/g, '');
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const records = await io.resolve(host);
    return records.length > 0 && !records.some(record => isPrivateAddress(record.address));
  } catch { return false; }
}

/** Baixa uma imagem seguindo no máximo 3 redirecionamentos, conferindo cada endereço antes de pedir. */
async function downloadImage(io, raw) {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await publicUrl(io, url))) return null;
    let response;
    try { response = await io.fetch(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'manual' }); } catch { return null; }
    if (response.status < 300 || response.status >= 400) return response.ok ? response : null;
    const next = response.headers.get('location');
    if (!next) return null;
    try { url = new URL(next, url).toString(); } catch { return null; }
  }
  return null;
}

async function readSource(io) {
  const [dump, triggers, surveys] = await Promise.all(['dump', 'triggers', 'surveys'].map(name => io.readPart(name).then(text => JSON.parse(text))));
  return { dump, triggers, surveys };
}

/** Baixa as próximas pré-visualizações de página (uma linha temporária por página; '' quando falhou). */
async function stepPages(job, io) {
  const { dump } = await readSource(io);
  const pages = pagesOf(dump);
  if (job.status === 'received') {
    job.status = 'pages';
    job.pagesTotal = pages.length;
    job.pagesDone = 0;
    job.location = String(dump.location?.location?.name || dump.location?.name || 'Subconta').trim().slice(0, 80) || 'Subconta';
    for (const text of dump.errors || []) note(job, `Não consegui ler: ${text}`);
  }
  const batch = pages.slice(job.pagesDone, job.pagesDone + PAGES_PER_STEP);
  await Promise.all(batch.map(async ({ pageId }) => {
    const response = await download(io, PREVIEW(pageId));
    const html = response ? await response.text().catch(() => '') : '';
    await io.writeTemp(`page-${pageId}`, { html: /<html|<body/i.test(html) ? html : '' });
  }));
  job.pagesDone += batch.length;
  if (job.pagesDone >= job.pagesTotal) job.status = 'converting';
}

/** Roda o conversor e guarda o resultado; as imagens das páginas viram a fila do próximo passo. */
async function stepConvert(job, io) {
  const source = await readSource(io);
  const html = new Map();
  for (const { pageId } of pagesOf(source.dump)) html.set(pageId, (await io.readTemp(`page-${pageId}`))?.html || '');
  const { assets, sites, notes } = convert({ ...source, page: id => html.get(id) || '' }, { prefix: 'gi' });
  for (const text of notes) note(job, text);
  // Limites da soci: 50 páginas por site e o tamanho máximo de cada página.
  for (const project of assets.studioProjects || []) {
    let pages = sites[project.id] || [];
    if (pages.length > SITE_LIMITS.pages) {
      note(job, `O site "${project.name}" tinha ${pages.length} páginas; entraram as primeiras ${SITE_LIMITS.pages}.`);
      pages = pages.slice(0, SITE_LIMITS.pages);
      project.pages = (project.pages || []).slice(0, SITE_LIMITS.pages);
    }
    sites[project.id] = pages.map(page => {
      if (page.html.length <= SITE_LIMITS.html) return page;
      note(job, `A página "${page.name}" passou do tamanho máximo e entrou só com o título.`);
      return { ...page, html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${page.name}</title></head><body><h1>${page.name}</h1></body></html>` };
    });
  }
  const images = [...new Set(Object.values(sites).flatMap(pages => pages.flatMap(page => imageUrls(page.html))))];
  await io.writeTemp('converted', { assets, sites, images, copied: {} });
  job.imagesTotal = images.length;
  job.imagesDone = 0;
  job.status = images.length ? 'images' : 'saving';
}

/** Copia as próximas imagens para os assets da soci (as que falham continuam no endereço do GHL). */
async function stepImages(job, io) {
  const converted = await io.readTemp('converted');
  const batch = converted.images.slice(job.imagesDone, job.imagesDone + IMAGES_PER_STEP);
  const found = new Map();
  await Promise.all(batch.map(async url => {
    const response = await downloadImage(io, url);
    const mime = String(response?.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = response && EXT[mime] ? Buffer.from(await response.arrayBuffer().catch(() => new ArrayBuffer(0))) : null;
    if (!bytes?.length || bytes.length > IMAGE_MAX) { job.imagesFailed = (job.imagesFailed || 0) + 1; return; }
    const hash = createHash('sha256').update(bytes).digest('hex');
    found.set(hash, { hash, mime, data: bytes.toString('base64') });
    converted.copied[url] = `${io.origin}/asset/${hash}.${EXT[mime]}`;
  }));
  if (found.size) await io.saveImages(found);
  await io.writeTemp('converted', converted);
  job.imagesDone += batch.length;
  if (job.imagesDone >= job.imagesTotal) job.status = 'saving';
}

/** Troca os endereços das imagens, cria os sites e grava o setup em Importados. */
async function stepSave(job, io) {
  const { assets: rawAssets, sites: rawSites, copied } = await io.readTemp('converted');
  const map = new Map();
  for (const [from, to] of Object.entries(copied || {})) {
    map.set(from, to);
    if (from.includes('&')) map.set(from.replace(/&/g, '&amp;'), to);
  }
  const assets = replaceUrls(rawAssets, map), sites = replaceUrls(rawSites, map);
  if (job.imagesFailed) note(job, `${job.imagesFailed === 1 ? '1 imagem não pôde ser copiada e continua' : `${job.imagesFailed} imagens não puderam ser copiadas e continuam`} no endereço do GHL.`);
  const docs = Object.fromEntries((assets.studioProjects || []).filter(project => sites[project.id]?.length)
    .map(project => [project.id, newSiteDoc({ workspace: '', project, pages: sites[project.id] })]));
  const counts = Object.fromEntries(Object.entries(assets).filter(([, list]) => Array.isArray(list)).map(([key, list]) => [key, list.length]));
  const id = uid();
  await io.saveSites(id, docs);
  const now = stamp();
  const snapshotId = await io.addSetup({ id, name: `${job.location} (GHL)`.slice(0, 100), kind: 'imported', origin: 'ghl', include: Object.keys(assets), assets, counts,
    version: 1, created: now, updated: now, importedAt: now, shareCode: '', shared: false, sitesStored: true, notes: [...job.notes] });
  job.snapshotId = snapshotId;
  job.status = 'done';
  await io.clearTemp();
}

/** Roda um passo da importação e atualiza o job (no lugar). */
export async function runStep(job, io) {
  try {
    if (job.status === 'received' || job.status === 'pages') return await stepPages(job, io);
    if (job.status === 'converting') return await stepConvert(job, io);
    if (job.status === 'images') return await stepImages(job, io);
    if (job.status === 'saving') return await stepSave(job, io);
  } catch (problem) {
    job.status = 'failed';
    job.error = problem.status && problem.status < 500 ? problem.message : `A conversão parou: ${problem.message}`;
    await io.clearTemp().catch(() => {});
  }
}
