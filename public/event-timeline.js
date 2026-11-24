// Linha do tempo do Planejador de eventos: tarefas e mensagens por dia, de um evento ou de todos, com arrastar para remarcar.
// As datas são dias do calendário (AAAA-MM-DD), contados em UTC: fuso e horário de verão nunca deslocam um dia.
import { eventPlanPhases } from './event-planner-data.js';
import { deliveryActive, deliveryOf } from './event-sends.js';

const h = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const DAY = 86_400_000, LIMIT = 550;
export const timelineZooms = { day: 36, week: 14 };
const number = iso => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoDay = value => new Date(value * DAY).toISOString().slice(0, 10);
export const shiftDay = (iso, days) => isoDay(number(iso) + days);
const format = options => new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' });
const label = iso => format({ dateStyle: 'medium' }).format(new Date(`${iso}T12:00:00Z`));
const monthName = format({ month: 'long', year: 'numeric' }), weekday = format({ weekday: 'narrow' });

/** Dias desenhados: folga em volta dos itens, hoje se estiver perto, e um limite para uma data perdida não esticar tudo. */
export function timelineRange(dates, today) {
  const days = dates.filter(Boolean).map(number).sort((a, b) => a - b), now = number(today);
  if (!days.length) return { start: isoDay(now - 7), days: 42, hasToday: true };
  const near = now >= days[0] - 120 && now <= days.at(-1) + 120;
  let start = Math.min(days[0], near ? now : Infinity) - 7;
  const end = Math.max(days.at(-1), near ? now : -Infinity) + 14;
  let total = Math.max(42, end - start + 1);
  if (total > LIMIT) { total = LIMIT; start = days[Math.floor(days.length / 2)] - Math.floor(LIMIT / 2); }
  return { start: isoDay(start), days: total, hasToday: now >= start && now < start + total };
}

const shown = event => (event.plan?.items || []).filter(item => item.kind === 'task' || item.kind === 'message');
const order = (a, b) => (a.item.date || '9999').localeCompare(b.item.date || '9999') || (a.item.time || '99').localeCompare(b.item.time || '99') || a.item.title.localeCompare(b.item.title, 'pt-BR');
const rowsOf = (event, items) => items.map(item => ({ event, item })).sort(order);
export const eventGroups = event => eventPlanPhases
  .map(([phase, title]) => ({ key: phase, label: title, rows: rowsOf(event, shown(event).filter(item => item.phase === phase)) }))
  .filter(group => group.rows.length);
export const galleryGroups = events => events.filter(event => event.status !== 'arquivado')
  .sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999') || a.title.localeCompare(b.title, 'pt-BR'))
  .map(event => ({ key: event.id, eventId: event.id, label: event.title, mark: event.eventDate || '', rows: rowsOf(event, shown(event)) }));

/** Por que o item não se move; '' quando pode. */
export function movable(event, item) {
  const delivery = deliveryOf(event, item);
  return item.kind === 'message' && (item.status === 'enviado' || (delivery?.state === 'done' && delivery.sent > 0)) ? 'A mensagem já foi enviada.' : '';
}
/** Com envio agendado, uma data que já passou faz a mensagem sair na hora. */
export function leavesNow(event, item, date, zone, now) {
  if (item.kind !== 'message' || !deliveryActive(deliveryOf(event, item))) return false;
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${date} ${item.time || '00:00'}` <= `${local.year}-${local.month}-${local.day} ${local.hour}:${local.minute}`;
}

function header(range, zoom) {
  const first = number(range.start), months = [], days = [];
  for (let n = 0; n < range.days; n++) {
    const iso = isoDay(first + n), date = new Date(`${iso}T12:00:00Z`), month = iso.slice(0, 7);
    if (months.at(-1)?.key === month) months.at(-1).span++; else months.push({ key: month, span: 1, text: monthName.format(date) });
    if (zoom === 'day' || date.getUTCDay() === 1) days.push(`<span style="--at:${n}" class="${[0, 6].includes(date.getUTCDay()) ? 'is-weekend' : ''}">${zoom === 'day' ? `<small>${weekday.format(date)}</small>` : ''}${Number(iso.slice(8))}</span>`);
  }
  let at = 0;
  const names = months.map(month => { const html = `<b style="--at:${at};--span:${month.span}">${h(month.text[0].toUpperCase() + month.text.slice(1))}</b>`; at += month.span; return html; });
  return `<div class="ep-tl-head"><div class="ep-tl-name"></div><div class="ep-tl-track"><div class="ep-tl-months">${names.join('')}</div><div class="ep-tl-days">${days.join('')}</div></div></div>`;
}
function bar(event, item, at) {
  const locked = movable(event, item), done = ['feito', 'enviado'].includes(item.status);
  const classes = ['ep-tl-bar', item.kind === 'message' ? 'is-message' : '', done ? 'is-done' : '', deliveryActive(deliveryOf(event, item)) ? 'is-scheduled' : '', locked ? 'is-locked' : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${classes}" data-ep-tl-bar="${h(item.id)}" data-ep-event="${h(event.id)}" style="--at:${at}" title="${h(locked || `${item.title} · ${label(item.date)}`)}" aria-label="${h(item.title)}, ${h(label(item.date))}. ${locked ? h(locked) : 'Setas movem um dia, Enter abre.'}"><span data-ep-tl-date></span></button>`;
}
export function timelineHtml({ groups, zoom, today }) {
  const range = timelineRange(groups.flatMap(group => [group.mark, ...group.rows.map(row => row.item.date)]), today), first = number(range.start);
  const inside = iso => { const at = number(iso) - first; return at >= 0 && at < range.days ? at : -1; };
  const name = (event, item) => `<button type="button" class="ep-tl-name" data-ep-item-edit="${h(item.id)}" data-ep-event="${h(event.id)}" title="${h(item.title)}">${h(item.title)}</button>`;
  const line = ({ event, item }) => {
    const at = item.date ? inside(item.date) : -1;
    return `<div class="ep-tl-row">${name(event, item)}<div class="ep-tl-track">${at >= 0 ? bar(event, item, at) : `<span class="ep-tl-none">${item.date ? `Fora do período: ${h(label(item.date))}` : 'Sem data'}</span>`}</div></div>`;
  };
  const group = row => {
    const at = row.mark ? inside(row.mark) : -1;
    const title = row.eventId ? `<button type="button" class="ep-tl-name" data-ep-open="${h(row.eventId)}" title="${h(row.label)}">${h(row.label)}</button>` : `<div class="ep-tl-name">${h(row.label)}</div>`;
    return `<div class="ep-tl-row is-group">${title}<div class="ep-tl-track">${at >= 0 ? `<span class="ep-tl-mark" style="--at:${at}" title="Dia do evento: ${h(label(row.mark))}"></span>` : ''}</div></div>${row.rows.map(line).join('')}`;
  };
  return `<div class="ep-tl" data-ep-timeline data-day="${timelineZooms[zoom]}" data-today="${range.hasToday ? number(today) - first : ''}" style="--ep-day:${timelineZooms[zoom]}px;--ep-days:${range.days}"><div class="ep-tl-scroll" data-ep-tl-scroll tabindex="0" role="region" aria-label="Linha do tempo">${header(range, zoom)}${range.hasToday ? `<div class="ep-tl-today" style="--at:${number(today) - first}" aria-hidden="true"></div>` : ''}${groups.map(group).join('')}</div></div>`;
}

export function installTimeline({ find, itemOf, savePlan, openItem, repaint, flash, zone, ask, now = Date.now, listen = (type, fn, options) => document.addEventListener(type, fn, options), later = setTimeout, drop = clearTimeout }) {
  const barOf = domEvent => domEvent.target.closest?.('[data-ep-tl-bar]');
  const lookup = bar => { const event = find(bar.dataset.epEvent), item = event && itemOf(event, bar.dataset.epTlBar); return item ? { event, item } : null; };
  let drag = null, dragged = false, keys = null;

  function show(bar, date, shift, day) {
    bar.style.setProperty('--shift', `${shift * day}px`);
    const tip = bar.querySelector?.('[data-ep-tl-date]');
    if (tip) tip.textContent = shift ? label(shiftDay(date, shift)) : '';
  }
  const reset = bar => { bar.style.removeProperty('--shift'); bar.classList.remove('is-moving'); const tip = bar.querySelector?.('[data-ep-tl-date]'); if (tip) tip.textContent = ''; };
  async function move(bar, days) {
    const found = lookup(bar); if (!found || !days) { reset(bar); return; }
    const { event, item } = found, date = shiftDay(item.date, days);
    try {
      if (leavesNow(event, item, date, zone(), now()) && !await ask('Enviar agora?', { text: `“${item.title}” está agendada. Com a data em ${label(date)}, o horário já passou e ela sai em seguida.`, ok: 'Enviar agora' })) { repaint(); return; }
      await savePlan(event.id, plan => { const row = plan.items.find(entry => entry.id === item.id); if (!row) throw Error('Este item não existe mais.'); row.date = date; });
      repaint(); flash(`Remarcado para ${label(date)}.`);
    } catch (error) { repaint(); flash(error.message, true); }
    globalThis.document?.querySelector?.(`[data-ep-tl-bar="${globalThis.CSS?.escape?.(item.id) ?? item.id}"]`)?.focus?.({ preventScroll: true });
  }
  async function pressed() {
    const { bar, days } = keys; keys = null;
    await move(bar, days);
  }

  listen('pointerdown', domEvent => {
    dragged = false;
    const bar = barOf(domEvent); if (!bar || domEvent.button) return;
    const found = lookup(bar); if (!found || movable(found.event, found.item)) return;
    const day = Number(bar.closest('[data-ep-timeline]').dataset.day);
    drag = { bar, day, x: domEvent.clientX, date: found.item.date, days: 0, moved: false };
    bar.setPointerCapture?.(domEvent.pointerId);
  });
  listen('pointermove', domEvent => {
    if (!drag) return;
    const dx = domEvent.clientX - drag.x;
    if (Math.abs(dx) >= 6) drag.moved = true;
    if (!drag.moved) return;
    drag.days = Math.round(dx / drag.day);
    drag.bar.classList.add('is-moving');
    show(drag.bar, drag.date, drag.days, drag.day);
  });
  listen('pointerup', async () => {
    if (!drag) return;
    const { bar, days, moved } = drag; drag = null;
    dragged = moved;
    if (moved) { bar.classList.remove('is-moving'); await move(bar, days); }
  });
  listen('pointercancel', () => { if (drag) reset(drag.bar); drag = null; });
  listen('click', domEvent => {
    const bar = barOf(domEvent); if (!bar) return;
    if (dragged) { dragged = false; return; }
    const found = lookup(bar); if (found) openItem(found.event, found.item.kind, found.item);
  });
  listen('keydown', async domEvent => {
    if (domEvent.key === 'Escape' && drag) { reset(drag.bar); dragged = true; drag = null; return; }
    const bar = barOf(domEvent); if (!bar) return;
    const found = lookup(bar); if (!found) return;
    if (domEvent.key === 'Enter') { domEvent.preventDefault(); openItem(found.event, found.item.kind, found.item); return; }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[domEvent.key]; if (!step) return;
    domEvent.preventDefault();
    const locked = movable(found.event, found.item);
    if (locked) { flash(locked, true); return; }
    if (keys && keys.bar !== bar) { drop(keys.timer); await pressed(); }
    if (keys) drop(keys.timer);
    const days = (keys?.days || 0) + step;
    keys = { bar, days, timer: later(pressed, 600) };
    show(bar, found.item.date, days, Number(bar.closest('[data-ep-timeline]').dataset.day));
  });
}
