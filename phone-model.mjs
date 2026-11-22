// Telefonia (2.4): the sub-account's Twilio numbers (Configurações → Telefonia) and its calls (s.calls, also used by
// "Registrar ligação"). The server talks to Twilio; these commands keep the state and fire the workflow triggers.
import { e164 } from './twilio.mjs';
import { walletCharge } from './wallet-model.mjs';
import { transcriptText, voiceSettings, VOICE_LIMITS } from './voice-ai.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';
const FINAL = new Set(['answered', 'missed', 'voicemail', 'busy', 'failed']);
export const callStatusLabels = { ringing: 'tocando', 'in-progress': 'em andamento', answered: 'atendida', missed: 'não atendida', voicemail: 'caixa postal', busy: 'ocupado', failed: 'falhou' };

export const phoneDefaults = () => ({ numbers: [] });
export const phoneOf = s => { s.phone = { ...phoneDefaults(), ...(s.phone || {}) }; s.calls ||= []; return s.phone; };

// Power dialer (6b.9): a queue of contacts and the team member's session. The member stays on the line in a Twilio
// conference while the dialer calls one contact after the other; each call gets a result (disposition).
export const dialerDispositions = [['interested', 'Interessado'], ['callback', 'Retornar depois'], ['not_interested', 'Sem interesse'], ['no_answer', 'Não atendeu'], ['voicemail', 'Caixa postal'], ['wrong_number', 'Número errado']];
export const dialerDefaults = () => ({ queue: [], sessions: [] });
export const dialerOf = s => { s.dialer = { ...dialerDefaults(), ...(s.dialer || {}) }; return s.dialer; };
const DIALER_QUEUE = 500;
/** The number of the sub-account that a Twilio "To"/"From" belongs to. */
export const numberByPhone = (s, phone) => phoneOf(s).numbers.find(row => row.number === e164(phone));

/** Same phone, whatever the formatting: compares the last 10 digits (DDD + number, or the national part). */
export function contactByPhone(s, phone) {
  const tail = String(phone || '').replace(/\D/g, '').slice(-10);
  if (tail.length < 8) return null;
  return s.contacts.find(row => String(row.phone || '').replace(/\D/g, '').slice(-10) === tail) || null;
}

const phoneList = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/)).map(item => e164(item)).filter(Boolean))].slice(0, 5);

/** A number's editable settings: name, where calls ring, for how long, recording, voicemail and the IVR switch. */
// `mode`: who answers an inbound call — the forwarding phones, the IVR workflows or the Voice AI agent (3.2).
function numberSettings(d) {
  const mode = ['forward', 'ivr', 'voice_ai'].includes(d.mode) ? d.mode : d.ivr ? 'ivr' : 'forward';
  const voice = voiceSettings({ agentId: d.voiceAgentId, welcome: d.voiceWelcome, transfer: d.voiceTransfer, voice: d.voice, serviceId: d.voiceServiceId, maxMinutes: d.voiceMaxMinutes });
  return {
    name: str(d.name, 60), forward: phoneList(d.forward), timeout: Math.min(60, Math.max(5, Math.trunc(Number(d.timeout)) || 20)),
    record: Boolean(d.record), voicemail: d.voicemail !== false, greeting: str(d.greeting, 600), mode, ivr: mode === 'ivr',
    voiceAgentId: voice.agentId, voiceWelcome: voice.welcome, voiceTransfer: e164(voice.transfer), voice: voice.voice, voiceServiceId: voice.serviceId, voiceMaxMinutes: voice.maxMinutes
  };
}
// Whose OpenAI the Voice AI of a number uses: set only by the server, from the session of who saved it.
const voiceKeyOf = key => key && typeof key === 'object' && str(key.session, 80) ? { session: str(key.session, 80), user: str(key.user, 80), agency: str(key.agency, 120) } : null;

function callMessage(s, call, contact, { add, body }) {
  if (!contact) return;
  add(s, 'messages', { contactId: contact.id, body, subject: '', channel: 'Call', direction: call.direction === 'inbound' ? 'Inbound' : 'Outbound', read: call.direction !== 'inbound', starred: false,
    origin: 'phone', callId: call.id, ...(call.recordingUrl || call.voicemailUrl ? { recordingUrl: call.voicemailUrl || call.recordingUrl } : {}) });
}
const callLine = call => `${call.direction === 'inbound' ? 'Ligação recebida' : 'Ligação feita'} · ${callStatusLabels[call.status] || call.status}${call.duration ? ` · ${Math.ceil(call.duration / 60)} min` : ''}`;

/** The phone commands. Returns undefined when the type is not one of them. */
export function phoneCommand(s, type, d, { add, run, now, engine }) {
  if (type === 'phone-number-save') {
    // Configurações → Telefonia: the settings of a number the agency already bought.
    const number = phoneOf(s).numbers.find(row => row.id === d.id);
    if (!number) fail('Número não encontrado.', 404);
    // The old switch (ivr: true/false) still works when no mode is sent.
    const next = { ...number, ...d };
    if (!('mode' in d) && 'ivr' in d) next.mode = d.ivr ? 'ivr' : number.mode === 'ivr' ? 'forward' : number.mode;
    Object.assign(number, numberSettings(next));
    if ('voiceKey' in d) number.voiceKey = voiceKeyOf(d.voiceKey);
    if (number.mode === 'voice_ai' && !number.voiceAgentId) fail('Voice AI: escolha o agente que atende.');
    return number.id;
  }
  if (type === 'phone-number-add') {
    // Server only, after buying it on Twilio.
    const phone = phoneOf(s), number = e164(d.number);
    if (!number || !str(d.sid, 64)) fail('Número inválido.');
    if (phone.numbers.length >= 20) fail('Até 20 números por subconta.');
    if (phone.numbers.some(row => row.number === number)) fail('Este número já está na subconta.');
    const row = { id: `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sid: str(d.sid, 64), number, created: now(), ...numberSettings({ name: d.name, forward: d.forward }) };
    phone.numbers.push(row);
    return row.id;
  }
  if (type === 'phone-number-remove') {
    const phone = phoneOf(s), before = phone.numbers.length;
    phone.numbers = phone.numbers.filter(row => row.id !== d.id);
    if (phone.numbers.length === before) fail('Número não encontrado.', 404);
    return d.id;
  }
  if (type === 'phone-call-start') {
    // Server only: an inbound call reached a number, or an outbound call (team or workflow) was placed.
    phoneOf(s);
    if (d.callSid && s.calls.some(row => row.callSid === d.callSid)) return s.calls.find(row => row.callSid === d.callSid).id;
    const direction = d.direction === 'inbound' ? 'inbound' : 'outbound';
    const number = s.phone.numbers.find(row => row.id === d.numberId) || numberByPhone(s, direction === 'inbound' ? d.to : d.from);
    let contact = d.contactId ? s.contacts.find(row => row.id === d.contactId) : contactByPhone(s, direction === 'inbound' ? d.from : d.to);
    if (!contact && direction === 'inbound') {
      const phone = e164(d.from);
      if (!phone) fail('Número de origem inválido.');
      contact = add(s, 'contacts', { name: phone, phone, email: '', tags: ['Ligação'], company: '', notes: '', custom: {} });
      run(s, 'Contact created', { contactId: contact.id });
    }
    const call = add(s, 'calls', { contactId: contact?.id || '', direction, status: 'ringing', duration: 0, notes: '', phone: e164(direction === 'inbound' ? d.from : d.to), source: 'twilio',
      numberId: number?.id || '', callSid: str(d.callSid, 64), userId: str(d.userId, 80), workflowId: str(d.workflowId, 80), kind: d.kind === 'voicemail-drop' ? 'voicemail-drop' : d.kind === 'dialer' ? 'dialer' : 'call', ...(d.dialerId ? { dialerId: str(d.dialerId, 80) } : {}),
      ...(d.kind === 'voicemail-drop' ? { notes: str(d.notes, 1500), dropUrl: /^https:\/\/\S+$/i.test(String(d.dropUrl || '')) ? str(d.dropUrl, 1000) : '' } : {}) });
    // Voice AI: an outbound call of the workflow step, or an inbound call to a number answered by the agent.
    if (d.kind === 'voice-ai' || (direction === 'inbound' && number?.mode === 'voice_ai' && number.voiceAgentId)) {
      call.kind = 'voice-ai';
      call.voice = { ...voiceSettings(d.kind === 'voice-ai' ? d.voice || {} : { agentId: number.voiceAgentId, welcome: number.voiceWelcome, transfer: number.voiceTransfer, voice: number.voice, serviceId: number.voiceServiceId, maxMinutes: number.voiceMaxMinutes }), transcript: [], outcome: '' };
    }
    if (direction === 'inbound' && number?.mode === 'ivr' && contact && call.callSid) {
      // "Início da URA": the workflows answer the call; without one, the number's forwarding takes it.
      run(s, 'ivr_call', { contactId: contact.id, callSid: call.callSid, numberId: number.id, from: call.phone });
    }
    return call.id;
  }
  if (type === 'phone-call-update') {
    // Server only: Twilio's status of the call. A final status fires "Ligação terminou" once and charges the minutes.
    phoneOf(s);
    const call = s.calls.find(row => (d.callId && row.id === d.callId) || (d.callSid && row.callSid === d.callSid));
    if (!call) return '';
    if (d.callSid && !call.callSid) call.callSid = str(d.callSid, 64);
    if (d.recordingUrl && /^https:\/\/api\.twilio\.com\//.test(d.recordingUrl)) call.recordingUrl = str(d.recordingUrl, 500);
    if (d.voicemailUrl && /^https:\/\/api\.twilio\.com\//.test(d.voicemailUrl)) call.voicemailUrl = str(d.voicemailUrl, 500);
    if (Number(d.duration) > 0) call.duration = Math.min(4 * 3600, Math.round(Number(d.duration)));
    const status = d.status === 'voicemail' || call.voicemailUrl ? 'voicemail' : d.status;
    if (status && (!FINAL.has(call.status) || status === 'voicemail')) call.status = status;
    if (d.final && !call.ended) {
      if (!FINAL.has(call.status)) call.status = call.duration ? 'answered' : 'missed';
      call.ended = now();
      const contact = s.contacts.find(row => row.id === call.contactId);
      callMessage(s, call, contact, { add, body: callLine(call) });
      // Voice AI: the transcript goes to Conversas and fires "Ligação do Voice AI terminou".
      if (call.voice?.transcript?.length && contact) {
        const transcript = transcriptText(call.voice.transcript);
        add(s, 'messages', { contactId: contact.id, body: `Transcrição da ligação com o Voice AI\n${transcript}`.slice(0, 5000), subject: '', channel: 'Note', direction: 'Outbound', read: true, starred: false, origin: 'phone', callId: call.id });
        run(s, 'voice_ai_ended', { contactId: contact.id, callId: call.id, agentId: call.voice.agentId, direction: call.direction, outcome: call.voice.outcome || 'end', transcript, duration: call.duration });
      }
      if (call.duration) walletCharge(s, 'phone', Math.ceil(call.duration / 60));
      if (contact) run(s, 'call_details', { contactId: contact.id, callId: call.id, direction: call.direction, status: call.status, duration: call.duration, numberId: call.numberId,
        recording: call.voicemailUrl || call.recordingUrl || '' });
      if (call.callSid) engine.callInput(s, { callSid: call.callSid, ended: true });
    }
    return call.id;
  }
  if (type === 'voice-turn') {
    // Server only: one turn of a Voice AI call (what the caller said, what the agent answered) and its outcome.
    const call = (s.calls || []).find(row => row.id === d.callId);
    if (!call?.voice) return '';
    const turns = call.voice.transcript;
    for (const [role, text] of [['caller', d.caller], ['agent', d.agent]]) if (str(text, VOICE_LIMITS.text)) turns.push({ role, text: str(text, VOICE_LIMITS.text), at: now() });
    if (turns.length > VOICE_LIMITS.turns * 2) turns.splice(0, turns.length - VOICE_LIMITS.turns * 2);
    if (['transfer', 'end', 'book', 'timeout'].includes(d.outcome)) call.voice.outcome = d.outcome;
    if (d.appointmentId) call.voice.appointmentId = str(d.appointmentId, 80);
    return call.id;
  }
  if (type === 'dialer-queue-add') {
    // Contacts with a phone go to the end of the queue (once while pending); by list or by tag.
    const dialer = dialerOf(s), pending = new Set(dialer.queue.filter(row => row.status === 'pending').map(row => row.contactId));
    const tag = str(d.tag, 48).toLowerCase();
    const ids = tag ? s.contacts.filter(row => (row.tags || []).some(t => String(t).toLowerCase() === tag)).map(row => row.id) : [].concat(d.contactIds || []).map(String);
    let added = 0;
    for (const id of ids) {
      const contact = s.contacts.find(row => row.id === id);
      if (!contact || !e164(contact.phone) || pending.has(id) || contact.dnd) continue;
      if (dialer.queue.filter(row => row.status === 'pending').length >= DIALER_QUEUE) fail(`A fila do discador aceita até ${DIALER_QUEUE} contatos pendentes.`);
      dialer.queue.push({ contactId: id, status: 'pending', added: now(), by: str(d.by, 80) });
      pending.add(id); added++;
    }
    dialer.queue = dialer.queue.filter(row => row.status === 'pending').concat(dialer.queue.filter(row => row.status !== 'pending').slice(-300));
    return added;
  }
  if (type === 'dialer-queue-remove') {
    const dialer = dialerOf(s), before = dialer.queue.length;
    dialer.queue = d.all ? dialer.queue.filter(row => row.status !== 'pending') : dialer.queue.filter(row => !(row.status === 'pending' && row.contactId === d.contactId));
    return before - dialer.queue.length;
  }
  if (type === 'dialer-disposition') {
    // The result of a dialer call: on the call, the queue and in Conversas; fires "Resultado do discador".
    const call = (s.calls || []).find(row => row.id === d.callId);
    if (!call) fail('Ligação não encontrada.', 404);
    const disposition = dialerDispositions.find(([key]) => key === d.disposition);
    if (!disposition) fail('Escolha o resultado da ligação.');
    const first = !call.disposition;
    call.disposition = disposition[0];
    const note = str(d.note, 1000);
    if (note) call.notes = note;
    const item = dialerOf(s).queue.find(row => row.callId === call.id);
    if (item) Object.assign(item, { status: 'done', disposition: disposition[0] });
    const contact = s.contacts.find(row => row.id === call.contactId);
    if (contact && first) {
      add(s, 'messages', { contactId: contact.id, body: [`Discador: ${disposition[1]}`, note].filter(Boolean).join('\n'), subject: '', channel: 'Note', direction: 'Outbound', read: true, starred: false, origin: 'human', callId: call.id });
      run(s, 'dialer_disposition', { contactId: contact.id, callId: call.id, disposition: disposition[0], note });
    }
    return call.id;
  }
  if (type === 'dialer-session-start') {
    // Server only: the member's session (one active per member; the newest replaces the older ones).
    const dialer = dialerOf(s), userId = str(d.userId, 80);
    for (const row of dialer.sessions) if (row.userId === userId && row.status !== 'ended') row.status = 'ended';
    const session = { id: `dl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, userId, numberId: str(d.numberId, 80), agent: e164(d.agent), status: 'connecting', agentCallSid: '', currentCallId: '', calls: 0, created: now() };
    dialer.sessions = [...dialer.sessions.filter(row => row.status !== 'ended').slice(-20), ...dialer.sessions.filter(row => row.status === 'ended').slice(-20), session];
    return session.id;
  }
  if (type === 'dialer-session-update') {
    const session = dialerOf(s).sessions.find(row => row.id === d.id);
    if (!session) return '';
    if (['connecting', 'active', 'ended'].includes(d.status)) session.status = d.status;
    if (d.agentCallSid) session.agentCallSid = str(d.agentCallSid, 64);
    if (d.status === 'ended') session.ended = now();
    return session.id;
  }
  if (type === 'dialer-next') {
    // Server only: the next pending contact of the queue for the session; the call row comes from phone-call-start.
    const dialer = dialerOf(s), session = dialer.sessions.find(row => row.id === d.id);
    if (!session || session.status === 'ended') fail('Inicie o discador.', 409);
    const current = session.currentCallId && s.calls.find(row => row.id === session.currentCallId);
    if (current && !current.ended && current.status !== 'failed') fail('Ainda há uma ligação em andamento: desligue antes de chamar o próximo.', 409);
    const item = dialer.queue.find(row => row.status === 'pending' && (!d.contactId || row.contactId === d.contactId));
    if (!item) return null;
    const contact = s.contacts.find(row => row.id === item.contactId);
    if (!contact || !e164(contact.phone)) { item.status = 'skipped'; return { skip: true }; }
    item.status = 'calling';
    return { contactId: contact.id, to: e164(contact.phone) };
  }
  if (type === 'dialer-calling') {
    // Server only: ties the contact's call to the session and to the queue item.
    const dialer = dialerOf(s), session = dialer.sessions.find(row => row.id === d.id);
    const item = dialer.queue.find(row => row.status === 'calling' && row.contactId === d.contactId);
    if (session) { session.currentCallId = str(d.callId, 80); session.calls++; session.status = 'active'; }
    if (item) { item.callId = str(d.callId, 80); item.status = d.failed ? 'pending' : 'called'; }
    return session?.id || '';
  }
  if (type === 'ivr-input') return engine.callInput(s, { callSid: str(d.callSid, 64), digits: str(String(d.digits ?? ''), 20), dialStatus: str(d.dialStatus, 30), recordingUrl: str(d.recordingUrl, 500) }) ? 'ok' : '';
  if (type === 'ivr-take') {
    // Server only: the verbs the IVR steps left for the call (and what they wait for), emptied as they go to Twilio.
    const script = s.callScripts?.[d.callSid];
    if (!script) return { verbs: [], wait: '', owner: '', done: false };
    const out = { verbs: script.verbs, wait: script.wait?.kind || '', owner: script.owner, done: script.done };
    script.verbs = [];
    return out;
  }
  return undefined;
}

/** "Relatório de ligações": totals and the rows of a period (newest first). */
export function callReport(s, { from = '', to = '', direction = '' } = {}) {
  const rows = (s.calls || []).filter(row => (!from || String(row.created) >= from) && (!to || String(row.created).slice(0, 10) <= to) && (!direction || row.direction === direction))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const answered = rows.filter(row => row.status === 'answered');
  const talk = answered.reduce((sum, row) => sum + (row.duration || 0), 0);
  return {
    rows, total: rows.length, inbound: rows.filter(row => row.direction === 'inbound').length, outbound: rows.filter(row => row.direction === 'outbound').length,
    answered: answered.length, missed: rows.filter(row => ['missed', 'busy', 'failed'].includes(row.status)).length, voicemail: rows.filter(row => row.status === 'voicemail').length,
    average: answered.length ? Math.round(talk / answered.length) : 0, minutes: Math.ceil(rows.reduce((sum, row) => sum + (row.duration || 0), 0) / 60)
  };
}
