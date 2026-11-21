// Communities 6.2: what a group configures beyond name and channels (access plans, theme, join questions,
// welcome message and onboarding steps, moderation, newsletter, tabs) and what is computed from activity
// (badges, analytics, the newsletter digest). Membership and activity live in the community document.
import { randomUUID } from 'node:crypto';
import { badgeCatalog, communityTabKeys, defaultTheme, planIntervals, spamPack, themePresets, themeTokens } from './ui/community-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const mail = value => { const email = str(value, 254).toLowerCase(); return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ? email : ''; };
const keepId = value => typeof value === 'string' && /^[\w-]{1,60}$/.test(value) ? value : randomUUID();
const https = (value, label) => { const link = str(value, 500); if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail(`${label} precisa começar com https://.`); return link; };
const DAY = 86400000;

/** The 6.2 settings of a group, merged over what it had. */
export function communityConfig(d, prior = {}) {
  const pick = key => d[key] === undefined ? prior[key] : d[key];
  // Access: free, or paid with up to 4 plans (monthly, yearly or once) and an optional free trial.
  const planInput = Array.isArray(pick('plans')) ? pick('plans') : [];
  if (planInput.length > 4) fail('Uma comunidade pode ter até 4 planos.');
  const plans = planInput.map(row => {
    const price = Math.round(Number(row?.price) * 100) / 100;
    if (!(price >= 1 && price <= 1e6)) fail('Cada plano custa a partir de R$ 1,00.');
    return { id: keepId(row?.id), name: str(row?.name, 60) || fail('Dê um nome a cada plano.'), price,
      interval: planIntervals.some(([key]) => key === row?.interval) ? row.interval : 'month' };
  });
  const access = pick('access') === 'paid' ? 'paid' : 'free';
  if (access === 'paid' && !plans.length) fail('Crie pelo menos um plano para cobrar o acesso.');
  const trialDays = Math.round(Number(pick('trialDays')) || 0);
  if (trialDays < 0 || trialDays > 30) fail('O teste grátis vai de 0 a 30 dias.');
  // Join questions (up to 5) and the welcome: a message sent to who joins and up to 5 onboarding steps.
  const questionInput = Array.isArray(pick('questions')) ? pick('questions') : [];
  if (questionInput.length > 5) fail('Faça até 5 perguntas de adesão.');
  const questions = questionInput.map(row => ({ id: keepId(row?.id), text: str(row?.text, 200) || fail('Escreva cada pergunta de adesão.'), required: row?.required !== false }));
  const stepInput = Array.isArray(pick('onboarding')) ? pick('onboarding') : [];
  if (stepInput.length > 5) fail('Use até 5 etapas de boas-vindas.');
  const onboarding = stepInput.map(row => ({ id: keepId(row?.id), title: str(row?.title, 80) || fail('Dê um título a cada etapa de boas-vindas.'),
    description: str(row?.description, 300), link: https(row?.link, 'O link da etapa') }));
  // Theme: a preset or custom tokens (#rrggbb each).
  const themeInput = pick('theme') || defaultTheme();
  const preset = themePresets.find(row => row.id === themeInput.preset);
  const tokens = Object.fromEntries(themeTokens.map(([key, label]) => {
    const value = String(themeInput.tokens?.[key] ?? preset?.tokens[key] ?? themePresets[0].tokens[key]).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(value)) fail(`A cor "${label}" precisa estar no formato #RRGGBB.`);
    return [key, value];
  }));
  const theme = { preset: preset ? preset.id : 'custom', tokens };
  // Tabs: the known ones, in the order given, renamed and shown or hidden; at least one stays visible.
  const tabInput = Array.isArray(pick('tabs')) ? pick('tabs') : [];
  const tabs = [...tabInput.filter(row => communityTabKeys.some(([key]) => key === row?.key)), ...communityTabKeys.filter(([key]) => !tabInput.some(row => row?.key === key)).map(([key]) => ({ key }))]
    .filter((row, index, list) => list.findIndex(other => other.key === row.key) === index)
    .map(row => ({ key: row.key, label: str(row.label, 30) || communityTabKeys.find(([key]) => key === row.key)[1], visible: row.visible !== false }));
  if (!tabs.some(row => row.visible)) fail('Deixe pelo menos uma aba visível.');
  // Moderation: words that hold a post or comment for review, and the anti-spam starter pack.
  const moderationInput = pick('moderation') || {};
  const keywords = [...new Set((Array.isArray(moderationInput.keywords) ? moderationInput.keywords : String(moderationInput.keywords || '').split(/[\n,]/))
    .map(word => str(word, 60).toLowerCase()).filter(Boolean))].slice(0, 100);
  const moderation = { keywords, spamPack: Boolean(moderationInput.spamPack) };
  // Newsletter: a digest of the best posts, daily or weekly, at an hour of the workspace's time zone.
  const newsInput = pick('newsletter') || {};
  const hour = Math.round(Number(newsInput.hour ?? 9)), weekday = Math.round(Number(newsInput.weekday ?? 1));
  if (hour < 0 || hour > 23 || weekday < 0 || weekday > 6) fail('Escolha um dia e uma hora válidos para a newsletter.');
  const newsletter = { enabled: Boolean(newsInput.enabled), frequency: newsInput.frequency === 'daily' ? 'daily' : 'weekly', weekday, hour };
  const badgesOff = (Array.isArray(pick('badgesOff')) ? pick('badgesOff') : []).filter(key => badgeCatalog.some(row => row.key === key));
  return { access, plans, trialDays, questions, welcomeDm: str(pick('welcomeDm'), 1500), onboarding, theme, tabs, moderation, newsletter, badgesOff };
}

/** Does a paid group give this membership access? Staff-added and older members keep access (no paidUntil). */
export const hasAccess = (group, row, at = Date.now()) => row?.status === 'active' && (group.access !== 'paid' || row.role === 'moderator' || !row.paidUntil || Date.parse(row.paidUntil) > at);
/** A plan's paid period, starting from the later of now and the current end. */
export function extendAccess(row, plan, at = Date.now()) {
  if (plan.interval === 'once') return null;
  const from = new Date(Math.max(at, row?.paidUntil ? Date.parse(row.paidUntil) : 0));
  if (plan.interval === 'year') from.setUTCFullYear(from.getUTCFullYear() + 1); else from.setUTCMonth(from.getUTCMonth() + 1);
  return from.toISOString();
}

/** Why a member's text is held for review ('' when it goes straight to the feed). */
export function heldReason(group, ...texts) {
  const text = ` ${texts.join(' ').toLowerCase()} `;
  const word = group.moderation?.keywords?.find(keyword => text.includes(keyword));
  if (word) return `Palavra-chave: ${word}`;
  if (group.moderation?.spamPack) {
    const spam = spamPack.find(keyword => text.includes(keyword));
    if (spam) return `Anti-spam: ${spam.trim()}`;
    if ((text.match(/https?:\/\//g) || []).length > 2) return 'Anti-spam: muitos links';
  }
  return '';
}

const quarterStart = at => { const d = new Date(at); return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1); };
/** The badges of every member, from roles, join order and this quarter's activity. */
export function badgesOf(group, data, at = Date.now()) {
  const off = new Set(group.badgesOff || []), since = quarterStart(at), out = new Map();
  const give = (id, key) => { if (!off.has(key) && id !== 'staff') out.set(id, [...(out.get(id) || []), key]); };
  const members = Object.entries(data.members || {}).filter(([, row]) => row.status === 'active');
  for (const [id, row] of members) if (row.role === 'moderator') give(id, 'moderator');
  for (const [id] of [...Object.entries(data.members || {})].sort((a, b) => String(a[1].joinedAt).localeCompare(String(b[1].joinedAt))).slice(0, 10)) if (data.members[id].status === 'active') give(id, 'founder');
  for (const [id, row] of members) if (at - Date.parse(row.joinedAt) < 30 * DAY) give(id, 'newcomer');
  const posts = new Map(), comments = new Map(), likes = new Map(), days = new Map();
  const bump = (map, id) => map.set(id, (map.get(id) || 0) + 1);
  const day = (id, iso) => { if (!days.has(id)) days.set(id, new Set()); days.get(id).add(Math.floor(Date.parse(iso) / DAY)); };
  for (const post of data.posts || []) {
    if (post.held) continue;
    if (Date.parse(post.created) >= since) { bump(posts, post.authorId); day(post.authorId, post.created); }
    for (const like of post.likes) if (like.memberId !== post.authorId && Date.parse(like.at) >= since) bump(likes, post.authorId);
    for (const comment of post.comments) {
      if (comment.held || Date.parse(comment.created) < since) continue;
      bump(comments, comment.authorId); day(comment.authorId, comment.created);
      for (const like of comment.likes) if (like.memberId !== comment.authorId) bump(likes, comment.authorId);
    }
  }
  const streak = set => { const list = [...set].sort((a, b) => a - b); let best = 0, run = 0; list.forEach((d, i) => { run = i && d === list[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }); return best; };
  for (const [id] of members) {
    if (streak(days.get(id) || new Set()) >= 7) give(id, 'streak');
    if ((comments.get(id) || 0) >= 20) give(id, 'commenter');
    if ((posts.get(id) || 0) >= 10) give(id, 'creator');
    if ((likes.get(id) || 0) >= 25) give(id, 'inspiring');
  }
  return out;
}
export const badgeLabels = keys => (keys || []).map(key => badgeCatalog.find(row => row.key === key)).filter(Boolean).map(row => ({ key: row.key, label: row.label }));

/** The hour and weekday of an instant in a time zone. */
function localParts(at, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}

/** Analytics of one group in the last `days` days. */
export function communityAnalytics(state, group, data, { days = 30, at = Date.now(), zone = 'America/Sao_Paulo' } = {}) {
  const since = at - days * DAY, rows = Object.entries(data.members || {});
  const active = rows.filter(([, row]) => row.status === 'active');
  const series = new Map(), heat = Array.from({ length: 7 }, () => Array(24).fill(0)), lastSeen = new Map();
  const track = (id, iso, kind) => {
    const t = Date.parse(iso);
    if (id && id !== 'staff') lastSeen.set(id, Math.max(lastSeen.get(id) || 0, t));
    if (t < since) return;
    const key = new Date(t).toISOString().slice(0, 10), row = series.get(key) || { day: key, posts: 0, comments: 0, likes: 0 };
    row[kind]++; series.set(key, row);
    const { hour, weekday } = localParts(t, zone); heat[weekday][hour]++;
  };
  let posts = 0, comments = 0, likes = 0;
  for (const post of data.posts || []) {
    track(post.authorId, post.created, 'posts'); if (Date.parse(post.created) >= since) posts++;
    for (const like of post.likes) { track(like.memberId, like.at, 'likes'); if (Date.parse(like.at) >= since) likes++; }
    for (const comment of post.comments) {
      track(comment.authorId, comment.created, 'comments'); if (Date.parse(comment.created) >= since) comments++;
      for (const like of comment.likes) { track(like.memberId, like.at, 'likes'); if (Date.parse(like.at) >= since) likes++; }
    }
  }
  const paid = (state.invoices || []).filter(row => row.status === 'Paid' && (row.communityPlan?.communityId === group.id || row.eventTicket?.communityId === group.id) && Date.parse(row.paidAt || row.updated || row.created) >= since);
  const inactiveCutoff = at - 30 * DAY;
  return {
    days, members: active.length, newMembers: active.filter(([, row]) => Date.parse(row.joinedAt) >= since).length,
    inactive: active.filter(([id, row]) => Math.max(lastSeen.get(id) || 0, Date.parse(row.lastActive || 0) || 0, Date.parse(row.joinedAt)) < inactiveCutoff).length,
    requested: rows.filter(([, row]) => row.status === 'requested').length, pendingPayment: rows.filter(([, row]) => row.status === 'pending').length,
    banned: rows.filter(([, row]) => row.status === 'banned').length,
    paying: active.filter(([, row]) => row.planId && (!row.paidUntil || Date.parse(row.paidUntil) > at)).length,
    earnings: Math.round(paid.reduce((sum, row) => sum + Number(row.value || 0), 0) * 100) / 100, sales: paid.length,
    posts, comments, likes, series: [...series.values()].sort((a, b) => a.day.localeCompare(b.day)), heat
  };
}

/** Is the group's newsletter due at this instant? Once per period, at the chosen local hour. */
export function newsletterDue(group, data, at = Date.now(), zone = 'America/Sao_Paulo') {
  const n = group.newsletter;
  if (!n?.enabled) return false;
  const { hour, weekday } = localParts(at, zone);
  if (hour !== n.hour || (n.frequency === 'weekly' && weekday !== n.weekday)) return false;
  return !data.newsletterAt || at - Date.parse(data.newsletterAt) > 20 * 3600000;
}
/** The best posts since the last digest (or the period), by likes and comments. */
export function digestPosts(group, data, at = Date.now()) {
  const since = data.newsletterAt ? Date.parse(data.newsletterAt) : at - (group.newsletter.frequency === 'daily' ? 1 : 7) * DAY;
  return (data.posts || []).filter(post => !post.held && Date.parse(post.created) >= since)
    .sort((a, b) => (b.likes.length + b.comments.length) - (a.likes.length + a.comments.length) || b.created.localeCompare(a.created)).slice(0, 5)
    .map(post => ({ title: post.title, comments: post.comments.filter(row => !row.held).length, likes: post.likes.length }));
}

// ---- Workspace side: the plan invoice, the welcome message and the newsletter ----------------------------
export function communityCommand(s, command, { add, run, now }) {
  const { type, id, data: d = {} } = command;
  const contactFor = ({ email, name, contactId }) => {
    let contact = (contactId && s.contacts.find(row => row.id === contactId)) || (email && s.contacts.find(row => (row.email || '').toLowerCase() === email));
    if (!contact) { contact = add(s, 'contacts', { name: str(name, 120) || email, email, phone: '', tags: ['comunidade'], company: '', notes: '', custom: {} }); run(s, 'Contact created', { contactId: contact.id }); }
    return contact;
  };
  if (type === 'community-plan-invoice') {
    const group = s.communities.find(row => row.id === id) || fail('Comunidade não encontrada.', 404);
    const plan = group.plans?.find(row => row.id === d.planId) || fail('Plano não encontrado.', 404);
    const email = mail(d.email) || fail('O seu acesso ao portal não tem um e-mail válido.');
    const contact = contactFor({ email, name: d.name, contactId: d.contactId });
    const invoice = add(s, 'invoices', { title: `${group.name}: ${plan.name}`, contactId: contact.id, value: plan.price, due: now().slice(0, 10), status: 'Open' });
    invoice.communityPlan = { communityId: group.id, planId: plan.id, memberId: str(d.memberId, 60) };
    return invoice.id;
  }
  if (type === 'community-welcome' || type === 'community-newsletter') {
    let written = 0;
    for (const item of Array.isArray(d.items) ? d.items.slice(0, 2000) : []) {
      const email = mail(item.email), body = str(item.body, 20000);
      if (!email || (!body && type === 'community-newsletter')) continue;
      const contact = contactFor({ email, name: item.name, contactId: item.contactId });
      if (body) { add(s, 'messages', { contactId: contact.id, channel: 'Email', direction: 'Outbound', read: true, starred: false, origin: 'workflow', subject: str(item.subject, 200), body }); written++; }
      if (type === 'community-welcome') run(s, 'community_member_joined', { contactId: contact.id, communityId: id, title: str(item.group, 120) });
    }
    return written;
  }
  fail('Comando de comunidade desconhecido.');
}

/** The welcome message with {{nome}} and {{comunidade}} filled in. */
export const fillWelcome = (text, { name, group }) => String(text || '').replace(/\{\{\s*nome\s*\}\}/g, String(name || '').split(' ')[0] || '').replace(/\{\{\s*comunidade\s*\}\}/g, group || '');
