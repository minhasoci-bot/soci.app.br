// Community feed of the client portal: shared helpers (escape, avatar, dates, empty state, segmented filter)
// and the discussion tab — first steps, an always-open composer, the feed filters and the post cards.
import { icon } from './icons.js';
import { composerPromptDefault } from './community-data.js';

export const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const dateShort = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
// A stable hue per name, so each person keeps the same avatar color.
const hue = name => [...String(name || '')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
export const avatar = (author, size = '') => `<span class="cp-avatar${author.staff ? ' staff' : ''}${size ? ` cp-avatar-${size}` : ''}" style="--av:${hue(author.name)}" aria-hidden="true">${h(initials(author.name))}${author.staff || !author.level ? '' : `<b>${author.level}</b>`}</span>`;
export const badgeChip = author => author.badges?.length ? ` <span class="cp-tag cp-badge" title="${h(author.badges.map(row => row.label).join(', '))}">${icon('award', 12)} ${h(author.badges[0].label)}${author.badges.length > 1 ? ` +${author.badges.length - 1}` : ''}</span>` : '';
/** The empty state: an icon in a circle, a title, one line and an optional action. */
export const empty = (name, title, text, action = '') => `<section class="cp-cm-empty"><span class="cp-cm-empty-icon">${icon(name, 20)}</span><h2>${h(title)}</h2><p>${h(text)}</p>${action}</section>`;
/** A pill segmented control; each button sends `data-cm-public=<verb>` with its value. */
export const segment = (verb, current, options, label) => `<div class="cp-segment" role="group" aria-label="${h(label)}">${options.map(([value, text]) =>
  `<button type="button" data-cm-public="${verb}" data-value="${value}" aria-pressed="${current === value}">${text}</button>`).join('')}</div>`;

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** "agora", "5 min", "3 h", "2 d", then the day ("03 nov"). */
export function relativeTime(iso, now = Date.now()) {
  const gap = now - Date.parse(iso);
  if (gap < MIN) return 'agora';
  if (gap < HOUR) return `${Math.floor(gap / MIN)} min`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)} h`;
  if (gap < 7 * DAY) return `${Math.floor(gap / DAY)} d`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(iso)).replace(' de ', ' ').replace('.', '');
}

const newest = (a, b) => String(b.created).localeCompare(String(a.created));
const buzz = post => post.likes + post.comments.length;
/** Recentes (fixadas primeiro), Em alta (curtidas + comentários nos últimos 30 dias) ou Minhas. */
export function filterFeed(posts, filter = 'recent', now = Date.now()) {
  if (filter === 'mine') return posts.filter(post => post.mine).sort(newest);
  if (filter === 'hot') return posts.filter(post => now - Date.parse(post.created) <= 30 * DAY).sort((a, b) => buzz(b) - buzz(a) || newest(a, b));
  return [...posts].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || newest(a, b));
}

const pollBlock = (post, active) => `<div class="cp-poll" role="group" aria-label="Enquete">${post.poll.options.map(option => {
  const share = post.poll.total ? Math.round(option.votes / post.poll.total * 100) : 0;
  return `<button type="button" data-cm-public="vote" data-post="${h(post.id)}" data-option="${h(option.id)}" aria-pressed="${post.poll.voted === option.id}" ${active ? '' : 'disabled'}>
    <span class="cp-poll-fill" style="width:${post.poll.voted ? share : 0}%"></span><span>${h(option.text)}</span>${post.poll.voted ? `<small>${share}%</small>` : ''}</button>`; }).join('')}
  <small>${post.poll.total} ${post.poll.total === 1 ? 'voto' : 'votos'}</small></div>`;

// The "⋯" menu: delete (own content or moderator) and report (someone else's).
function menu(target, active, kind) {
  const ids = `data-post="${h(target.postId)}"${target.commentId ? ` data-comment="${h(target.commentId)}"` : ''}`;
  const items = [
    target.canDelete ? `<button type="button" data-cm-public="delete" ${ids}>${icon('trash', 15)} Excluir</button>` : '',
    active && !target.mine && !target.author.staff ? `<button type="button" class="cp-report" data-cm-public="report" ${ids} ${target.reported ? 'disabled' : ''}>${icon('alert', 15)} ${target.reported ? (kind === 'post' ? 'Denunciada' : 'Denunciado') : 'Denunciar'}</button>` : ''
  ].filter(Boolean);
  return items.length ? `<details class="cp-cm-menu"><summary aria-label="Mais opções">${icon('dots', 16)}</summary><div class="cp-cm-menu-list">${items.join('')}</div></details>` : '';
}

function commentItem(post, comment, active, now) {
  return `<li>${avatar(comment.author, 'sm')}<div class="cp-comment-main"><div class="cp-comment-bubble"><strong>${h(comment.author.name)}</strong>${comment.held ? ' <span class="cp-tag cp-held">Em análise</span>' : ''}
    <p>${h(comment.body)}</p></div><span class="cp-comment-tools"><small>${h(relativeTime(comment.created, now))}</small>
    <button type="button" data-cm-public="like" data-post="${h(post.id)}" data-comment="${h(comment.id)}" aria-pressed="${comment.liked}" ${active ? '' : 'disabled'}>Curtir${comment.likes ? ` · ${comment.likes}` : ''}</button>
    ${menu({ ...comment, postId: post.id, commentId: comment.id }, active, 'comment')}</span></div></li>`;
}

function postCard(post, membership, ui, now) {
  const active = membership?.status === 'active', total = post.comments.length;
  const open = ui.openComments?.has?.(post.id), shown = open ? post.comments : post.comments.slice(-2);
  return `<article class="cp-public-card cp-post${post.pinned ? ' pinned' : ''}" id="post-${h(post.id)}">
    <header class="cp-post-head">${avatar(post.author)}<div class="cp-post-who"><strong>${h(post.author.name)}</strong>${post.author.staff ? ' <span class="cp-tag">Equipe</span>' : badgeChip(post.author)}${post.held ? ` <span class="cp-tag cp-held" title="${h(post.held)}">${post.held === 'Em análise' ? 'Em análise' : 'Retida'}</span>` : ''}
      <small>#${h(post.channel)} · <time datetime="${h(post.created)}">${h(relativeTime(post.created, now))}</time>${post.pinned ? ` · ${icon('pin', 12)} Fixada` : ''}</small></div>
      ${menu({ ...post, postId: post.id }, active, 'post')}</header>
    ${post.titleAuto ? '' : `<h3>${h(post.title)}</h3>`}<p class="cp-post-body">${h(post.body)}</p>
    ${post.image ? `<img class="cp-post-image" src="${h(post.image)}" alt="">` : ''}
    ${post.link ? `<a class="cp-post-link" href="${h(post.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 15)} ${h(post.link.replace(/^https:\/\//, '').slice(0, 60))}</a>` : ''}
    ${post.poll ? pollBlock(post, active) : ''}
    <footer class="cp-post-actions">
      <button type="button" data-cm-public="like" data-post="${h(post.id)}" aria-pressed="${post.liked}" ${active ? '' : 'disabled'}>${icon('thumbUp', 16)}<span>${post.likes || ''}</span> Curtir</button>
      ${active && post.commentsEnabled ? `<button type="button" data-cm-public="comment-focus" data-post="${h(post.id)}">${icon('chat', 16)}<span>${total || ''}</span> Comentar</button>` : `<span class="cp-post-count">${icon('chat', 16)} ${total}</span>`}
      <button type="button" class="cp-post-share" data-cm-public="share" data-post="${h(post.id)}">${icon('link', 16)} <span>Compartilhar</span></button></footer>
    ${total ? `<ul class="cp-comments">${shown.map(comment => commentItem(post, comment, active, now)).join('')}</ul>
      ${total > shown.length ? `<button type="button" class="cp-cm-more" data-cm-public="comments-all" data-post="${h(post.id)}">Ver todos os ${total} comentários</button>` : ''}` : ''}
    ${active && post.commentsEnabled ? `<form class="cp-comment-form" data-cm-public-form="comment" data-post="${h(post.id)}">
      <input name="body" required maxlength="2000" placeholder="Escreva um comentário" aria-label="Escreva um comentário"><button type="submit" class="cp-public-ghost">${icon('send', 15)}<span>Enviar</span></button></form>` : ''}
  </article>`;
}

function composer(view, ui) {
  const { group, membership } = view;
  if (membership?.status !== 'active' || (!group.memberPosts && membership.role !== 'moderator')) return '';
  const prompt = group.layout?.composerPrompt || composerPromptDefault;
  return `<form class="cp-public-card cp-cm-composer" data-cm-public-form="post">
    <div class="cp-cm-composer-row">${avatar({ name: ui.me || 'Você' })}<textarea name="body" required rows="2" maxlength="10000" placeholder="${h(prompt)}" aria-label="${h(prompt)}"></textarea></div>
    <div class="cp-cm-composer-more">
      <input name="title" maxlength="200" placeholder="Título (opcional)" aria-label="Título (opcional)">
      <div class="cp-cm-composer-fields"><label>${icon('list', 15)}<select name="channelId" aria-label="Canal">${group.channels.map(channel => `<option value="${h(channel.id)}"${ui.channel === channel.id ? ' selected' : ''}>#${h(channel.name)}</option>`).join('')}</select></label>
        <label>${icon('link', 15)}<input name="link" type="url" maxlength="500" placeholder="Link (opcional)" aria-label="Link (opcional)"></label></div>
      <textarea name="poll" rows="2" maxlength="500" placeholder="Enquete (opcional): uma opção por linha" aria-label="Enquete, uma opção por linha"></textarea></div>
    <div class="cp-cm-composer-foot"><small data-cm-count>0/10000</small><button type="submit" class="cp-public-primary">Publicar ${icon('send', 15)}</button></div></form>`;
}

function onboardingCard(view) {
  const steps = view.group.onboarding || [], done = new Set(view.membership?.onboardingDone || []);
  if (view.membership?.status !== 'active' || !steps.length || steps.every(step => done.has(step.id))) return '';
  const share = Math.round(done.size / steps.length * 100);
  return `<section class="cp-public-card cp-onboarding"><div class="cp-onboarding-head"><h2>Primeiros passos</h2><span class="cp-tag">${done.size}/${steps.length}</span></div>
    <span class="cp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${share}" aria-label="Primeiros passos"><span style="width:${share}%"></span></span><ol>${steps.map(step => `<li>
    <button type="button" class="cp-check" data-cm-public="onboarding" data-step="${h(step.id)}" data-done="${done.has(step.id) ? 'no' : 'yes'}" aria-pressed="${done.has(step.id)}" aria-label="${h(step.title)}">${done.has(step.id) ? icon('check', 14) : ''}</button>
    <div><strong>${h(step.title)}</strong>${step.description ? `<small>${h(step.description)}</small>` : ''}${step.link ? `<a href="${h(step.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 13)} Abrir</a>` : ''}</div></li>`).join('')}</ol></section>`;
}

const emptyFeed = {
  recent: ['chat', 'Ainda não há publicações', 'Comece a conversa com uma ideia, dúvida ou novidade.'],
  hot: ['star', 'Nada em alta agora', 'As publicações mais curtidas e comentadas dos últimos 30 dias aparecem aqui.'],
  mine: ['edit', 'Você ainda não publicou', 'Sua primeira publicação vale pontos no ranking.']
};

/** The discussion tab: first steps, welcome, composer, the feed filters and the posts. */
export function feedTab(view, ui = {}, now = Date.now()) {
  const { group, membership } = view, filter = emptyFeed[ui.feed] ? ui.feed : 'recent';
  const posts = filterFeed(view.posts, filter, now);
  return `${onboardingCard(view)}${membership?.status === 'active' && group.welcome ? `<p class="cp-public-card cp-welcome">${h(group.welcome)}</p>` : ''}${composer(view, ui)}
    <div class="cp-cm-toolbar">${segment('feed', filter, [['recent', 'Recentes'], ['hot', 'Em alta'], ['mine', 'Minhas']], 'Filtrar publicações')}</div>
    ${posts.length ? posts.map(post => postCard(post, membership, ui, now)).join('') : empty(...emptyFeed[filter])}`;
}
