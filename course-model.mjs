// Courses: modules with lessons (text, video or a Mídia Drive file), drip release by days after access,
// and the per-member view the client portal renders. Older single-lesson courses keep working.
import { randomUUID } from 'node:crypto';
import { assignmentRecord, liveSessionsRecord, liveView, quizRecord, quizView } from './course-learning.mjs';
import { courseExtras } from './course-credentials.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const kinds = ['text', 'video', 'file', 'quiz', 'assignment'];
const DAY = 86400000;
const idOf = value => typeof value === 'string' && /^[\w-]{1,60}$/.test(value) ? value : randomUUID();

// Turns a public video page into an embeddable player; '' when the link is not a known player.
export function videoEmbed(address) {
  let url;
  try { url = new URL(address); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const youtube = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]) : '';
  if (youtube && /^[\w-]{6,20}$/.test(youtube)) return `https://www.youtube-nocookie.com/embed/${youtube}`;
  const vimeo = host === 'vimeo.com' && url.pathname.match(/^\/(\d{5,12})/)?.[1];
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  const loom = host === 'loom.com' && url.pathname.match(/^\/share\/([a-f0-9]{32})/)?.[1];
  if (loom) return `https://www.loom.com/embed/${loom}`;
  return '';
}

// The outline of any course, including older ones saved with a single `lesson`/`body`.
export function courseOutline(course) {
  if (Array.isArray(course.modules) && course.modules.length) return course.modules;
  return [{ id: `${course.id}-m1`, title: 'Módulo 1', lessons: [{ id: `${course.id}-l1`, title: course.lesson || course.name || 'Aula 1',
    kind: 'text', body: course.body || '', videoUrl: '', fileId: '', dripDays: 0 }] }];
}

function lessonRecord(s, input) {
  const kind = kinds.includes(input?.kind) ? input.kind : 'text';
  const lesson = { id: idOf(input?.id), title: str(input?.title, 160) || fail('Toda aula precisa de um título.'), kind,
    body: str(input?.body, 20000), videoUrl: '', fileId: '', dripDays: 0, submoduleId: str(input?.submoduleId, 60), published: input?.published !== false };
  if (kind === 'quiz') lesson.quiz = quizRecord(input.quiz, lesson.title);
  if (kind === 'assignment') lesson.assignment = assignmentRecord(s, input.assignment, lesson.title);
  if (kind === 'video') {
    lesson.videoUrl = str(input.videoUrl, 500);
    if (!/^https:\/\/[^\s"'<>]+$/i.test(lesson.videoUrl)) fail(`Use um link de vídeo que comece com https:// na aula “${lesson.title}”.`);
  }
  if (kind === 'file') {
    lesson.fileId = str(input.fileId, 60);
    if (!s.files.some(file => file.id === lesson.fileId)) fail(`Escolha um arquivo da Mídia Drive para a aula “${lesson.title}”.`);
  }
  const days = Number(input?.dripDays || 0);
  if (!Number.isInteger(days) || days < 0 || days > 365) fail('A liberação deve ser entre 0 e 365 dias.');
  lesson.dripDays = days;
  return lesson;
}

function outlineRecord(s, input) {
  if (!Array.isArray(input) || !input.length) fail('Adicione pelo menos um módulo com uma aula.');
  if (input.length > 50) fail('Um curso pode ter até 50 módulos.');
  const modules = input.map(module => {
    const submoduleInput = Array.isArray(module?.submodules) ? module.submodules : [];
    if (submoduleInput.length > 20) fail('Um módulo pode ter até 20 submódulos.');
    const submodules = submoduleInput.map(row => ({ id: idOf(row?.id), title: str(row?.title, 160) || fail('Todo submódulo precisa de um título.') }));
    const lessons = (Array.isArray(module?.lessons) ? module.lessons : []).map(lesson => lessonRecord(s, lesson));
    for (const lesson of lessons) if (lesson.submoduleId && !submodules.some(row => row.id === lesson.submoduleId)) lesson.submoduleId = '';
    // The order students follow is the order they see: lessons straight in the module, then each submodule's.
    const ordered = [...lessons.filter(lesson => !lesson.submoduleId), ...submodules.flatMap(sub => lessons.filter(lesson => lesson.submoduleId === sub.id))];
    return { id: idOf(module?.id), title: str(module?.title, 160) || fail('Todo módulo precisa de um título.'), submodules, lessons: ordered };
  });
  const count = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  if (!count) fail('Adicione pelo menos uma aula.');
  if (count > 300) fail('Um curso pode ter até 300 aulas.');
  const seen = new Set();
  for (const id of modules.flatMap(module => [module.id, ...module.submodules.map(row => row.id), ...module.lessons.map(lesson => lesson.id)])) {
    if (seen.has(id)) fail('Há módulos ou aulas repetidos.');
    seen.add(id);
  }
  return modules;
}

export const courseFields = {
  courses: (s, d) => {
    const prior = d.id ? s.courses.find(row => row.id === d.id) : null;
    const modules = d.modules !== undefined ? outlineRecord(s, d.modules)
      : prior ? courseOutline(prior)
        : outlineRecord(s, [{ title: 'Módulo 1', lessons: [{ title: str(d.lesson, 160) || 'Aula 1', kind: 'text', body: d.body }] }]);
    const coverFileId = str(d.coverFileId ?? prior?.coverFileId, 60);
    if (coverFileId && !s.files.some(file => file.id === coverFileId && file.data.startsWith('data:image/'))) fail('A capa precisa ser uma imagem da Mídia Drive.');
    const first = modules[0].lessons[0] || modules.flatMap(module => module.lessons)[0];
    return {
      name: str(d.name ?? prior?.name, 160) || fail('Dê um nome ao curso.'),
      description: str(d.description ?? prior?.description, 2500),
      coverFileId, modules,
      lesson: first.title, body: first.body,
      active: d.active === undefined ? Boolean(prior?.active) : Boolean(d.active),
      sequential: d.sequential === undefined ? Boolean(prior?.sequential) : Boolean(d.sequential),
      liveSessions: d.liveSessions === undefined ? prior?.liveSessions || [] : liveSessionsRecord(d.liveSessions),
      ...courseExtras(s, d, prior || {}),
      portalOnly: typeof d.portalOnly === 'boolean' ? d.portalOnly : (prior ? Boolean(prior.portalOnly) : true)
    };
  }
};

const fileView = (s, id) => {
  const file = id && s.files.find(row => row.id === id);
  return file ? { name: file.name, data: file.data } : null;
};
export const lessonCount = course => courseOutline(course).reduce((sum, module) => sum + module.lessons.length, 0);

// What one member sees of a course: the outline with done/locked state and the content of a single lesson.
export function memberCourse(s, course, member, { now = Date.now(), lessonId = '' } = {}) {
  const anchor = Date.parse(member.grantedAt?.[course.id] || member.joinedAt || member.created || new Date(now).toISOString());
  const done = member.progress?.[course.id] || {};
  const outline = courseOutline(course).map(module => ({ ...module, lessons: module.lessons.filter(lesson => lesson.published !== false) })).filter(module => module.lessons.length);
  // In order: a lesson opens only when the one before it is done (when the course asks for it).
  let previousDone = true;
  const modules = outline.map(module => ({ id: module.id, title: module.title, submodules: module.submodules || [], lessons: module.lessons.map(lesson => {
    const opens = anchor + (lesson.dripDays || 0) * DAY, isDone = Boolean(done[lesson.id]);
    const waiting = course.sequential && !previousDone;
    previousDone = isDone;
    return { id: lesson.id, title: lesson.title, kind: lesson.kind, submoduleId: lesson.submoduleId || '', done: isDone, locked: opens > now || waiting,
      ...(waiting ? { waiting: true } : {}), ...(lesson.dripDays ? { availableAt: new Date(opens).toISOString() } : {}) };
  }) }));
  const flat = modules.flatMap(module => module.lessons);
  const finished = flat.filter(lesson => lesson.done).length;
  let open = lessonId ? flat.find(lesson => lesson.id === lessonId) : flat.find(lesson => !lesson.locked && !lesson.done) || flat.find(lesson => !lesson.locked);
  if (lessonId && !open) fail('Aula não encontrada.', 404);
  if (open?.locked) fail(open.waiting ? 'Conclua a aula anterior para liberar esta.' : 'Esta aula ainda não foi liberada.', 403);
  const source = open && outline.flatMap(module => module.lessons).find(lesson => lesson.id === open.id);
  return {
    id: course.id, name: course.name, description: course.description || '', cover: fileView(s, course.coverFileId)?.data || '',
    modules, progress: { done: finished, total: flat.length, percent: flat.length ? Math.round(finished / flat.length * 100) : 0 },
    lesson: source ? { id: source.id, title: source.title, kind: source.kind, body: source.body || '', videoUrl: source.videoUrl || '',
      embed: source.kind === 'video' ? videoEmbed(source.videoUrl) : '', file: source.kind === 'file' ? fileView(s, source.fileId) : null,
      ...(source.kind === 'quiz' ? { quiz: quizView(source, member.quizzes?.[course.id]?.[source.id]) } : {}),
      ...(source.kind === 'assignment' ? { assignment: { graded: source.assignment.graded, attachments: source.assignment.attachments.map(id => ({ id, ...fileView(s, id) })).filter(row => row.name),
        submission: member.assignments?.[course.id]?.[source.id] || null, message: member.assignments?.[course.id]?.[source.id] ? source.assignment.completionMessage : '' } } : {}) } : null,
    live: liveView(course, videoEmbed, now), sequential: Boolean(course.sequential),
    ...courseLook(s, course, member)
  };
}

// What the course page and the lesson page show beyond the lessons: theme, instructor, page options, the
// cross-sell offer and the student's badge and certificate.
function courseLook(s, course, member) {
  const offer = course.page?.crossSellOfferId && s.offers.find(row => row.id === course.page.crossSellOfferId && row.status === 'published');
  const mine = (s.credentialsIssued || []).filter(row => row.courseId === course.id && row.memberId === member.id && !row.revokedAt);
  const credential = kind => { const row = mine.find(item => item.kind === kind); return row ? { title: row.title, code: row.code, issuedAt: row.issuedAt } : null; };
  return {
    theme: course.theme || null, page: course.page || { productPage: true, showInstructor: true, showProgress: true, nextCard: true },
    instructor: course.instructor?.name ? { ...course.instructor, photo: fileView(s, course.instructor.photoFileId)?.data || '' } : null,
    crossSell: offer ? { id: offer.id, title: offer.title, text: course.page.crossSellText || '', price: offer.type === 'free' ? 'Gratuito' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price) } : null,
    badge: credential('badge'), certificate: credential('certificate')
  };
}

// The summary used on the member's library cards.
export function memberCourseCard(s, course, member, now = Date.now()) {
  const { id, name, description, cover, progress, badge, certificate } = memberCourse(s, course, member, { now });
  return { id, name, description, cover, progress, badge, certificate };
}
