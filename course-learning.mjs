// Courses 6.3: quizzes (single or multiple choice, minimum score), assignments (support material and the
// student's delivery, graded or not), live sessions with recordings, and the "course activity" trigger.
import { randomUUID } from 'node:crypto';
import { issueCredential } from './course-credentials.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const idOf = value => typeof value === 'string' && /^[\w-]{1,60}$/.test(value) ? value : randomUUID();
const https = (value, label) => { const link = str(value, 600); if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail(`${label} precisa começar com https://.`); return link; };
const mail = value => { const email = str(value, 254).toLowerCase(); return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ? email : ''; };
export const LIVE_OPENS_BEFORE = 15 * 60000;

/** The quiz part of a lesson: 1 to 50 questions, 2 to 8 options each, at least one right answer. */
export function quizRecord(input, title) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  if (!questions.length) fail(`Adicione pelo menos uma pergunta ao quiz “${title}”.`);
  if (questions.length > 50) fail(`O quiz “${title}” pode ter até 50 perguntas.`);
  const passScore = Math.round(Number(input.passScore ?? 70));
  if (!(passScore >= 0 && passScore <= 100)) fail('A nota mínima vai de 0 a 100%.');
  return {
    passScore, completionMessage: str(input.completionMessage, 500),
    questions: questions.map((question, index) => {
      const text = str(question?.text, 500) || fail(`Escreva a pergunta ${index + 1} do quiz “${title}”.`);
      const options = (Array.isArray(question.options) ? question.options : []).map(option => ({ id: idOf(option?.id), text: str(option?.text, 300), correct: Boolean(option?.correct) })).filter(option => option.text);
      if (options.length < 2 || options.length > 8) fail(`A pergunta “${text.slice(0, 60)}” precisa de 2 a 8 opções.`);
      const right = options.filter(option => option.correct);
      if (!right.length) fail(`Marque a resposta certa da pergunta “${text.slice(0, 60)}”.`);
      const multiple = Boolean(question.multiple);
      if (!multiple && right.length > 1) fail(`A pergunta “${text.slice(0, 60)}” é de escolha única: marque só uma resposta certa.`);
      return { id: idOf(question.id), text, multiple, options, explanation: str(question.explanation, 1000) };
    })
  };
}

/** The assignment part of a lesson: support files from Mídia Drive, graded or not, and the message after delivery. */
export function assignmentRecord(s, input, title) {
  const attachments = [...new Set(Array.isArray(input?.attachments) ? input.attachments.map(id => str(id, 60)).filter(Boolean) : [])];
  if (attachments.length > 10) fail(`A tarefa “${title}” pode ter até 10 materiais de apoio.`);
  for (const id of attachments) if (!s.files.some(file => file.id === id)) fail(`Escolha os materiais da tarefa “${title}” na Mídia Drive.`);
  return { attachments, graded: input?.graded !== false, completionMessage: str(input?.completionMessage, 500) || 'Recebemos sua entrega. Obrigado!' };
}

/** Live sessions of a course (up to 50), each with an optional recording. */
export function liveSessionsRecord(input) {
  const rows = Array.isArray(input) ? input : [];
  if (rows.length > 50) fail('Um curso pode ter até 50 sessões ao vivo.');
  return rows.map(row => {
    const title = str(row?.title, 160) || fail('Dê um nome a cada sessão ao vivo.');
    const start = Date.parse(row.start);
    if (Number.isNaN(start)) fail(`Informe a data e a hora da sessão “${title}”.`);
    const duration = Math.round(Number(row.duration) || 60);
    if (duration < 10 || duration > 480) fail(`A sessão “${title}” dura de 10 a 480 minutos.`);
    return { id: idOf(row.id), title, description: str(row.description, 1000), host: str(row.host, 80), start: new Date(start).toISOString(), duration,
      joinUrl: https(row.joinUrl, 'O link da sessão'), recordingUrl: https(row.recordingUrl, 'O link da gravação'), cancelled: Boolean(row.cancelled) };
  }).sort((a, b) => a.start.localeCompare(b.start));
}

/** Grades one attempt: a question counts only when the chosen set equals the right set. */
export function gradeQuiz(lesson, answers) {
  const given = new Map((Array.isArray(answers) ? answers : []).map(row => [row?.questionId, new Set(Array.isArray(row?.optionIds) ? row.optionIds : [row?.optionIds].filter(Boolean))]));
  const results = lesson.quiz.questions.map(question => {
    const chosen = [...(given.get(question.id) || [])].filter(id => question.options.some(option => option.id === id));
    if (!question.multiple && chosen.length > 1) fail('Escolha só uma opção nas perguntas de escolha única.');
    const right = question.options.filter(option => option.correct).map(option => option.id);
    const correct = chosen.length === right.length && right.every(id => chosen.includes(id));
    return { questionId: question.id, chosen, correct };
  });
  if (results.some(row => !row.chosen.length)) fail('Responda todas as perguntas antes de enviar.');
  const score = Math.round(results.filter(row => row.correct).length / results.length * 100);
  return { score, passed: score >= lesson.quiz.passScore, results };
}

/** What a student sees of a quiz: no right answers before an attempt; after it, the result with explanations. */
export function quizView(lesson, attempt) {
  return { passScore: lesson.quiz.passScore, questionCount: lesson.quiz.questions.length,
    questions: lesson.quiz.questions.map(question => {
      const result = attempt?.results?.find(row => row.questionId === question.id);
      return { id: question.id, text: question.text, multiple: question.multiple, options: question.options.map(option => ({ id: option.id, text: option.text,
        ...(attempt ? { correct: option.correct, chosen: Boolean(result?.chosen.includes(option.id)) } : {}) })),
        ...(attempt ? { right: Boolean(result?.correct), explanation: question.explanation } : {}) };
    }),
    attempt: attempt ? { score: attempt.score, passed: attempt.passed, at: attempt.at, count: attempt.count, message: attempt.passed ? lesson.quiz.completionMessage : '' } : null };
}

/** The live sessions a student sees: the join link opens 15 minutes before; recordings play in the portal. */
export function liveView(course, videoEmbed, at = Date.now()) {
  const rows = (course.liveSessions || []).map(row => {
    const start = Date.parse(row.start), end = start + row.duration * 60000;
    const open = !row.cancelled && start - LIVE_OPENS_BEFORE <= at && at < end;
    return { id: row.id, title: row.title, description: row.description, host: row.host, start: row.start, duration: row.duration, cancelled: row.cancelled,
      past: end <= at, live: open && at >= start, joinUrl: open ? row.joinUrl : '', recordingUrl: end <= at ? row.recordingUrl : '', recordingEmbed: end <= at && row.recordingUrl ? videoEmbed(row.recordingUrl) : '' };
  });
  // Upcoming first (soonest on top), then past ones (latest on top).
  return [...rows.filter(row => !row.past), ...rows.filter(row => row.past).reverse()];
}

// ---- Workspace side: course activity fires the workflow triggers on the student's contact -----------------
export function courseActivityCommand(s, command, { add, run }) {
  const d = command.data || {};
  const course = s.courses.find(row => row.id === d.courseId) || fail('Curso não encontrado.', 404);
  const email = mail(d.email);
  const contactFor = () => {
    let contact = (d.contactId && s.contacts.find(row => row.id === d.contactId)) || (email && s.contacts.find(row => (row.email || '').toLowerCase() === email));
    if (!contact && email) { contact = add(s, 'contacts', { name: str(d.name, 120) || email, email, phone: '', tags: ['curso'], company: '', notes: '', custom: {} }); run(s, 'Contact created', { contactId: contact.id }); }
    return contact || null;
  };
  // Opening the course gives the enrollment badge; finishing it gives the certificate (when the course has them on).
  if (d.event === 'opened' || d.event === 'completed') return issueCredential(s, { ...d, kind: d.event === 'opened' ? 'badge' : 'certificate' }, { add, run, contactFor });
  const contact = contactFor();
  if (!contact) return '';
  const base = { contactId: contact.id, courseId: course.id, lessonId: str(d.lessonId, 60), title: str(d.lessonTitle, 160), course: course.name };
  if (d.event === 'quiz') run(s, 'course_quiz_submitted', { ...base, score: Number(d.score) || 0, passed: d.passed ? 'yes' : 'no' });
  else if (d.event === 'assignment') run(s, 'course_assignment_submitted', base);
  else if (d.event === 'graded') run(s, 'course_assignment_graded', { ...base, status: d.status === 'approved' ? 'approved' : 'revise' });
  else if (d.event === 'lesson') run(s, 'lesson_completed', base);
  else if (d.event === 'granted' || d.event === 'revoked') run(s, d.event === 'granted' ? 'course_access_granted' : 'course_access_revoked', { contactId: contact.id, courseId: course.id, course: course.name });
  else fail('Atividade de curso desconhecida.');
  return contact.id;
}
