// Sequências de e-mail (6b.2): a series of e-mails sent one after the other to each enrolled contact, with a
// delay before each step, a sending window (days and hours in the workspace's time zone) and exits (reply,
// unsubscribe, removal). Sends ride the campaign pipeline: email-tick counts them, email-take leases them,
// email-result settles them and the campaign tracking links (open, click, unsubscribe) work the same way.
import { walletCharge } from './wallet-model.mjs';
import { randomBytes } from 'node:crypto';
import { collectLinks, normalizeDesign } from './ui/email-blocks.js';
import { canMessage } from './preference-model.mjs';

export const sequenceCollections = ['emailSequences'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const isEmail = value => /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(value || '');
const iso = at => new Date(at).toISOString();
const token = () => randomBytes(12).toString('hex');
const HOUR = 3600000, LEASE_MS = 10 * 60000, MAX_ENROLLED = 5000;

export const sequenceFields = {
  emailSequences: (s, d) => {
    const prior = d.id ? (s.emailSequences || []).find(row => row.id === d.id) : null;
    const stepsInput = Array.isArray(d.steps) ? d.steps : prior?.steps || [];
    if (!stepsInput.length) fail('Adicione pelo menos um e-mail à sequência.');
    if (stepsInput.length > 20) fail('Uma sequência pode ter até 20 e-mails.');
    const steps = stepsInput.map((step, index) => {
      const delayDays = Math.round(Number(step?.delayDays) || 0), delayHours = Math.round(Number(step?.delayHours) || 0);
      if (delayDays < 0 || delayDays > 365 || delayHours < 0 || delayHours > 23) fail(`O intervalo do e-mail ${index + 1} vai de 0 a 365 dias e de 0 a 23 horas.`);
      const subject = str(step?.subject, 200) || fail(`Escreva o assunto do e-mail ${index + 1}.`);
      const design = normalizeDesign(step || {});
      if (!design.blocks?.length) fail(`Escreva o conteúdo do e-mail ${index + 1}.`);
      return { id: /^[\w-]{6,40}$/.test(step?.id || '') ? step.id : token().slice(0, 12), delayDays, delayHours, subject, preheader: str(step?.preheader, 200), ...design };
    });
    const replyTo = str(d.replyTo ?? prior?.replyTo, 160);
    if (replyTo && !isEmail(replyTo)) fail('Informe um e-mail válido em Responder para.');
    const win = d.window ?? prior?.window ?? {};
    const days = [...new Set((Array.isArray(win.days) ? win.days : [1, 2, 3, 4, 5]).map(Number).filter(n => n >= 0 && n <= 6))];
    const startHour = Math.round(Number(win.startHour ?? 8)), endHour = Math.round(Number(win.endHour ?? 20));
    if (!days.length) fail('Escolha pelo menos um dia para enviar.');
    if (!(startHour >= 0 && endHour <= 24 && endHour > startHour)) fail('A janela de envio precisa terminar depois de começar.');
    const status = ['active', 'paused', 'draft'].includes(d.status) ? d.status : prior?.status || 'draft';
    return { name: str(d.name ?? prior?.name, 120) || fail('Dê um nome à sequência.'), status, fromName: str(d.fromName ?? prior?.fromName, 80), replyTo,
      window: { days, startHour, endHour }, exitOnReply: d.exitOnReply === undefined ? prior?.exitOnReply !== false : Boolean(d.exitOnReply), steps,
      enrolled: prior?.enrolled || [] };
  }
};

/** The hour and weekday of an instant in a time zone. */
function local(at, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}
/** The first moment at or after `at` inside the sending window (checked hour by hour, up to 8 days). */
export function inWindow(at, win, zone) {
  let t = at;
  for (let i = 0; i < 24 * 8; i++) {
    const { hour, weekday } = local(t, zone);
    if (win.days.includes(weekday) && hour >= win.startHour && hour < win.endHour) return t;
    t = Math.ceil((t + 1) / HOUR) * HOUR;
  }
  return at;
}
const dueOf = (seq, index, from, zone) => { const step = seq.steps[index]; return step ? iso(inWindow(from + (step.delayDays * 24 + step.delayHours) * HOUR, seq.window, zone)) : ''; };
const zoneOf = s => s.profile?.timezone || 'America/Sao_Paulo';

/** Enrolls contacts (once while active); returns how many came in. */
export function enroll(s, seq, contacts, at = Date.now()) {
  if (seq.status === 'draft') fail('Ative a sequência antes de inscrever contatos.');
  let added = 0;
  for (const contact of contacts) {
    const email = String(contact?.email || '').trim().toLowerCase();
    if (!isEmail(email) || !canMessage(contact, 'Email')) continue;
    if (seq.enrolled.some(row => row.c === contact.id && row.status === 'active')) continue;
    if (seq.enrolled.length >= MAX_ENROLLED) fail(`Uma sequência pode ter até ${MAX_ENROLLED} inscrições.`);
    seq.enrolled.push({ id: token().slice(0, 12), c: contact.id, e: email, n: contact.name || '', status: 'active', step: 0, enrolledAt: iso(at), dueAt: dueOf(seq, 0, at, zoneOf(s)), sends: [] });
    added++;
  }
  return added;
}
const exit = (row, reason, at) => Object.assign(row, { status: 'exited', reason, exitedAt: iso(at), dueAt: '' });

export function sequenceCommand(s, command) {
  const { type, id, data: d = {} } = command, at = Date.now();
  const seq = (s.emailSequences || []).find(row => row.id === id) || fail('Sequência não encontrada.', 404);
  if (type === 'sequence-enroll') {
    const ids = new Set(Array.isArray(d.contactIds) ? d.contactIds : []);
    const tag = str(d.tag, 60).toLowerCase();
    const contacts = s.contacts.filter(c => ids.has(c.id) || (tag && (c.tags || []).some(t => t.toLowerCase() === tag)));
    if (!contacts.length) fail('Escolha contatos ou uma tag com contatos.');
    return enroll(s, seq, contacts, at);
  }
  if (type === 'sequence-remove') {
    const row = seq.enrolled.find(item => item.c === d.contactId && item.status === 'active') || fail('Contato não está na sequência.', 404);
    exit(row, 'removed', at); return row.id;
  }
  fail('Comando de sequência desconhecido.');
}

// ---- The campaign pipeline: count, lease, settle, track --------------------------------------------------
const sendable = (row, at) => row.status === 'active' && row.dueAt && Date.parse(row.dueAt) <= at && !(row.lease && Date.parse(row.lease) > at - LEASE_MS);

export function sequenceTick(s, at) {
  let due = 0;
  for (const seq of s.emailSequences || []) if (seq.status === 'active') due += seq.enrolled.filter(row => sendable(row, at)).length;
  return due;
}

/** Adds due sequence e-mails to a leased batch (items and their "campaign" render data). */
export function sequenceTake(s, at, limit, items, campaigns) {
  for (const seq of s.emailSequences || []) {
    if (seq.status !== 'active') continue;
    for (const row of seq.enrolled) {
      if (items.length >= limit) return;
      if (!sendable(row, at)) continue;
      const step = seq.steps[row.step];
      if (!step) { Object.assign(row, { status: 'completed', dueAt: '', completedAt: iso(at) }); continue; }
      const contact = s.contacts.find(c => c.id === row.c);
      if (!contact || !canMessage(contact, 'Email')) { exit(row, 'unsubscribed', at); continue; }
      const t = token(), key = `seq:${seq.id}:${step.id}`;
      row.lease = iso(at);
      row.sends = [...row.sends, { s: row.step, t, st: 'sending', at: iso(at) }].slice(-40);
      items.push({ campaignId: key, token: t, email: row.e, variant: 'A', contact: { name: contact.name || '', email: row.e, phone: contact.phone || '', company: contact.company || '' } });
      campaigns[key] ||= { name: seq.name, fromName: seq.fromName, replyTo: seq.replyTo, blocks: step.blocks, style: step.style, origin: '', A: { subject: step.subject, preheader: step.preheader }, B: { subject: step.subject, preheader: step.preheader } };
    }
  }
}

const findSend = (s, t) => {
  for (const seq of s.emailSequences || []) for (const row of seq.enrolled) { const send = row.sends.find(item => item.t === t); if (send) return { seq, row, send }; }
  return null;
};

/** Settles sent or failed sequence e-mails and schedules each contact's next step. */
export function sequenceResults(s, results, at, run) {
  for (const result of results) {
    if (!String(result?.campaignId || '').startsWith('seq:')) continue;
    const hit = findSend(s, result.token);
    if (!hit || hit.send.st !== 'sending') continue;
    const { seq, row, send } = hit;
    delete row.lease;
    if (!result.ok) { Object.assign(send, { st: 'failed', err: str(result.error, 200) }); exit(row, 'failed', at); continue; }
    Object.assign(send, { st: 'sent', at: iso(at) });
    walletCharge(s, 'email', 1, iso(at));
    row.step += 1;
    if (seq.steps[row.step]) row.dueAt = dueOf(seq, row.step, at, zoneOf(s));
    else { Object.assign(row, { status: 'completed', dueAt: '', completedAt: iso(at) }); run?.(s, 'email_sequence_completed', { contactId: row.c, sequenceId: seq.id, title: seq.name }); }
  }
}

/** Open, click and unsubscribe of a sequence e-mail (null when the token is not from a sequence). */
export function sequenceTrack(s, { token: t, event, index }, { run, at }) {
  const hit = findSend(s, t);
  if (!hit) return null;
  const { seq, row, send } = hit, step = seq.steps[send.s];
  const fire = name => run(s, 'email_event', { contactId: row.c, sequenceId: seq.id, event: name });
  const out = { campaign: seq.name, business: s.profile?.name || '', unsubscribed: Boolean(send.u), opened: Boolean(send.o), url: '', contactId: row.c };
  if (event === 'info') return out;
  if (event === 'click') {
    out.url = collectLinks(step?.blocks || [])[Number(index)] || '';
    if (!out.url) return out;
    if (!send.o) { send.o = iso(at); fire('opened'); }
    if (!send.k) { send.k = iso(at); fire('clicked'); }
  } else if (event === 'open') { if (!send.o) { send.o = iso(at); fire('opened'); } }
  else if (event === 'unsubscribe') {
    if (!send.u) {
      send.u = iso(at); out.unsubscribed = true;
      const contact = s.contacts.find(c => c.id === row.c);
      if (contact && !contact.emailUnsubscribed) Object.assign(contact, { emailUnsubscribed: true, emailUnsubscribedAt: iso(at), updated: iso(at) });
      if (row.status === 'active') exit(row, 'unsubscribed', at);
      fire('unsubscribed');
    }
  } else return null;
  return out;
}

/** A reply from the contact takes them out of the sequences that stop on reply. */
export function sequenceInbound(s, type, ctx) {
  if (type !== 'customer_replied' || !ctx.contactId) return;
  for (const seq of s.emailSequences || []) if (seq.exitOnReply !== false) for (const row of seq.enrolled) if (row.c === ctx.contactId && row.status === 'active') exit(row, 'replied', Date.now());
}

/** Per-step numbers for the screen. */
export function sequenceStats(seq) {
  const steps = seq.steps.map(() => ({ sent: 0, opened: 0, clicked: 0, unsubscribed: 0 }));
  for (const row of seq.enrolled) for (const send of row.sends) {
    const n = steps[send.s]; if (!n || send.st !== 'sent') continue;
    n.sent++; if (send.o) n.opened++; if (send.k) n.clicked++; if (send.u) n.unsubscribed++;
  }
  const count = status => seq.enrolled.filter(row => row.status === status).length;
  return { active: count('active'), completed: count('completed'), exited: count('exited'), steps };
}

/** Workflow actions "Inscrever na sequência" / "Tirar da sequência". */
export function sequenceWorkflow(s, contact, action, sequenceId) {
  const seq = (s.emailSequences || []).find(row => row.id === sequenceId);
  if (!seq) return 'erro: sequência não encontrada';
  if (action === 'remove_from_sequence') {
    const row = seq.enrolled.find(item => item.c === contact.id && item.status === 'active');
    if (!row) return 'contato não estava na sequência';
    exit(row, 'removed', Date.now()); return `saiu de “${seq.name}”`;
  }
  if (seq.status !== 'active') return 'erro: sequência não está ativa';
  if (!isEmail(contact.email)) return 'erro: contato sem e-mail válido';
  if (contact.emailUnsubscribed) return 'contato descadastrado dos e-mails';
  return enroll(s, seq, [contact]) ? `inscrito em “${seq.name}”` : 'já estava na sequência';
}
