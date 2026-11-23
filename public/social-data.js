// Social Planner: the networks, post rules and calendar helpers shared by the server (social-model.mjs,
// social-providers.mjs) and the browser (social.js). Nothing here touches tokens or the network.

// [id, name, colour, short glyph, group, character limit, what the network needs to publish]
export const networks = [
  { id: 'facebook', name: 'Facebook', color: '#1877f2', glyph: 'f', group: 'major', limit: 63206, kind: 'Página', env: ['META_APP_ID', 'META_APP_SECRET'] },
  { id: 'instagram', name: 'Instagram', color: '#e1306c', glyph: 'IG', group: 'major', limit: 2200, kind: 'Conta profissional', needsMedia: true, env: ['META_APP_ID', 'META_APP_SECRET'] },
  { id: 'linkedin', name: 'LinkedIn', color: '#0a66c2', glyph: 'in', group: 'major', limit: 3000, kind: 'Perfil', env: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] },
  { id: 'tiktok', name: 'TikTok', color: '#111111', glyph: 'TT', group: 'major', limit: 2200, kind: 'Conta', needsMedia: true, env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] },
  { id: 'youtube', name: 'YouTube', color: '#ff0000', glyph: 'YT', group: 'major', limit: 5000, kind: 'Canal', needsVideo: true, env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { id: 'pinterest', name: 'Pinterest', color: '#e60023', glyph: 'P', group: 'more', limit: 500, kind: 'Pasta', needsMedia: true, env: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'] },
  { id: 'threads', name: 'Threads', color: '#000000', glyph: '@', group: 'more', limit: 500, kind: 'Perfil', env: ['THREADS_APP_ID', 'THREADS_APP_SECRET'] },
  { id: 'bluesky', name: 'Bluesky', color: '#1185fe', glyph: 'B', group: 'more', limit: 300, kind: 'Perfil', password: true, env: [] },
  { id: 'gbp', name: 'Google Business', color: '#34a853', glyph: 'G', group: 'more', limit: 1500, kind: 'Local', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] }
];
export const network = id => networks.find(n => n.id === id);

export const postStatuses = ['draft', 'in_review', 'scheduled', 'in_progress', 'published', 'failed'];
export const statusLabel = { draft: 'Rascunho', in_review: 'Em revisão', scheduled: 'Agendado', in_progress: 'Publicando', published: 'Publicado', failed: 'Falhou' };
export const statusTone = { draft: '', in_review: 'amber', scheduled: 'blue', in_progress: 'blue', published: 'green', failed: 'red' };
export const postTypes = [['post', 'Post'], ['story', 'Story'], ['reel', 'Reel / vídeo curto']];
export const recurrences = [['', 'Não repetir'], ['daily', 'Todo dia'], ['weekly', 'Toda semana'], ['monthly', 'Todo mês']];
export const csvColumns = ['date', 'content', 'accounts', 'link', 'media', 'category', 'first_comment'];
export const bulkCsvColumns = {
  basic: ['postAtSpecificTime', 'content', 'link (OGmetaUrl)', 'imageUrls', 'videoUrls', 'gifUrl'],
  advanced: ['postAtSpecificTime', 'content', 'link (OGmetaUrl)', 'imageUrls', 'videoUrls', 'gifUrl', 'type', 'tags', 'category', 'followUpComment', 'accounts']
};
export const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const isVideo = url => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url || '');
export const mediaKind = m => m?.type || (isVideo(m?.url) ? 'video' : 'image');

/** Problems that stop a post from publishing on the selected accounts. Empty when it can go out. */
export function postIssues(post, accounts) {
  const issues = [];
  const chosen = accounts.filter(a => (post.accountIds || []).includes(a.id));
  if (!chosen.length) issues.push('Escolha ao menos uma conta.');
  const media = post.media || [];
  const videos = media.filter(m => mediaKind(m) === 'video').length;
  for (const id of [...new Set(chosen.map(a => a.provider))]) {
    const n = network(id); if (!n) continue;
    const text = textFor(post, id);
    if (text.length > n.limit) issues.push(`${n.name}: o texto passa de ${n.limit} caracteres (${text.length}).`);
    if (n.needsMedia && !media.length) issues.push(`${n.name}: adicione uma imagem ou vídeo.`);
    if (n.needsVideo && !videos) issues.push(`${n.name}: adicione um vídeo.`);
    if (!text.trim() && !media.length) issues.push(`${n.name}: escreva um texto ou adicione mídia.`);
    if (id === 'tiktok' && media.length && !videos && media.length > 35) issues.push('TikTok: até 35 fotos por carrossel.');
    if (id === 'instagram' && media.length > 10) issues.push('Instagram: até 10 itens por carrossel.');
    if (id === 'bluesky' && media.length > 4) issues.push('Bluesky: até 4 imagens.');
    if (id === 'bluesky' && videos && (videos > 1 || media.length > videos)) issues.push('Bluesky: um vídeo por post, sem imagens junto.');
    if ((post.type === 'reel' || post.type === 'story') && !['facebook', 'instagram'].includes(id)) issues.push(`${n.name}: stories e reels só valem para Facebook e Instagram.`);
    if (post.type === 'reel' && !videos) issues.push('Reels precisam de um vídeo.');
  }
  return [...new Set(issues)];
}
export const textFor = (post, provider) => (post.overrides?.[provider] ?? post.summary ?? '');

/** Wall-clock parts of an instant in a time zone (falls back to UTC for an unknown zone). */
export function zonedParts(iso, zone = 'UTC') {
  let f;
  try { f = new Intl.DateTimeFormat('en-US', { timeZone: zone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
/** The instant whose wall clock in `zone` is the given date and time (DST gaps move forward). */
export function zonedIso({ y, m, d, h = 0, mi = 0, s = 0 }, zone = 'UTC') {
  const wall = Date.UTC(y, m - 1, d, h, mi, s);
  const offset = t => { const p = zonedParts(new Date(t).toISOString(), zone); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t; };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return new Date(t).toISOString();
}
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);

/**
 * Next date of a recurring post after `from`, or '' when the series ended. Dates move on the wall
 * clock of `zone`, so a 9:00 post stays at 9:00 across daylight saving. `recurrence.anchor` is the
 * first date of the series: monthly posts keep its day (31 → last day of shorter months) and weekly
 * posts with `days` count weeks from it. `count` ends the series after that many posts (`done`).
 */
export function nextOccurrence(iso, recurrence, from = iso, zone = 'UTC') {
  if (!recurrence?.freq || !iso) return '';
  if (recurrence.count && (recurrence.done || 0) >= recurrence.count) return '';
  const step = Math.max(1, Math.min(30, Number(recurrence.interval) || 1));
  const anchor = zonedParts(recurrence.anchor || iso, zone), cur = zonedParts(iso, zone);
  const days = recurrence.freq === 'weekly' && Array.isArray(recurrence.days) && recurrence.days.length ? recurrence.days : null;
  const after = Date.parse(from), weekStart = dayNumber(anchor.y, anchor.m, anchor.d) - weekday(anchor.y, anchor.m, anchor.d);
  let { y, m, d } = cur, months = (cur.y - anchor.y) * 12 + (cur.m - anchor.m), at = iso;
  for (let guard = 0; guard < 5000 && Date.parse(at) <= after; guard++) {
    if (recurrence.freq === 'daily') ({ y, m, d } = zonedParts(new Date(Date.UTC(y, m - 1, d + step, 12)).toISOString(), 'UTC'));
    else if (recurrence.freq === 'weekly' && !days) ({ y, m, d } = zonedParts(new Date(Date.UTC(y, m - 1, d + 7 * step, 12)).toISOString(), 'UTC'));
    else if (days) {
      ({ y, m, d } = zonedParts(new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString(), 'UTC'));
      const week = Math.floor((dayNumber(y, m, d) - weekStart) / 7);
      if (!days.includes(weekday(y, m, d)) || week % step) continue;
    } else {
      months += step;
      y = anchor.y + Math.floor((anchor.m - 1 + months) / 12); m = ((anchor.m - 1 + months) % 12 + 12) % 12 + 1;
      d = Math.min(anchor.d, daysIn(y, m));
    }
    at = zonedIso({ y, m, d, h: cur.h, mi: cur.mi }, zone);
  }
  if (Date.parse(at) <= after) return '';
  if (recurrence.until && Date.parse(at) > Date.parse(recurrence.until)) return '';
  return at;
}

/** Planned occurrences of a recurring series inside [start, end), for the calendar. */
export function occurrencesBetween(post, start, end, max = 62, zone = 'UTC') {
  const out = []; if (!post.scheduleDate) return out;
  const r = post.recurrence, left = r?.count ? Math.max(0, r.count - (r.done || 0)) : Infinity;
  let at = post.scheduleDate, n = 0;
  while (at && Date.parse(at) < end && out.length < max && n < left) {
    if (Date.parse(at) >= start) out.push(at);
    n++;
    if (!r?.freq) break;
    at = nextOccurrence(at, { ...r, count: 0 }, at, zone);
  }
  return out;
}

// ---- Evergreen queue (shared with social-model.mjs) ----------------------------------------------
export const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const dateKey = p => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
const dayAfter = (p, n) => zonedParts(new Date(Date.UTC(p.y, p.m - 1, p.d + n, 12)).toISOString(), 'UTC');
export const weekdayOf = p => new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();

/** Posts of an evergreen category, oldest first. Without `recycle`, only those never sent from the queue. */
export function queuePool(s, c) {
  return s.socialPosts.filter(p => p.categoryId === c.id && !p.parentId && ['published', 'draft'].includes(p.status) && p.source !== 'queue' && (c.recycle !== false || !p.queueRuns))
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
}
export const queuePick = (c, pool) => c.recycle === false ? pool[0] : pool[(c.cursor || 0) % pool.length];

/** The post the queue sends next and when, for the category card. */
export function queueNext(s, c, at = new Date(), zone = 'UTC') {
  if (!c.evergreen || !c.slots?.length) return null;
  const pool = queuePool(s, c); if (!pool.length) return { post: null, at: '' };
  const post = queuePick(c, pool), today = zonedParts(at.toISOString(), zone), clock = today.h * 60 + today.mi;
  for (let n = 0; n < 8; n++) {
    const d = dayAfter(today, n);
    for (const slot of c.slots.filter(x => x.day === weekdayOf(d)).sort((a, b) => a.time.localeCompare(b.time))) {
      if (`${dateKey(d)} ${slot.time}` <= (c.lastSlot || '') || (!n && minutes(slot.time) <= clock - 60)) continue;
      return { post, at: zonedIso({ y: d.y, m: d.m, d: d.d, h: Number(slot.time.slice(0, 2)), mi: Number(slot.time.slice(3, 5)) }, zone) };
    }
  }
  return { post, at: '' };
}


// Times when each network's audience is usually most active, as starting points for testing. Keyed by
// weekday group: wd = Mon–Fri, peak = Tue–Thu (extra slots on top of wd), we = Sat–Sun.
const audienceWindows = {
  facebook: { wd: ['09:00', '13:00', '15:00'], peak: ['11:00'], we: ['10:00', '12:00'] },
  instagram: { wd: ['11:00', '13:00', '19:00'], peak: ['12:00', '18:00'], we: ['10:00', '17:00'] },
  linkedin: { wd: ['08:00', '12:00', '17:00'], peak: ['10:00'], we: [] },
  tiktok: { wd: ['12:00', '19:00', '21:00'], peak: ['17:00'], we: ['11:00', '20:00'] },
  youtube: { wd: ['15:00', '18:00'], peak: ['17:00'], we: ['10:00', '14:00'] },
  pinterest: { wd: ['14:00', '20:00', '21:00'], peak: [], we: ['16:00', '21:00'] },
  threads: { wd: ['09:00', '12:00', '18:00'], peak: [], we: ['11:00'] },
  bluesky: { wd: ['09:00', '12:00', '18:00'], peak: [], we: ['11:00'] },
  gbp: { wd: ['09:00', '12:00'], peak: [], we: ['10:00'] }
};
const fallbackWindows = { wd: ['09:00', '12:00', '18:00'], peak: [], we: ['11:00'] };

/**
 * Suggested posting times for a day: slots recommended by the most of the chosen networks first,
 * then the ones that fit the times this workspace already published at, earliest first.
 * `day` is the weekday (0 = Sunday). `busy` lists HH:MM already taken; slots within 30 min are skipped.
 */
export function bestTimes(providers, day, { history = [], busy = [], limit = 4 } = {}) {
  const ids = [...new Set(providers)].filter(id => network(id));
  const score = new Map();
  for (const id of ids.length ? ids : ['']) {
    const w = audienceWindows[id] || fallbackWindows;
    const slots = day === 0 || day === 6 ? w.we : [...w.wd, ...(day >= 2 && day <= 4 ? w.peak : [])];
    for (const slot of slots) score.set(slot, (score.get(slot) || 0) + 1);
  }
  const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const habit = slot => history.filter(t => Math.abs(minutes(t) - minutes(slot)) <= 60).length;
  const clash = slot => busy.some(t => Math.abs(minutes(t) - minutes(slot)) < 30);
  return [...score].filter(([slot]) => !clash(slot))
    .sort((a, b) => b[1] - a[1] || habit(b[0]) - habit(a[0]) || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([time, votes]) => ({ time, networks: votes, habit: habit(time) > 0 }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Minimal CSV reader (comma or semicolon) used by the bulk scheduler. */
export function parseCsv(csv) {
  const source = String(csv || '').replace(/^﻿/, ''), sep = source.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows = []; let row = [], value = '', quoted = false;
  const push = () => { row.push(value); if (row.some(x => x.trim())) rows.push(row); row = []; value = ''; };
  for (let n = 0; n < source.length; n++) {
    const ch = source[n];
    if (quoted) { if (ch === '"' && source[n + 1] === '"') { value += '"'; n++; } else if (ch === '"') quoted = false; else value += ch; }
    else if (ch === '"' && !value) quoted = true;
    else if (ch === sep) { row.push(value); value = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && source[n + 1] === '\n') n++; push(); }
    else value += ch;
  }
  if (quoted) throw Error('Uma aspa do CSV não foi fechada.');
  push();
  const keys = (rows.shift() || []).map(k => k.trim().toLowerCase());
  return rows.map(r => Object.fromEntries(keys.map((k, n) => [k, (r[n] || '').trim()])));
}
