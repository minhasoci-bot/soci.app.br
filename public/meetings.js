// Calendários → Reuniões (6b.7, Meetings + Notes AI): the meetings list, and one meeting with its transcript
// (paste, .txt/.vtt/.srt file, audio file or a recording made here) and the AI notes: summary, key points,
// decisions, action items (→ CRM tasks), the follow-up e-mail and "save to the contact".
import { icon } from './icons.js';
import { badge, fmt, h, pageShell } from './screens.js';

const ui = { open: '', recorder: null, chunks: [], started: 0, timer: 0, busy: '' };
const sentiments = { positive: ['Positivo', 'green'], neutral: ['Neutro', ''], negative: ['Negativo', 'red'] };
const sources = { manual: 'Digitada', file: 'Arquivo de texto', audio: 'Áudio enviado', recording: 'Gravada aqui' };
const audioLimit = 4_000_000;

function listView(c) {
  const rows = [...(c.s.meetings || [])].sort((a, b) => b.date.localeCompare(a.date));
  const bar = `<div class="sch-bar"><button type="button" class="primary" data-mt="new">${icon('plus', 15)} Nova reunião</button></div>`;
  if (!rows.length) return `<div class="surface empty-state sch-empty">${icon('mic', 22)}<b>Nenhuma reunião ainda</b><p class="dim">Registre uma reunião ou ligação: cole a transcrição, envie o áudio ou grave aqui. A IA resume, lista decisões e transforma os combinados em tarefas.</p><button type="button" class="primary" data-mt="new">${icon('plus', 15)} Nova reunião</button></div>`;
  return bar + `<div class="surface table-shell"><table><thead><tr><th scope="col">Reunião</th><th scope="col">Data</th><th scope="col">Contato</th><th scope="col">Transcrição</th><th scope="col">Notas da IA</th></tr></thead><tbody>
    ${rows.map(m => { const who = c.s.contacts.find(x => x.id === m.contactId); const mood = m.summary ? sentiments[m.summary.sentiment] : null;
      return `<tr><td><button type="button" class="text-link" data-mt="open" data-id="${h(m.id)}"><b>${h(m.title)}</b></button></td><td>${h(fmt(m.date, c.s.profile.timezone, true))}</td><td>${h(who?.name || '—')}</td>
        <td>${m.transcript ? badge(sources[m.source] || 'Digitada', 'blue') : badge('Sem transcrição')}</td><td>${mood ? `${badge('Resumida', 'green')} ${badge(mood[0], mood[1])}` : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
}

function meetingForm(c, m) {
  const row = m || { title: '', contactId: '', appointmentId: '', date: new Date().toISOString(), participants: '' };
  const local = new Date(new Date(row.date).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return `<form class="settings-form" data-mt-form="meeting" data-id="${h(m?.id || '')}"><label>Título<input name="title" required maxlength="160" value="${h(row.title)}" placeholder="Ex.: Apresentação da proposta"></label>
    <div class="field-grid"><label>Contato<select name="contactId"><option value="">Nenhum</option>${c.s.contacts.map(x => `<option value="${h(x.id)}"${x.id === row.contactId ? ' selected' : ''}>${h(x.name || x.email)}</option>`).join('')}</select></label>
      <label>Data e hora<input name="date" type="datetime-local" value="${h(local)}"></label></div>
    <label>Agendamento (opcional)<select name="appointmentId"><option value="">Nenhum</option>${[...c.s.appointments].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 200).map(a => `<option value="${h(a.id)}"${a.id === row.appointmentId ? ' selected' : ''}>${h(fmt(a.start, c.s.profile.timezone, true))} · ${h(a.title)}</option>`).join('')}</select></label>
    <label>Participantes<input name="participants" maxlength="500" value="${h(row.participants)}" placeholder="Ex.: Ana (cliente), Marina (vendas)"></label>
    <div class="tx-actions">${m ? `<button type="button" class="danger plain" data-mt="delete" data-id="${h(m.id)}">Excluir</button>` : ''}<button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p></form>`;
}

function detailView(c, m) {
  const who = c.s.contacts.find(x => x.id === m.contactId), s = m.summary, mood = s ? sentiments[s.sentiment] : null;
  const recording = ui.recorder && ui.recorder.state === 'recording';
  const transcript = `<section class="surface padded mt-transcript"><div class="mt-head"><h2>Transcrição</h2>${m.transcript ? badge(sources[m.source] || 'Digitada', 'blue') : ''}</div>
    <form class="settings-form" data-mt-form="transcript"><textarea name="transcript" rows="14" maxlength="60000" placeholder="Cole aqui a transcrição da reunião ou ligação.">${h(m.transcript)}</textarea>
      <div class="mt-tools"><button class="secondary">Salvar transcrição</button>
        <label class="secondary mt-file">${icon('upload', 15)} Arquivo .txt, .vtt ou .srt<input type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" data-mt-file="text" hidden></label>
        <label class="secondary mt-file">${icon('upload', 15)} Áudio (até 4 MB)<input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" data-mt-file="audio" hidden></label>
        <button type="button" class="${recording ? 'danger' : 'secondary'}" data-mt="record"${ui.busy ? ' disabled' : ''}>${icon(recording ? 'stop' : 'mic', 15)} ${recording ? `Parar e transcrever <span class="mt-clock" data-mt-clock>0:00</span>` : 'Gravar aqui'}</button></div>
      <p class="dim">A gravação usa o microfone deste aparelho e cabe até uns 20 minutos. Avise os participantes antes de gravar.</p><p class="form-status" role="alert">${ui.busy === 'audio' ? 'Transcrevendo o áudio…' : ''}</p></form></section>`;
  const notes = !s ? `<section class="surface padded mt-notes"><h2>Notas da IA</h2><p class="dim">Com a transcrição salva, a IA escreve o resumo, os pontos principais, as decisões, as tarefas combinadas e um e-mail de follow-up.</p>
      <button type="button" class="primary" data-mt="summarize"${!m.transcript || ui.busy ? ' disabled' : ''}>${icon('spark', 15)} ${ui.busy === 'summary' ? 'Resumindo…' : 'Resumir com IA'}</button></section>`
    : `<section class="surface padded mt-notes"><div class="mt-head"><h2>Notas da IA</h2>${badge(mood[0], mood[1])}<button type="button" class="secondary" data-mt="summarize"${ui.busy ? ' disabled' : ''}>${icon('refresh', 15)} ${ui.busy === 'summary' ? 'Resumindo…' : 'Refazer'}</button></div>
      <p>${h(s.summary)}</p>
      ${s.keyPoints.length ? `<h3>Pontos principais</h3><ul>${s.keyPoints.map(p => `<li>${h(p)}</li>`).join('')}</ul>` : ''}
      ${s.decisions.length ? `<h3>Decisões</h3><ul>${s.decisions.map(p => `<li>${h(p)}</li>`).join('')}</ul>` : ''}
      ${s.actionItems.length ? `<h3>Tarefas combinadas</h3><form data-mt-form="tasks"><ul class="mt-actions">${s.actionItems.map((a, i) => `<li><label class="mt-check"><input type="checkbox" name="item" value="${i}"${a.taskId ? ' checked disabled' : ' checked'}> <span>${h(a.text)}${a.owner ? ` · <b>${h(a.owner)}</b>` : ''}${a.due ? ` · até ${h(a.due.split('-').reverse().join('/'))}` : ''}</span></label>${a.taskId ? badge('Tarefa criada', 'green') : ''}</li>`).join('')}</ul>
        ${s.actionItems.some(a => !a.taskId) ? '<button class="secondary">Criar tarefas marcadas</button>' : ''}</form>` : ''}
      ${s.nextSteps ? `<h3>Próximos passos</h3><p>${h(s.nextSteps)}</p>` : ''}
      ${s.followUpEmail.subject ? `<h3>E-mail de follow-up</h3><div class="mt-mail"><b>${h(s.followUpEmail.subject)}</b><p>${h(s.followUpEmail.body).replace(/\n/g, '<br>')}</p><button type="button" class="secondary" data-mt="copy-mail">${icon('copy', 15)} Copiar e-mail</button></div>` : ''}
      <div class="mt-tools">${who ? `<button type="button" class="secondary" data-mt="note">${icon('note', 15)} Salvar resumo nas notas de ${h(who.name)}</button>` : '<p class="dim">Ligue a reunião a um contato para salvar o resumo nas notas e criar as tarefas no nome dele.</p>'}</div></section>`;
  return `<div class="sch-bar"><button type="button" class="secondary" data-mt="back">${icon('left', 15)} Reuniões</button><button type="button" class="secondary" data-mt="edit" data-id="${h(m.id)}">${icon('edit', 15)} Editar</button></div>
    <div class="mt-title"><h2>${h(m.title)}</h2><p class="dim">${h(fmt(m.date, c.s.profile.timezone, true))}${who ? ` · ${h(who.name)}` : ''}${m.participants ? ` · ${h(m.participants)}` : ''}</p></div>
    <div class="mt-grid">${transcript}${notes}</div>`;
}

export function meetingsScreen(c, tabs) {
  const m = ui.open && (c.s.meetings || []).find(x => x.id === ui.open);
  return pageShell({ title: 'Calendários', desc: 'Reuniões e ligações com transcrição e notas da IA: resumo, decisões, tarefas e follow-up.', tabs, content: m ? detailView(c, m) : listView(c) });
}

export function installMeetings({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'calendars' && c.tab === 'meetings';
  const meeting = () => (c.s.meetings || []).find(x => x.id === ui.open);
  const headers = () => { try { return c.access?.session ? {} : { 'X-Go-User': localStorage.getItem('go.user') || '' }; } catch { return {}; } };
  async function call(path, body, type) {
    const response = await fetch(`${path}?workspace=${encodeURIComponent(c.workspace)}&meeting=${encodeURIComponent(ui.open)}${type === 'recording' ? '&source=recording' : ''}&lang=${document.documentElement.lang === 'es' ? 'es' : 'pt'}`,
      { method: 'POST', headers: { ...headers(), ...(body ? { 'Content-Type': body.type || 'audio/webm' } : {}) }, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'A IA não respondeu. Tente de novo.');
    const fresh = await fetch(`/api/state?workspace=${encodeURIComponent(c.workspace)}`, { headers: headers() }).then(r => r.json());
    if (fresh.state) c.s = fresh.state;
  }
  async function sendAudio(blob, type) {
    if (blob.size > audioLimit) throw new Error('O áudio pode ter até 4 MB. Grave em partes ou envie a transcrição.');
    ui.busy = 'audio'; render();
    try { await call('/api/meetings/transcribe', blob, type); flash('Transcrição pronta.'); } finally { ui.busy = ''; render(); }
  }
  const tick = () => { const el = document.querySelector('[data-mt-clock]'); if (!el) return; const sec = Math.floor((Date.now() - ui.started) / 1000); el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-mt]');
    if (!el || !here()) return;
    const act = el.dataset.mt;
    try {
      if (act === 'new') dialog('Nova reunião', meetingForm(c));
      if (act === 'edit') dialog('Editar reunião', meetingForm(c, meeting()));
      if (act === 'open') { ui.open = el.dataset.id; render(); }
      if (act === 'back') { ui.open = ''; render(); }
      if (act === 'delete') { if (!confirm('Excluir esta reunião, a transcrição e as notas? As tarefas já criadas continuam.')) return; await mutate({ type: 'delete', key: 'meetings', id: el.dataset.id }); ui.open = ''; close(); render(); flash('Reunião excluída.'); }
      if (act === 'summarize') {
        ui.busy = 'summary'; render();
        try { await call('/api/meetings/summarize'); flash('Notas prontas.'); } finally { ui.busy = ''; render(); }
      }
      if (act === 'note') { await mutate({ type: 'meeting-note', data: { id: ui.open } }); render(); flash('Resumo salvo nas notas do contato.'); }
      if (act === 'copy-mail') { const mail = meeting().summary.followUpEmail; const text = `${mail.subject}\n\n${mail.body}`; await navigator.clipboard.writeText(text).then(() => flash('E-mail copiado.'), () => flash(text)); }
      if (act === 'record') {
        if (ui.recorder?.state === 'recording') { ui.recorder.stop(); return; }
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador não grava áudio. Envie um arquivo.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
        ui.recorder = new MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 24000 });
        ui.chunks = []; ui.started = Date.now();
        ui.recorder.ondataavailable = e => { if (e.data.size) ui.chunks.push(e.data); };
        ui.recorder.onstop = async () => {
          clearInterval(ui.timer); stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(ui.chunks, { type: (ui.recorder.mimeType || 'audio/webm').split(';')[0] });
          ui.recorder = null;
          try { await sendAudio(blob, 'recording'); } catch (error) { flash(error.message, true); }
        };
        ui.recorder.start(1000); ui.timer = setInterval(tick, 500); render();
      }
    } catch (error) { ui.busy = ''; flash(error.message, true); }
  });
  document.addEventListener('change', async event => {
    const input = event.target.closest('[data-mt-file]');
    if (!input || !here() || !input.files[0]) return;
    const file = input.files[0];
    try {
      if (input.dataset.mtFile === 'text') {
        if (file.size > 400000) throw new Error('O arquivo de texto pode ter até 400 KB.');
        await mutate({ type: 'save', key: 'meetings', id: ui.open, data: { ...meeting(), transcript: await file.text(), source: 'file' } });
        render(); flash('Transcrição salva.');
      } else await sendAudio(file.type ? file : new Blob([file], { type: 'audio/mpeg' }), 'audio');
    } catch (error) { flash(error.message, true); }
    input.value = '';
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-mt-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const f = new FormData(form), status = form.querySelector('.form-status');
    try {
      if (form.dataset.mtForm === 'meeting') {
        const id = form.dataset.id || undefined, prior = id ? meeting() : {};
        const saved = await mutate({ type: 'save', key: 'meetings', id, data: { ...prior, ...Object.fromEntries(f), date: f.get('date') ? new Date(f.get('date')).toISOString() : '' } });
        close(); ui.open = saved || id; render(); flash('Reunião salva.');
      }
      if (form.dataset.mtForm === 'transcript') { await mutate({ type: 'save', key: 'meetings', id: ui.open, data: { ...meeting(), transcript: f.get('transcript'), source: meeting().source === 'manual' || !meeting().transcript ? 'manual' : meeting().source } }); render(); flash('Transcrição salva.'); }
      if (form.dataset.mtForm === 'tasks') { const n = await mutate({ type: 'meeting-tasks', data: { id: ui.open, items: f.getAll('item').map(Number) } }); render(); flash(n ? `${n} tarefa(s) criada(s).` : 'Nenhuma tarefa nova.'); }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
  });
}
