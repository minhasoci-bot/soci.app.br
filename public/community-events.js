// Communities admin → Eventos: the group's events (free or paid), who is attending, going live and the recordings.
// The event is saved in the workspace (`communityEvents`); attendees and the live flag come from the community admin API.
import { icon } from './icons.js';
import { h, fmt } from './screens.js';

const repeatLabel = { none: 'Uma vez', weekly: 'Toda semana', monthly: 'Todo mês' };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const pad = n => String(n).padStart(2, '0');
/** ISO → value of a datetime-local input, in this browser's time zone. */
const localInput = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const statusBadge = row => row.status === 'going' ? `<span class="badge green">${row.paid ? 'Pago' : row.guest ? 'Convidado' : 'Confirmado'}</span>` : '<span class="badge gold">Pagamento pendente</span>';

export function recordingRow(row = {}) {
  return `<li class="ce-recording"><input type="hidden" name="recording.id" value="${h(row.id || '')}">
    <input name="recording.title" maxlength="120" placeholder="Título (ex.: Encontro de março)" value="${h(row.title || '')}" aria-label="Título da gravação">
    <input name="recording.url" type="url" maxlength="600" placeholder="https://youtube.com/…" value="${h(row.url || '')}" aria-label="Link da gravação">
    <button type="button" class="icon-btn" data-cm="event-recording-remove" aria-label="Remover gravação">${icon('trash', 15)}</button></li>`;
}

export function eventForm(c, group, event = null) {
  const e = event || { title: '', color: '#155eef', description: '', start: '', end: '', recurrence: 'none', occurrences: 4, locationType: 'online', location: '', liveUrl: '',
    coverFileId: '', access: 'free', price: '', capacity: 0, reminder: true, hideAttendees: false, recordings: [], status: 'published' };
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `<form class="co-form ce-form" data-cm-form="event" data-id="${h(event?.id || '')}" data-group="${h(group.id)}">
    <div class="ce-tabs" role="group" aria-label="Seções do evento">${[['ce-event', 'Evento'], ['ce-payment', 'Ingresso'], ['ce-recordings', 'Gravações']].map(([id, label]) => `<button type="button" data-cm="event-jump" data-id="${id}">${label}</button>`).join('')}</div>
    <fieldset id="ce-event"><legend>Evento</legend>
      <div class="cm-row"><label>Título<input name="title" required maxlength="120" value="${h(e.title)}" placeholder="Ex.: Mentoria ao vivo"></label>
        <label class="ce-color">Cor<input name="color" type="color" value="${h(e.color)}"></label></div>
      <label>Descrição<textarea name="description" rows="3" maxlength="1000">${h(e.description)}</textarea></label>
      <div class="cm-row"><label>Início<input name="start" type="datetime-local" required value="${localInput(e.start)}"></label>
        <label>Fim<input name="end" type="datetime-local" required value="${localInput(e.end)}"></label></div>
      <p class="co-hint">Horários no fuso ${h(zone)}. Os membros veem no fuso deles.</p>
      <div class="cm-row"><label>Repetir<select name="recurrence">${Object.entries(repeatLabel).map(([value, label]) => `<option value="${value}"${e.recurrence === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Quantas vezes<input name="occurrences" type="number" min="1" max="52" value="${h(e.occurrences || 4)}"></label></div>
      <div class="cm-row"><label>Local<select name="locationType"><option value="online"${e.locationType === 'online' ? ' selected' : ''}>Online (link)</option><option value="address"${e.locationType === 'address' ? ' selected' : ''}>Presencial (endereço)</option></select></label>
        <label>Link ou endereço<input name="location" maxlength="600" value="${h(e.location)}" placeholder="https://meet.google.com/… ou Rua…"></label></div>
      <label>Link da transmissão ao vivo (opcional)<input name="liveUrl" type="url" maxlength="600" value="${h(e.liveUrl)}" placeholder="https://youtube.com/live/… · Vimeo · Zoom · Meet"></label>
      <p class="co-hint">O local e a transmissão aparecem só para quem confirmou presença ou comprou o ingresso. Links do YouTube e do Vimeo tocam dentro do portal; os demais abrem numa nova aba.</p>
      <label>Miniatura (1280×720)<select name="coverFileId"><option value="">Sem miniatura</option>${images.map(file => `<option value="${h(file.id)}"${file.id === e.coverFileId ? ' selected' : ''}>${h(file.name)}</option>`).join('')}</select></label>
      <label class="cp-checkbox co-check"><input type="checkbox" name="reminder"${e.reminder !== false ? ' checked' : ''}><span>Lembrete por e-mail 1 dia antes</span></label>
      <label class="cp-checkbox co-check"><input type="checkbox" name="hideAttendees"${e.hideAttendees ? ' checked' : ''}><span>Ocultar a lista de participantes dos membros</span></label>
    </fieldset>
    <fieldset id="ce-payment"><legend>Ingresso</legend>
      <div class="co-kinds"><label><input type="radio" name="access" value="free"${e.access !== 'paid' ? ' checked' : ''}><span>${icon('users', 15)} Gratuito para membros</span></label>
        <label><input type="radio" name="access" value="paid"${e.access === 'paid' ? ' checked' : ''}><span>${icon('pay', 15)} Ingresso pago</span></label></div>
      <div class="cm-row"><label>Preço do ingresso (R$)<input name="price" type="number" min="1" step="0.01" value="${h(e.access === 'paid' ? e.price : '')}" placeholder="Ex.: 97"></label>
        <label>Limite de participantes (0 = sem limite)<input name="capacity" type="number" min="0" max="100000" value="${h(e.capacity || 0)}"></label></div>
      <p class="co-hint">O ingresso vira uma fatura cobrada pela AbacatePay (Pix ou cartão). A vaga é confirmada quando o pagamento entra.</p>
    </fieldset>
    <fieldset id="ce-recordings"><legend>Gravações</legend>
      <ul class="ce-recordings" data-ce-recordings>${(e.recordings || []).map(recordingRow).join('')}</ul>
      <button type="button" class="secondary" data-cm="event-recording-add">${icon('plus', 15)} Adicionar gravação</button>
      <p class="co-hint">Em eventos gratuitos, todos os membros veem as gravações; em eventos pagos, só quem tem ingresso.</p>
    </fieldset>
    <label class="cp-checkbox co-check"><input type="checkbox" name="published"${e.status !== 'draft' ? ' checked' : ''}><span>Publicado no portal</span></label>
    <p class="form-status" role="alert" data-cm-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">${event ? 'Salvar evento' : 'Criar evento'}</button></div>
  </form>`;
}

/** The form's fields as the communityEvents record. */
export function eventData(form) {
  const f = new FormData(form), local = value => value ? new Date(value).toISOString() : '';
  const ids = f.getAll('recording.id'), titles = f.getAll('recording.title'), urls = f.getAll('recording.url');
  return {
    communityId: form.dataset.group, title: f.get('title'), color: f.get('color'), description: f.get('description'),
    start: local(f.get('start')), end: local(f.get('end')), recurrence: f.get('recurrence'), occurrences: Number(f.get('occurrences')),
    locationType: f.get('locationType'), location: f.get('location'), liveUrl: f.get('liveUrl'), coverFileId: f.get('coverFileId'),
    access: f.get('access'), price: Number(f.get('price')), capacity: Number(f.get('capacity')), reminder: f.has('reminder'), hideAttendees: f.has('hideAttendees'),
    recordings: urls.map((url, index) => ({ id: ids[index], title: titles[index], url })).filter(row => row.url.trim() || row.title.trim()),
    status: f.has('published') ? 'published' : 'draft'
  };
}

function eventCard(c, event, data) {
  const zone = c.s.profile.timezone, liveHere = data.live?.eventId === event.id;
  const canLive = !event.past && (c.s.communityEvents.find(row => row.id === event.id)?.liveUrl || (event.locationType === 'online' && event.location));
  return `<article class="cm-panel ce-card" style="--ce-color:${h(event.color)}">
    <header class="ce-card-head">${event.cover ? `<img src="${h(event.cover)}" alt="">` : `<span class="ce-dot">${icon('cal', 18)}</span>`}
      <div><h3>${h(event.title)}</h3><small>${h(fmt(event.start, zone, true))} → ${h(fmt(event.end, zone, true))}${event.recurrence !== 'none' ? ` · ${repeatLabel[event.recurrence]}` : ''}</small>
        <p>${event.status === 'draft' ? '<span class="badge">Rascunho</span>' : '<span class="badge green">Publicado</span>'}
          <span class="badge ${event.access === 'paid' ? 'pink' : 'blue'}">${event.access === 'paid' ? money(event.price) : 'Gratuito'}</span>
          ${event.past ? '<span class="badge">Encerrado</span>' : ''}${liveHere ? '<span class="badge red">Ao vivo</span>' : ''}
          <span class="co-hint">${event.going}${event.capacity ? `/${event.capacity}` : ''} ${event.going === 1 ? 'participante' : 'participantes'} · ${event.recordingCount} ${event.recordingCount === 1 ? 'gravação' : 'gravações'}</span></p></div>
      <div class="cm-row-actions">
        ${liveHere ? `<button type="button" class="danger" data-cm="live-end">${icon('stop', 15)} Encerrar ao vivo</button>` : canLive ? `<button type="button" class="secondary" data-cm="live-start" data-id="${h(event.id)}">${icon('play', 15)} Entrar ao vivo</button>` : ''}
        <button type="button" class="icon-btn" data-cm="event-edit" data-id="${h(event.id)}" aria-label="Editar evento" title="Editar">${icon('edit', 16)}</button>
        <button type="button" class="icon-btn" data-cm="event-delete" data-id="${h(event.id)}" aria-label="Excluir evento" title="Excluir">${icon('trash', 16)}</button></div></header>
    <details class="ce-people"><summary>Participantes (${event.people.length})</summary>
      ${event.people.length ? `<div class="cp-table-scroll"><table class="cm-table"><thead><tr><th scope="col">Membro</th><th scope="col">Situação</th><th scope="col">Desde</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
        ${event.people.map(row => `<tr><td><strong>${h(row.name)}</strong><small>${h(row.email)}</small></td><td>${statusBadge(row)}</td><td>${h(fmt(row.at, zone, true))}</td>
          <td class="cm-row-actions"><button type="button" class="icon-btn" data-cm="attendee-remove" data-id="${h(event.id)}" data-member="${h(row.id)}" aria-label="Remover ${h(row.name)}" title="Remover">${icon('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="co-hint">Ninguém confirmou ainda.</p>'}
      ${event.past ? '' : `<button type="button" class="secondary" data-cm="attendee-add" data-id="${h(event.id)}">${icon('plus', 15)} Adicionar participantes</button>`}
    </details>
  </article>`;
}

export function eventsTab(c, group, data) {
  const events = data.events || [];
  const live = data.live && events.find(row => row.id === data.live.eventId);
  return `<div class="cm-panel cm-panel-head ce-head"><div><h2>Eventos</h2><p class="co-hint">Encontros gratuitos ou com ingresso pago, com transmissão ao vivo e gravações dentro do portal.</p></div>
      <button type="button" class="primary" data-cm="event-new">${icon('plus', 15)} Novo evento</button></div>
    ${live ? `<div class="ce-live"><span class="badge red">Ao vivo</span><b>${h(live.title)}</b><span class="co-hint">desde ${h(fmt(data.live.startedAt, c.s.profile.timezone, true))}. Os membros veem um aviso no topo da comunidade.</span>
      <button type="button" class="danger" data-cm="live-end">Encerrar ao vivo</button></div>` : ''}
    ${events.length ? events.map(event => eventCard(c, event, data)).join('')
      : `<div class="co-empty">${icon('cal', 26)}<strong>Nenhum evento ainda</strong><p>Crie uma mentoria, uma aula ao vivo ou um encontro presencial. Ele aparece na aba Eventos da comunidade, no portal.</p></div>`}`;
}

/** The members who can still be added to one event. */
export function attendeeDialog(data, eventId) {
  const event = data.events.find(row => row.id === eventId);
  const taken = new Set(event.people.filter(row => row.status === 'going').map(row => row.id));
  const free = data.members.filter(row => row.status === 'active' && !taken.has(row.id));
  return `<form class="co-form" data-cm-form="attendees" data-id="${h(eventId)}">${free.length ? `<fieldset class="cp-permissions"><legend>Membros da comunidade</legend>
    ${free.map(row => `<label class="cp-checkbox"><input type="checkbox" name="memberIds" value="${h(row.id)}"><span>${h(row.name)}<small>${h(row.email)}</small></span></label>`).join('')}</fieldset>
    <p class="co-hint">Entram como convidados, sem pagar o ingresso.</p>` : '<p class="co-hint">Todos os membros ativos já estão neste evento.</p>'}
    <p class="form-status" role="alert" data-cm-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit"${free.length ? '' : ' disabled'}>Adicionar</button></div></form>`;
}
