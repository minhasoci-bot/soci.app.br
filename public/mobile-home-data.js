// What the app's Início screen shows, from the state the platform already loaded: conversations waiting for an answer,
// today's appointments, tasks due and open opportunities. Days are counted in the sub-account's timezone, and each
// block only exists for who can open its module.
import { dayAt } from './dashboard-metrics.js';

const LIMIT = 5;
const minutesAgo = (instant, now) => Math.max(0, Math.round((+now - +new Date(instant)) / 60000));
/** "agora", "9 min", "2 h", "3 d". */
export const shortAgo = (instant, now = new Date()) => {
  const minutes = minutesAgo(instant, now);
  return minutes < 1 ? 'agora' : minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} d`;
};
const hourAt = (now, timezone) => Number(new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));

export function homeData(state, { allowed = () => true, name = '', now = new Date(), lang = 'pt' } = {}) {
  const timezone = state.profile?.timezone || 'America/Sao_Paulo', locale = lang === 'es' ? 'es' : 'pt-BR', currency = state.profile?.currency || 'BRL';
  const hour = hourAt(now, timezone), today = dayAt(now.toISOString(), timezone);
  const format = (instant, options) => new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(new Date(instant));
  const contacts = new Map((state.contacts || []).map(row => [row.id, row]));
  const blocks = [allowed('conversations') && 'replies', allowed('calendars') && 'agenda', allowed('contacts') && 'tasks', allowed('opportunities') && 'deals'].filter(Boolean);

  const waiting = new Map();
  if (blocks.includes('replies')) for (const message of state.messages || []) {
    if (message.read || message.direction !== 'Inbound' || !contacts.has(message.contactId)) continue;
    const prior = waiting.get(message.contactId);
    if (!prior || new Date(message.created) >= new Date(prior.created)) waiting.set(message.contactId, message);
  }
  const replies = [...waiting.values()].sort((a, b) => +new Date(b.created) - +new Date(a.created)).slice(0, LIMIT)
    .map(message => ({ id: message.contactId, name: contacts.get(message.contactId).name, text: String(message.body || '').trim().slice(0, 140) || 'Anexo', ago: shortAgo(message.created, now) }));

  const agenda = !blocks.includes('agenda') ? [] : (state.appointments || []).filter(row => row.status !== 'Canceled' && dayAt(row.start || row.date, timezone) === today)
    .sort((a, b) => +new Date(a.start || a.date) - +new Date(b.start || b.date)).slice(0, LIMIT)
    .map(row => ({ id: row.id, title: row.title, contact: contacts.get(row.contactId)?.name || '', weekday: format(now, { weekday: 'short' }).replace('.', ''), day: format(now, { day: '2-digit' }),
      time: row.start ? format(row.start, { hour: '2-digit', minute: '2-digit' }) : '' }));

  // A task's due date is a calendar day (stored as its UTC midnight), not an instant.
  const tasks = !blocks.includes('tasks') ? [] : (state.tasks || []).filter(row => !row.done && row.due && row.due.slice(0, 10) <= today)
    .sort((a, b) => a.due.localeCompare(b.due)).slice(0, LIMIT)
    .map(row => ({ id: row.id, title: row.title, contact: contacts.get(row.contactId)?.name || '', late: row.due.slice(0, 10) < today }));

  const open = blocks.includes('deals') ? (state.opportunities || []).filter(row => row.status === 'Open') : [];
  const deals = { count: open.length, value: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(open.reduce((sum, row) => sum + (Number(row.value) || 0), 0)) };

  return { greeting: hour < 5 || hour >= 18 ? 'night' : hour < 12 ? 'morning' : 'afternoon', name: String(name || '').trim().split(/\s+/)[0] || '',
    blocks, replies, agenda, tasks, deals, empty: !replies.length && !agenda.length && !tasks.length && !open.length };
}
