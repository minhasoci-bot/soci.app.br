// Community screens of the client portal: the list on the home page and one group (feed, members, ranking, about).
import { icon } from './icons.js';

const h = value => String(value ?? '').replace(/[&<>"']/g,char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const when = value => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
const avatar = author => `<span class="cp-avatar ${author.staff ? 'staff' : ''}" aria-hidden="true">${h(initials(author.name))}${author.staff ? '' : `<b>${author.level}</b>`}</span>`;
export const communityTabs = [['discussion','Discussão'],['members','Membros'],['ranking','Ranking'],['about','Sobre']];

export function communityCards(list) {
  if (!list?.length) return '';
  const label = status => status === 'active' ? 'Abrir' : status === 'requested' ? 'Aguardando aprovação' : 'Conhecer';
  return `<section class="cp-library" id="comunidades"><h2>Comunidades</h2><div class="cp-course-grid">${list.map(item => `<article class="cp-public-card cp-course-card">
    <div class="cp-cover">${item.cover ? `<img src="${h(item.cover)}" alt="">` : `<span class="cp-course-icon">${icon('users',26)}</span>`}</div>
    <div class="cp-course-text"><h3>${h(item.name)}</h3>${item.description ? `<p>${h(item.description)}</p>` : ''}
      <small class="cp-meta">${item.visibility === 'private' ? `${icon('lock',13)} Privada` : 'Pública'} · ${item.memberCount} ${item.memberCount === 1 ? 'membro' : 'membros'}</small>
      <button type="button" class="${item.membership === 'active' ? 'cp-public-primary' : 'cp-public-ghost'}" data-community="${h(item.id)}">${label(item.membership)} ${icon('right',16)}</button></div>
  </article>`).join('')}</div></section>`;
}

function postCard(post, membership) {
  const active = membership?.status === 'active';
  return `<article class="cp-public-card cp-post ${post.pinned ? 'pinned' : ''}">
    <header>${avatar(post.author)}<div><strong>${h(post.author.name)}</strong>${post.author.staff ? ' <span class="cp-tag">Equipe</span>' : ''}
      <small>em #${h(post.channel)} · ${h(when(post.created))}${post.pinned ? ' · Fixada' : ''}</small></div>
      ${post.canDelete ? `<button type="button" class="cp-icon-button" data-cm-public="delete" data-post="${h(post.id)}" aria-label="Excluir publicação" title="Excluir">${icon('trash',16)}</button>` : ''}</header>
    <h3>${h(post.title)}</h3><p class="cp-post-body">${h(post.body)}</p>
    ${post.image ? `<img class="cp-post-image" src="${h(post.image)}" alt="">` : ''}
    ${post.link ? `<a class="cp-public-link" href="${h(post.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external',15)} ${h(post.link.replace(/^https:\/\//, '').slice(0, 60))}</a>` : ''}
    ${post.poll ? `<div class="cp-poll" role="group" aria-label="Enquete">${post.poll.options.map(option => { const share = post.poll.total ? Math.round(option.votes / post.poll.total * 100) : 0;
      return `<button type="button" data-cm-public="vote" data-post="${h(post.id)}" data-option="${h(option.id)}" aria-pressed="${post.poll.voted === option.id}" ${active ? '' : 'disabled'}>
        <span class="cp-poll-fill" style="width:${post.poll.voted ? share : 0}%"></span><span>${h(option.text)}</span>${post.poll.voted ? `<small>${share}%</small>` : ''}</button>`; }).join('')}
      <small>${post.poll.total} ${post.poll.total === 1 ? 'voto' : 'votos'}</small></div>` : ''}
    <footer class="cp-post-actions"><button type="button" data-cm-public="like" data-post="${h(post.id)}" aria-pressed="${post.liked}" ${active ? '' : 'disabled'}>${icon('star',16)} ${post.likes ? post.likes : ''} Curtir</button>
      <span>${icon('chat',16)} ${post.comments.length} ${post.comments.length === 1 ? 'comentário' : 'comentários'}</span></footer>
    ${post.comments.length ? `<ul class="cp-comments">${post.comments.map(comment => `<li>${avatar(comment.author)}<div><strong>${h(comment.author.name)}</strong>
      <p>${h(comment.body)}</p><span class="cp-comment-tools"><small>${h(when(comment.created))}</small>
      <button type="button" data-cm-public="like" data-post="${h(post.id)}" data-comment="${h(comment.id)}" aria-pressed="${comment.liked}" ${active ? '' : 'disabled'}>Curtir${comment.likes ? ` · ${comment.likes}` : ''}</button>
      ${comment.canDelete ? `<button type="button" data-cm-public="delete" data-post="${h(post.id)}" data-comment="${h(comment.id)}">Excluir</button>` : ''}</span></div></li>`).join('')}</ul>` : ''}
    ${active && post.commentsEnabled ? `<form class="cp-comment-form" data-cm-public-form="comment" data-post="${h(post.id)}">
      <input name="body" required maxlength="2000" placeholder="Escreva um comentário" aria-label="Escreva um comentário"><button type="submit" class="cp-public-ghost">Enviar</button></form>` : ''}
  </article>`;
}

function composer(view) {
  const { group, membership } = view;
  if (membership?.status !== 'active' || (!group.memberPosts && membership.role !== 'moderator')) return '';
  return `<details class="cp-public-card cp-composer"><summary>${icon('edit',16)} Criar publicação</summary>
    <form data-cm-public-form="post">
      <label>Canal<select name="channelId">${group.channels.map(channel => `<option value="${h(channel.id)}">#${h(channel.name)}</option>`).join('')}</select></label>
      <label>Título<input name="title" required maxlength="200"></label>
      <label>Texto<textarea name="body" required rows="4" maxlength="10000" placeholder="Compartilhe uma ideia, dúvida ou novidade"></textarea></label>
      <label>Link (opcional)<input name="link" type="url" maxlength="500" placeholder="https://…"></label>
      <label>Enquete (opcional, uma opção por linha)<textarea name="poll" rows="2" maxlength="500"></textarea></label>
      <button type="submit" class="cp-public-primary">Publicar</button></form></details>`;
}

export function communityPage(view, ui) {
  const { group, membership } = view;
  const status = membership?.status;
  const joinButton = !membership ? `<button type="button" class="cp-public-primary" data-cm-public="join">${group.visibility === 'private' ? 'Pedir para entrar' : 'Entrar na comunidade'}</button>`
    : status === 'requested' ? '<span class="cp-tag">Pedido enviado. Aguarde a aprovação.</span>'
      : '<button type="button" class="cp-public-link" data-cm-public="leave">Sair da comunidade</button>';
  const locked = !view.posts;
  let body = '';
  if (locked) body = `<section class="cp-public-card cp-locked">${icon('lock',22)}<h2>Comunidade privada</h2><p>Somente membros aprovados veem as publicações.</p></section>`;
  else if (ui.tab === 'members') body = `<section class="cp-public-card"><h2>Membros</h2><ul class="cp-member-list">${view.members.map(member => `<li>${avatar({ name: member.name, level: member.level })}
      <div><strong>${h(member.name)}</strong><small>${member.role === 'moderator' ? 'Moderador · ' : ''}Nível ${member.level} · entrou em ${h(new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', year:'numeric' }).format(new Date(member.joinedAt)))}</small></div></li>`).join('') || '<li>Ninguém entrou ainda.</li>'}</ul></section>`;
  else if (ui.tab === 'ranking') {
    const board = view.leaderboard;
    body = `<section class="cp-public-card"><div class="cp-ranking-head"><h2>Ranking</h2><div class="cp-segment" role="group" aria-label="Período">
        ${[['7','7 dias'],['30','30 dias'],['all','Todo o período']].map(([value, label]) => `<button type="button" data-cm-public="period" data-value="${value}" aria-pressed="${board.period === value}">${label}</button>`).join('')}</div></div>
      ${board.me ? `<p class="cp-me">Você está no <b>nível ${board.me.level}</b> com ${board.me.points} pontos${board.me.next ? ` · faltam ${board.me.next} para o próximo nível` : ' · nível máximo'}.</p>` : ''}
      <ol class="cp-leaderboard">${board.top.map((row, index) => `<li><span class="cp-rank">${index + 1}</span>${avatar({ name: row.name, level: row.level })}<strong>${h(row.name)}</strong><b>${row.points} pts</b></li>`).join('') || '<li class="cp-empty-line">Ninguém pontuou neste período ainda.</li>'}</ol>
      <h3>Níveis</h3><ul class="cp-levels">${board.levels.map(level => `<li><span class="cp-level">${level.level}</span><strong>${h(level.name)}</strong><small>a partir de ${level.min} pts · ${level.share}% dos membros</small></li>`).join('')}</ul></section>`;
  } else if (ui.tab === 'about') body = `<section class="cp-public-card"><h2>Sobre</h2><p>${h(group.description || 'Sem descrição.')}</p>
      <p>${group.visibility === 'private' ? 'Comunidade privada' : 'Comunidade pública'} · ${group.memberCount} ${group.memberCount === 1 ? 'membro' : 'membros'} · ${group.postCount} ${group.postCount === 1 ? 'publicação' : 'publicações'}</p></section>`;
  else body = `${status === 'active' && group.welcome ? `<p class="cp-public-card cp-welcome">${h(group.welcome)}</p>` : ''}${composer(view)}
    ${view.posts.length ? view.posts.map(post => postCard(post, membership)).join('') : '<section class="cp-public-card cp-empty-feed"><h2>Ainda não há publicações</h2><p>Comece a conversa com uma ideia, dúvida ou novidade.</p></section>'}`;
  return `<div class="cp-community">
    <button type="button" class="cp-public-link" data-portal-public="back">${icon('left',16)} Início</button>
    <header class="cp-community-head">${group.cover ? `<img src="${h(group.cover)}" alt="">` : ''}<div><h1>${h(group.name)}</h1>
      <p>${group.visibility === 'private' ? `${icon('lock',14)} Privada` : 'Pública'} · ${group.memberCount} ${group.memberCount === 1 ? 'membro' : 'membros'}</p></div>${joinButton}</header>
    ${locked ? '' : `<nav class="cp-community-tabs" aria-label="Seções da comunidade">${communityTabs.map(([value, label]) => `<button type="button" data-cm-public="tab" data-value="${value}" ${ui.tab === value ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`}
    <div class="cp-community-grid">${!locked && ui.tab === 'discussion' ? `<nav class="cp-public-card cp-channels" aria-label="Canais"><h2>Canais</h2>
        <button type="button" data-cm-public="channel" data-value="" ${ui.channel ? '' : 'aria-current="true"'}>${icon('list',15)} Todas as publicações</button>
        ${group.channels.map(channel => `<button type="button" data-cm-public="channel" data-value="${h(channel.id)}" ${ui.channel === channel.id ? 'aria-current="true"' : ''}># ${h(channel.name)}</button>`).join('')}</nav>` : ''}
      <div class="cp-community-main">${body}</div></div></div>`;
}
