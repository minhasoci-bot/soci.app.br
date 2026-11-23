// Community screens of the client portal: the list on the home page and one group as a three-column app —
// identity, sections and channels on the left; the section in the middle; the owner's blocks on the right.
import { icon } from './icons.js';
import { planPrice, themeIsDark, themeMode, themeStyle } from './community-data.js';
import { avatar, badgeChip, dateShort, empty, feedTab, h, segment } from './portal-community-feed.js';
import { academyTab } from './portal-community-academy.js';

export const communityTabs = [['discussion', 'Discussão'], ['academy', 'Academia'], ['events', 'Eventos'], ['members', 'Membros'], ['ranking', 'Ranking'], ['about', 'Sobre']];
const tabIcons = { discussion: 'chat', academy: 'book', events: 'cal', members: 'users', ranking: 'award', about: 'note' };
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const span = (start, end) => {
  const a = new Date(start), b = new Date(end), same = a.toDateString() === b.toDateString();
  const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(a);
  const until = new Intl.DateTimeFormat('pt-BR', same ? { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(b);
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
    ${event.liveEmbed ? player(event.liveEmbed, event.title) : event.liveUrl ? `<a class="cp-public-primary cp-event-join" href="${h(event.liveUrl)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play', 16)} Entrar na transmissão</a>` : ''}
    ${recordings.length ? `<div class="cp-event-recordings"><h4>Gravações</h4>${recordings.map(row => row.embed ? `<figure>${player(row.embed, row.title)}<figcaption>${h(row.title)}</figcaption></figure>` : `<a class="cp-public-link" href="${h(row.url)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play', 15)} ${h(row.title)}</a>`).join('')}</div>`
      : event.past && event.recordingCount && !event.recordings.length ? '<p class="cp-meta">As gravações ficam disponíveis para quem tem ingresso.</p>' : ''}
    <footer class="cp-event-foot"><small>${event.going} ${event.going === 1 ? 'participante' : 'participantes'}${event.capacity ? ` de ${event.capacity}` : ''}${event.attendees.length ? `: ${h(event.attendees.slice(0, 6).join(', '))}${event.attendees.length > 6 ? '…' : ''}` : ''}</small>
      <div class="cp-event-actions">${eventAction(event, active)}</div></footer>
  </article>`;
}

function eventsTab(view, ui) {
  const filter = ui.events || 'upcoming', events = view.events || [];
  const shown = filter === 'past' ? events.filter(row => row.past) : filter === 'recordings' ? events.filter(row => row.recordings.length) : events.filter(row => !row.past);
  const none = { upcoming: ['Nenhum evento agendado', 'Os próximos encontros da comunidade aparecem aqui.'], past: ['Nenhum evento passado', 'Os eventos que já aconteceram aparecem aqui.'], recordings: ['Nenhuma gravação', 'As gravações dos eventos aparecem aqui depois que forem publicadas.'] }[filter];
  return `<div class="cp-cm-toolbar">${segment('events', filter, [['upcoming', 'Próximos'], ['past', 'Passados'], ['recordings', 'Gravações']], 'Eventos')}</div>
    ${shown.length ? shown.map(event => eventCard(event, view.membership, filter)).join('') : empty('cal', none[0], none[1])}`;
}

function membersTab(view) {
  if (!view.members.length) return empty('users', 'Ninguém entrou ainda', 'Os membros da comunidade aparecem aqui.');
  return `<section class="cp-public-card"><ul class="cp-member-list">${view.members.map(member => `<li>${avatar({ name: member.name, level: member.level, photo: member.photo })}
    <div><strong>${h(member.name)}</strong>${badgeChip(member)}<small>${member.role === 'moderator' ? 'Moderador · ' : ''}Nível ${member.level} · entrou em ${h(dateShort(member.joinedAt))}</small></div></li>`).join('')}</ul></section>`;
}

function rankingTab(view) {
  const board = view.leaderboard;
  return `<div class="cp-cm-toolbar">${segment('period', board.period, [['7', '7 dias'], ['30', '30 dias'], ['all', 'Todo o período']], 'Período')}</div>
    ${board.me ? `<p class="cp-public-card cp-me">Você está no <b>nível ${board.me.level}</b> com ${board.me.points} pontos${board.me.next ? ` · faltam ${board.me.next} para o próximo nível` : ' · nível máximo'}.</p>` : ''}
    ${board.top.length ? `<section class="cp-public-card"><ol class="cp-leaderboard">${board.top.map((row, index) => `<li><span class="cp-rank">${index + 1}</span>${avatar({ name: row.name, level: row.level, photo: row.photo })}<strong>${h(row.name)}</strong><b>${row.points} <small>pts</small></b></li>`).join('')}</ol></section>`
      : empty('award', 'Ninguém pontuou neste período', 'Publique, comente e curta para aparecer no ranking.')}
    <section class="cp-public-card"><h2>Níveis</h2><ul class="cp-levels">${board.levels.map(level => `<li><span class="cp-level">${level.level}</span><strong>${h(level.name)}</strong><small>a partir de ${level.min} pts · ${level.share}% dos membros</small></li>`).join('')}</ul></section>`;
}

function aboutTab(view) {
  const { group } = view;
  return `<section class="cp-public-card cp-cm-about">${group.cover ? `<img src="${h(group.cover)}" alt="">` : ''}<p class="cp-post-body">${h(group.description || 'Sem descrição.')}</p>
    <dl class="cp-cm-facts"><div><dt>Tipo</dt><dd>${group.visibility === 'private' ? 'Privada' : 'Pública'}</dd></div><div><dt>Acesso</dt><dd>${group.access === 'paid' ? 'Paga' : 'Gratuita'}</dd></div>
      <div><dt>Membros</dt><dd>${group.memberCount}</dd></div><div><dt>Publicações</dt><dd>${group.postCount}</dd></div></dl></section>`;
}

export function communityCards(list) {
  if (!list?.length) return '';
  const label = status => status === 'active' ? 'Abrir' : status === 'requested' ? 'Aguardando aprovação' : 'Conhecer';
  return `<section class="cp-library" id="comunidades"><h2>Comunidades</h2><div class="cp-course-grid">${list.map(item => `<article class="cp-public-card cp-course-card">
    <div class="cp-cover">${item.cover ? `<img src="${h(item.cover)}" alt="">` : `<span class="cp-course-icon">${icon('users', 26)}</span>`}</div>
    <div class="cp-course-text"><h3>${h(item.name)}</h3>${item.description ? `<p>${h(item.description)}</p>` : ''}
      <small class="cp-meta">${item.visibility === 'private' ? `${icon('lock', 13)} Privada` : 'Pública'} · ${plural(item.memberCount, 'membro', 'membros')}</small>
      <button type="button" class="${item.membership === 'active' ? 'cp-public-primary' : 'cp-public-ghost'}" data-community="${h(item.id)}">${label(item.membership)} ${icon('right', 16)}</button></div>
  </article>`).join('')}</div></section>`;
}

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
    ${group.trialDays && !membership?.trialUsed && !status ? `<button type="submit" class="cp-public-ghost" name="trial" value="1">Começar teste grátis de ${plural(group.trialDays, 'dia', 'dias')}</button>` : ''}</form>`;
}

// Visitors (not an active member yet) see who the community is before anything else.
function hero(view, joinButton) {
  const { group } = view, faces = (view.members || []).slice(0, 5);
  return `<section class="cp-cm-hero">
    <div class="cp-cm-hero-band">${group.cover ? `<img src="${h(group.cover)}" alt="">` : ''}</div>
    <div class="cp-cm-hero-body"><h1>${h(group.name)}</h1>${group.description ? `<p>${h(group.description)}</p>` : ''}
      <div class="cp-cm-hero-foot">${faces.length ? `<span class="cp-cm-faces">${faces.map(member => avatar({ name: member.name, photo: member.photo }, 'sm')).join('')}</span>` : ''}
        <small>${plural(group.memberCount, 'membro', 'membros')}${group.access === 'paid' ? ' · Comunidade paga' : group.visibility === 'private' ? ' · Entrada com aprovação' : ''}</small>
        ${joinButton}</div></div></section>`;
}

/** The owner's blocks on the right: only visible ones whose section is visible and has something to show. */
export function sideWidgets(view, tabs) {
  const { group } = view, shown = key => tabs.some(tab => tab.key === key);
  const label = key => tabs.find(tab => tab.key === key)?.label;
  const more = key => `<button type="button" class="cp-cm-more" data-cm-public="tab" data-value="${key}">Ver tudo ${icon('right', 14)}</button>`;
  const blocks = {
    about: () => shown('about') && `<h2>${h(label('about'))}</h2>${group.description ? `<p>${h(group.description)}</p>` : ''}
      <p class="cp-cm-stats"><span><b>${group.memberCount}</b> ${group.memberCount === 1 ? 'membro' : 'membros'}</span><span><b>${group.postCount}</b> ${group.postCount === 1 ? 'publicação' : 'publicações'}</span></p>`,
    events: () => {
      const next = (view.events || []).filter(row => !row.past).slice(0, 3);
      return shown('events') && next.length && `<h2>Próximos eventos</h2><ul class="cp-cm-mini">${next.map(event => `<li><span class="cp-cm-date"><b>${new Date(event.start).getDate()}</b>${h(new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(event.start)).replace('.', ''))}</span>
        <div><strong>${h(event.title)}</strong><small>${h(new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.start)))}</small></div></li>`).join('')}</ul>${more('events')}`;
    },
    ranking: () => {
      const top = (view.leaderboard?.top || []).slice(0, 5);
      return shown('ranking') && top.length && `<h2>Top do ranking</h2><ol class="cp-cm-mini">${top.map((row, index) => `<li><span class="cp-rank">${index + 1}</span>${avatar({ name: row.name, photo: row.photo }, 'sm')}<strong>${h(row.name)}</strong><b>${row.points}<small> pts</small></b></li>`).join('')}</ol>${more('ranking')}`;
    },
    members: () => {
      const recent = [...(view.members || [])].sort((a, b) => String(b.joinedAt).localeCompare(String(a.joinedAt))).slice(0, 8), rest = group.memberCount - recent.length;
      return shown('members') && recent.length && `<h2>Membros recentes</h2><div class="cp-cm-faces">${recent.map(member => avatar({ name: member.name, photo: member.photo }, 'sm').replace('aria-hidden="true"', `title="${h(member.name)}"`)).join('')}${rest > 0 ? `<span class="cp-cm-rest">+${rest}</span>` : ''}</div>${more('members')}`;
    }
  };
  return (group.layout?.widgets || []).filter(row => row.visible !== false && blocks[row.key])
    .map(row => { const body = blocks[row.key](); return body ? `<section class="cp-public-card cp-cm-widget" data-widget="${row.key}">${body}</section>` : ''; }).join('');
}

export function communityPage(view, ui) {
  const { group, membership } = view;
  const status = membership?.status, member = status === 'active' && !membership.expired;
  const tabs = (group.tabs || communityTabs.map(([key, label]) => ({ key, label, visible: true }))).filter(tab => tab.visible !== false);
  const tab = tabs.some(row => row.key === ui.tab) ? ui.tab : tabs[0]?.key || 'discussion';
  const simpleJoin = !membership && group.access !== 'paid' && !(group.questions || []).length;
  const joinButton = simpleJoin ? `<button type="button" class="cp-public-primary cp-cm-join" data-cm-public="join">${group.visibility === 'private' ? 'Pedir para entrar' : 'Entrar na comunidade'}</button>`
    : status === 'requested' ? '<span class="cp-tag">Pedido enviado. Aguarde a aprovação.</span>' : '';
  const locked = !view.posts;
  let body = '';
  if (locked && tab !== 'academy') body = group.access === 'paid' ? '' : empty('lock', 'Comunidade privada', 'Somente membros aprovados veem as publicações.');
  else if (tab === 'events') body = eventsTab(view, ui);
  else if (tab === 'members') body = membersTab(view);
  else if (tab === 'ranking') body = rankingTab(view);
  else if (tab === 'about') body = aboutTab(view);
  else if (tab === 'discussion') body = feedTab(view, ui);
  else if (tab === 'academy') body = academyTab(view);
  const current = tabs.find(row => row.key === tab), channel = tab === 'discussion' && group.channels.find(row => row.id === ui.channel);
  const aside = sideWidgets(view, tabs);
  // Light or dark: the member's choice (kept in their browser) over the owner's theme.
  const theme = themeMode(group.theme, ui.mode), dark = themeIsDark(theme);
  return `<div class="cp-cm${aside ? '' : ' cp-cm-no-aside'}" style="${h(themeStyle(theme))}">
    <aside class="cp-cm-side">
      <div class="cp-cm-top"><button type="button" class="cp-public-link cp-cm-back" data-portal-public="back">${icon('left', 16)} Início</button>
        <button type="button" class="cp-cm-mode" data-cm-public="mode" data-value="${dark ? 'light' : 'dark'}" aria-label="${dark ? 'Ativar modo claro' : 'Ativar modo escuro'}" title="${dark ? 'Modo claro' : 'Modo escuro'}">${icon(dark ? 'sun' : 'moon', 17)}</button></div>
      <div class="cp-cm-id">${group.cover ? `<img src="${h(group.cover)}" alt="">` : `<span class="cp-cm-tile">${h(group.name.trim()[0]?.toUpperCase() || '?')}</span>`}
        <div><strong>${h(group.name)}</strong><small>${group.visibility === 'private' ? 'Privada' : 'Pública'} · ${plural(group.memberCount, 'membro', 'membros')}</small></div></div>
      <nav class="cp-cm-nav" aria-label="Seções da comunidade">${tabs.map(row => `<button type="button" data-cm-public="tab" data-value="${row.key}" ${tab === row.key ? 'aria-current="page"' : ''}>${icon(tabIcons[row.key] || 'list', 17)}<span>${h(row.label)}</span></button>`).join('')}</nav>
      ${locked ? '' : `<div class="cp-cm-channels"><h2>Canais</h2>
        <button type="button" data-cm-public="channel" data-value="" ${tab === 'discussion' && !ui.channel ? 'aria-current="true"' : ''}><span aria-hidden="true">#</span> Todas</button>
        ${group.channels.map(row => `<button type="button" data-cm-public="channel" data-value="${h(row.id)}" ${tab === 'discussion' && ui.channel === row.id ? 'aria-current="true"' : ''}><span aria-hidden="true">#</span> ${h(row.name)}</button>`).join('')}</div>`}
      ${status === 'active' || status === 'pending' ? `<button type="button" class="cp-public-link cp-cm-leave" data-cm-public="leave">Sair da comunidade</button>${membership?.paidUntil && !membership.expired ? `<small class="cp-meta">Acesso até ${h(dateShort(membership.paidUntil))}</small>` : ''}` : ''}
    </aside>
    <main class="cp-cm-main">
      ${member ? `<header class="cp-cm-title"><h1 tabindex="-1">${h(channel ? `# ${channel.name}` : current?.label || group.name)}</h1></header>` : hero(view, joinButton)}
      ${joinPanel(view)}
      ${view.live && !locked ? `<button type="button" class="cp-live-banner" data-cm-public="tab" data-value="events"><span class="cp-live">Ao vivo</span> ${h(view.live.title)} · Assistir agora ${icon('right', 16)}</button>` : ''}
      ${body}
    </main>
    ${aside ? `<aside class="cp-cm-aside" aria-label="Destaques da comunidade">${aside}</aside>` : ''}
  </div>`;
}
