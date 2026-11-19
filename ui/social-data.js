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
    if ((post.type === 'reel' || post.type === 'story') && !['facebook', 'instagram'].includes(id)) issues.push(`${n.name}: stories e reels só valem para Facebook e Instagram.`);
    if (post.type === 'reel' && !videos) issues.push('Reels precisam de um vídeo.');
  }
  return [...new Set(issues)];
}
export const textFor = (post, provider) => (post.overrides?.[provider] ?? post.summary ?? '');

/** Next date of a recurring post after `from`, or '' when the series ended. */
export function nextOccurrence(iso, recurrence, from = iso) {
  if (!recurrence?.freq || !iso) return '';
  const step = Math.max(1, Math.min(30, Number(recurrence.interval) || 1));
  let d = new Date(iso); const after = Date.parse(from);
  for (let guard = 0; guard < 2000 && +d <= after; guard++) {
    if (recurrence.freq === 'daily') d.setUTCDate(d.getUTCDate() + step);
    else if (recurrence.freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * step);
    else d.setUTCMonth(d.getUTCMonth() + step);
  }
  if (recurrence.until && +d > Date.parse(recurrence.until)) return '';
  return d.toISOString();
}

/** Planned occurrences of a recurring series inside [start, end), for the calendar. */
export function occurrencesBetween(post, start, end, max = 62) {
  const out = []; if (!post.scheduleDate) return out;
  let at = post.scheduleDate;
  while (at && Date.parse(at) < end && out.length < max) {
    if (Date.parse(at) >= start) out.push(at);
    if (!post.recurrence?.freq) break;
    at = nextOccurrence(at, post.recurrence);
  }
  return out;
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
