// Community screens of the client portal: the list on the home page and one group (feed, members, ranking, about).
import { icon } from './icons.js';
import { planPrice, themeStyle } from './community-data.js';

const h = value => String(value ?? '').replace(/[&<>"']/g,char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const when = value => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
const avatar = author => `<span class="cp-avatar ${author.staff ? 'staff' : ''}" aria-hidden="true">${h(initials(author.name))}${author.staff ? '' : `<b>${author.level}</b>`}</span>`;
export const communityTabs = [['discussion','Discussão'],['events','Eventos'],['members','Membros'],['ranking','Ranking'],['about','Sobre']];
const span = (start, end) => {
  const a = new Date(start), b = new Date(end), same = a.toDateString() === b.toDateString();
  const day = new Intl.DateTimeFormat('pt-BR',{ weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(a);
  const until = new Intl.DateTimeFormat('pt-BR', same ? { hour:'2-digit', minute:'2-digit', timeZoneName:'short' } : { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZoneName:'short' }).format(b);
  return `${day} – ${until}`;
};
const repeatLabel = { weekly: 'Toda semana', monthly: 'Todo mês' };
const player = (src, title) => `<div class="cp-event-player"><iframe src="${h(src)}" title="${h(title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

function eventAction(event, active) {
  if (!active || event.past) return '';
  if (event.access === 'paid') {
    if (event.myStatus === 'going') return '<span class="cp-tag cp-tag-ok">Ingresso confirmado</span>';
    if (event.full) return '<span class="cp-tag">Esgotado</span>';
    return `<button type="button" class="cp-public-primary" data-cm-public="ticket" data-event="${h(event.id)}">${event.myStatus === 'pending' ? 'Concluir pagamento' : `Comprar ingresso · ${h(event.priceLabel)}`}</button>`;
  }
  if (event.myStatus === 'going') return `<span class="cp-tag cp-tag-ok">Presença confirmada</span><button type="button" class="cp-public-link" data-cm-public="rsvp-cancel" data-event="${h(event.id)}">Cancelar presença</button>`;
  return event.full ? '<span class="cp-tag">Vagas esgotadas</span>' : `<button type="button" class="cp-public-primary" data-cm-public="rsvp" data-event="${h(event.id)}">Confirmar presença</button>`;
}

function eventCard(event, membership, filter) {
  const active = membership?.status === 'active';
  const recordings = filter === 'recordings' || event.past ? event.recordings : [];
  return `<article class="cp-public-card cp-event" style="--cp-event:${h(event.color)}">
    ${event.cover ? `<img class="cp-event-cover" src="${h(event.cover)}" alt="">` : ''}
    <header><div><h3>${h(event.title)}</h3><small>${h(span(event.start, event.end))}${repeatLabel[event.recurrence] ? ` · ${repeatLabel[event.recurrence]}` : ''}</small></div>
      <span class="cp-tag">${h(event.priceLabel)}</span>${event.live ? '<span class="cp-tag cp-live">Ao vivo</span>' : ''}</header>
    ${event.description ? `<p class="cp-post-body">${h(event.description)}</p>` : ''}
    ${event.attending && event.location ? `<p class="cp-event-where">${icon(event.locationType === 'online' ? 'external' : 'site', 15)} ${event.locationType === 'online' ? `<a href="${h(event.location)}" target="_blank" rel="noopener noreferrer nofollow">Link do evento</a>` : h(event.location)}</p>` : ''}
    ${event.liveEmbed ? player(event.liveEmbed, event.title) : event.liveUrl ? `<a class="cp-public-primary cp-event-join" href="${h(event.liveUrl)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play',16)} Entrar na transmissão</a>` : ''}
    ${recordings.length ? `<div class="cp-event-recordings"><h4>Gravações</h4>${recordings.map(row => row.embed ? `<figure>${player(row.embed, row.title)}<figcaption>${h(row.title)}</figcaption></figure>` : `<a class="cp-public-link" href="${h(row.url)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play',15)} ${h(row.title)}</a>`).join('')}</div>`
      : event.past && event.recordingCount && !event.recordings.length ? '<p class="cp-meta">As gravações ficam disponíveis para quem tem ingresso.</p>' : ''}
    <footer class="cp-event-foot"><small>${event.going} ${event.going === 1 ? 'participante' : 'participantes'}${event.capacity ? ` de ${event.capacity}` : ''}${event.attendees.length ? `: ${h(event.attendees.slice(0, 6).join(', '))}${event.attendees.length > 6 ? '…' : ''}` : ''}</small>
      <div class="cp-event-actions">${eventAction(event, active)}</div></footer>
  </article>`;
}

function eventsTab(view, ui) {
  const filter = ui.events || 'upcoming', events = view.events || [];
  const shown = filter === 'past' ? events.filter(row => row.past) : filter === 'recordings' ? events.filter(row => row.recordings.length) : events.filter(row => !row.past);
  const empty = { upcoming: ['Nenhum evento agendado', 'Os próximos encontros da comunidade aparecem aqui.'], past: ['Nenhum evento passado', 'Os eventos que já aconteceram aparecem aqui.'], recordings: ['Nenhuma gravação', 'As gravações dos eventos aparecem aqui depois que forem publicadas.'] }[filter];
  return `<section class="cp-public-card cp-ranking-head"><h2>Eventos</h2><div class="cp-segment" role="group" aria-label="Eventos">
      ${[['upcoming','Próximos'],['past','Passados'],['recordings','Gravações']].map(([value, label]) => `<button type="button" data-cm-public="events" data-value="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div></section>
    ${shown.length ? shown.map(event => eventCard(event, view.membership, filter)).join('') : `<section class="cp-public-card cp-empty-feed"><h2>${empty[0]}</h2><p>${empty[1]}</p></section>`}`;
}

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
    <header>${avatar(post.author)}<div><strong>${h(post.author.name)}</strong>${post.author.staff ? ' <span class="cp-tag">Equipe</span>' : badgeChip(post.author)}${post.held ? ` <span class="cp-tag cp-held" title="${h(post.held)}">${post.held === 'Em análise' ? 'Em análise' : 'Retida'}</span>` : ''}
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
      <span>${icon('chat',16)} ${post.comments.length} ${post.comments.length === 1 ? 'comentário' : 'comentários'}</span>
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
  return `<details class="cp-public-card cp-composer"><summary>${icon('edit',16)} Criar publicação</summary>
    <form data-cm-public-form="post">
      <label>Canal<select name="channelId">${group.channels.map(channel => `<option value="${h(channel.id)}">#${h(channel.name)}</option>`).join('')}</select></label>
      <label>Título<input name="title" required maxlength="200"></label>
      <label>Texto<textarea name="body" required rows="4" maxlength="10000" placeholder="Compartilhe uma ideia, dúvida ou novidade"></textarea></label>
      <label>Link (opcional)<input name="link" type="url" maxlength="500" placeholder="https://…"></label>
      <label>Enquete (opcional, uma opção por linha)<textarea name="poll" rows="2" maxlength="500"></textarea></label>
      <button type="submit" class="cp-public-primary">Publicar</button></form></details>`;
}

const badgeChip = author => author.badges?.length ? ` <span class="cp-tag cp-badge" title="${h(author.badges.map(row => row.label).join(', '))}">${icon('award',12)} ${h(author.badges[0].label)}${author.badges.length > 1 ? ` +${author.badges.length - 1}` : ''}</span>` : '';
const dateShort = value => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', year:'numeric' }).format(new Date(value));

// Joining: the questions, then free entry, the free trial or the paid plans.
function joinPanel(view) {
  const { group, membership } = view, status = membership?.status;
  if (status === 'active' && !membership.expired) return '';
  if (status === 'requested') return '';
  const questions = (group.questions || []).length && !(membership?.status) ? `<fieldset class="cp-join-questions"><legend>Antes de entrar</legend>${group.questions.map(question => `<label>${h(question.text)}${question.required ? ' *' : ''}
      <textarea name="answer.${h(question.id)}" rows="2" maxlength="1000"${question.required ? ' required' : ''}></textarea></label>`).join('')}</fieldset>` : '';
  if (group.access !== 'paid') return questions ? `<form class="cp-public-card cp-join" data-cm-public-form="join">${questions}<button type="submit" class="cp-public-primary">${group.visibility === 'private' ? 'Pedir para entrar' : 'Entrar na comunidade'}</button></form>` : '';
  const title = membership?.expired ? 'Seu acesso venceu' : status === 'pending' ? 'Pagamento pendente' : 'Comunidade paga';
  const text = membership?.expired ? 'Renove um plano para voltar a ver as publicações e participar.' : status === 'pending' ? 'Assim que o pagamento for confirmado, o acesso é liberado. Se não concluiu, escolha o plano de novo.' : 'Escolha um plano para entrar. O pagamento é por Pix ou cartão.';
  return `<form class="cp-public-card cp-join" data-cm-public-form="subscribe"><h2>${title}</h2><p>${text}</p>${questions}
    <div class="cp-plans">${group.plans.map(plan => `<div class="cp-plan"><strong>${h(plan.name)}</strong><span>${h(planPrice(plan))}</span>
      <button type="submit" class="cp-public-primary" name="planId" value="${h(plan.id)}">${membership?.expired ? 'Renovar' : 'Assinar'}</button></div>`).join('')}</div>
    ${group.trialDays && !membership?.trialUsed && !status ? `<button type="submit" class="cp-public-ghost" name="trial" value="1">Começar teste grátis de ${group.trialDays} ${group.trialDays === 1 ? 'dia' : 'dias'}</button>` : ''}</form>`;
}

function onboardingCard(view) {
  const steps = view.group.onboarding || [], done = new Set(view.membership?.onboardingDone || []);
  if (view.membership?.status !== 'active' || !steps.length || steps.every(step => done.has(step.id))) return '';
  return `<section class="cp-public-card cp-onboarding"><h2>Primeiros passos</h2><p class="cp-meta">${done.size} de ${steps.length} concluídos</p><ol>${steps.map(step => `<li>
    <button type="button" class="cp-check" data-cm-public="onboarding" data-step="${h(step.id)}" data-done="${done.has(step.id) ? 'no' : 'yes'}" aria-pressed="${done.has(step.id)}">${done.has(step.id) ? icon('check',14) : ''}</button>
    <div><strong>${h(step.title)}</strong>${step.description ? `<small>${h(step.description)}</small>` : ''}${step.link ? `<a href="${h(step.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external',13)} Abrir</a>` : ''}</div></li>`).join('')}</ol></section>`;
}

export function communityPage(view, ui) {
  const { group, membership } = view;
  const status = membership?.status;
  const tabs = (group.tabs || communityTabs.map(([key, label]) => ({ key, label, visible: true }))).filter(tab => tab.visible !== false);
  const tab = tabs.some(row => row.key === ui.tab) ? ui.tab : tabs[0]?.key || 'discussion';
  const simpleJoin = !membership && group.access !== 'paid' && !(group.questions || []).length;
  const joinButton = simpleJoin ? `<button type="button" class="cp-public-primary" data-cm-public="join">${group.visibility === 'private' ? 'Pedir para entrar' : 'Entrar na comunidade'}</button>`
    : status === 'requested' ? '<span class="cp-tag">Pedido enviado. Aguarde a aprovação.</span>'
      : status === 'active' || status === 'pending' ? '<button type="button" class="cp-public-link" data-cm-public="leave">Sair da comunidade</button>' : '';
  const locked = !view.posts;
  let body = '';
  if (locked) body = group.access === 'paid' ? '' : `<section class="cp-public-card cp-locked">${icon('lock',22)}<h2>Comunidade privada</h2><p>Somente membros aprovados veem as publicações.</p></section>`;
  else if (tab === 'events') body = eventsTab(view, ui);
  else if (tab === 'members') body = `<section class="cp-public-card"><h2>${h(tabs.find(row => row.key === 'members')?.label || 'Membros')}</h2><ul class="cp-member-list">${view.members.map(member => `<li>${avatar({ name: member.name, level: member.level })}
      <div><strong>${h(member.name)}</strong>${badgeChip(member)}<small>${member.role === 'moderator' ? 'Moderador · ' : ''}Nível ${member.level} · entrou em ${h(dateShort(member.joinedAt))}</small></div></li>`).join('') || '<li>Ninguém entrou ainda.</li>'}</ul></section>`;
  else if (tab === 'ranking') {
    const board = view.leaderboard;
    body = `<section class="cp-public-card"><div class="cp-ranking-head"><h2>Ranking</h2><div class="cp-segment" role="group" aria-label="Período">
        ${[['7','7 dias'],['30','30 dias'],['all','Todo o período']].map(([value, label]) => `<button type="button" data-cm-public="period" data-value="${value}" aria-pressed="${board.period === value}">${label}</button>`).join('')}</div></div>
      ${board.me ? `<p class="cp-me">Você está no <b>nível ${board.me.level}</b> com ${board.me.points} pontos${board.me.next ? ` · faltam ${board.me.next} para o próximo nível` : ' · nível máximo'}.</p>` : ''}
      <ol class="cp-leaderboard">${board.top.map((row, index) => `<li><span class="cp-rank">${index + 1}</span>${avatar({ name: row.name, level: row.level })}<strong>${h(row.name)}</strong><b>${row.points} pts</b></li>`).join('') || '<li class="cp-empty-line">Ninguém pontuou neste período ainda.</li>'}</ol>
      <h3>Níveis</h3><ul class="cp-levels">${board.levels.map(level => `<li><span class="cp-level">${level.level}</span><strong>${h(level.name)}</strong><small>a partir de ${level.min} pts · ${level.share}% dos membros</small></li>`).join('')}</ul></section>`;
  } else if (tab === 'about') body = `<section class="cp-public-card"><h2>${h(tabs.find(row => row.key === 'about')?.label || 'Sobre')}</h2><p>${h(group.description || 'Sem descrição.')}</p>
      <p>${group.visibility === 'private' ? 'Comunidade privada' : 'Comunidade pública'} · ${group.access === 'paid' ? 'Paga' : 'Gratuita'} · ${group.memberCount} ${group.memberCount === 1 ? 'membro' : 'membros'} · ${group.postCount} ${group.postCount === 1 ? 'publicação' : 'publicações'}</p></section>`;
  else body = `${onboardingCard(view)}${status === 'active' && group.welcome ? `<p class="cp-public-card cp-welcome">${h(group.welcome)}</p>` : ''}${composer(view)}
    ${view.posts.length ? view.posts.map(post => postCard(post, membership)).join('') : '<section class="cp-public-card cp-empty-feed"><h2>Ainda não há publicações</h2><p>Comece a conversa com uma ideia, dúvida ou novidade.</p></section>'}`;
  return `<div class="cp-community${group.theme ? ' cm-themed' : ''}"${group.theme ? ` style="${h(themeStyle(group.theme))}"` : ''}>
    <button type="button" class="cp-public-link" data-portal-public="back">${icon('left',16)} Início</button>
    <header class="cp-community-head">${group.cover ? `<img src="${h(group.cover)}" alt="">` : ''}<div><h1>${h(group.name)}</h1>
      <p>${group.visibility === 'private' ? `${icon('lock',14)} Privada` : 'Pública'}${group.access === 'paid' ? ' · Paga' : ''} · ${group.memberCount} ${group.memberCount === 1 ? 'membro' : 'membros'}${membership?.paidUntil && !membership.expired ? ` · acesso até ${h(dateShort(membership.paidUntil))}` : ''}</p></div>${joinButton}</header>
    ${joinPanel(view)}
    ${view.live && !locked ? `<button type="button" class="cp-live-banner" data-cm-public="tab" data-value="events"><span class="cp-live">Ao vivo</span> ${h(view.live.title)} · Assistir agora ${icon('right',16)}</button>` : ''}
    ${locked ? '' : `<nav class="cp-community-tabs" aria-label="Seções da comunidade">${tabs.map(row => `<button type="button" data-cm-public="tab" data-value="${row.key}" ${tab === row.key ? 'aria-current="page"' : ''}>${h(row.label)}</button>`).join('')}</nav>`}
    <div class="cp-community-grid">${!locked && tab === 'discussion' ? `<nav class="cp-public-card cp-channels" aria-label="Canais"><h2>Canais</h2>
        <button type="button" data-cm-public="channel" data-value="" ${ui.channel ? '' : 'aria-current="true"'}>${icon('list',15)} Todas as publicações</button>
        ${group.channels.map(channel => `<button type="button" data-cm-public="channel" data-value="${h(channel.id)}" ${ui.channel === channel.id ? 'aria-current="true"' : ''}># ${h(channel.name)}</button>`).join('')}</nav>` : ''}
      <div class="cp-community-main">${body}</div></div></div>`;
}
