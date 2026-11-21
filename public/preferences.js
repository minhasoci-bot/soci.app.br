// Configurações → Preferências de comunicação (6b.4): the page texts and the topics contacts choose from, with
// how many contacts left each channel and topic; plus the summary and private link shown in a contact's record.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';

const defaults = { title: 'Suas preferências de comunicação', intro: 'Escolha como e sobre o que você quer receber nossas mensagens.',
  topics: [{ id: 'novidades', name: 'Novidades', description: 'Lançamentos e conteúdos novos.' }, { id: 'promocoes', name: 'Promoções', description: 'Ofertas e descontos.' }] };
const channels = [['email', 'E-mail'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']];
const topicRow = (t = {}) => `<li class="pf-topic"><input type="hidden" name="topicId" value="${h(t.id || '')}"><input name="topicName" maxlength="60" value="${h(t.name || '')}" placeholder="Assunto" aria-label="Nome do assunto">
  <input name="topicDescription" maxlength="160" value="${h(t.description || '')}" placeholder="Descrição (opcional)" aria-label="Descrição do assunto"><button type="button" class="icon-btn" data-pf="remove-topic" aria-label="Remover assunto">${icon('trash', 15)}</button></li>`;

export function preferencesScreen(c, tabs) {
  const p = { ...defaults, ...(c.s.preferences || {}) };
  const out = key => c.s.contacts.filter(x => x.optOut?.[key] || (key === 'email' && x.emailUnsubscribed)).length;
  const topicOut = id => c.s.contacts.filter(x => x.topics?.[id] === false).length;
  return pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, content: `<div class="metrics">${[['Em não perturbe (saíram de tudo)', c.s.contacts.filter(x => x.dnd).length], ...channels.map(([k, l]) => [`Sem ${l}`, out(k)])].map(([t, v]) => `<div class="surface metric"><span>${t}</span><b>${v}</b></div>`).join('')}</div>
    <form class="surface padded settings-form" data-pf-form="settings"><h2>Central de preferências</h2>
      <p class="dim">Cada contato tem um link próprio para escolher os canais e os assuntos que quer receber, ou sair de tudo. Ele aparece na página de descadastro dos e-mails e na ficha do contato (Copiar link). Campanhas de e-mail podem escolher um assunto; workflows de envio também.</p>
      <label>Título da página<input name="title" maxlength="120" value="${h(p.title)}"></label><label>Texto de abertura<textarea name="intro" rows="2" maxlength="400">${h(p.intro)}</textarea></label>
      <h3>Assuntos</h3><ul class="pf-topics" data-pf-topics>${p.topics.map(t => topicRow(t)).join('')}</ul>
      <button type="button" class="secondary" data-pf="add-topic">${icon('plus', 15)} Adicionar assunto</button>
      ${p.topics.length ? `<p class="dim">${p.topics.map(t => `${h(t.name)}: ${topicOut(t.id)} saíram`).join(' · ')}</p>` : ''}
      <button class="primary">Salvar</button><p class="form-status" role="alert"></p></form>` });
}

/** The summary inside the contact record dialog. */
export function contactPreferences(c, contact) {
  if (!contact?.id) return '';
  const p = { ...defaults, ...(c.s.preferences || {}) };
  const off = channels.filter(([k]) => contact.optOut?.[k] || (k === 'email' && contact.emailUnsubscribed)).map(([, l]) => l);
  const topicsOff = p.topics.filter(t => contact.topics?.[t.id] === false).map(t => t.name);
  return `<div class="pf-contact"><b>${icon('lock', 14)} Preferências</b><span>${contact.dnd ? 'Saiu de todas as comunicações' : off.length || topicsOff.length ? `Não quer: ${[...off, ...topicsOff].join(', ')}` : 'Recebe tudo'}</span>
    <button type="button" class="text-link" data-pf="copy-link" data-id="${h(contact.id)}">Copiar link de preferências</button></div>`;
}

export function installPreferences({ c, mutate, flash, render }) {
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-pf]');
    if (!el) return;
    if (el.dataset.pf === 'add-topic') { document.querySelector('[data-pf-topics]').insertAdjacentHTML('beforeend', topicRow()); document.querySelector('[data-pf-topics] li:last-child input[name="topicName"]').focus(); }
    if (el.dataset.pf === 'remove-topic') el.closest('li').remove();
    if (el.dataset.pf === 'copy-link') {
      try {
        const token = await mutate({ type: 'preferences-link', data: { contactId: el.dataset.id } });
        const link = `${location.origin}/preferencias/${c.workspace}/${token}`;
        await navigator.clipboard.writeText(link).then(() => flash('Link de preferências copiado.'), () => flash(link));
      } catch (error) { flash(error.message, true); }
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-pf-form]');
    if (!form) return;
    event.preventDefault();
    const f = new FormData(form), ids = f.getAll('topicId'), names = f.getAll('topicName'), descriptions = f.getAll('topicDescription');
    try {
      await mutate({ type: 'preferences-settings', data: { title: f.get('title'), intro: f.get('intro'), topics: names.map((name, i) => ({ id: ids[i] || undefined, name, description: descriptions[i] })).filter(t => t.name.trim()) } });
      render(); flash('Central de preferências salva.');
    } catch (error) { form.querySelector('.form-status').textContent = error.message; }
  });
}
