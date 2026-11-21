// Meetings + Notes AI (6b.7): a meeting (linked to a contact and, optionally, an appointment) keeps its transcript —
// pasted, from a .txt/.vtt/.srt file, or transcribed from audio by the AI — and an AI summary with key points,
// decisions, action items (turned into CRM tasks) and a follow-up e-mail draft. The summary can go to the contact's notes.
export const meetingCollections = ['meetings'];
export const sentiments = [['positive', 'Positivo'], ['neutral', 'Neutro'], ['negative', 'Negativo']];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const lines = (list, limit, size) => (Array.isArray(list) ? list : []).map(item => str(String(item ?? ''), size)).filter(Boolean).slice(0, limit);

/** Plain text from a subtitle file (WebVTT or SRT): drops the header, cue numbers and timings. */
export function transcriptFromCaptions(text) {
  const raw = String(text || '').replace(/\r/g, '');
  if (!/-->/.test(raw)) return raw.trim();
  return raw.split('\n').filter(line => line.trim() && !/^WEBVTT/.test(line) && !/^\d+$/.test(line.trim()) && !/-->/.test(line) && !/^(NOTE|STYLE|REGION)\b/.test(line))
    .map(line => line.replace(/<[^>]+>/g, '').trim()).join('\n').trim();
}

export const meetingFields = {
  meetings: (s, d) => {
    const prior = d.id ? (s.meetings || []).find(m => m.id === d.id) : null;
    const contactId = str(d.contactId, 80);
    if (contactId && !s.contacts.some(c => c.id === contactId)) fail('Contato não encontrado.', 404);
    const appointmentId = str(d.appointmentId, 80);
    if (appointmentId && !s.appointments.some(a => a.id === appointmentId)) fail('Agendamento não encontrado.', 404);
    const date = d.date ? new Date(d.date) : new Date();
    if (!Number.isFinite(+date)) fail('Data inválida.');
    const transcript = typeof d.transcript === 'string' ? transcriptFromCaptions(d.transcript).slice(0, 60000) : prior?.transcript || '';
    return {
      title: str(d.title, 160) || fail('Dê um título à reunião.'), contactId, appointmentId, date: date.toISOString(),
      participants: str(d.participants, 500), transcript, notes: str(d.notes, 5000),
      // The AI result is kept when the meeting is edited (only "meeting-summary" changes it).
      summary: prior?.summary || null, source: ['manual', 'file', 'audio', 'recording'].includes(d.source) ? d.source : prior?.source || 'manual'
    };
  }
};

/** Normalizes what the AI returned (also used by the tests' stub). */
export function cleanSummary(result) {
  return {
    summary: str(result?.summary, 4000), keyPoints: lines(result?.keyPoints, 12, 400), decisions: lines(result?.decisions, 12, 400),
    actionItems: (Array.isArray(result?.actionItems) ? result.actionItems : []).slice(0, 20).map(item => ({ text: str(item?.text, 300), owner: str(item?.owner, 80), due: /^\d{4}-\d{2}-\d{2}$/.test(item?.due || '') ? item.due : '', taskId: '' })).filter(item => item.text),
    nextSteps: str(result?.nextSteps, 1000), sentiment: sentiments.some(([k]) => k === result?.sentiment) ? result.sentiment : 'neutral',
    followUpEmail: { subject: str(result?.followUpEmail?.subject, 160), body: str(result?.followUpEmail?.body, 4000) }
  };
}

export function meetingCommand(s, command, { add, run, now }) {
  const { type, data: d = {} } = command;
  const meeting = (s.meetings || []).find(m => m.id === d.id) || fail('Reunião não encontrada.', 404);
  if (type === 'meeting-transcript') {
    const text = transcriptFromCaptions(str(d.transcript, 60000));
    if (!text) fail('A transcrição veio vazia.');
    meeting.transcript = text; meeting.source = ['audio', 'recording'].includes(d.source) ? d.source : 'audio'; meeting.updated = now();
    return meeting.id;
  }
  if (type === 'meeting-summary') {
    meeting.summary = { ...cleanSummary(d.result), language: d.language === 'es' ? 'es' : 'pt', at: now() };
    meeting.updated = now();
    if (meeting.contactId) run(s, 'meeting_summarized', { contactId: meeting.contactId, meetingId: meeting.id, sentiment: meeting.summary.sentiment });
    return meeting.id;
  }
  if (type === 'meeting-tasks') {
    if (!meeting.summary) fail('Gere o resumo antes de criar as tarefas.');
    const wanted = new Set((Array.isArray(d.items) ? d.items : []).map(Number));
    let created = 0;
    meeting.summary.actionItems.forEach((item, index) => {
      if (item.taskId || (wanted.size && !wanted.has(index))) return;
      const task = add(s, 'tasks', { title: item.text, contactId: meeting.contactId, due: item.due ? new Date(`${item.due}T12:00:00Z`).toISOString() : '', done: false, owner: item.owner, notes: `Da reunião "${meeting.title}".` });
      item.taskId = task.id; created += 1;
      if (meeting.contactId) run(s, 'task_added', { contactId: meeting.contactId, taskId: task.id });
    });
    meeting.updated = now();
    return created;
  }
  if (type === 'meeting-note') {
    if (!meeting.summary) fail('Gere o resumo antes de salvar a nota.');
    const contact = s.contacts.find(c => c.id === meeting.contactId) || fail('Ligue a reunião a um contato para salvar a nota.');
    const m = meeting.summary;
    const text = [`Reunião: ${meeting.title} (${meeting.date.slice(0, 10)})`, m.summary, m.keyPoints.length ? `Pontos: ${m.keyPoints.join('; ')}` : '', m.decisions.length ? `Decisões: ${m.decisions.join('; ')}` : '', m.nextSteps ? `Próximos passos: ${m.nextSteps}` : ''].filter(Boolean).join('\n');
    // Newest first, within the contact's 5,000-character notes field.
    contact.notes = [text, String(contact.notes || '').trim()].filter(Boolean).join('\n\n').slice(0, 5000);
    contact.updated = now();
    return contact.id;
  }
  fail('Comando de reunião desconhecido.');
}
