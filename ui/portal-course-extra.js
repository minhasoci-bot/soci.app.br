// Client portal course player, 6.3: the quiz (answer, result with explanations, retake), the assignment
// (support material, delivery, the team's feedback) and the course's live sessions.
import { icon } from './icons.js';
import { themeStyle } from './community-data.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const when = value => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const player = (src, title) => `<div class="cp-video"><iframe src="${h(src)}" title="${h(title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;

export function quizBlock(lesson, retake) {
  const quiz = lesson.quiz, attempt = retake ? null : quiz.attempt;
  if (attempt) return `<section class="cp-quiz-result ${attempt.passed ? 'passed' : 'failed'}" aria-live="polite">
      <div class="cp-quiz-score"><b>${attempt.score}%</b><span>${attempt.passed ? 'Aprovado' : `Nota mínima: ${quiz.passScore}%`}</span></div>
      <p>${attempt.passed ? h(attempt.message || 'Parabéns, você atingiu a nota mínima!') : 'Você ainda não atingiu a nota mínima. Revise as respostas e tente de novo.'}</p>
      <ol class="cp-quiz">${quiz.questions.map(question => `<li class="${question.right ? 'right' : 'wrong'}"><p class="cp-quiz-q">${icon(question.right ? 'check' : 'close', 14)} ${h(question.text)}</p>
        <ul>${question.options.map(option => `<li class="${option.correct ? 'correct' : ''} ${option.chosen ? 'chosen' : ''}">${h(option.text)}${option.chosen ? ' <small>sua resposta</small>' : ''}${option.correct ? ' <small>certa</small>' : ''}</li>`).join('')}</ul>
        ${question.explanation ? `<p class="cp-quiz-why">${h(question.explanation)}</p>` : ''}</li>`).join('')}</ol>
      <button type="button" class="cp-public-ghost" data-course-retake="${h(lesson.id)}">Tentar de novo</button>
      <small class="cp-meta">${attempt.count} ${attempt.count === 1 ? 'tentativa' : 'tentativas'}</small></section>`;
  return `<form class="cp-quiz-form" data-course-form="quiz"><p class="cp-meta">${quiz.questionCount} ${quiz.questionCount === 1 ? 'pergunta' : 'perguntas'} · nota mínima ${quiz.passScore}%</p>
    <ol class="cp-quiz">${quiz.questions.map(question => `<li><fieldset><legend class="cp-quiz-q">${h(question.text)}${question.multiple ? ' <small>(marque todas as certas)</small>' : ''}</legend>
      ${question.options.map(option => `<label class="cp-quiz-option"><input type="${question.multiple ? 'checkbox' : 'radio'}" name="q.${h(question.id)}" value="${h(option.id)}"${question.multiple ? '' : ' required'}> <span>${h(option.text)}</span></label>`).join('')}</fieldset></li>`).join('')}</ol>
    <button type="submit" class="cp-public-primary">${icon('check', 16)} Enviar respostas</button></form>`;
}

export function assignmentBlock(lesson) {
  const a = lesson.assignment, s = a.submission;
  const status = { submitted: ['Aguardando correção', ''], approved: ['Aprovada', 'ok'], revise: ['Ajustes pedidos', 'warn'] };
  return `<section class="cp-assignment">
    ${a.attachments.length ? `<div class="cp-assignment-files"><h3>Material de apoio</h3>${a.attachments.map(file => `<a class="cp-public-ghost" href="${h(file.data)}" download="${h(file.name)}">${icon('download', 15)} ${h(file.name)}</a>`).join('')}</div>` : ''}
    ${s ? `<div class="cp-assignment-status ${status[s.status]?.[1] || ''}"><b>${status[s.status]?.[0] || s.status}</b><small>Entregue em ${h(when(s.at))}</small>
      ${a.message && s.status !== 'revise' ? `<p>${h(a.message)}</p>` : ''}${s.feedback ? `<p class="cp-feedback"><b>Comentário da equipe:</b> ${h(s.feedback)}</p>` : ''}</div>` : ''}
    ${s?.status === 'approved' ? '' : `<form class="cp-assignment-form" data-course-form="assignment"><h3>${s ? 'Enviar de novo' : 'Sua entrega'}</h3>
      <label>Resposta<textarea name="text" rows="6" maxlength="5000">${h(s?.text || '')}</textarea></label>
      <label>Link (opcional)<input name="link" type="url" maxlength="600" placeholder="https://drive.google.com/…" value="${h(s?.link || '')}"></label>
      <button type="submit" class="cp-public-primary">${icon('send', 16)} Entregar tarefa</button>
      ${a.graded ? '<small class="cp-meta">A equipe corrige e a aula é concluída quando a entrega for aprovada.</small>' : ''}</form>`}</section>`;
}

export function liveBlock(live) {
  if (!live?.length) return '';
  return `<section class="cp-public-card cp-live-sessions"><h2>Sessões ao vivo</h2><ul>${live.map(row => `<li class="${row.cancelled ? 'cancelled' : ''}">
    <div><strong>${h(row.title)}</strong>${row.live ? ' <span class="cp-tag cp-live-now">Ao vivo</span>' : ''}${row.cancelled ? ' <span class="cp-tag">Cancelada</span>' : ''}
      <small>${h(when(row.start))} · ${row.duration} min${row.host ? ` · ${h(row.host)}` : ''}</small>${row.description ? `<p>${h(row.description)}</p>` : ''}</div>
    ${row.joinUrl ? `<a class="cp-public-primary" href="${h(row.joinUrl)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play', 15)} Entrar</a>` : ''}
    ${row.recordingEmbed ? `<details class="cp-recording"><summary>${icon('play', 14)} Ver gravação</summary>${player(row.recordingEmbed, row.title)}</details>`
      : row.recordingUrl ? `<a class="cp-public-link" href="${h(row.recordingUrl)}" target="_blank" rel="noopener noreferrer nofollow">${icon('play', 14)} Ver gravação</a>` : ''}
    ${!row.past && !row.joinUrl && !row.cancelled ? '<small class="cp-meta">O link abre 15 minutos antes.</small>' : ''}</li>`).join('')}</ul></section>`;
}

/** The quiz answers in the shape the server grades. */
export const quizAnswers = form => [...new Set([...form.querySelectorAll('input[name^="q."]')].map(input => input.name))]
  .map(name => ({ questionId: name.slice(2), optionIds: [...form.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map(input => input.value) }));

// ---- 6.4: the course page, the theme, the instructor, the next-lesson card and the credentials -------------
const workspaceOf = () => location.pathname.split('/')[2];
export const certificateLink = credential => `/certificado/${encodeURIComponent(workspaceOf())}/${encodeURIComponent(credential.code)}`;
export const themed = course => course.theme ? ` cm-themed" style="${h(themeStyle(course.theme))}` : '';

export function instructorCard(course) {
  const who = course.instructor;
  if (!who || course.page?.showInstructor === false) return '';
  return `<section class="cp-public-card cp-instructor">${who.photo ? `<img src="${h(who.photo)}" alt="">` : `<span class="cp-avatar" aria-hidden="true">${h((who.name || '?').slice(0, 1).toUpperCase())}</span>`}
    <div><small class="cp-meta">Instrutor</small><strong>${h(who.name)}</strong>${who.title ? `<small>${h(who.title)}</small>` : ''}${who.bio ? `<p>${h(who.bio)}</p>` : ''}</div></section>`;
}

export function credentialsCard(course) {
  if (!course.badge && !course.certificate) return '';
  return `<section class="cp-public-card cp-credentials"><h2>Conquistas</h2>
    ${course.badge ? `<a class="cp-credential" href="${h(certificateLink(course.badge))}" target="_blank" rel="noopener"><span class="cp-seal" aria-hidden="true">★</span><span><b>${h(course.badge.title)}</b><small>Badge de matrícula</small></span></a>` : ''}
    ${course.certificate ? `<a class="cp-credential" href="${h(certificateLink(course.certificate))}" target="_blank" rel="noopener"><span class="cp-seal cert" aria-hidden="true">${icon('award', 18)}</span><span><b>${h(course.certificate.title)}</b><small>Ver e imprimir o certificado</small></span></a>` : ''}</section>`;
}

export function crossSellCard(course) {
  const offer = course.crossSell;
  return offer ? `<section class="cp-public-card cp-cross-sell"><small class="cp-meta">Próximo passo</small><strong>${h(offer.title)}</strong>${offer.text ? `<p>${h(offer.text)}</p>` : ''}
    <a class="cp-public-primary" href="/oferta/${encodeURIComponent(workspaceOf())}/${encodeURIComponent(offer.id)}" target="_blank" rel="noopener">${h(offer.price)} · Conhecer ${icon('right', 15)}</a></section>` : '';
}

/** The course page: cover, description, progress, modules and the instructor, before the lessons. */
export function coursePage(course, bar) {
  const flat = course.modules.flatMap(module => module.lessons);
  const next = flat.find(lesson => !lesson.locked && !lesson.done) || flat.find(lesson => !lesson.locked);
  const label = !course.progress.done ? 'Começar o curso' : course.progress.done >= course.progress.total ? 'Rever o curso' : 'Continuar de onde parei';
  return `<div class="cp-course-page${themed(course)}">
    <button type="button" class="cp-public-link" data-portal-public="back">${icon('left', 16)} Meus cursos</button>
    <header class="cp-public-card cp-course-hero">${course.cover ? `<img src="${h(course.cover)}" alt="">` : ''}<div>
      <h1>${h(course.name)}</h1>${course.description ? `<p>${h(course.description)}</p>` : ''}
      ${course.page?.showProgress !== false ? `<div class="cp-course-progress">${bar(course.progress)}<small>${course.progress.done} de ${course.progress.total} aulas · ${course.progress.percent}%</small></div>` : ''}
      ${next ? `<button type="button" class="cp-public-primary" data-lesson="${h(next.id)}">${label} ${icon('right', 16)}</button>` : ''}</div></header>
    <div class="cp-course-page-grid"><section class="cp-public-card cp-course-modules"><h2>Conteúdo do curso</h2>${course.modules.map(module => `<details open><summary>${h(module.title)} <small>${module.lessons.length} ${module.lessons.length === 1 ? 'aula' : 'aulas'}</small></summary>
        <ol>${module.lessons.map(lesson => `<li><button type="button" data-lesson="${h(lesson.id)}" ${lesson.locked ? 'disabled' : ''}>${icon(lesson.locked ? 'lock' : lesson.done ? 'check' : 'play', 14)} ${h(lesson.title)}</button></li>`).join('')}</ol></details>`).join('')}</section>
      <aside class="cp-course-aside">${credentialsCard(course)}${instructorCard(course)}${crossSellCard(course)}${liveBlock(course.live)}</aside></div></div>`;
}

/** The card that leads to the next lesson at the end of a lesson. */
export const nextLessonCard = (next, current) => next ? `<button type="button" class="cp-next-card" data-lesson="${h(next.id)}" data-auto="${current && !current.done && !['quiz', 'assignment'].includes(current.kind) ? '1' : ''}">
  <small>Próxima aula</small><strong>${h(next.title)}</strong>${icon('right', 18)}</button>` : '';
