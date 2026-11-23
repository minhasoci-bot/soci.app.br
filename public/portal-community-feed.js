// Community feed of the client portal: shared helpers (escape, avatar, dates, empty state) and the discussion tab.
import { icon } from './icons.js';

export const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const when = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const dateShort = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
// A stable hue per name, so each person keeps the same avatar color.
const hue = name => [...String(name || '')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
export const avatar = (author, size = '') => `<span class="cp-avatar${author.staff ? ' staff' : ''}${size ? ` cp-avatar-${size}` : ''}" style="--av:${hue(author.name)}" aria-hidden="true">${h(initials(author.name))}${author.staff || !author.level ? '' : `<b>${author.level}</b>`}</span>`;
export const badgeChip = author => author.badges?.length ? ` <span class="cp-tag cp-badge" title="${h(author.badges.map(row => row.label).join(', '))}">${icon('award', 12)} ${h(author.badges[0].label)}${author.badges.length > 1 ? ` +${author.badges.length - 1}` : ''}</span>` : '';
/** The empty state: an icon in a circle, a title, one line and an optional action. */
export const empty = (name, title, text, action = '') => `<section class="cp-cm-empty"><span class="cp-cm-empty-icon">${icon(name, 20)}</span><h2>${h(title)}</h2><p>${h(text)}</p>${action}</section>`;

function postCard(post, membership) {
  const active = membership?.status === 'active';
  return `<article class="cp-public-card cp-post ${post.pinned ? 'pinned' : ''}">
    <header>${avatar(post.author)}<div><strong>${h(post.author.name)}</strong>${post.author.staff ? ' <span class="cp-tag">Equipe</span>' : badgeChip(post.author)}${post.held ? ` <span class="cp-tag cp-held" title="${h(post.held)}">${post.held === 'Em análise' ? 'Em análise' : 'Retida'}</span>` : ''}
      <small>em #${h(post.channel)} · ${h(when(post.created))}${post.pinned ? ' · Fixada' : ''}</small></div>
      ${post.canDelete ? `<button type="button" class="cp-icon-button" data-cm-public="delete" data-post="${h(post.id)}" aria-label="Excluir publicação" title="Excluir">${icon('trash', 16)}</button>` : ''}</header>
    <h3>${h(post.title)}</h3><p class="cp-post-body">${h(post.body)}</p>
    ${post.image ? `<img class="cp-post-image" src="${h(post.image)}" alt="">` : ''}
    ${post.link ? `<a class="cp-public-link" href="${h(post.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 15)} ${h(post.link.replace(/^https:\/\//, '').slice(0, 60))}</a>` : ''}
    ${post.poll ? `<div class="cp-poll" role="group" aria-label="Enquete">${post.poll.options.map(option => { const share = post.poll.total ? Math.round(option.votes / post.poll.total * 100) : 0;
      return `<button type="button" data-cm-public="vote" data-post="${h(post.id)}" data-option="${h(option.id)}" aria-pressed="${post.poll.voted === option.id}" ${active ? '' : 'disabled'}>
        <span class="cp-poll-fill" style="width:${post.poll.voted ? share : 0}%"></span><span>${h(option.text)}</span>${post.poll.voted ? `<small>${share}%</small>` : ''}</button>`; }).join('')}
      <small>${post.poll.total} ${post.poll.total === 1 ? 'voto' : 'votos'}</small></div>` : ''}
    <footer class="cp-post-actions"><button type="button" data-cm-public="like" data-post="${h(post.id)}" aria-pressed="${post.liked}" ${active ? '' : 'disabled'}>${icon('star', 16)} ${post.likes ? post.likes : ''} Curtir</button>
      <span>${icon('chat', 16)} ${post.comments.length} ${post.comments.length === 1 ? 'comentário' : 'comentários'}</span>
      ${active && !post.mine && !post.author.staff ? `<button type="button" class="cp-report" data-cm-public="report" data-post="${h(post.id)}" ${post.reported ? 'disabled' : ''}>${post.reported ? 'Denunciada' : 'Denunciar'}</button>` : ''}</footer>
    ${post.comments.length ? `<ul class="cp-comments">${post.comments.map(comment => `<li>${avatar(comment.author)}<div><strong>${h(comment.author.name)}</strong>${comment.held ? ' <span class="cp-tag cp-held">Em análise</span>' : ''}
      <p>${h(comment.body)}</p><span class="cp-comment-tools"><small>${h(when(comment.created))}</small>
      <button type="button" data-cm-public="like" data-post="${h(post.id)}" data-comment="${h(comment.id)}" aria-pressed="${comment.liked}" ${active ? '' : 'disabled'}>Curtir${comment.likes ? ` · ${comment.likes}` : ''}</button>
      ${comment.canDelete ? `<button type="button" data-cm-public="delete" data-post="${h(post.id)}" data-comment="${h(comment.id)}">Excluir</button>` : ''}
      ${active && !comment.mine && !comment.author.staff ? `<button type="button" data-cm-public="report" data-post="${h(post.id)}" data-comment="${h(comment.id)}" ${comment.reported ? 'disabled' : ''}>${comment.reported ? 'Denunciado' : 'Denunciar'}</button>` : ''}</span></div></li>`).join('')}</ul>` : ''}
    ${active && post.commentsEnabled ? `<form class="cp-comment-form" data-cm-public-form="comment" data-post="${h(post.id)}">
      <input name="body" required maxlength="2000" placeholder="Escreva um comentário" aria-label="Escreva um comentário"><button type="submit" class="cp-public-ghost">Enviar</button></form>` : ''}
  </article>`;
}

function composer(view) {
  const { group, membership } = view;
  if (membership?.status !== 'active' || (!group.memberPosts && membership.role !== 'moderator')) return '';
  return `<details class="cp-public-card cp-composer"><summary>${icon('edit', 16)} Criar publicação</summary>
    <form data-cm-public-form="post">
      <label>Canal<select name="channelId">${group.channels.map(channel => `<option value="${h(channel.id)}">#${h(channel.name)}</option>`).join('')}</select></label>
      <label>Título<input name="title" required maxlength="200"></label>
      <label>Texto<textarea name="body" required rows="4" maxlength="10000" placeholder="Compartilhe uma ideia, dúvida ou novidade"></textarea></label>
      <label>Link (opcional)<input name="link" type="url" maxlength="500" placeholder="https://…"></label>
      <label>Enquete (opcional, uma opção por linha)<textarea name="poll" rows="2" maxlength="500"></textarea></label>
      <button type="submit" class="cp-public-primary">Publicar</button></form></details>`;
}

function onboardingCard(view) {
  const steps = view.group.onboarding || [], done = new Set(view.membership?.onboardingDone || []);
  if (view.membership?.status !== 'active' || !steps.length || steps.every(step => done.has(step.id))) return '';
  return `<section class="cp-public-card cp-onboarding"><h2>Primeiros passos</h2><p class="cp-meta">${done.size} de ${steps.length} concluídos</p><ol>${steps.map(step => `<li>
    <button type="button" class="cp-check" data-cm-public="onboarding" data-step="${h(step.id)}" data-done="${done.has(step.id) ? 'no' : 'yes'}" aria-pressed="${done.has(step.id)}">${done.has(step.id) ? icon('check', 14) : ''}</button>
    <div><strong>${h(step.title)}</strong>${step.description ? `<small>${h(step.description)}</small>` : ''}${step.link ? `<a href="${h(step.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 13)} Abrir</a>` : ''}</div></li>`).join('')}</ol></section>`;
}

/** The discussion tab: first steps, welcome, composer and the posts. */
export function feedTab(view) {
  const { group, membership } = view;
  return `${onboardingCard(view)}${membership?.status === 'active' && group.welcome ? `<p class="cp-public-card cp-welcome">${h(group.welcome)}</p>` : ''}${composer(view)}
    ${view.posts.length ? view.posts.map(post => postCard(post, membership)).join('') : empty('chat', 'Ainda não há publicações', 'Comece a conversa com uma ideia, dúvida ou novidade.')}`;
}
