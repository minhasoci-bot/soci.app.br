// Social Planner records of a sub-account: connected accounts (public part only; tokens live in the
// separate `social-<workspace>` row handled by social-providers.mjs), posts, categories with an
// evergreen queue, hashtag groups and RSS feeds. model.mjs routes `social-*` commands and saves here.
import { dateKey, minutes, network, networks, nextOccurrence, postIssues, postStatuses, postTypes, queuePick, queuePool, weekdayOf, weekdays, zonedIso, zonedParts } from './ui/social-data.js';
export { queueNext, queuePool } from './ui/social-data.js';

export const socialCollections = ['socialAccounts', 'socialPosts', 'socialCategories', 'socialHashtags', 'socialFeeds', 'socialImports', 'socialWebhooks', 'socialCompetitors'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} é obrigatório.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Escolha ${label} válido.`);
const instant = (value, label = 'uma data') => {
  const v = str(value, 40); if (!v) return '';
  const d = new Date(v); if (!Number.isFinite(+d)) fail(`Informe ${label} válida.`);
  return d.toISOString();
};
const web = (value, label = 'link') => {
  const v = str(value, 2000); if (!v) return '';
  try { const u = new URL(v); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) return u.href; } catch { /* reported below */ }
  return fail(`Informe um ${label} válido (http ou https).`);
};
const color = value => /^#[0-9a-f]{6}$/i.test(str(value)) ? str(value).toLowerCase() : '#ea580c';
const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(str(value)) ? str(value) : fail('Informe um horário no formato HH:MM.');
const list = value => Array.isArray(value) ? value : typeof value === 'string' && value ? value.split(',') : [];
const keywords = value => [...new Set(list(value).map(v => str(v, 60).toLowerCase()).filter(Boolean))].slice(0, 30);
const zoneOf = s => s.profile?.timezone || 'UTC';

function media(s, value) {
  const items = Array.isArray(value) ? value.slice(0, 35) : [];
  return items.map(m => {
    if (m?.fileId) {
      const file = s.files.find(f => f.id === m.fileId) || fail('Um arquivo de mídia não existe mais.');
      if (!file.data.startsWith('data:image/')) fail('Apenas imagens do Mídia Drive podem ir em posts.');
      return { fileId: file.id, type: 'image', name: file.name };
    }
    const url = web(m?.url, 'endereço de mídia');
    const type = m?.type === 'video' || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'image';
    return { url, type };
  });
}
const accountIds = (s, value) => {
  const ids = [...new Set(list(value).map(v => str(v, 60)).filter(Boolean))];
  for (const id of ids) if (!s.socialAccounts.some(a => a.id === id)) fail('Uma das contas escolhidas foi desconectada.');
  return ids;
};
/** A repeat rule. Weekly rules may pick weekdays; `count` ends the series after N posts. */
function recurrence(value, start, prior) {
  if (!value?.freq) return null;
  const freq = one(value.freq, ['daily', 'weekly', 'monthly'], 'uma repetição');
  const until = value.until ? instant(value.until.length === 10 ? `${value.until}T23:59:59Z` : value.until, 'uma data final') : '';
  if (until && start && until < start) fail('A data final da repetição vem antes do primeiro post.');
  const days = freq === 'weekly' ? [...new Set(list(value.days).map(Number))].filter(n => Number.isInteger(n) && n >= 0 && n <= 6).sort() : [];
  const count = Math.max(0, Math.min(500, Math.round(Number(value.count) || 0)));
  const done = prior?.freq ? Math.min(prior.done || 0, count || Infinity) : 0;
  return { freq, interval: Math.max(1, Math.min(30, Math.round(Number(value.interval) || 1))), until, days, count, done, anchor: prior?.anchor || start || '' };
}
function overrides(value) {
  const out = {};
  for (const n of networks) if (typeof value?.[n.id] === 'string' && value[n.id].trim()) out[n.id] = value[n.id].slice(0, 63206);
  return out;
}

/** Validated post content. `mode` decides the status: draft, schedule (or review) or now. */
function postFields(s, d, prior) {
  const type = one(d.type || 'post', postTypes.map(t => t[0]), 'um tipo de post');
  const post = {
    type, summary: str(d.summary, 63206), overrides: overrides(d.overrides), accountIds: accountIds(s, d.accountIds),
    media: media(s, d.media), link: web(d.link), firstComment: str(d.firstComment, 2200),
    location: str(d.location, 120), userTags: str(d.userTags, 240),
    categoryId: d.categoryId ? (s.socialCategories.find(c => c.id === d.categoryId)?.id ?? fail('Escolha uma categoria válida.')) : '',
    tags: [...new Set(list(d.tags).map(t => str(t, 40)).filter(Boolean))].slice(0, 20),
    needsApproval: Boolean(d.needsApproval), source: prior?.source || one(d.source || 'post', ['post', 'csv', 'rss', 'recurring', 'queue', 'event-planner'], 'uma origem')
  };
  const mode = one(d.mode || 'draft', ['draft', 'schedule', 'now'], 'como publicar');
  post.scheduleDate = mode === 'now' ? new Date().toISOString() : instant(d.scheduleDate, 'uma data de publicação');
  post.recurrence = recurrence(d.recurrence, post.scheduleDate, prior?.scheduleDate === post.scheduleDate ? prior?.recurrence : null);
  if (post.recurrence && !post.recurrence.anchor) post.recurrence.anchor = post.scheduleDate;
  if (post.recurrence?.days.length && post.scheduleDate) {
    const day = new Date(zonedIso(zonedParts(post.scheduleDate, zoneOf(s)), 'UTC')).getUTCDay();
    if (!post.recurrence.days.includes(day)) fail(`O primeiro post cai em ${weekdays[day]}, que não está entre os dias escolhidos para repetir.`);
  }
  if (mode === 'draft') { post.status = 'draft'; return post; }
  if (!post.scheduleDate) fail('Escolha quando publicar.');
  if (mode === 'schedule' && Date.parse(post.scheduleDate) < Date.now() - 60_000) fail('Escolha uma data no futuro ou use “Publicar agora”.');
  const issues = postIssues(post, s.socialAccounts);
  if (issues.length) fail(issues.join(' '));
  post.status = post.needsApproval && prior?.approval !== 'approved' ? 'in_review' : 'scheduled';
  post.approval = post.needsApproval ? (post.status === 'in_review' ? 'pending' : 'approved') : '';
  return post;
}

export const socialFields = {
  socialCategories: (s, d) => {
    const name = req(d.name, 'Nome da categoria', 60);
    if (s.socialCategories.some(c => c.id !== d.id && c.name.toLowerCase() === name.toLowerCase())) fail(`A categoria “${name}” já existe.`);
    const slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 21).map(x => ({ day: one(Number(x?.day), [0, 1, 2, 3, 4, 5, 6], 'um dia'), time: time(x?.time) }));
    if (d.evergreen && !slots.length) fail('Adicione ao menos um horário para a fila evergreen.');
    const ids = d.evergreen ? accountIds(s, d.accountIds) : [];
    if (d.evergreen && !ids.length) fail('Escolha ao menos uma conta para a fila evergreen.');
    // recycle: when every post went out, start over (default). Off: each post goes out once from the queue.
    return { name, color: color(d.color), evergreen: Boolean(d.evergreen), slots, accountIds: ids, recycle: d.recycle === undefined ? true : Boolean(d.recycle) };
  },
  socialHashtags: (s, d) => {
    const tags = [...new Set(str(d.tags, 3000).split(/[\s,]+/).map(t => t.replace(/^#*/, '')).filter(t => /^[\p{L}\p{N}_]{1,60}$/u.test(t)))].slice(0, 60);
    if (!tags.length) fail('Adicione ao menos uma hashtag.');
    return { name: req(d.name, 'Nome do grupo', 60), tags };
  },
  socialFeeds: (s, d) => ({
    name: req(d.name, 'Nome do feed', 80), url: web(req(d.url, 'Endereço do feed', 2000), 'endereço de feed'),
    accountIds: accountIds(s, d.accountIds).length ? accountIds(s, d.accountIds) : fail('Escolha ao menos uma conta para o feed.'),
    mode: one(d.mode || 'draft', ['draft', 'schedule'], 'o modo do feed'), template: str(d.template, 1000) || '{{title}}\n\n{{link}}',
    active: d.active === undefined ? true : Boolean(d.active),
    // Only items whose title or text has one of `include` (and none of `exclude`) become posts.
    include: keywords(d.include), exclude: keywords(d.exclude),
    images: d.images === undefined ? true : Boolean(d.images),
    categoryId: d.categoryId ? (s.socialCategories.find(c => c.id === d.categoryId)?.id ?? fail('Escolha uma categoria válida.')) : '',
    spacing: Math.max(0, Math.min(1440, Math.round(Number(d.spacing ?? 60) || 0))),
    perCheck: Math.max(1, Math.min(10, Math.round(Number(d.perCheck) || 3)))
  }),
  socialWebhooks: (s, d) => ({
    name: req(d.name, 'Nome do webhook', 80),
    url: web(req(d.url, 'URL do webhook', 2000), 'endereço do webhook'),
    events: (Array.isArray(d.events) ? d.events : []).filter(e => ['post.published', 'post.failed', 'account.disconnected'].includes(e)),
    active: d.active === undefined ? true : Boolean(d.active)
  }),
  socialCompetitors: (s, d) => ({
    name: req(d.name, 'Nome do concorrente', 80),
    handle: req(d.handle, 'Perfil (@usuario)', 80).replace(/^@/, ''),
    network: one(d.network || 'instagram', ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'], 'uma rede'),
    followers: Math.max(0, Math.min(1e9, Math.round(Number(d.followers) || 0))),
    postsPerWeek: Math.max(0, Math.min(100, Math.round(Number(d.postsPerWeek) || 0))),
    notes: str(d.notes, 500)
  })
};

export function socialBeforeDelete(s, key, id) {
  if (key === 'socialCategories') for (const p of s.socialPosts) if (p.categoryId === id) p.categoryId = '';
  if (key === 'files') for (const p of s.socialPosts) if (p.status !== 'published') p.media = (p.media || []).filter(m => m.fileId !== id);
}

const findPost = (s, id) => s.socialPosts.find(p => p.id === id) || fail('Post não encontrado.', 404);
const editable = p => { if (p.status === 'in_progress') fail('Este post está sendo publicado agora.', 409); };

function csvDate(value, zone) {
  const raw = str(value, 40);
  if (!raw) return '';
  const ymd = raw.match(/^(\d{4})[-/](\d\d)[-/](\d\d)[ T](\d{1,2}):(\d\d)(?::(\d\d))?(Z|[+-]\d\d:?\d\d)?$/i);
  const mdy = raw.match(/^(\d\d)[-/](\d\d)[-/](\d{4}) (\d{1,2}):(\d\d)(?::(\d\d))?$/);
  if (!ymd && !mdy) fail('Use data no formato AAAA-MM-DD HH:MM.');
  const [, y, m, d, hour, minute, sec = '00', offset] = ymd || [null, mdy[3], mdy[1], mdy[2], ...mdy.slice(4)];
  const local = `${y}-${m}-${d}T${hour.padStart(2, '0')}:${minute}:${sec}`;
  const target = Date.parse(local + 'Z');
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 19) !== local) fail('Data ou horário inválido.');
  if (offset) return instant(local + offset);
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let at = target;
  for (let n = 0; n < 4; n++) {
    const seen = fmt.format(new Date(at)).replace(' ', 'T');
    if (seen === local) return new Date(at).toISOString();
    at += target - Date.parse(seen + 'Z');
  }
  return fail('O horário não existe nesse fuso.');
}

export function reviewSocialCsv(s, d) {
  const rows = Array.isArray(d.rows) ? d.rows : [];
  if (!rows.length || rows.length > 300) fail('Importe entre 1 e 300 posts por arquivo.');
  const selected = d.accountIds === undefined ? s.socialAccounts.map(a => a.id) : accountIds(s, d.accountIds);
  const destinations = s.socialAccounts.filter(a => selected.includes(a.id));
  const zone = s.profile.timezone || 'America/Sao_Paulo';
  const split = (value, sep) => str(value, 8000).split(sep).map(x => x.trim()).filter(Boolean);
  return Array.from(rows, (row, index) => {
    try {
      if (!row || typeof row !== 'object') fail('Linha inválida.');
      const wanted = str(row.accounts, 2000).toLowerCase();
      const ids = !wanted || ['all', 'todas'].includes(wanted) ? selected : split(wanted, '|').map(name => {
        const matches = destinations.filter(a => a.name.toLowerCase() === name);
        if (matches.length > 1) fail(`mais de uma conta chamada “${name}”; selecione apenas uma delas`);
        return matches[0]?.id || fail(`conta “${name}” não selecionada ou desconectada`);
      });
      const category = row.category ? s.socialCategories.find(c => c.name.toLowerCase() === str(row.category).toLowerCase())?.id || fail(`categoria “${row.category}” não existe`) : '';
      const raw = str(row.date || row.postatspecifictime, 40);
      const scheduleDate = csvDate(raw, zone);
      const videos = split(row.videourls, /[|,]/), images = split(row.imageurls, /[|,]/), gif = str(row.gifurl, 2000);
      const legacyMedia = split(row.media, '|');
      if (videos.length > 1) fail('Use até um vídeo por post.');
      if (gif && (videos.length || images.length || legacyMedia.length)) fail('Use o GIF sem outras mídias.');
      if (!str(row.content, 63206) && !legacyMedia.length && !images.length && !videos.length && !gif) fail('Escreva um texto ou adicione mídia.');
      const fields = postFields(s, { summary: row.content, accountIds: ids, link: row.link || row['link (ogmetaurl)'] || row.ogmetaurl,
        type: str(row.type).toLowerCase() || 'post', firstComment: row.first_comment || row.followupcomment, categoryId: category, tags: row.tags,
        media: [...legacyMedia.map(url => ({ url })), ...images.map(url => ({ url, type: 'image' })), ...videos.map(url => ({ url, type: 'video' })), ...(gif ? [{ url: gif, type: 'image' }] : [])],
        scheduleDate, mode: d.asDraft || !scheduleDate ? 'draft' : 'schedule', needsApproval: d.needsApproval, source: 'csv' });
      return { index, fields };
    } catch (e) { if (!e.status) throw e; return { index, error: e.message }; }
  });
}

/** `social-*` commands of /api/action. Returns the id the client should focus. */
export function socialCommand(s, command, { add, now }) {
  const { type, id, data: d = {} } = command;
  switch (type) {
    case 'social-post': {
      const prior = id ? findPost(s, id) : null;
      if (prior) { editable(prior); if (prior.status === 'published') fail('Posts publicados não podem ser editados. Duplique para reutilizar.', 409); }
      const fields = postFields(s, d, prior);
      if (prior) { Object.assign(prior, fields, { updated: now(), results: prior.results || [], error: '' }); return prior.id; }
      if (s.socialPosts.length >= 3000) fail('O planejador guarda até 3.000 posts. Exclua posts antigos.');
      return add(s, 'socialPosts', { ...fields, results: [], createdBy: str(command.actor, 120), error: '' }).id;
    }
    case 'social-reschedule': {
      const p = findPost(s, id); editable(p);
      if (p.status === 'published') fail('Posts publicados não podem ser reagendados.', 409);
      const at = instant(d.scheduleDate, 'uma data');
      if (Date.parse(at) < Date.now() - 60_000) fail('Escolha uma data no futuro.');
      p.scheduleDate = at; if (p.status === 'failed' || p.status === 'draft') p.status = p.needsApproval && p.approval !== 'approved' ? 'in_review' : 'scheduled';
      p.updated = now(); return p.id;
    }
    case 'social-review': {
      const p = findPost(s, id);
      if (p.status !== 'in_review') fail('Este post não está aguardando aprovação.', 409);
      const decision = one(d.decision, ['approved', 'rejected'], 'uma decisão');
      Object.assign(p, { approval: decision, reviewNote: str(d.note, 1000), reviewedBy: str(command.actor, 120), status: decision === 'approved' ? 'scheduled' : 'draft', updated: now() });
      return p.id;
    }
    case 'social-duplicate': {
      const p = findPost(s, id);
      const { id: _id, created: _c, results: _r, status: _s, error: _e, publishedAt: _p, approval: _a, ...copy } = structuredClone(p);
      return add(s, 'socialPosts', { ...copy, status: 'draft', approval: '', results: [], error: '', source: 'post', parentId: '' }).id;
    }
    case 'social-delete': {
      const p = findPost(s, id); editable(p);
      s.socialPosts = s.socialPosts.filter(x => x.id !== id && x.parentId !== id); return id;
    }
    case 'social-bulk-delete': {
      const ids = new Set(list(d.ids));
      s.socialPosts = s.socialPosts.filter(p => !ids.has(p.id) || p.status === 'in_progress'); return ids.size;
    }
    case 'social-retry': {
      const p = findPost(s, id);
      if (p.status !== 'failed') fail('Só posts com falha podem ser reenviados.', 409);
      p.status = 'scheduled'; p.scheduleDate = now(); p.error = ''; p.updated = now(); return p.id;
    }
    case 'social-csv': {
      const rows = reviewSocialCsv(s, d);
      const chosen = Array.isArray(d.includeIndices) ? new Set(d.includeIndices) : null;
      const selected = rows.filter(r => !chosen || chosen.has(r.index));
      if (d.requireValid && (!selected.length || selected.some(r => r.error))) fail('O lote mudou desde a revisão. Volte e valide as linhas novamente.', 409);
      const errors = rows.filter(r => r.error || (chosen && !chosen.has(r.index)))
        .map(r => `Linha ${r.index + 2}: ${r.error || 'Não selecionada na revisão.'}`);
      const valid = selected.filter(r => r.fields);
      if (s.socialPosts.length + valid.length > 3000) fail('O planejador guarda até 3.000 posts. Exclua posts antigos.');
      for (const { fields } of valid) add(s, 'socialPosts', { ...fields, results: [], createdBy: str(command.actor, 120), error: '' });
      add(s, 'socialImports', { file: str(d.file, 120), total: rows.length, count: valid.length, errors: errors.slice(0, 50) });
      if (s.socialImports.length > 50) s.socialImports.splice(0, s.socialImports.length - 50);
      return { created: valid.length, errors };
    }
    case 'social-account-remove': {
      const a = s.socialAccounts.find(x => x.id === id) || fail('Conta não encontrada.', 404);
      s.socialAccounts = s.socialAccounts.filter(x => x.id !== a.id);
      for (const p of s.socialPosts) {
        p.accountIds = p.accountIds.filter(x => x !== a.id);
        if (['scheduled', 'in_review'].includes(p.status) && !p.accountIds.length) { p.status = 'draft'; p.error = 'A conta deste post foi desconectada.'; }
      }
      for (const f of s.socialFeeds) f.accountIds = f.accountIds.filter(x => x !== a.id);
      for (const c of s.socialCategories) c.accountIds = (c.accountIds || []).filter(x => x !== a.id);
      return a.id;
    }
    default: return fail('Comando desconhecido.', 404);
  }
}

// ---- Server-side helpers (scheduler) -------------------------------------------------------------

/** Accounts attached after an OAuth round trip. Same external id = refresh the existing row. */
export function attachAccounts(s, picked, { uid, now }) {
  const ids = [];
  for (const a of picked) {
    const n = network(a.provider) || fail('Rede desconhecida.');
    const prior = s.socialAccounts.find(x => x.provider === n.id && x.externalId === a.externalId);
    const row = { provider: n.id, externalId: str(a.externalId, 200), name: str(a.name, 120) || n.name, handle: str(a.handle, 120),
      avatar: /^https:\/\//.test(a.avatar || '') ? a.avatar.slice(0, 1000) : '', kind: str(a.kind, 40) || n.kind, status: 'connected', error: '' };
    if (prior) { Object.assign(prior, row, { updated: now() }); ids.push(prior.id); continue; }
    if (s.socialAccounts.length >= 60) fail('Uma subconta pode conectar até 60 contas sociais.');
    const created = { id: uid(), created: now(), connectedAt: now(), ...row };
    s.socialAccounts.push(created); ids.push(created.id);
  }
  return ids;
}

/** Posts that should publish now, claimed (status in_progress) so a second runner skips them. */
export function claimDue(s, at = Date.now()) {
  const due = s.socialPosts.filter(p => p.status === 'scheduled' && p.scheduleDate && Date.parse(p.scheduleDate) <= at);
  // A claim older than 10 minutes means the runner died mid-way: let it try again.
  for (const p of s.socialPosts) if (p.status === 'in_progress' && Date.parse(p.claimedAt || 0) < at - 600_000) due.push(p);
  for (const p of due) { p.status = 'in_progress'; p.claimedAt = new Date(at).toISOString(); }
  return due.map(p => structuredClone(p));
}

/**
 * Stores per-account results. A recurring post leaves a published copy and moves to its next date.
 * Returns what happened, for the "post published" workflow trigger.
 */
export function settle(s, postId, results, { uid, now, zone = zoneOf(s) }) {
  const p = s.socialPosts.find(x => x.id === postId); if (!p) return null;
  const failed = results.filter(r => !r.ok);
  const entry = results.map(r => ({ accountId: r.accountId, ok: r.ok, url: r.url || '', externalId: r.externalId || '', error: r.error || '', at: now() }));
  const status = failed.length === results.length ? 'failed' : 'published', error = failed.map(f => f.error).join(' · ');
  const outcome = { postId: p.id, status, summary: String(p.summary || '').slice(0, 500), source: p.source || 'post', categoryId: p.categoryId || '', url: entry.find(r => r.ok && r.url)?.url || '',
    networks: [...new Set(results.map(r => s.socialAccounts.find(a => a.id === r.accountId)?.provider).filter(Boolean))].join(','), failed: failed.length };
  delete p.claimedAt;
  if (p.recurrence?.freq) {
    const copy = { ...structuredClone(p), id: uid(), created: now(), recurrence: null, parentId: p.id, source: 'recurring', status, results: entry, publishedAt: now(), error };
    s.socialPosts.push(copy); outcome.postId = copy.id;
    p.recurrence.done = (p.recurrence.done || 0) + 1;
    const next = nextOccurrence(p.scheduleDate, p.recurrence, new Date().toISOString(), zone);
    if (next) { p.scheduleDate = next; p.status = 'scheduled'; p.results = []; p.error = ''; return outcome; }
    Object.assign(p, { status, results: entry, publishedAt: now(), error }); return outcome;
  }
  Object.assign(p, { results: entry, publishedAt: now(), status, error });
  if (p.source === 'queue' && p.parentId && status === 'published') {
    const original = s.socialPosts.find(x => x.id === p.parentId);
    if (original) original.lastQueuedAt = now();
  }
  return outcome;
}

/**
 * Evergreen queue: when a category slot is due, re-schedule the next post of that category on the
 * queue's accounts. Slots are read on the sub-account's wall clock and fire once, within an hour of
 * their time (a slot missed for longer is skipped, not published late).
 */
export function evergreenDue(s, at = new Date(), zone = 'UTC') {
  const p = zonedParts(at.toISOString(), zone), day = weekdayOf(p), clock = p.h * 60 + p.mi, created = [];
  for (const c of s.socialCategories.filter(x => x.evergreen && x.accountIds?.length)) {
    const slot = c.slots.filter(x => x.day === day && minutes(x.time) <= clock && clock - minutes(x.time) < 60).sort((a, b) => b.time.localeCompare(a.time))[0];
    if (!slot) continue;
    const key = `${dateKey(p)} ${slot.time}`;
    if ((c.lastSlot || '') >= key) continue;
    c.lastSlot = key;
    const pool = queuePool(s, c);
    if (!pool.length) continue;
    const pick = queuePick(c, pool);
    if (c.recycle !== false) c.cursor = ((c.cursor || 0) + 1) % pool.length;
    const copy = { ...structuredClone(pick), id: undefined, accountIds: c.accountIds, status: 'scheduled', scheduleDate: at.toISOString(), results: [], recurrence: null,
      source: 'queue', parentId: pick.id, approval: '', needsApproval: false, queueRuns: 0, lastQueuedAt: '' };
    if (postIssues(copy, s.socialAccounts).length) continue;
    pick.queueRuns = (pick.queueRuns || 0) + 1;
    created.push(copy);
  }
  return created;
}

// ---- RSS feeds ---------------------------------------------------------------------------------
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
  if (code[0] !== '#') return entities[code.toLowerCase()] ?? all;
  const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
});
const unwrap = raw => raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
// Entities are decoded before tags are stripped too, since many feeds escape their HTML (&lt;p&gt;).
const plain = raw => decode(decode(unwrap(raw)).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ''))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const httpUrl = value => { try { const u = new URL(decode(String(value || '').trim())); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

/** Items of an RSS 2.0 or Atom document: title, link, guid, plain-text summary and an image. */
export function parseFeed(xml) {
  return [...String(xml || '').matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(([block]) => {
    const raw = name => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
    const tags = name => [...block.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(([t]) => t);
    const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || '';
    const links = tags('link'), alternate = links.find(t => !/\brel=/i.test(t) || /\brel=["']alternate["']/i.test(t));
    const link = httpUrl(plain(raw('link'))) || httpUrl(attr(alternate || '', 'href'));
    const body = raw('content:encoded') || raw('description') || raw('summary') || raw('content');
    const image = [...tags('media:content'), ...tags('media:thumbnail'), ...tags('enclosure')]
      .filter(t => !/\b(type|medium)=["'](?!image)/i.test(t)).map(t => httpUrl(attr(t, 'url'))).find(Boolean)
      || httpUrl(decode(unwrap(body)).match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]);
    return { title: plain(raw('title')), link, guid: plain(raw('guid')) || plain(raw('id')) || link, summary: plain(body).slice(0, 3000), image };
  }).filter(item => item.guid);
}

const matches = (feed, item) => {
  const text = `${item.title}\n${item.summary}`.toLowerCase();
  return (!feed.include?.length || feed.include.some(k => text.includes(k))) && !(feed.exclude || []).some(k => text.includes(k));
};

/**
 * Turns the new items of a feed into posts: drafts, or scheduled `spacing` minutes apart starting
 * five minutes from now. The first read only takes the newest few, so old items are not reposted.
 */
export function feedPosts(s, feed, items, { at = Date.now(), uid, now }) {
  const seen = new Set(feed.seen || []), limit = feed.seen ? feed.perCheck || 5 : Math.min(3, feed.perCheck || 3);
  const fresh = items.filter(item => !seen.has(item.guid)).slice(0, limit).reverse();
  const accounts = feed.accountIds.filter(id => s.socialAccounts.some(a => a.id === id)), spacing = (feed.spacing ?? 60) * 60_000;
  const created = [];
  let next = Math.max(at + 5 * 60_000, Date.parse(feed.lastScheduled || 0) + spacing);
  for (const item of fresh.filter(item => matches(feed, item))) {
    if (s.socialPosts.length >= 3000) break;
    const summary = feed.template.replace(/\{\{\s*(title|link|summary)\s*\}\}/g, (_, k) => item[k] || '').slice(0, 5000);
    const post = { id: uid(), created: now(), type: 'post', summary, overrides: {}, accountIds: accounts, media: feed.images !== false && item.image ? [{ url: item.image, type: 'image' }] : [],
      link: item.link, firstComment: '', location: '', userTags: '', categoryId: feed.categoryId || '', tags: [], needsApproval: false, source: 'rss', feedId: feed.id,
      scheduleDate: '', recurrence: null, status: 'draft', approval: '', results: [], createdBy: feed.name, error: '' };
    if (feed.mode === 'schedule' && accounts.length) {
      post.scheduleDate = new Date(next).toISOString();
      const issues = postIssues(post, s.socialAccounts);
      if (issues.length) { post.error = issues.join(' '); post.scheduleDate = ''; }
      else { post.status = 'scheduled'; feed.lastScheduled = post.scheduleDate; next += spacing; }
    }
    s.socialPosts.push(post); created.push(post);
  }
  feed.seen = [...new Set([...items.map(item => item.guid), ...(feed.seen || [])])].slice(0, 300);
  return created;
}

// ---- Workflows ---------------------------------------------------------------------------------
const httpOnly = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
/** "Criar post social" action: a draft, or a post scheduled `delay` minutes ahead on the chosen accounts. */
export function workflowPost(s, config, text, { add }) {
  const summary = text(config.body).slice(0, 5000).trim();
  if (!summary) return { error: 'texto vazio' };
  const category = config.categoryId ? s.socialCategories.find(c => c.id === config.categoryId) : null;
  const ids = config.accountId ? [config.accountId] : category?.accountIds?.length ? category.accountIds : s.socialAccounts.filter(a => a.status === 'connected').map(a => a.id);
  const image = httpOnly(text(config.image || '').trim());
  const post = { type: 'post', summary, overrides: {}, accountIds: ids.filter(id => s.socialAccounts.some(a => a.id === id)), media: image ? [{ url: image, type: 'image' }] : [],
    link: httpOnly(text(config.link || '').trim()), firstComment: '', location: '', userTags: '', categoryId: category?.id || '', tags: [],
    needsApproval: config.approval === 'yes', source: 'workflow', scheduleDate: '', recurrence: null, status: 'draft', approval: '', results: [], createdBy: 'Automação', error: '' };
  if (config.mode === 'schedule') {
    post.scheduleDate = new Date(Date.now() + Math.max(0, Math.min(43200, Number(config.delay) || 0)) * 60_000).toISOString();
    const issues = postIssues(post, s.socialAccounts);
    if (issues.length) { post.error = issues.join(' '); post.scheduleDate = ''; }
    else { post.status = post.needsApproval ? 'in_review' : 'scheduled'; post.approval = post.needsApproval ? 'pending' : ''; }
  }
  if (s.socialPosts.length >= 3000) return { error: 'o planejador está cheio (3.000 posts)' };
  const row = add(s, 'socialPosts', post);
  return { id: row.id, status: row.status, problem: post.error };
}

export { postStatuses };
