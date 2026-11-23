// Labs (7.2) in Conversas: "Sugerir resposta" fills the composer with an AI draft, "Resumir conversa" shows a brief
// above it. Both appear only when the feature is on for this sub-account (Configurações → Labs).
import { icon as i } from './icons.js';
import { getLanguage, tr } from './i18n.js';
import { h } from './screens.js';
import { labOn } from './labs-data.js';

const summaries = new Map();
const busy = { reply: '', summary: '' };
const moods = { positive: ['Positivo', 'green'], neutral: ['Neutro', ''], negative: ['Negativo', 'red'] };
const list = (title, rows) => rows?.length ? `<h4>${h(tr(title))}</h4><ul>${rows.map(row => `<li>${h(row)}</li>`).join('')}</ul>` : '';

export function conversationAiBar(c, contactId) {
  const reply = labOn(c.s, 'conversation-reply'), summary = labOn(c.s, 'conversation-summary');
  if (!reply && !summary) return '';
  const brief = summary && summaries.get(`${c.workspace}:${contactId}`);
  const mood = brief && moods[brief.sentiment];
  return `${brief ? `<section class="cv-ai-summary" aria-label="${h(tr('Resumo da conversa'))}"><header><b>${i('spark', 14)} ${h(tr('Resumo da conversa'))}</b>${mood ? `<span class="badge ${mood[1]}">${h(tr('Clima:'))} ${h(tr(mood[0]))}</span>` : ''}<button type="button" class="icon-btn" data-cv-ai="close" aria-label="${h(tr('Fechar resumo'))}">${i('close', 14)}</button></header>
      <p>${h(brief.summary)}</p>${list('O que o cliente pediu', brief.requests)}${list('O que foi combinado', brief.agreed)}${list('O que falta', brief.pending)}</section>` : ''}
    <div class="cv-ai" role="group" aria-label="${h(tr('IA na conversa (Labs)'))}">
      ${reply ? `<button type="button" class="secondary" data-cv-ai="reply" ${busy.reply === contactId ? 'disabled' : ''}>${i('spark', 14)} ${h(tr(busy.reply === contactId ? 'Escrevendo sugestão…' : 'Sugerir resposta'))}</button>` : ''}
      ${summary ? `<button type="button" class="secondary" data-cv-ai="summary" ${busy.summary === contactId ? 'disabled' : ''}>${i('note', 14)} ${h(tr(busy.summary === contactId ? 'Resumindo…' : 'Resumir conversa'))}</button>` : ''}
    </div>`;
}

export function installConversationAi({ c, api, url, flash, render }) {
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-cv-ai]');
    if (!el || c.view !== 'conversations' || !c.thread) return;
    const contactId = c.thread, key = `${c.workspace}:${contactId}`, mode = el.dataset.cvAi;
    if (mode === 'close') { summaries.delete(key); render(); return; }
    if (busy[mode]) return;
    busy[mode] = contactId; render();
    try {
      const result = await api(url(`/api/conversations/ai/${mode}`), { contactId, language: getLanguage() });
      if (mode === 'summary') summaries.set(key, result);
      busy[mode] = ''; render();
      if (mode === 'reply' && c.thread === contactId) {
        const form = document.querySelector('.message-compose[data-form="message"]');
        const box = form?.querySelector('textarea[name="body"]');
        if (box) {
          const direction = form.querySelector('select[name="direction"]');
          if (direction) direction.value = 'Outbound';
          box.value = result.text; box.focus();
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
        flash('Sugestão pronta. Revise antes de enviar; o que estiver entre [[ ]] precisa ser preenchido.');
      }
    } catch (error) {
      busy[mode] = ''; render();
      flash(error.message, true);
    }
  });
}
