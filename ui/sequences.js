// Marketing → E-mails → Sequências (6b.2): the list with numbers, and one sequence (steps with delay, subject,
// text and optional button or an existing template; sending window; exits; who is in it, with enroll and
// remove). Sends go through the same pipeline and tracking as the campaigns.
import { icon } from './icons.js';
import { badge, fmt, h } from './screens.js';

const dayNames = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];
const statusTone = { active: ['Ativa', 'green'], paused: ['Pausada', 'gold'], draft: ['Rascunho', ''] };
const reasonLabel = { replied: 'Respondeu', unsubscribed: 'Descadastrou', removed: 'Removido', failed: 'Falha no envio' };
const seqId = () => location.hash.split('/')[1] === 'email-sequence' ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';

function stats(seq) {
  const steps = seq.steps.map(() => ({ sent: 0, opened: 0, clicked: 0 }));
  for (const row of seq.enrolled || []) for (const send of row.sends || []) { const n = steps[send.s]; if (!n || send.st !== 'sent') continue; n.sent++; if (send.o) n.opened++; if (send.k) n.clicked++; }
  const count = status => (seq.enrolled || []).filter(row => row.status === status).length;
  return { active: count('active'), completed: count('completed'), exited: count('exited'), steps };
}

function list(c) {
  const rows = c.s.emailSequences || [];
  return `<div class="cp-section-title"><div><h2>Sequências</h2><p>Séries de e-mails enviadas uma depois da outra para cada contato inscrito, com intervalo, janela de envio e saída quando o contato responde.</p></div>
      <button type="button" class="primary" data-sq="new">${icon('plus', 16)} Nova sequência</button></div>
    ${rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Sequência</th><th scope="col">Situação</th><th scope="col">E-mails</th><th scope="col">Em andamento</th><th scope="col">Concluíram</th><th scope="col">Saíram</th><th scope="col">Abertura do 1º</th></tr></thead><tbody>
      ${rows.map(seq => { const st = stats(seq); return `<tr><td><a class="text-link" href="#marketing/email-sequence/${encodeURIComponent(seq.id)}"><b>${h(seq.name)}</b></a></td><td>${badge(...statusTone[seq.status])}</td><td>${seq.steps.length}</td>
        <td>${st.active}</td><td>${st.completed}</td><td>${st.exited}</td><td>${pct(st.steps[0]?.opened || 0, st.steps[0]?.sent || 0)}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="empty">${icon('mail', 26)}<strong>Nenhuma sequência ainda</strong><p>Crie uma sequência de boas-vindas ou de nutrição e inscreva contatos por tag, à mão ou por automação.</p></div>`}`;
}

function stepCard(c, step, i) {
  const button = step.blocks?.find(b => b.type === 'button') || {};
  const textBlock = step.blocks?.filter(b => b.type === 'text').map(b => b.text).join('\n\n') || '';
  const fromTemplate = step.blocks?.some(b => !['text', 'button'].includes(b.type));
  return `<li class="sq-step" data-sq-step="${i}"><div class="sq-step-head"><b>E-mail ${i + 1}</b>
      <label class="sq-delay">${i === 0 ? 'Enviar' : 'Depois de'} <input type="number" min="0" max="365" data-sq-f="delayDays" value="${h(step.delayDays || 0)}"> dias e <input type="number" min="0" max="23" data-sq-f="delayHours" value="${h(step.delayHours || 0)}"> horas${i === 0 ? ' da inscrição' : ' do anterior'}</label>
      <span class="sq-move"><button type="button" class="icon-btn" data-sq="up" ${i ? '' : 'disabled'} aria-label="Subir">↑</button><button type="button" class="icon-btn" data-sq="remove-step" aria-label="Excluir e-mail ${i + 1}">${icon('trash', 15)}</button></span></div>
    <div class="field-grid"><label>Assunto<input data-sq-f="subject" maxlength="200" value="${h(step.subject || '')}" placeholder="Ex.: {{contact.first_name}}, bem-vindo!"></label><label>Pré-cabeçalho<input data-sq-f="preheader" maxlength="200" value="${h(step.preheader || '')}"></label></div>
    ${fromTemplate ? `<p class="dim">${icon('mail', 14)} Conteúdo vindo de um modelo de e-mail (${step.blocks.length} blocos). <button type="button" class="text-link" data-sq="to-text">Trocar por texto simples</button></p>`
      : `<label>Texto<textarea data-sq-f="text" rows="5" maxlength="8000" placeholder="Oi {{contact.first_name}}, …">${h(textBlock)}</textarea></label>
      <div class="field-grid"><label>Botão (opcional)<input data-sq-f="buttonLabel" maxlength="60" value="${h(button.label || '')}" placeholder="Ex.: Ver oferta"></label><label>Link do botão<input data-sq-f="buttonUrl" type="url" maxlength="500" value="${h(button.url || '')}" placeholder="https://"></label></div>`}
    <label>Ou usar um modelo<select data-sq-f="template"><option value="">—</option>${(c.s.emailTemplates || []).map(t => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('')}</select></label></li>`;
}

function editor(c, seq) {
  const st = stats(seq), zone = c.s.profile?.timezone || 'America/Sao_Paulo';
  const people = (seq.enrolled || []).slice().sort((a, b) => String(b.enrolledAt).localeCompare(String(a.enrolledAt))).slice(0, 200);
  return `<a class="text-link" href="#marketing/email-sequences">${icon('left', 15)} Sequências</a>
    <form class="sq-form" data-sq-form="save" data-id="${h(seq.id)}">
      <div class="sq-head"><label>Nome<input name="name" required maxlength="120" value="${h(seq.name)}"></label>
        <label>Situação<select name="status">${Object.entries(statusTone).map(([key, [text]]) => `<option value="${key}"${seq.status === key ? ' selected' : ''}>${text}</option>`).join('')}</select></label>
        <button class="primary">${icon('check', 15)} Salvar</button></div>
      <div class="metrics">${[['Em andamento', st.active], ['Concluíram', st.completed], ['Saíram', st.exited], ['E-mails', seq.steps.length]].map(([title, value]) => `<div class="surface metric"><span>${title}</span><b>${value}</b></div>`).join('')}</div>
      <section class="surface padded sq-section"><h2>E-mails</h2><ol class="sq-steps">${seq.steps.map((step, i) => stepCard(c, step, i)).join('')}</ol>
        <button type="button" class="secondary" data-sq="add-step">${icon('plus', 15)} Adicionar e-mail</button>
        ${st.steps.length ? `<div class="sq-funnel">${st.steps.map((n, i) => `<span><b>E-mail ${i + 1}</b> ${n.sent} enviados · ${pct(n.opened, n.sent)} abertura · ${pct(n.clicked, n.sent)} clique</span>`).join('')}</div>` : ''}</section>
      <section class="surface padded sq-section"><h2>Envio</h2>
        <div class="field-grid"><label>Nome do remetente<input name="fromName" maxlength="80" value="${h(seq.fromName || '')}" placeholder="${h(c.s.profile?.name || '')}"></label><label>Responder para<input name="replyTo" type="email" maxlength="160" value="${h(seq.replyTo || '')}"></label></div>
        <fieldset class="sq-days"><legend>Dias de envio</legend>${dayNames.map(([value, text]) => `<label><input type="checkbox" name="days" value="${value}"${seq.window.days.includes(Number(value)) ? ' checked' : ''}> ${text}</label>`).join('')}</fieldset>
        <div class="field-grid"><label>Das (hora)<input name="startHour" type="number" min="0" max="23" value="${seq.window.startHour}"></label><label>Até (hora)<input name="endHour" type="number" min="1" max="24" value="${seq.window.endHour}"></label></div>
        <p class="dim">No fuso ${h(zone)}. Um e-mail que vence fora da janela sai no início da próxima.</p>
        <label class="switch-row"><span><b>Tirar da sequência quando o contato responder</b></span><input type="checkbox" name="exitOnReply"${seq.exitOnReply !== false ? ' checked' : ''}></label></section>
    </form>
    <section class="surface padded sq-section"><div class="sq-head"><h2>Contatos</h2><button type="button" class="secondary" data-sq="enroll" ${seq.status === 'active' ? '' : 'disabled'}>${icon('plus', 15)} Inscrever contatos</button></div>
      ${seq.status === 'active' ? '' : '<p class="dim">Ative a sequência para inscrever contatos. Também dá para inscrever pela automação "Inscrever em sequência de e-mail".</p>'}
      ${people.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Contato</th><th scope="col">Situação</th><th scope="col">Próximo e-mail</th><th scope="col">Inscrito em</th><th scope="col"></th></tr></thead><tbody>
        ${people.map(row => `<tr><td><b>${h(row.n || row.e)}</b><br><small>${h(row.e)}</small></td>
          <td>${row.status === 'active' ? badge(`E-mail ${row.step + 1} de ${seq.steps.length}`, 'blue') : row.status === 'completed' ? badge('Concluiu', 'green') : badge(reasonLabel[row.reason] || 'Saiu')}</td>
          <td>${row.status === 'active' && row.dueAt ? h(fmt(row.dueAt, zone, true)) : '—'}</td><td>${h(fmt(row.enrolledAt, zone, true))}</td>
          <td class="right">${row.status === 'active' ? `<button type="button" class="danger plain" data-sq="unenroll" data-contact="${h(row.c)}">Remover</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="dim">Ninguém inscrito ainda.</p>'}</section>`;
}

export function sequencesScreen(c, wrap) {
  const id = seqId(), seq = id && (c.s.emailSequences || []).find(row => row.id === id);
  return wrap(seq ? editor(c, seq) : list(c));
}

/** The step cards as the steps the server expects. */
function readSteps(form, c, prior) {
  return [...form.querySelectorAll('[data-sq-step]')].map((card, i) => {
    const get = key => card.querySelector(`[data-sq-f="${key}"]`)?.value ?? '';
    const template = get('template') && (c.s.emailTemplates || []).find(t => t.id === get('template'));
    const old = prior.steps[i] || {};
    let blocks;
    if (template) blocks = structuredClone(template.blocks);
    else if (card.querySelector('[data-sq-f="text"]')) {
      blocks = get('text').split(/\n{2,}/).map(part => part.trim()).filter(Boolean).map(text => ({ type: 'text', text }));
      if (get('buttonLabel').trim()) blocks.push({ type: 'button', label: get('buttonLabel').trim(), url: get('buttonUrl').trim() });
    } else blocks = old.blocks;
    return { id: old.id, delayDays: Number(get('delayDays')), delayHours: Number(get('delayHours')), subject: get('subject'), preheader: get('preheader'), blocks, style: template ? template.style : old.style };
  });
}

export function installSequences({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'marketing' && ['email-sequences', 'email-sequence'].includes(c.tab);
  const current = () => (c.s.emailSequences || []).find(row => row.id === seqId());
  const saveFrom = async (form, change = steps => steps) => {
    const seq = current(), f = new FormData(form);
    const data = { name: f.get('name'), status: f.get('status'), fromName: f.get('fromName'), replyTo: f.get('replyTo'), exitOnReply: f.has('exitOnReply'),
      window: { days: f.getAll('days').map(Number), startHour: Number(f.get('startHour')), endHour: Number(f.get('endHour')) }, steps: change(readSteps(form, c, seq)) };
    await mutate({ type: 'save', key: 'emailSequences', id: seq.id, data });
  };
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-sq]');
    if (!el || !here()) return;
    const act = el.dataset.sq, form = document.querySelector('[data-sq-form="save"]');
    try {
      if (act === 'new') {
        const id = await mutate({ type: 'save', key: 'emailSequences', data: { name: 'Nova sequência', steps: [{ subject: 'Bem-vindo, {{contact.first_name}}!', blocks: [{ type: 'text', text: 'Oi {{contact.first_name}}, que bom ter você por aqui.' }] }] } });
        location.hash = `#marketing/email-sequence/${encodeURIComponent(id)}`;
      }
      const index = Number(el.closest('[data-sq-step]')?.dataset.sqStep);
      if (act === 'add-step') { await saveFrom(form, steps => [...steps, { delayDays: 2, delayHours: 0, subject: `E-mail ${steps.length + 1}`, blocks: [{ type: 'text', text: 'Escreva aqui.' }] }]); render(); }
      if (act === 'remove-step') { await saveFrom(form, steps => steps.filter((_, i) => i !== index)); render(); }
      if (act === 'up') { await saveFrom(form, steps => { const copy = [...steps]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; }); render(); }
      if (act === 'to-text') { await saveFrom(form, steps => steps.map((s, i) => i === index ? { ...s, blocks: [{ type: 'text', text: 'Escreva aqui.' }] } : s)); render(); }
      if (act === 'enroll') {
        const tags = [...new Set(c.s.contacts.flatMap(row => row.tags || []))].sort();
        dialog('Inscrever contatos', `<form class="settings-form" data-sq-form="enroll"><label>Por tag<select name="tag"><option value="">—</option>${tags.map(t => `<option>${h(t)}</option>`).join('')}</select></label>
          <fieldset class="cp-permissions sq-people"><legend>Ou escolha os contatos</legend>${c.s.contacts.filter(row => row.email && !row.emailUnsubscribed).slice(0, 400).map(row => `<label class="cp-checkbox"><input type="checkbox" name="contactIds" value="${h(row.id)}"><span>${h(row.name || row.email)}<small>${h(row.email)}</small></span></label>`).join('')}</fieldset>
          <p class="dim">Contatos sem e-mail, descadastrados ou que já estão na sequência ficam de fora.</p>
          <div class="tx-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Inscrever</button></div><p class="form-status" role="alert"></p></form>`);
      }
      if (act === 'unenroll') { await mutate({ type: 'sequence-remove', id: current().id, data: { contactId: el.dataset.contact } }); render(); flash('Contato removido da sequência.'); }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-sq-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const status = form.querySelector('.form-status');
    try {
      if (form.dataset.sqForm === 'save') { await saveFrom(form); render(); flash('Sequência salva.'); }
      else {
        const f = new FormData(form);
        const added = await mutate({ type: 'sequence-enroll', id: current().id, data: { tag: f.get('tag'), contactIds: f.getAll('contactIds') } });
        close(); render(); flash(`${added} ${added === 1 ? 'contato inscrito' : 'contatos inscritos'}.`);
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
  });
}
