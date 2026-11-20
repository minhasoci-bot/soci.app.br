// Communities: groups configured in the workspace (name, channels, points, levels) and member activity
// (memberships, posts, comments, likes, polls) kept in a separate `community-<workspace>` document.
import { randomUUID } from 'node:crypto';

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
    const channels = channelInput.map(channel => ({ id: idOf(channel?.id), name: str(channel?.name, 40) || fail('Todo canal precisa de um nome.') }));
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
      channels, levels, points: points(d.points, prior?.points)
    };
  }
};

const blankDoc = () => ({ groups: {} });
const groupData = (doc, id) => doc.groups[id] ||= { members: {}, posts: [] };
const displayName = member => member?.name || (member?.email || '').split('@')[0] || 'Membro';
const https = value => { const link = str(value, 500); if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail('Use um link que comece com https://.'); return link; };

// Points per author in a period: posts, comments and likes received (likes on your own content do not count).
function scores(group, data, since = 0) {
  const totals = new Map(), add = (id, value) => { if (id !== 'staff' && value) totals.set(id, (totals.get(id) || 0) + value); };
  for (const post of data.posts) {
    if (Date.parse(post.created) >= since) add(post.authorId, group.points.post);
    for (const like of post.likes) if (like.memberId !== post.authorId && Date.parse(like.at) >= since) add(post.authorId, group.points.like);
    for (const comment of post.comments) {
      if (comment.authorId !== post.authorId && Date.parse(comment.created) >= since) add(comment.authorId, group.points.comment);
      for (const like of comment.likes) if (like.memberId !== comment.authorId && Date.parse(like.at) >= since) add(comment.authorId, group.points.like);
    }
  }
  return totals;
}

export function makeCommunity({ store }) {
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

  function postView(state, group, data, post, viewer, names, levels) {
    const author = post.authorId === 'staff' ? { name: state.profile.name, staff: true, level: 0 }
      : { name: names.get(post.authorId) || 'Membro', staff: false, level: levels.get(post.authorId) || 1 };
    const moderator = viewer === 'staff' || data.members[viewer]?.role === 'moderator';
    const image = post.imageFileId && state.files.find(file => file.id === post.imageFileId && file.data.startsWith('data:image/'));
    return {
      id: post.id, channelId: post.channelId, channel: group.channels.find(channel => channel.id === post.channelId)?.name || '',
      title: post.title, body: post.body, link: post.link || '', image: image?.data || '', pinned: Boolean(post.pinned), created: post.created,
      author, mine: post.authorId === viewer, canDelete: post.authorId === viewer || moderator, commentsEnabled: post.commentsEnabled !== false,
      likes: post.likes.length, liked: post.likes.some(like => like.memberId === viewer),
      poll: post.poll ? { options: post.poll.map(option => ({ id: option.id, text: option.text, votes: option.votes.length })),
        voted: post.poll.find(option => option.votes.includes(viewer))?.id || null, total: post.poll.reduce((sum, option) => sum + option.votes.length, 0) } : null,
      comments: post.comments.map(comment => ({ id: comment.id, body: comment.body, created: comment.created,
        author: comment.authorId === 'staff' ? { name: state.profile.name, staff: true, level: 0 } : { name: names.get(comment.authorId) || 'Membro', staff: false, level: levels.get(comment.authorId) || 1 },
        likes: comment.likes.length, liked: comment.likes.some(like => like.memberId === viewer), mine: comment.authorId === viewer,
        canDelete: comment.authorId === viewer || moderator }))
    };
  }

  function feed(state, group, data, viewer, names, channelId = '') {
    const levels = new Map([...scores(group, data)].map(([id, total]) => [id, levelOf(total)]));
    return data.posts.filter(post => !channelId || post.channelId === channelId)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.created.localeCompare(a.created)).slice(0, 100)
      .map(post => postView(state, group, data, post, viewer, names, levels));
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
      memberCount: Object.values(data.members).filter(row => row.status === 'active').length, postCount: data.posts.length };
  }

  // What a signed-in portal member sees of one group.
  function memberView(state, portal, group, data, member, { channelId = '', period = '30' } = {}) {
    const membership = data.members[member.id];
    if (membership?.status === 'banned') fail('Você não tem mais acesso a esta comunidade.', 403);
    const names = new Map([...people(portal)].map(([id, row]) => [id, displayName(row)]));
    const open = membership?.status === 'active' || (!membership && group.visibility === 'public') || (membership?.status === 'requested' && group.visibility === 'public');
    const view = { group: groupHeader(state, group, data), membership: membership ? { status: membership.status, role: membership.role } : null };
    if (!open) return view;
    return { ...view, posts: feed(state, group, data, member.id, names, channelId),
      members: Object.entries(data.members).filter(([, row]) => row.status === 'active')
        .map(([id, row]) => ({ name: names.get(id) || 'Membro', role: row.role, joinedAt: row.joinedAt, level: levelOf(scores(group, data).get(id) || 0) }))
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
    const channelId = group.channels.some(channel => channel.id === input.channelId) ? input.channelId : group.channels[0].id;
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
    return change(workspace, doc => {
      const data = groupData(doc, groupId), membership = data.members[member.id];
      if (membership?.status === 'banned') fail('Você não tem mais acesso a esta comunidade.', 403);
      if (action === 'join') {
        if (!membership) data.members[member.id] = { role: 'member', status: group.visibility === 'public' ? 'active' : 'requested', joinedAt: new Date().toISOString() };
      } else if (action === 'leave') {
        delete data.members[member.id];
      } else {
        if (membership?.status !== 'active') fail('Entre na comunidade para participar.', 403);
        const moderator = membership.role === 'moderator';
        if (action === 'post') {
          if (!group.memberPosts && !moderator) fail('Somente a equipe publica nesta comunidade.', 403);
          writePost(data, group, member.id, input);
        } else if (action === 'comment') {
          const post = findPost(data, input.postId);
          if (post.commentsEnabled === false) fail('Os comentários estão desativados nesta publicação.', 403);
          if (post.comments.length >= 500) fail('Esta publicação atingiu o limite de comentários.', 409);
          post.comments.push({ id: randomUUID(), authorId: member.id, body: str(input.body, 2000) || fail('Escreva o comentário.'), created: new Date().toISOString(), likes: [] });
        } else if (action === 'like') {
          const post = findPost(data, input.postId);
          toggleLike(input.commentId ? (post.comments.find(row => row.id === input.commentId) || fail('Comentário não encontrado.', 404)).likes : post.likes, member.id);
        } else if (action === 'vote') {
          const post = findPost(data, input.postId);
          const option = post.poll?.find(row => row.id === input.optionId) || fail('Opção não encontrada.', 404);
          for (const row of post.poll) row.votes = row.votes.filter(id => id !== member.id);
          option.votes.push(member.id);
        } else if (action === 'delete') {
          const post = findPost(data, input.postId);
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
    });
  }

  // Staff view of one group (or a summary of all) for the admin panel.
  function adminView(state, portal, doc, groupId) {
    const names = new Map([...people(portal)].map(([id, row]) => [id, displayName(row)]));
    if (!groupId) return { groups: state.communities.map(group => {
      const data = doc.groups[group.id] || { members: {}, posts: [] }, members = Object.values(data.members);
      return { id: group.id, memberCount: members.filter(row => row.status === 'active').length,
        requested: members.filter(row => row.status === 'requested').length, postCount: data.posts.length,
        lastActivity: data.posts.map(post => post.created).sort().at(-1) || '' };
    }) };
    const group = state.communities.find(row => row.id === groupId) || fail('Comunidade não encontrada.', 404);
    const data = doc.groups[groupId] || { members: {}, posts: [] }, totals = scores(group, data);
    const contacts = people(portal);
    return { group: groupHeader(state, group, data), posts: feed(state, group, data, 'staff', names),
      members: Object.entries(data.members).map(([id, row]) => ({ id, name: names.get(id) || 'Membro', email: contacts.get(id)?.email || '',
        status: row.status, role: row.role, joinedAt: row.joinedAt, points: totals.get(id) || 0, level: levelOf(totals.get(id) || 0) }))
        .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name)),
      candidates: [...contacts.values()].filter(member => !member.revokedAt && !data.members[member.id]).map(member => ({ id: member.id, name: displayName(member), email: member.email })) };
  }

  async function admin(workspace, state, portal, groupId, input) {
    if (!input) return adminView(state, portal, await load(workspace), groupId);
    const group = state.communities.find(row => row.id === groupId) || fail('Comunidade não encontrada.', 404);
    return change(workspace, doc => {
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
        if (input.status !== undefined) row.status = ['active', 'requested', 'banned'].includes(input.status) ? input.status : fail('Situação inválida.');
        if (input.role !== undefined) row.role = input.role === 'moderator' ? 'moderator' : 'member';
      } else if (action === 'add') {
        const ids = Array.isArray(input.memberIds) ? input.memberIds.slice(0, 500) : [];
        const valid = new Set((portal?.members || []).filter(member => !member.revokedAt).map(member => member.id));
        for (const id of ids) if (valid.has(id) && !data.members[id]) data.members[id] = { role: 'member', status: 'active', joinedAt: new Date().toISOString() };
      } else if (action === 'remove') {
        delete data.members[input.memberId];
      } else fail('Ação da comunidade não encontrada.', 404);
      return adminView(state, portal, doc, groupId);
    });
  }

  // Adds a member to groups (for offers); banned members stay banned.
  async function enroll(workspace, memberId, groupIds) {
    if (!memberId || !groupIds.length) return;
    await change(workspace, doc => {
      for (const id of groupIds) {
        const data = groupData(doc, id), row = data.members[memberId];
        if (!row) data.members[memberId] = { role: 'member', status: 'active', joinedAt: new Date().toISOString() };
        else if (row.status === 'requested') row.status = 'active';
      }
    });
  }

  return { home, read, act, admin, enroll };
}
