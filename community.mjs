// Communities: groups configured in the workspace (name, channels, points, levels) and member activity
// (memberships, posts, comments, likes, polls) kept in a separate `community-<workspace>` document.
import { randomUUID } from 'node:crypto';
import { eventView, nextOccurrence, occurrences, REMINDER_BEFORE } from './community-events.mjs';
import { badgeLabels, badgesOf, communityAnalytics, communityConfig, digestPosts, extendAccess, hasAccess, heldReason, newsletterDue } from './community-config.mjs';

export const communityCollections = ['communities'];
export const levelThresholds = [0, 5, 20, 65, 155, 515, 2015, 8015, 33015];
export const levelOf = points => levelThresholds.reduce((level, min, index) => points >= min ? index + 1 : level, 1);

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const idOf = value => typeof value === 'string' && /^[\w-]{1,60}$/.test(value) ? value : randomUUID();
const DAY = 86400000;
const slugify = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'comunidade';

function points(input, prior) {
  const merged = { post: 2, comment: 1, like: 1, ...prior, ...(input || {}) };
  for (const key of ['post', 'comment', 'like']) {
    const value = Number(merged[key]);
    if (!Number.isInteger(value) || value < 0 || value > 100) fail('Os pontos de cada ação devem ser de 0 a 100.');
    merged[key] = value;
  }
  return { post: merged.post, comment: merged.comment, like: merged.like };
}

export const communityFields = {
  communities: (s, d) => {
    const prior = d.id ? s.communities.find(row => row.id === d.id) : null;
    const name = str(d.name ?? prior?.name, 80) || fail('Dê um nome à comunidade.');
    let slug = prior?.slug;
    if (!slug || (d.slug !== undefined && slugify(str(d.slug, 60)) !== slug)) {
      const wanted = slugify(str(d.slug, 60) || name);
      slug = wanted;
      for (let n = 2; s.communities.some(row => row.id !== d.id && row.slug === slug); n++) slug = `${wanted}-${n}`;
    }
    const channelInput = d.channels ?? prior?.channels ?? [{ name: 'Avisos' }];
    if (!Array.isArray(channelInput) || !channelInput.length) fail('A comunidade precisa de pelo menos um canal.');
    if (channelInput.length > 30) fail('Uma comunidade pode ter até 30 canais.');
    const channels = channelInput.map(channel => ({ id: idOf(channel?.id), name: str(channel?.name, 40) || fail('Todo canal precisa de um nome.'), private: Boolean(channel?.private) }));
    if (channels.every(channel => channel.private)) fail('Deixe pelo menos um canal aberto a todos os membros.');
    const levelInput = Array.isArray(d.levels) ? d.levels : prior?.levels || [];
    const levels = levelThresholds.map((min, index) => ({ name: str(levelInput[index]?.name, 30) || `Nível ${index + 1}` }));
    const coverFileId = str(d.coverFileId ?? prior?.coverFileId, 60);
    if (coverFileId && !s.files.some(file => file.id === coverFileId && file.data.startsWith('data:image/'))) fail('A capa precisa ser uma imagem da Mídia Drive.');
    return {
      name, slug, description: str(d.description ?? prior?.description, 500), coverFileId,
      visibility: (d.visibility ?? prior?.visibility) === 'private' ? 'private' : 'public',
      active: d.active === undefined ? prior?.active !== false : Boolean(d.active),
      memberPosts: d.memberPosts === undefined ? prior?.memberPosts !== false : Boolean(d.memberPosts),
      welcome: str(d.welcome ?? prior?.welcome, 1000),
      channels, levels, points: points(d.points, prior?.points), ...communityConfig(d, prior || {})
    };
  }
};

const blankDoc = () => ({ groups: {} });
const groupData = (doc, id) => doc.groups[id] ||= { members: {}, posts: [] };
const eventRecord = (data, id) => (data.events ||= {})[id] ||= { attendees: {} };
const displayName = member => member?.name || (member?.email || '').split('@')[0] || 'Membro';
const https = value => { const link = str(value, 500); if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail('Use um link que comece com https://.'); return link; };

// Points per author in a period: posts, comments and likes received (likes on your own content do not count),
// plus the points the workflows gave (data.bonuses).
function scores(group, data, since = 0) {
  const totals = new Map(), add = (id, value) => { if (id !== 'staff' && value) totals.set(id, (totals.get(id) || 0) + value); };
  for (const bonus of data.bonuses || []) if (Date.parse(bonus.at) >= since) add(bonus.memberId, bonus.points);
  for (const post of data.posts) {
    if (post.held) continue;
    if (Date.parse(post.created) >= since) add(post.authorId, group.points.post);
    for (const like of post.likes) if (like.memberId !== post.authorId && Date.parse(like.at) >= since) add(post.authorId, group.points.like);
    for (const comment of post.comments) {
      if (comment.held) continue;
      if (comment.authorId !== post.authorId && Date.parse(comment.created) >= since) add(comment.authorId, group.points.comment);
      for (const like of comment.likes) if (like.memberId !== comment.authorId && Date.parse(like.at) >= since) add(comment.authorId, group.points.like);
    }
  }
  return totals;
}

// Private channels (T.1): only members given access, moderators and the team see and use them.
const channelOpen = (group, data, viewer, channelId) => {
  const channel = group.channels.find(row => row.id === channelId);
  return !channel?.private || viewer === 'staff' || data.members[viewer]?.role === 'moderator' || Boolean(data.channelAccess?.[channelId]?.[viewer]);
};
// Gives or takes one member's access to a private channel: 'channel-granted', 'channel-revoked' or '' (no change).
const setChannel = (data, channelId, memberId, grant) => {
  const access = ((data.channelAccess ||= {})[channelId] ||= {});
  if (grant === Boolean(access[memberId])) return '';
  if (grant) access[memberId] = new Date().toISOString(); else delete access[memberId];
  return grant ? 'channel-granted' : 'channel-revoked';
};
const levels = (group, data) => new Map([...scores(group, data)].map(([id, total]) => [id, levelOf(total)]));
// Wraps a change of one group: members whose all-time level moved get a "level" activity (workflow trigger).
const ranked = (group, groupId, activity, mutate) => doc => {
  const before = group?.points ? levels(group, groupData(doc, groupId)) : new Map();
  const result = mutate(doc);
  if (!group?.points) return result;
  const after = levels(group, groupData(doc, groupId));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id) || 1, level = after.get(id) || 1;
    if (previous !== level) activity.push({ event: 'level', memberId: id, level, previous });
  }
  return result;
};

export function makeCommunity({ store, onEventJoin = null, onMemberJoin = null, onActivity = null }) {
  // Workflows (T.1): posts, comments, join requests and lost access, after the change is saved.
  const announce = async (workspace, groupId, rows) => { for (const row of rows) await onActivity?.(workspace, { groupId, ...row }); };
  const docId = workspace => `community-${workspace}`;
  async function load(workspace) {
    try { return await store.load(docId(workspace)); }
    catch (error) { if (error.status !== 404) throw error; return blankDoc(); }
  }
  async function change(workspace, mutate) {
    try { return await store.change(docId(workspace), mutate); }
    catch (error) {
      if (error.status !== 404 || error.message !== 'Workspace not found.') throw error;
      try { await store.insert(docId(workspace), { profile: { name: 'Comunidades' }, ...blankDoc() }); }
      catch (inserted) { if (inserted.status !== 409) throw inserted; }
      return store.change(docId(workspace), mutate);
    }
  }
  const groupOf = (state, id) => state.communities.find(row => row.id === id && row.active !== false) || fail('Comunidade não encontrada.', 404);
  const people = portal => new Map((portal?.members || []).map(member => [member.id, member]));

  function postView(state, group, data, post, viewer, names, levels, badges = new Map()) {
    const person = id => id === 'staff' ? { name: state.profile.name, staff: true, level: 0, badges: [] }
      : { name: names.get(id) || 'Membro', staff: false, level: levels.get(id) || 1, badges: badgeLabels(badges.get(id)) };
    const author = person(post.authorId);
    const moderator = viewer === 'staff' || data.members[viewer]?.role === 'moderator';
    const seeComment = comment => !comment.held || moderator || comment.authorId === viewer;
    const image = post.imageFileId && state.files.find(file => file.id === post.imageFileId && file.data.startsWith('data:image/'));
    return {
      id: post.id, channelId: post.channelId, channel: group.channels.find(channel => channel.id === post.channelId)?.name || '',
      title: post.title, body: post.body, link: post.link || '', image: image?.data || '', pinned: Boolean(post.pinned), created: post.created,
      author, mine: post.authorId === viewer, canDelete: post.authorId === viewer || moderator, commentsEnabled: post.commentsEnabled !== false,
      held: post.held ? (moderator ? post.held : 'Em análise') : '', reports: moderator ? (post.reports || []).length : 0, reported: (post.reports || []).some(row => row.memberId === viewer),
      likes: post.likes.length, liked: post.likes.some(like => like.memberId === viewer),
      poll: post.poll ? { options: post.poll.map(option => ({ id: option.id, text: option.text, votes: option.votes.length })),
        voted: post.poll.find(option => option.votes.includes(viewer))?.id || null, total: post.poll.reduce((sum, option) => sum + option.votes.length, 0) } : null,
      comments: post.comments.filter(seeComment).map(comment => ({ id: comment.id, body: comment.body, created: comment.created,
        held: comment.held ? (moderator ? comment.held : 'Em análise') : '', reports: moderator ? (comment.reports || []).length : 0, reported: (comment.reports || []).some(row => row.memberId === viewer),
        author: person(comment.authorId),
        likes: comment.likes.length, liked: comment.likes.some(like => like.memberId === viewer), mine: comment.authorId === viewer,
        canDelete: comment.authorId === viewer || moderator }))
    };
  }

  function feed(state, group, data, viewer, names, channelId = '') {
    const levels = new Map([...scores(group, data)].map(([id, total]) => [id, levelOf(total)]));
    const moderator = viewer === 'staff' || data.members[viewer]?.role === 'moderator', badges = badgesOf(group, data);
    return data.posts.filter(post => (!channelId || post.channelId === channelId) && (!post.held || moderator || post.authorId === viewer) && channelOpen(group, data, viewer, post.channelId))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.created.localeCompare(a.created)).slice(0, 100)
      .map(post => postView(state, group, data, post, viewer, names, levels, badges));
  }

  function leaderboard(group, data, names, viewer, period) {
    const since = period === 'all' ? 0 : Date.now() - (period === '7' ? 7 : 30) * DAY;
    const all = scores(group, data), recent = scores(group, data, since);
    const active = Object.entries(data.members).filter(([, row]) => row.status === 'active').map(([id]) => id);
    const total = active.length || 1;
    return {
      period, levels: group.levels.map((level, index) => ({ level: index + 1, name: level.name, min: levelThresholds[index],
        share: Math.round(active.filter(id => levelOf(all.get(id) || 0) === index + 1).length / total * 100) })),
      top: active.map(id => ({ id, name: names.get(id) || 'Membro', points: recent.get(id) || 0, level: levelOf(all.get(id) || 0) }))
        .filter(row => row.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, 10)
        .map(({ id, ...row }) => row),
      me: data.members[viewer] ? (() => { const mine = all.get(viewer) || 0, level = levelOf(mine);
        return { points: mine, level, next: levelThresholds[level] === undefined ? null : levelThresholds[level] - mine }; })() : null
    };
  }

  function groupHeader(state, group, data) {
    const cover = group.coverFileId && state.files.find(file => file.id === group.coverFileId)?.data;
    return { id: group.id, name: group.name, slug: group.slug, description: group.description, cover: cover || '', visibility: group.visibility,
      welcome: group.welcome, memberPosts: group.memberPosts, channels: group.channels,
      access: group.access || 'free', plans: group.plans || [], trialDays: group.trialDays || 0, questions: group.questions || [], onboarding: group.onboarding || [],
      theme: group.theme || null, tabs: group.tabs || null,
      memberCount: Object.values(data.members).filter(row => row.status === 'active').length, postCount: data.posts.length };
  }

  // The group's events for one viewer: upcoming first (soonest on top), then past ones (latest on top).
  function eventsOf(state, group, data, viewer, names, { staff = false } = {}) {
    const member = staff || data.members[viewer]?.status === 'active', at = Date.now();
    const list = (state.communityEvents || []).filter(event => event.communityId === group.id && (staff || event.status === 'published'))
      .map(event => eventView(state, event, data.events?.[event.id], { viewer, staff, member, live: data.live, names, at }));
    const upcoming = list.filter(row => !row.past).sort((a, b) => a.start.localeCompare(b.start));
    return [...upcoming, ...list.filter(row => row.past).sort((a, b) => b.start.localeCompare(a.start))];
  }
  const liveBanner = (state, data) => {
    const event = data.live && (state.communityEvents || []).find(row => row.id === data.live.eventId);
    return event ? { eventId: event.id, title: event.title, startedAt: data.live.startedAt } : null;
  };

  // What a signed-in portal member sees of one group.
  function memberView(state, portal, group, data, member, { channelId = '', period = '30' } = {}) {
    const membership = data.members[member.id];
    if (membership?.status === 'banned') fail('Você não tem mais acesso a esta comunidade.', 403);
    const names = new Map([...people(portal)].map(([id, row]) => [id, displayName(row)]));
    const paid = group.access === 'paid', allowed = hasAccess(group, membership);
    const open = allowed || (!paid && ((!membership && group.visibility === 'public') || (membership?.status === 'requested' && group.visibility === 'public')));
    const header = groupHeader(state, group, data);
    const view = { group: { ...header, channels: header.channels.filter(channel => channelOpen(group, data, member.id, channel.id)) }, membership: membership ? { status: membership.status, role: membership.role, planId: membership.planId || '',
      paidUntil: membership.paidUntil || '', expired: paid && membership.status === 'active' && !allowed, trialUsed: Boolean(membership.trialUsed),
      onboardingDone: membership.onboardingDone || [] } : null };
    if (!open) return view;
    const badges = badgesOf(group, data);
    return { ...view, posts: feed(state, group, data, member.id, names, channelId), events: eventsOf(state, group, data, member.id, names), live: liveBanner(state, data),
      members: Object.entries(data.members).filter(([, row]) => row.status === 'active')
        .map(([id, row]) => ({ name: names.get(id) || 'Membro', role: row.role, joinedAt: row.joinedAt, level: levelOf(scores(group, data).get(id) || 0), badges: badgeLabels(badges.get(id)) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      leaderboard: leaderboard(group, data, names, member.id, ['7', '30', 'all'].includes(period) ? period : '30') };
  }

  async function home(workspace, state, member) {
    const doc = await load(workspace);
    return state.communities.filter(group => group.active !== false).map(group => {
      const data = doc.groups[group.id] || { members: {}, posts: [] }, membership = data.members[member.id];
      if (membership?.status === 'banned') return null;
      return { id: group.id, name: group.name, description: group.description, visibility: group.visibility,
        cover: groupHeader(state, group, data).cover, memberCount: groupHeader(state, group, data).memberCount, membership: membership?.status || null };
    }).filter(Boolean);
  }

  async function read(workspace, state, portal, member, groupId, options) {
    const group = groupOf(state, groupId), doc = await load(workspace);
    return memberView(state, portal, group, doc.groups[groupId] || { members: {}, posts: [] }, member, options);
  }

  const findPost = (data, id) => data.posts.find(post => post.id === id) || fail('Publicação não encontrada.', 404);
  function writePost(data, group, authorId, input) {
    if (data.posts.length >= 2000) fail('Esta comunidade atingiu o limite de publicações.', 409);
    const open = group.channels.filter(channel => channelOpen(group, data, authorId, channel.id));
    if (input.channelId && group.channels.some(channel => channel.id === input.channelId) && !open.some(channel => channel.id === input.channelId)) fail('Você não tem acesso a este canal.', 403);
    const channelId = open.some(channel => channel.id === input.channelId) ? input.channelId : (open[0] || group.channels[0]).id;
    const pollInput = Array.isArray(input.poll) ? input.poll.map(text => str(text, 80)).filter(Boolean) : [];
    if (pollInput.length === 1 || pollInput.length > 6) fail('A enquete precisa de 2 a 6 opções.');
    const post = { id: randomUUID(), channelId, authorId, created: new Date().toISOString(),
      title: str(input.title, 200) || fail('Dê um título à publicação.'), body: str(input.body, 10000) || fail('Escreva o texto da publicação.'),
      link: https(input.link), commentsEnabled: input.commentsEnabled !== false, likes: [], comments: [],
      poll: pollInput.length ? pollInput.map(text => ({ id: randomUUID(), text, votes: [] })) : null };
    data.posts.push(post);
    return post;
  }
  const toggleLike = (likes, memberId) => {
    const index = likes.findIndex(like => like.memberId === memberId);
    if (index >= 0) likes.splice(index, 1); else likes.push({ memberId, at: new Date().toISOString() });
  };

  // Member actions: join, leave, post, comment, like, vote, delete.
  async function act(workspace, state, portal, member, groupId, input) {
    const group = groupOf(state, groupId), action = input?.action;
    let joined = null, welcomed = false;
    const activity = [];
    const result = await change(workspace, ranked(group, groupId, activity, doc => {
      activity.length = 0; // a retried change starts over
      const data = groupData(doc, groupId), membership = data.members[member.id];
      const reach = (rows, postId) => { const post = findPost(rows, postId); if (!channelOpen(group, rows, member.id, post.channelId)) fail('Você não tem acesso a este canal.', 403); return post; };
      if (membership?.status === 'banned') fail('Você não tem mais acesso a esta comunidade.', 403);
      if (action === 'join') {
        if (membership?.status === 'active' || membership?.status === 'requested') return memberView(state, portal, group, data, member, {});
        const answers = (group.questions || []).map(question => {
          const answer = str((Array.isArray(input.answers) ? input.answers : []).find(row => row?.id === question.id)?.answer, 1000);
          if (question.required && !answer) fail(`Responda: ${question.text}`);
          return { question: question.text, answer };
        });
        const now = new Date().toISOString();
        if (group.access === 'paid') {
          if (!group.trialDays || membership?.trialUsed) fail('Esta comunidade é paga: escolha um plano para entrar.', 402);
          data.members[member.id] = { ...(membership || {}), role: membership?.role || 'member', status: 'active', joinedAt: membership?.joinedAt || now, answers,
            trialUsed: true, paidUntil: new Date(Date.now() + group.trialDays * DAY).toISOString(), lastActive: now };
          welcomed = true;
        } else {
          data.members[member.id] = { role: 'member', status: group.visibility === 'public' ? 'active' : 'requested', joinedAt: now, answers, lastActive: now };
          welcomed = group.visibility === 'public';
          if (!welcomed) activity.push({ event: 'requested', memberId: member.id, answers: answers.map(row => `${row.question}: ${row.answer}`).join('\n') });
        }
      } else if (action === 'leave') {
        if (membership?.status === 'active') activity.push({ event: 'revoked', memberId: member.id, reason: 'left' });
        delete data.members[member.id];
      } else if (action === 'onboarding') {
        if (membership?.status !== 'active') fail('Entre na comunidade para participar.', 403);
        const step = (group.onboarding || []).find(row => row.id === input.stepId) || fail('Etapa não encontrada.', 404);
        const done = new Set(membership.onboardingDone || []);
        if (input.done === false) done.delete(step.id); else done.add(step.id);
        membership.onboardingDone = [...done];
      } else {
        if (membership?.status !== 'active') fail('Entre na comunidade para participar.', 403);
        if (!hasAccess(group, membership)) fail('Seu acesso a esta comunidade venceu. Renove o plano para continuar participando.', 402);
        const moderator = membership.role === 'moderator';
        membership.lastActive = new Date().toISOString();
        if (action === 'post') {
          if (!group.memberPosts && !moderator) fail('Somente a equipe publica nesta comunidade.', 403);
          const post = writePost(data, group, member.id, input);
          const held = moderator ? '' : heldReason(group, post.title, post.body, post.link);
          if (held) post.held = held;
          else activity.push({ event: 'post', memberId: member.id, postId: post.id, title: post.title, body: post.body });
        } else if (action === 'comment') {
          const post = reach(data, input.postId);
          if (post.commentsEnabled === false) fail('Os comentários estão desativados nesta publicação.', 403);
          if (post.comments.length >= 500) fail('Esta publicação atingiu o limite de comentários.', 409);
          const body = str(input.body, 2000) || fail('Escreva o comentário.'), held = moderator ? '' : heldReason(group, body);
          post.comments.push({ id: randomUUID(), authorId: member.id, body, created: new Date().toISOString(), likes: [], ...(held ? { held } : {}) });
          if (!held) activity.push({ event: 'comment', memberId: member.id, postId: post.id, title: post.title, body });
        } else if (action === 'report') {
          const post = reach(data, input.postId);
          const target = input.commentId ? post.comments.find(row => row.id === input.commentId) || fail('Comentário não encontrado.', 404) : post;
          if (target.authorId === member.id) fail('Você não pode denunciar o que você mesmo escreveu.');
          target.reports ||= [];
          if (!target.reports.some(row => row.memberId === member.id)) target.reports.push({ memberId: member.id, reason: str(input.reason, 200), at: new Date().toISOString() });
        } else if (action === 'like') {
          const post = reach(data, input.postId);
          toggleLike(input.commentId ? (post.comments.find(row => row.id === input.commentId) || fail('Comentário não encontrado.', 404)).likes : post.likes, member.id);
        } else if (action === 'vote') {
          const post = reach(data, input.postId);
          const option = post.poll?.find(row => row.id === input.optionId) || fail('Opção não encontrada.', 404);
          for (const row of post.poll) row.votes = row.votes.filter(id => id !== member.id);
          option.votes.push(member.id);
        } else if (action === 'rsvp' || action === 'rsvp-cancel') {
          const event = (state.communityEvents || []).find(row => row.id === input.eventId && row.communityId === group.id && row.status === 'published') || fail('Evento não encontrado.', 404);
          const record = eventRecord(data, event.id), mine = record.attendees[member.id];
          if (action === 'rsvp-cancel') {
            if (mine?.paid) fail('Ingressos pagos não são cancelados pelo portal. Fale com a equipe.', 409);
            delete record.attendees[member.id];
          } else {
            if (event.access === 'paid') fail('Este evento é pago: compre o ingresso para participar.', 402);
            if (!nextOccurrence(event)) fail('Este evento já terminou.', 409);
            if (mine?.status !== 'going') {
              if (event.capacity && Object.values(record.attendees).filter(row => row.status === 'going').length >= event.capacity) fail('As vagas deste evento esgotaram.', 409);
              record.attendees[member.id] = { status: 'going', at: new Date().toISOString(), paid: false, reminded: {} };
              joined = { eventId: event.id, memberId: member.id, paid: false };
            }
          }
        } else if (action === 'delete') {
          const post = reach(data, input.postId);
          if (input.commentId) {
            const comment = post.comments.find(row => row.id === input.commentId) || fail('Comentário não encontrado.', 404);
            if (comment.authorId !== member.id && !moderator) fail('Você só pode excluir seus comentários.', 403);
            post.comments = post.comments.filter(row => row !== comment);
          } else {
            if (post.authorId !== member.id && !moderator) fail('Você só pode excluir suas publicações.', 403);
            data.posts = data.posts.filter(row => row !== post);
          }
        } else fail('Ação da comunidade não encontrada.', 404);
      }
      return memberView(state, portal, group, data, member, { channelId: input.channelFilter || '' });
    }));
    if (joined) await onEventJoin?.(workspace, joined);
    if (welcomed) await onMemberJoin?.(workspace, { groupId, memberId: member.id });
    await announce(workspace, groupId, activity);
    return result;
  }

  // Paid access: check the plan, keep the pending invoice, and open (or extend) the access once paid.
  async function reservePlan(workspace, state, member, groupId, planId, answers = []) {
    const group = groupOf(state, groupId), doc = await load(workspace), row = doc.groups[groupId]?.members?.[member.id];
    if (row?.status === 'banned') fail('Você não tem mais acesso a esta comunidade.', 403);
    if (group.access !== 'paid') fail('Esta comunidade é gratuita.');
    const plan = (group.plans || []).find(item => item.id === planId) || fail('Plano não encontrado.', 404);
    if (plan.interval === 'once' && row?.status === 'active' && row.planId && !row.paidUntil) fail('Você já tem acesso vitalício a esta comunidade.', 409);
    const given = Array.isArray(answers) ? answers : [];
    for (const question of group.questions || []) if (question.required && !row?.answers?.length && !str(given.find(item => item?.id === question.id)?.answer, 1000)) fail(`Responda: ${question.text}`);
    return { group, plan };
  }
  async function markPlanPending(workspace, groupId, memberId, invoiceId, answersInput = []) {
    const group = (await store.load(workspace)).communities.find(row => row.id === groupId);
    await change(workspace, doc => {
      const data = groupData(doc, groupId), row = data.members[memberId];
      const answers = (group?.questions || []).map(question => ({ question: question.text, answer: str((Array.isArray(answersInput) ? answersInput : []).find(item => item?.id === question.id)?.answer, 1000) }));
      if (!row) data.members[memberId] = { role: 'member', status: 'pending', joinedAt: new Date().toISOString(), answers, pendingInvoiceId: invoiceId };
      else row.pendingInvoiceId = invoiceId;
    });
  }
  async function grantPlan(workspace, state, { communityId, planId, memberId }, invoiceId = '') {
    const group = state.communities.find(row => row.id === communityId), plan = group?.plans?.find(row => row.id === planId);
    if (!group || !plan || !memberId) return false;
    let opened = false;
    await change(workspace, doc => {
      const data = groupData(doc, communityId), row = data.members[memberId] || { role: 'member', joinedAt: new Date().toISOString() };
      if (row.status === 'banned' || (invoiceId && (row.paidInvoices || []).includes(invoiceId))) return;
      opened = row.status !== 'active';
      Object.assign(row, { status: 'active', planId: plan.id, paidUntil: extendAccess(row, plan), pendingInvoiceId: '', paidInvoices: [...(row.paidInvoices || []), invoiceId].filter(Boolean).slice(-50) });
      data.members[memberId] = row;
    });
    if (opened) await onMemberJoin?.(workspace, { groupId: communityId, memberId });
    return true;
  }

  // Newsletters due now: the best posts since the last one, for every active member.
  async function dueNewsletters(workspace, state, at = Date.now()) {
    const zone = state.profile?.timezone || 'America/Sao_Paulo';
    const groups = (state.communities || []).filter(group => group.active !== false && group.newsletter?.enabled);
    if (!groups.length) return [];
    const out = [];
    await change(workspace, doc => {
      for (const group of groups) {
        const data = groupData(doc, group.id);
        if (!newsletterDue(group, data, at, zone)) continue;
        const posts = digestPosts(group, data, at);
        data.newsletterAt = new Date(at).toISOString();
        const memberIds = Object.entries(data.members).filter(([, row]) => hasAccess(group, row, at)).map(([id]) => id);
        if (posts.length && memberIds.length) out.push({ groupId: group.id, groupName: group.name, posts, memberIds });
      }
    });
    return out;
  }

  // Paid tickets: check the member may buy, keep the pending invoice, and turn it into a seat once paid.
  async function reserve(workspace, state, member, groupId, eventId) {
    const group = groupOf(state, groupId), doc = await load(workspace), data = doc.groups[groupId] || { members: {}, posts: [] };
    if (data.members[member.id]?.status !== 'active') fail('Entre na comunidade para participar.', 403);
    const event = (state.communityEvents || []).find(row => row.id === eventId && row.communityId === group.id && row.status === 'published') || fail('Evento não encontrado.', 404);
    if (event.access !== 'paid') fail('Este evento é gratuito: basta confirmar presença.');
    if (!nextOccurrence(event)) fail('Este evento já terminou.', 409);
    const record = data.events?.[event.id] || { attendees: {} };
    if (record.attendees[member.id]?.status === 'going') fail('Você já tem ingresso para este evento.', 409);
    if (event.capacity && Object.values(record.attendees).filter(row => row.status === 'going').length >= event.capacity) fail('Os ingressos deste evento esgotaram.', 409);
    return event;
  }
  async function markPending(workspace, groupId, eventId, memberId, invoiceId) {
    await change(workspace, doc => {
      const record = eventRecord(groupData(doc, groupId), eventId), row = record.attendees[memberId];
      if (row?.status !== 'going') record.attendees[memberId] = { status: 'pending', at: new Date().toISOString(), paid: false, invoiceId, reminded: {} };
    });
  }
  async function grantTicket(workspace, { communityId, eventId, memberId }, invoiceId = '') {
    if (!memberId) return false;
    let granted = false;
    await change(workspace, doc => {
      const data = groupData(doc, communityId), record = eventRecord(data, eventId), row = record.attendees[memberId];
      if (row?.status === 'going' && row.paid) return;
      record.attendees[memberId] = { ...(row || {}), status: 'going', at: new Date().toISOString(), paid: true, invoiceId, reminded: row?.reminded || {} };
      if (!data.members[memberId]) data.members[memberId] = { role: 'member', status: 'active', joinedAt: new Date().toISOString() };
      granted = true;
    });
    if (granted) await onEventJoin?.(workspace, { eventId, memberId, paid: true });
    return granted;
  }

  // Reminders due now (one day before each date of an event with reminders on), marked as sent once.
  async function dueReminders(workspace, state, at = Date.now()) {
    const events = (state.communityEvents || []).filter(event => event.status === 'published' && event.reminder !== false);
    if (!events.length) return [];
    const doc = await load(workspace);
    if (!events.some(event => Object.keys(doc.groups[event.communityId]?.events?.[event.id]?.attendees || {}).length)) return [];
    const due = [];
    await change(workspace, current => {
      for (const event of events) {
        const record = current.groups[event.communityId]?.events?.[event.id];
        if (!record) continue;
        const date = occurrences(event).find(row => { const start = Date.parse(row.start); return start > at && start - REMINDER_BEFORE <= at; });
        if (!date) continue;
        for (const [memberId, row] of Object.entries(record.attendees)) {
          if (row.status !== 'going' || row.reminded?.[date.index] || Date.parse(row.at) > Date.parse(date.start) - REMINDER_BEFORE) continue;
          row.reminded = { ...(row.reminded || {}), [date.index]: new Date(at).toISOString() };
          due.push({ eventId: event.id, memberId, start: date.start });
        }
      }
    });
    return due;
  }

  // Staff view of one group (or a summary of all) for the admin panel.
  function adminView(state, portal, doc, groupId, { days = 30 } = {}) {
    const names = new Map([...people(portal)].map(([id, row]) => [id, displayName(row)]));
    if (!groupId) return { groups: state.communities.map(group => {
      const data = doc.groups[group.id] || { members: {}, posts: [] }, members = Object.values(data.members);
      return { id: group.id, memberCount: members.filter(row => row.status === 'active').length,
        requested: members.filter(row => row.status === 'requested').length, postCount: data.posts.length,
        lastActivity: data.posts.map(post => post.created).sort().at(-1) || '' };
    }) };
    const group = state.communities.find(row => row.id === groupId) || fail('Comunidade não encontrada.', 404);
    const data = doc.groups[groupId] || { members: {}, posts: [] }, totals = scores(group, data);
    const contacts = people(portal), badges = badgesOf(group, data);
    const queue = [];
    for (const post of data.posts) {
      if (post.held || post.reports?.length) queue.push({ postId: post.id, commentId: '', kind: 'post', title: post.title, body: post.body, author: post.authorId === 'staff' ? state.profile.name : names.get(post.authorId) || 'Membro', created: post.created, held: post.held || '', reports: (post.reports || []).map(row => ({ name: names.get(row.memberId) || 'Membro', reason: row.reason, at: row.at })) });
      for (const comment of post.comments) if (comment.held || comment.reports?.length) queue.push({ postId: post.id, commentId: comment.id, kind: 'comment', title: post.title, body: comment.body, author: comment.authorId === 'staff' ? state.profile.name : names.get(comment.authorId) || 'Membro', created: comment.created, held: comment.held || '', reports: (comment.reports || []).map(row => ({ name: names.get(row.memberId) || 'Membro', reason: row.reason, at: row.at })) });
    }
    const directory = people(portal);
    return { group: groupHeader(state, group, data), posts: feed(state, group, data, 'staff', names), live: liveBanner(state, data),
      events: eventsOf(state, group, data, 'staff', names, { staff: true }).map(view => ({ ...view,
        people: Object.entries(data.events?.[view.id]?.attendees || {}).map(([id, row]) => ({ id, name: names.get(id) || 'Membro', email: directory.get(id)?.email || '', status: row.status, paid: Boolean(row.paid), at: row.at }))
          .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)) })),
      queue: queue.sort((a, b) => b.created.localeCompare(a.created)),
      analytics: communityAnalytics(state, group, data, { days, zone: state.profile?.timezone || 'America/Sao_Paulo' }),
      members: Object.entries(data.members).map(([id, row]) => ({ id, name: names.get(id) || 'Membro', email: contacts.get(id)?.email || '',
        status: row.status, role: row.role, joinedAt: row.joinedAt, points: totals.get(id) || 0, level: levelOf(totals.get(id) || 0),
        answers: row.answers || [], badges: badgeLabels(badges.get(id)), planId: row.planId || '', paidUntil: row.paidUntil || '', expired: row.status === 'active' && !hasAccess(group, row),
        lastActive: row.lastActive || '', channels: group.channels.filter(channel => channel.private && data.channelAccess?.[channel.id]?.[id]).map(channel => channel.id), onboarding: (row.onboardingDone || []).filter(stepId => (group.onboarding || []).some(step => step.id === stepId)).length }))
        .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)),
      candidates: [...contacts.values()].filter(member => !member.revokedAt && !data.members[member.id]).map(member => ({ id: member.id, name: displayName(member), email: member.email })) };
  }

  async function admin(workspace, state, portal, groupId, input, options = {}) {
    if (!input) return adminView(state, portal, await load(workspace), groupId, options);
    const group = state.communities.find(row => row.id === groupId) || fail('Comunidade não encontrada.', 404);
    const added = [], welcome = [], activity = [];
    // A member who loses the group: a refused request, or access taken away.
    const lost = (memberId, row, reason) => { if (row?.status === 'requested') activity.push({ event: 'rejected', memberId }); else if (row?.status === 'active') activity.push({ event: 'revoked', memberId, reason }); };
    const result = await change(workspace, ranked(group, groupId, activity, doc => {
      activity.length = 0;
      const data = groupData(doc, groupId), action = input.action;
      if (action === 'post') {
        const post = writePost(data, group, 'staff', input);
        post.pinned = Boolean(input.pinned);
        const image = str(input.imageFileId, 60);
        if (image && !state.files.some(file => file.id === image && file.data.startsWith('data:image/'))) fail('Escolha uma imagem da Mídia Drive.');
        post.imageFileId = image;
      } else if (action === 'comment') {
        const post = findPost(data, input.postId);
        post.comments.push({ id: randomUUID(), authorId: 'staff', body: str(input.body, 2000) || fail('Escreva o comentário.'), created: new Date().toISOString(), likes: [] });
      } else if (action === 'pin') {
        const post = findPost(data, input.postId); post.pinned = !post.pinned;
      } else if (action === 'delete') {
        const post = findPost(data, input.postId);
        if (input.commentId) post.comments = post.comments.filter(row => row.id !== input.commentId);
        else data.posts = data.posts.filter(row => row !== post);
      } else if (action === 'member') {
        const row = data.members[input.memberId] || fail('Membro não encontrado.', 404);
        if (input.status === 'active' && row.status !== 'active') welcome.push(input.memberId);
        if (input.status === 'banned' && row.status !== 'banned') lost(input.memberId, row, 'banned');
        if (input.status !== undefined) row.status = ['active', 'requested', 'banned'].includes(input.status) ? input.status : fail('Situação inválida.');
        if (input.role !== undefined) row.role = input.role === 'moderator' ? 'moderator' : 'member';
      } else if (action === 'add') {
        const ids = Array.isArray(input.memberIds) ? input.memberIds.slice(0, 500) : [];
        const valid = new Set((portal?.members || []).filter(member => !member.revokedAt).map(member => member.id));
        for (const id of ids) if (valid.has(id) && !data.members[id]) { data.members[id] = { role: 'member', status: 'active', joinedAt: new Date().toISOString() }; welcome.push(id); }
      } else if (action === 'channel-access') {
        const channel = group.channels.find(row => row.id === input.channelId && row.private) || fail('Canal privado não encontrado.', 404);
        if (data.members[input.memberId]?.status !== 'active') fail('Só membros ativos recebem acesso a canais privados.');
        const shift = setChannel(data, channel.id, input.memberId, Boolean(input.grant));
        if (shift) activity.push({ event: shift, memberId: input.memberId, channelId: channel.id });
      } else if (action === 'remove') {
        lost(input.memberId, data.members[input.memberId], 'removed');
        delete data.members[input.memberId];
      } else if (action === 'approve' || action === 'reject' || action === 'dismiss') {
        const post = findPost(data, input.postId);
        const target = input.commentId ? post.comments.find(row => row.id === input.commentId) || fail('Comentário não encontrado.', 404) : post;
        if (action === 'reject') { if (input.commentId) post.comments = post.comments.filter(row => row !== target); else data.posts = data.posts.filter(row => row !== post); }
        else {
          // A held post or comment from a member counts as created when the team approves it.
          if (action === 'approve' && target.held && target.authorId !== 'staff') activity.push({ event: input.commentId ? 'comment' : 'post', memberId: target.authorId, postId: post.id, title: post.title, body: target.body });
          if (action === 'approve') delete target.held;
          target.reports = [];
        }
      } else if (action === 'live-start') {
        const event = (state.communityEvents || []).find(row => row.id === input.eventId && row.communityId === group.id) || fail('Evento não encontrado.', 404);
        if (!event.liveUrl && !(event.locationType === 'online' && event.location)) fail('Informe o link da transmissão no evento antes de entrar ao vivo.');
        data.live = { eventId: event.id, startedAt: new Date().toISOString() };
      } else if (action === 'live-end') {
        data.live = null;
      } else if (action === 'attendee-add') {
        const event = (state.communityEvents || []).find(row => row.id === input.eventId && row.communityId === group.id) || fail('Evento não encontrado.', 404);
        const record = eventRecord(data, event.id);
        for (const id of (Array.isArray(input.memberIds) ? input.memberIds : []).slice(0, 500)) {
          if (data.members[id]?.status !== 'active' || record.attendees[id]?.status === 'going') continue;
          record.attendees[id] = { status: 'going', at: new Date().toISOString(), paid: false, guest: true, reminded: {} };
          added.push({ eventId: event.id, memberId: id, paid: false });
        }
      } else if (action === 'attendee-remove') {
        const record = eventRecord(data, input.eventId);
        delete record.attendees[input.memberId];
      } else fail('Ação da comunidade não encontrada.', 404);
      return adminView(state, portal, doc, groupId);
    }));
    for (const row of added) await onEventJoin?.(workspace, row);
    for (const memberId of welcome) await onMemberJoin?.(workspace, { groupId, memberId });
    await announce(workspace, groupId, activity);
    return result;
  }

  // Adds a member to groups (for offers and workflows); banned members stay banned. Returns the groups opened.
  async function enroll(workspace, memberId, groupIds) {
    if (!memberId || !groupIds.length) return [];
    const opened = [];
    await change(workspace, doc => {
      for (const id of groupIds) {
        const data = groupData(doc, id), row = data.members[memberId];
        if (!row) { data.members[memberId] = { role: 'member', status: 'active', joinedAt: new Date().toISOString() }; opened.push(id); }
        else if (['requested', 'pending'].includes(row.status)) { row.status = 'active'; opened.push(id); }
      }
    });
    for (const groupId of opened) await onMemberJoin?.(workspace, { groupId, memberId });
    return opened;
  }

  // Workflows (T.1): takes a member out of groups; returns the groups they were active in.
  async function unenroll(workspace, memberId, groupIds) {
    if (!memberId || !groupIds.length) return [];
    const removed = [], revoked = [];
    await change(workspace, doc => {
      removed.length = revoked.length = 0;
      for (const id of groupIds) {
        const data = groupData(doc, id), row = data.members[memberId];
        if (row && row.status !== 'banned') { if (row.status === 'active') revoked.push(id); delete data.members[memberId]; removed.push(id); }
      }
    });
    for (const id of revoked) await announce(workspace, id, [{ event: 'revoked', memberId, reason: 'workflow' }]);
    return removed;
  }

  // Workflows (T.1): bonus points (negative takes points away) for an active member. Null when not a member.
  async function grantPoints(workspace, state, memberId, groupId, points, note = '') {
    const group = state.communities.find(row => row.id === groupId);
    if (!group || !memberId) return null;
    const activity = [];
    let total = null;
    await change(workspace, ranked(group, groupId, activity, doc => {
      activity.length = 0; total = null;
      const data = groupData(doc, groupId);
      if (data.members[memberId]?.status !== 'active') return;
      (data.bonuses ||= []).push({ memberId, points, note: str(note, 200), at: new Date().toISOString() });
      total = scores(group, data).get(memberId) || 0;
    }));
    await announce(workspace, groupId, activity);
    return total === null ? null : { total, level: levelOf(total), name: group.levels?.[levelOf(total) - 1]?.name || '' };
  }

  // Workflows (T.1): private channel access for an active member. Returns 'granted', 'revoked', 'same' or null (not a member).
  async function channelAccess(workspace, state, memberId, groupId, channelId, grant) {
    const group = state.communities.find(row => row.id === groupId);
    if (!group?.channels.some(channel => channel.id === channelId && channel.private) || !memberId) return null;
    const activity = [];
    let outcome = null;
    await change(workspace, doc => {
      activity.length = 0; outcome = null;
      const data = groupData(doc, groupId);
      if (data.members[memberId]?.status !== 'active') return;
      const shift = setChannel(data, channelId, memberId, grant);
      outcome = shift ? (grant ? 'granted' : 'revoked') : 'same';
      if (shift) activity.push({ event: shift, memberId, channelId });
    });
    await announce(workspace, groupId, activity);
    return outcome;
  }

  return { home, read, act, admin, enroll, unenroll, grantPoints, channelAccess, reserve, markPending, grantTicket, dueReminders, reservePlan, markPlanPending, grantPlan, dueNewsletters };
}
