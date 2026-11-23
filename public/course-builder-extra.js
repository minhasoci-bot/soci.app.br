// Course builder, 6.3: editors for quizzes, assignments, submodules and live sessions, and the panel where the
// team corrects assignment deliveries. courses.js renders them and forwards clicks and inputs here.
import { icon } from './icons.js';
import { h, fmt } from './screens.js';
import { themePresets, themeStyle, themeTokens } from './community-data.js';

const newId = () => crypto.randomUUID();
export const blankQuestion = () => ({ id: newId(), text: '', multiple: false, explanation: '', options: [{ id: newId(), text: '', correct: true }, { id: newId(), text: '', correct: false }] });
export const blankQuiz = () => ({ passScore: 70, completionMessage: 'Parabéns, você foi aprovado!', questions: [blankQuestion()] });
export const blankAssignment = () => ({ attachments: [], graded: true, completionMessage: 'Recebemos sua entrega. Obrigado!' });
const pad = n => String(n).padStart(2, '0');
const localInput = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function quizEditor(lesson) {
  const q = lesson.quiz ||= blankQuiz();
  return `<section class="cx-block"><h3>Quiz</h3>
    <div class="cx-row"><label>Nota mínima para aprovação (%)<input type="number" min="0" max="100" data-co-quiz="passScore" value="${h(q.passScore)}"></label>
      <label>Mensagem ao ser aprovado<input data-co-quiz="completionMessage" maxlength="500" value="${h(q.completionMessage || '')}"></label></div>
    <ol class="cx-questions">${q.questions.map((question, qi) => `<li class="cx-question">
      <div class="cx-question-head"><b>Pergunta ${qi + 1}</b>
        <label class="cp-checkbox"><input type="checkbox" data-co-q="multiple" data-q="${qi}"${question.multiple ? ' checked' : ''}><span>Várias respostas certas</span></label>
        <button type="button" class="icon-btn" data-co="quiz-remove-question" data-q="${qi}" aria-label="Excluir pergunta ${qi + 1}" ${q.questions.length > 1 ? '' : 'disabled'}>${icon('trash', 15)}</button></div>
      <textarea data-co-q="text" data-q="${qi}" rows="2" maxlength="500" placeholder="Escreva a pergunta" aria-label="Texto da pergunta ${qi + 1}">${h(question.text)}</textarea>
      <ul class="cx-options">${question.options.map((option, oi) => `<li>
        <label class="cx-correct" title="Resposta certa"><input type="${question.multiple ? 'checkbox' : 'radio'}" name="cx-right-${qi}" data-co-o="correct" data-q="${qi}" data-o="${oi}"${option.correct ? ' checked' : ''} aria-label="Marcar a opção ${oi + 1} como certa"></label>
        <input data-co-o="text" data-q="${qi}" data-o="${oi}" maxlength="300" value="${h(option.text)}" placeholder="Opção ${oi + 1}" aria-label="Opção ${oi + 1}">
        <button type="button" class="icon-btn" data-co="quiz-remove-option" data-q="${qi}" data-o="${oi}" aria-label="Remover opção ${oi + 1}" ${question.options.length > 2 ? '' : 'disabled'}>${icon('trash', 14)}</button></li>`).join('')}</ul>
      ${question.options.length < 8 ? `<button type="button" class="co-add" data-co="quiz-add-option" data-q="${qi}">${icon('plus', 14)} Opção</button>` : ''}
      <label>Explicação (aparece depois da resposta)<textarea data-co-q="explanation" data-q="${qi}" rows="2" maxlength="1000">${h(question.explanation || '')}</textarea></label></li>`).join('')}</ol>
    ${q.questions.length < 50 ? `<button type="button" class="secondary" data-co="quiz-add-question">${icon('plus', 15)} Adicionar pergunta</button>` : ''}
    <p class="co-hint">Marque a bolinha (ou as caixas) das respostas certas. Uma pergunta só vale ponto quando o aluno marca exatamente as respostas certas. A aula fica concluída quando a nota atinge o mínimo; o aluno pode tentar de novo.</p></section>`;
}

export function assignmentEditor(c, lesson) {
  const a = lesson.assignment ||= blankAssignment();
  const files = c.s.files.filter(file => !file.trashedAt);
  return `<section class="cx-block"><h3>Tarefa</h3>
    <label class="cp-checkbox co-check"><input type="checkbox" data-co-assign="graded"${a.graded !== false ? ' checked' : ''}><span>Corrigir as entregas<small>Ligado: a aula só conclui quando você aprovar a entrega em "Entregas". Desligado: conclui assim que o aluno entrega (tarefa sem nota).</small></span></label>
    <label>Mensagem depois da entrega<input data-co-assign="completionMessage" maxlength="500" value="${h(a.completionMessage || '')}"></label>
    <fieldset class="cx-files"><legend>Material de apoio (Mídia Drive)</legend>${files.length ? files.slice(0, 200).map(file => `<label class="cp-checkbox"><input type="checkbox" data-co-assign="attachment" value="${h(file.id)}"${a.attachments.includes(file.id) ? ' checked' : ''}><span>${h(file.name)}</span></label>`).join('')
      : '<p class="co-hint">Envie PDFs, planilhas ou imagens na <a class="text-link" href="#media">Mídia Drive</a> para anexar aqui.</p>'}</fieldset>
    <p class="co-hint">Escreva as instruções no campo "Instruções da tarefa". O aluno responde com um texto e, se quiser, um link (Google Drive, Docs, Canva…).</p></section>`;
}

export function submodulePanel(module, sub) {
  const count = module.lessons.filter(lesson => lesson.submoduleId === sub.id).length;
  return `<h2>Submódulo</h2><p class="co-hint">Dentro de “${h(module.title)}”.</p><label>Título do submódulo<input data-co-set="submodule.title" value="${h(sub.title)}" maxlength="160" required></label>
    <p class="co-hint">${count} ${count === 1 ? 'aula' : 'aulas'} neste submódulo.</p>
    <div class="co-panel-actions"><button type="button" class="secondary" data-co="add-lesson" data-id="${h(module.id)}" data-sub="${h(sub.id)}">${icon('plus', 15)} Adicionar aula</button>
    <button type="button" class="danger plain" data-co="remove-submodule" data-id="${h(sub.id)}">${icon('trash', 15)} Excluir submódulo</button></div>
    <p class="co-hint">Excluir o submódulo mantém as aulas, que voltam para o módulo.</p>`;
}

export function livePanel(c, draft) {
  const rows = draft.liveSessions ||= [];
  return `<h2>Sessões ao vivo</h2><p class="co-hint">Encontros ao vivo do curso. O link aparece para os alunos 15 minutos antes; depois, a gravação toca no portal (YouTube, Vimeo ou Loom).</p>
    <ol class="cx-live">${rows.map((row, i) => `<li class="cx-question">
      <div class="cx-question-head"><b>${h(row.title || `Sessão ${i + 1}`)}</b>${row.start ? `<small>${h(fmt(row.start, c.s.profile.timezone, true))}</small>` : ''}
        <button type="button" class="icon-btn" data-co="live-remove" data-i="${i}" aria-label="Excluir sessão ${i + 1}">${icon('trash', 15)}</button></div>
      <div class="cx-row"><label>Nome<input data-co-live="title" data-i="${i}" maxlength="160" value="${h(row.title)}"></label><label>Apresentador<input data-co-live="host" data-i="${i}" maxlength="80" value="${h(row.host || '')}"></label></div>
      <div class="cx-row"><label>Início<input type="datetime-local" data-co-live="start" data-i="${i}" value="${localInput(row.start)}"></label><label>Duração (min)<input type="number" min="10" max="480" data-co-live="duration" data-i="${i}" value="${h(row.duration || 60)}"></label></div>
      <label>Descrição<textarea data-co-live="description" data-i="${i}" rows="2" maxlength="1000">${h(row.description || '')}</textarea></label>
      <label>Link da sessão<input type="url" data-co-live="joinUrl" data-i="${i}" maxlength="600" value="${h(row.joinUrl || '')}" placeholder="https://meet.google.com/… · Zoom · YouTube Live"></label>
      <label>Link da gravação (depois da sessão)<input type="url" data-co-live="recordingUrl" data-i="${i}" maxlength="600" value="${h(row.recordingUrl || '')}" placeholder="https://youtu.be/…"></label>
      <label class="cp-checkbox"><input type="checkbox" data-co-live="cancelled" data-i="${i}"${row.cancelled ? ' checked' : ''}><span>Sessão cancelada</span></label></li>`).join('')}</ol>
    <button type="button" class="secondary" data-co="live-add">${icon('plus', 15)} Agendar sessão</button>`;
}

export function submissionsPanel(c, rows) {
  if (!rows) return '<h2>Entregas</h2><div class="cm-loading">Carregando…</div>';
  const label = { submitted: ['Aguardando correção', 'gold'], approved: ['Aprovada', 'green'], revise: ['Ajustes pedidos', 'red'] };
  return `<h2>Entregas</h2><p class="co-hint">Respostas dos alunos às tarefas deste curso. Aprovar conclui a aula para o aluno; pedir ajustes deixa a aula aberta para uma nova entrega.</p>
    ${rows.length ? `<ul class="cx-submissions">${rows.map(row => `<li class="cx-question">
      <div class="cx-question-head"><b>${h(row.name)}</b><small>${h(row.lesson)} · ${h(fmt(row.at, c.s.profile.timezone, true))}${row.count > 1 ? ` · ${row.count}ª entrega` : ''}</small>
        <span class="badge ${label[row.status]?.[1] || ''}">${label[row.status]?.[0] || row.status}</span></div>
      ${row.text ? `<p class="cx-answer">${h(row.text)}</p>` : ''}${row.link ? `<a class="text-link" href="${h(row.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 14)} ${h(row.link)}</a>` : ''}
      ${row.graded && row.status === 'approved' ? (row.feedback ? `<p class="co-hint"><b>Seu comentário:</b> ${h(row.feedback)}</p>` : '') : row.graded ? `<form class="cx-grade" data-cx-grade data-member="${h(row.memberId)}" data-lesson="${h(row.lessonId)}">
        <label>Comentário para o aluno<textarea name="feedback" rows="2" maxlength="2000">${h(row.feedback || '')}</textarea></label>
        <div class="co-panel-actions"><button type="submit" class="primary" name="status" value="approved">${icon('check', 15)} Aprovar</button><button type="submit" class="secondary" name="status" value="revise">Pedir ajustes</button></div></form>`
        : '<p class="co-hint">Tarefa sem nota: concluída na entrega.</p>'}</li>`).join('')}</ul>`
      : `<div class="co-empty">${icon('inbox', 26)}<strong>Nenhuma entrega ainda</strong><p>Quando os alunos entregarem as tarefas, elas aparecem aqui.</p></div>`}`;
}

/** Applies an input from the 6.3 editors to the draft; returns true when the panel must be redrawn. */
export function applyExtraInput(draft, sel, el, findLesson, event) {
  const lesson = sel.type === 'lesson' ? findLesson(draft, sel.id).lesson : null;
  if (el.dataset.coQuiz && lesson) { lesson.quiz[el.dataset.coQuiz] = el.dataset.coQuiz === 'passScore' ? Math.max(0, Math.min(100, Math.round(Number(el.value) || 0))) : el.value; return false; }
  if (el.dataset.coQ && lesson) {
    const question = lesson.quiz.questions[Number(el.dataset.q)];
    if (el.dataset.coQ === 'multiple') {
      question.multiple = el.checked;
      if (!question.multiple) { const first = question.options.findIndex(option => option.correct); question.options.forEach((option, i) => { option.correct = i === Math.max(0, first); }); }
      return true;
    }
    question[el.dataset.coQ] = el.value; return false;
  }
  if (el.dataset.coO && lesson) {
    const question = lesson.quiz.questions[Number(el.dataset.q)], option = question.options[Number(el.dataset.o)];
    if (el.dataset.coO === 'correct') { if (question.multiple) option.correct = el.checked; else question.options.forEach(row => { row.correct = row === option; }); return false; }
    option.text = el.value; return false;
  }
  if (el.dataset.coAssign && lesson) {
    const a = lesson.assignment;
    if (el.dataset.coAssign === 'graded') a.graded = el.checked;
    else if (el.dataset.coAssign === 'attachment') a.attachments = el.checked ? [...new Set([...a.attachments, el.value])] : a.attachments.filter(id => id !== el.value);
    else a[el.dataset.coAssign] = el.value;
    return false;
  }
  if (el.dataset.coLive) {
    const row = draft.liveSessions[Number(el.dataset.i)], key = el.dataset.coLive;
    if (key === 'cancelled') row.cancelled = el.checked;
    else if (key === 'start') { if (el.value) row.start = new Date(el.value).toISOString(); }
    else if (key === 'duration') row.duration = Math.round(Number(el.value) || 60);
    else row[key] = el.value;
    return event.type === 'change' && ['title', 'start'].includes(key);
  }
  return null;
}

/** Clicks of the 6.3 editors; returns true when handled. */
export function extraAction(action, el, draft, sel, findLesson) {
  const lesson = sel.type === 'lesson' ? findLesson(draft, sel.id).lesson : null;
  const q = Number(el.dataset.q), o = Number(el.dataset.o);
  if (action === 'quiz-add-question') lesson.quiz.questions.push(blankQuestion());
  else if (action === 'quiz-remove-question') lesson.quiz.questions.splice(q, 1);
  else if (action === 'quiz-add-option') lesson.quiz.questions[q].options.push({ id: newId(), text: '', correct: false });
  else if (action === 'quiz-remove-option') { const question = lesson.quiz.questions[q]; question.options.splice(o, 1); if (!question.options.some(row => row.correct)) question.options[0].correct = true; }
  else if (action === 'live-add') { const start = new Date(Date.now() + 7 * 86400000); start.setMinutes(0, 0, 0); (draft.liveSessions ||= []).push({ id: newId(), title: 'Sessão ao vivo', description: '', host: '', start: start.toISOString(), duration: 60, joinUrl: '', recordingUrl: '', cancelled: false }); }
  else if (action === 'live-remove') draft.liveSessions.splice(Number(el.dataset.i), 1);
  else return false;
  return true;
}

// ---- 6.4: page and theme, checkout, certificate and badge ------------------------------------------------
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
export const defaultPage = () => ({ productPage: true, showInstructor: true, showProgress: true, crossSellOfferId: '', crossSellText: '', nextCard: true, autoComplete: false });
export const defaultCredentials = () => ({ badge: { enabled: true, title: 'Aluno matriculado' }, certificate: { enabled: true, title: 'Certificado de conclusão', signer: '', signerRole: '' } });

export function lookPanel(c, draft) {
  const theme = draft.theme || { preset: '', tokens: { ...themePresets[0].tokens } }, page = draft.page ||= defaultPage(), who = draft.instructor ||= { name: '', title: '', bio: '', photoFileId: '' };
  const images = c.s.files.filter(file => file.data.startsWith('data:image/') && !file.trashedAt);
  const check = (key, label, hint) => `<label class="cp-checkbox co-check"><input type="checkbox" data-co-look="page.${key}"${page[key] ? ' checked' : ''}><span>${label}<small>${hint}</small></span></label>`;
  return `<h2>Página e tema</h2>
    <section class="cx-block"><h3>Tema do curso</h3>
      <label class="cp-checkbox co-check"><input type="checkbox" data-co-look="themeOn"${draft.theme ? ' checked' : ''}><span>Usar um tema próprio neste curso<small>Desligado, o curso usa as cores do portal.</small></span></label>
      ${draft.theme ? `<div class="ca-presets">${themePresets.map(row => `<label class="ca-preset"><input type="radio" name="cx-preset" data-co-look="preset" value="${row.id}"${theme.preset === row.id ? ' checked' : ''}>
          <span class="ca-swatch" style="${themeStyle(row)}"><i></i><i></i><i></i></span><b>${h(row.name)}</b></label>`).join('')}</div>
        <div class="ca-tokens">${themeTokens.map(([key, label]) => `<label>${label}<input type="color" data-co-look="token" data-key="${key}" value="${h(theme.tokens[key])}"></label>`).join('')}</div>
        <div class="ca-preview" style="${themeStyle(theme)}"><div class="ca-preview-side"><b>Aulas</b><span>1. Boas-vindas</span><span>2. Primeiros passos</span></div>
          <div class="ca-preview-main"><div class="ca-preview-card"><b>${h(draft.name || 'Seu curso')}</b><p>Assim fica a aula.</p><span class="ca-preview-button">Próxima aula</span></div></div></div>` : ''}</section>
    <section class="cx-block"><h3>Página do curso</h3>
      ${check('productPage', 'Mostrar a página do curso antes das aulas', 'Capa, descrição, instrutor, progresso e módulos. Desligado, o aluno cai direto na aula.')}
      ${check('showInstructor', 'Mostrar o instrutor', 'Na página do curso e ao lado das aulas.')}
      ${check('showProgress', 'Mostrar o progresso', 'Barra de conclusão na página do curso.')}
      <div class="cx-row"><label>Oferta cruzada<select data-co-look="page.crossSellOfferId"><option value="">Nenhuma</option>${c.s.offers.filter(row => row.status === 'published').map(row => `<option value="${h(row.id)}"${page.crossSellOfferId === row.id ? ' selected' : ''}>${h(row.title)}</option>`).join('')}</select></label>
        <label>Chamada da oferta<input data-co-look="page.crossSellText" maxlength="200" value="${h(page.crossSellText)}" placeholder="Ex.: Continue com a mentoria em grupo"></label></div></section>
    <section class="cx-block"><h3>Página da aula</h3>
      ${check('nextCard', 'Cartão da próxima aula', 'No fim de cada aula, um atalho para a seguinte.')}
      ${check('autoComplete', 'Concluir aulas ao abrir a próxima', 'Aulas de texto, vídeo e arquivo ficam concluídas quando o aluno avança. Quiz e tarefa continuam pedindo resposta.')}</section>
    <section class="cx-block"><h3>Instrutor</h3>
      <div class="cx-row"><label>Nome<input data-co-look="instructor.name" maxlength="80" value="${h(who.name)}"></label><label>Cargo<input data-co-look="instructor.title" maxlength="80" value="${h(who.title)}"></label></div>
      <label>Bio<textarea data-co-look="instructor.bio" rows="3" maxlength="1000">${h(who.bio)}</textarea></label>
      <label>Foto (Mídia Drive)<select data-co-look="instructor.photoFileId"><option value="">Sem foto</option>${images.map(file => `<option value="${h(file.id)}"${file.id === who.photoFileId ? ' selected' : ''}>${h(file.name)}</option>`).join('')}</select></label></section>`;
}

export function checkoutPanel(c, draft, courseId) {
  const offer = draft.offerId && c.s.offers.find(row => row.id === draft.offerId);
  const link = offer ? `${location.origin}/oferta/${c.workspace}/${offer.id}` : '';
  return `<h2>Checkout</h2><p class="co-hint">Uma página de venda do curso com pagamento por Pix ou cartão (AbacatePay). Quem paga recebe acesso ao curso no portal automaticamente.</p>
    ${offer ? `<section class="cx-block"><h3>${h(offer.title)}</h3><p>${offer.type === 'free' ? 'Gratuito' : money(offer.price)} · ${offer.status === 'published' ? '<span class="badge green">Publicada</span>' : '<span class="badge">Rascunho</span>'}</p>
        <label>Link do checkout<input readonly value="${h(link)}"></label>
        <div class="co-panel-actions"><button type="button" class="secondary" data-co="checkout-copy" data-value="${h(link)}">${icon('copy', 15)} Copiar link</button>
          <a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('external', 15)} Abrir</a><a class="text-link" href="#memberships/offers">Editar na aba Ofertas</a>
          <button type="button" class="danger plain" data-co="checkout-unlink">Desvincular</button></div>
        ${offer.courseIds.includes(courseId) ? '' : '<p class="co-hint">Atenção: esta oferta não inclui este curso.</p>'}</section>`
      : `<section class="cx-block"><h3>Criar o checkout</h3>
        <div class="co-kinds"><label><input type="radio" name="cx-price" value="one_time" checked><span>${icon('pay', 15)} Pagamento único</span></label><label><input type="radio" name="cx-price" value="free"><span>Gratuito</span></label></div>
        <label>Preço (R$)<input type="number" min="1" step="0.01" data-cx-price placeholder="Ex.: 197"></label>
        <button type="button" class="primary" data-co="checkout-create">${icon('plus', 15)} Criar página de checkout</button>
        <p class="co-hint">Cria uma oferta publicada com este curso. Gratuito libera o acesso na hora; pago libera quando a AbacatePay confirma.</p></section>`}`;
}

export function credentialsPanel(c, draft, courseId) {
  const cred = draft.credentials ||= { badge: { enabled: false, title: 'Aluno matriculado' }, certificate: { enabled: false, title: 'Certificado de conclusão', signer: '', signerRole: '' } };
  const issued = (c.s.credentialsIssued || []).filter(row => row.courseId === courseId && !row.revokedAt).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const templates = kind => (c.s.certificateTemplates || []).filter(row => row.kind === kind);
  const pickTemplate = kind => `<label>Modelo (aba Certificados)<select data-co-cred="${kind}.templateId"><option value="">Visual padrão do curso</option>${templates(kind).map(row => `<option value="${h(row.id)}"${cred[kind].templateId === row.id ? ' selected' : ''}>${h(row.name)}</option>`).join('')}</select></label>`;
  return `<h2>Certificado e badge</h2><p class="co-hint">Emitidos sozinhos: o badge quando o aluno abre o curso pela primeira vez e o certificado quando ele chega a 100%. Cada um tem uma página pública com código de verificação.</p>
    <section class="cx-block"><h3>Badge de matrícula</h3>
      <label class="cp-checkbox co-check"><input type="checkbox" data-co-cred="badge.enabled"${cred.badge.enabled ? ' checked' : ''}><span>Emitir badge</span></label>
      <label>Nome do badge<input data-co-cred="badge.title" maxlength="80" value="${h(cred.badge.title)}"></label>${pickTemplate('badge')}</section>
    <section class="cx-block"><h3>Certificado de conclusão</h3>
      <label class="cp-checkbox co-check"><input type="checkbox" data-co-cred="certificate.enabled"${cred.certificate.enabled ? ' checked' : ''}><span>Emitir certificado</span></label>
      <label>Título<input data-co-cred="certificate.title" maxlength="120" value="${h(cred.certificate.title)}"></label>
      <div class="cx-row"><label>Quem assina<input data-co-cred="certificate.signer" maxlength="80" value="${h(cred.certificate.signer)}" placeholder="Ex.: Ana Lima"></label>
        <label>Cargo<input data-co-cred="certificate.signerRole" maxlength="80" value="${h(cred.certificate.signerRole)}" placeholder="Ex.: Diretora"></label></div>${pickTemplate('certificate')}
      <p class="co-hint">Com um modelo, o título, o texto, a assinatura e o visual vêm dele.</p></section>
    <h3>Emitidos (${issued.length})</h3>
    ${issued.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Aluno</th><th scope="col">Tipo</th><th scope="col">Emitido em</th><th scope="col">Código</th></tr></thead><tbody>
      ${issued.slice(0, 200).map(row => `<tr><td><b>${h(row.name || row.email)}</b><br><small>${h(row.email)}</small></td><td>${row.kind === 'certificate' ? 'Certificado' : 'Badge'}</td><td>${h(fmt(row.issuedAt, c.s.profile.timezone, true))}</td>
        <td><a class="text-link" href="/certificado/${h(c.workspace)}/${h(row.code)}" target="_blank" rel="noopener">${h(row.code)}</a></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="co-hint">Nenhum emitido ainda.</p>'}`;
}

/** Inputs of the 6.4 panels; returns true when the panel must be redrawn, null when not ours. */
export function applyLookInput(draft, el, event) {
  if (el.dataset.coLook) {
    const key = el.dataset.coLook;
    if (key === 'themeOn') { draft.theme = el.checked ? { preset: 'default', tokens: { ...themePresets[0].tokens } } : null; return true; }
    if (key === 'preset') { const preset = themePresets.find(row => row.id === el.value); draft.theme = { preset: preset.id, tokens: { ...preset.tokens } }; return true; }
    if (key === 'token') { draft.theme.tokens[el.dataset.key] = el.value; draft.theme.preset = 'custom'; return event.type === 'change'; }
    const [scope, field] = key.split('.');
    const target = scope === 'page' ? (draft.page ||= defaultPage()) : (draft.instructor ||= { name: '', title: '', bio: '', photoFileId: '' });
    target[field] = el.type === 'checkbox' ? el.checked : el.value;
    return false;
  }
  if (el.dataset.coCred) {
    const [kind, field] = el.dataset.coCred.split('.');
    draft.credentials[kind][field] = el.type === 'checkbox' ? el.checked : el.value;
    return false;
  }
  return null;
}

// ---- 6.5: course analytics in the builder ------------------------------------------------------------------
export function analyticsPanel(c, a, days) {
  if (!a) return '<h2>Analytics</h2><div class="cm-loading">Carregando…</div>';
  const tile = (title, value, note = '') => `<div class="surface metric"><span>${title}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  const byDay = new Map(a.series.map(row => [row.day, row.count]));
  const series = Array.from({ length: a.days }, (_, i) => { const day = new Date(Date.now() - (a.days - 1 - i) * 86400000).toISOString().slice(0, 10); return { day, count: byDay.get(day) || 0 }; });
  const max = Math.max(1, ...series.map(row => row.count));
  const kindNote = row => row.kind === 'quiz' ? ` · ${row.takers} responderam, ${row.passed} aprovados, média ${row.averageScore}%` : row.kind === 'assignment' ? ` · ${row.submitted} entregas, ${row.pending} aguardando, ${row.approved} aprovadas` : '';
  return `<h2>Analytics</h2>
    <div class="cx-row"><label>Período<select data-cx-days>${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']].map(([value, text]) => `<option value="${value}"${days === value ? ' selected' : ''}>${text}</option>`).join('')}</select></label>
      <button type="button" class="secondary" data-co="analytics-export">${icon('download', 15)} Exportar alunos (CSV)</button></div>
    <div class="metrics">${tile('Alunos', a.students, `${a.newStudents} novos no período`)}${tile('Começaram', a.started)}${tile('Concluíram', a.completed, `${a.completionRate}% dos alunos`)}${tile('Progresso médio', `${a.averageProgress}%`)}</div>
    <div class="metrics">${tile('Ativos no período', a.active)}${tile('Certificados emitidos', a.certificates)}${tile('Aulas publicadas', a.lessons)}</div>
    <h3>Aulas concluídas por dia</h3><div class="ca-daybars" role="img" aria-label="Aulas concluídas por dia">${series.map(row => `<span title="${h(row.day)}: ${row.count}" style="height:${row.count ? Math.max(4, Math.round(row.count / max * 100)) : 1}%"></span>`).join('')}</div>
    <h3>Funil por aula</h3><p class="co-hint">Quantos alunos concluíram cada aula. Uma queda forte mostra onde a turma trava.</p>
    <ol class="cx-funnel">${a.funnel.map(row => `<li><span>${h(row.title)}</span><span class="cx-bar"><span style="width:${row.percent}%"></span></span><small>${row.done} · ${row.percent}%${kindNote(row)}</small></li>`).join('') || '<li class="co-hint">Sem aulas publicadas.</li>'}</ol>
    <h3>Alunos</h3>${a.rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Aluno</th><th scope="col">Progresso</th><th scope="col">Última atividade</th><th scope="col">Concluiu em</th><th scope="col">Certificado</th></tr></thead><tbody>
      ${a.rows.slice(0, 300).map(row => `<tr><td><b>${h(row.name)}</b><br><small>${h(row.email)}</small></td><td>${row.done}/${a.lessons} · ${row.percent}%</td><td>${row.lastActivity ? h(fmt(row.lastActivity, c.s.profile.timezone, true)) : '—'}</td>
        <td>${row.completedAt ? h(fmt(row.completedAt, c.s.profile.timezone)) : '—'}</td><td>${row.certificate ? `<a class="text-link" href="/certificado/${h(c.workspace)}/${h(row.certificate)}" target="_blank" rel="noopener">${h(row.certificate)}</a>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="co-hint">Nenhum aluno com acesso a este curso ainda. Libere o acesso na aba Clientes ou venda pelo checkout.</p>'}`;
}

export function analyticsCsv(a) {
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [['Nome', 'E-mail', 'Aulas concluídas', 'Progresso (%)', 'Última atividade', 'Concluiu em', 'Certificado'],
    ...a.rows.map(row => [row.name, row.email, row.done, row.percent, row.lastActivity, row.completedAt, row.certificate])].map(line => line.map(cell).join(',')).join('\r\n');
}
