// Course analytics (6.5): enrollment, completion, the lesson funnel, quizzes, assignments and each student,
// read from the client portal document (grants and progress) and the course outline.
import { courseOutline } from './course-model.mjs';

const DAY = 86400000;
const published = course => courseOutline(course).flatMap(module => module.lessons).filter(lesson => lesson.published !== false);
const enrolled = (doc, course) => (doc.members || []).filter(member => !member.revokedAt && (member.courseIds || []).includes(course.id));

/** One line per course for the course list: students, average progress and how many finished. */
export function courseSummaries(state, doc) {
  return Object.fromEntries((state.courses || []).map(course => {
    const lessons = published(course), students = enrolled(doc, course);
    const percents = students.map(member => lessons.length ? lessons.filter(lesson => member.progress?.[course.id]?.[lesson.id]).length / lessons.length : 0);
    return [course.id, { students: students.length, completed: percents.filter(value => value >= 1).length,
      average: percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length * 100) : 0 }];
  }));
}

/** The full analytics of one course over the last `days` days. */
export function courseAnalytics(state, course, doc, { days = 30, at = Date.now() } = {}) {
  const lessons = published(course), students = enrolled(doc, course), since = at - days * DAY;
  const certificates = new Map((state.credentialsIssued || []).filter(row => row.courseId === course.id && row.kind === 'certificate' && !row.revokedAt).map(row => [row.memberId, row]));
  const series = new Map();
  const rows = students.map(member => {
    const done = member.progress?.[course.id] || {};
    const stamps = lessons.map(lesson => done[lesson.id]).filter(Boolean).sort();
    for (const stamp of stamps) if (Date.parse(stamp) >= since) { const key = stamp.slice(0, 10); series.set(key, (series.get(key) || 0) + 1); }
    const count = lessons.filter(lesson => done[lesson.id]).length, percent = lessons.length ? Math.round(count / lessons.length * 100) : 0;
    const activity = [...stamps, ...Object.values(member.quizzes?.[course.id] || {}).map(row => row.at), ...Object.values(member.assignments?.[course.id] || {}).map(row => row.at)].filter(Boolean).sort();
    return { id: member.id, name: member.name || member.email, email: member.email, grantedAt: member.grantedAt?.[course.id] || member.created || '', done: count, percent,
      lastActivity: activity.at(-1) || '', completedAt: percent === 100 ? stamps.at(-1) || '' : '', certificate: certificates.get(member.id)?.code || '' };
  }).sort((a, b) => b.percent - a.percent || String(b.lastActivity).localeCompare(String(a.lastActivity)));
  const funnel = lessons.map(lesson => {
    const reached = students.filter(member => member.progress?.[course.id]?.[lesson.id]).length;
    const out = { id: lesson.id, title: lesson.title, kind: lesson.kind, done: reached, percent: students.length ? Math.round(reached / students.length * 100) : 0 };
    if (lesson.kind === 'quiz') {
      const tries = students.map(member => member.quizzes?.[course.id]?.[lesson.id]).filter(Boolean);
      Object.assign(out, { attempts: tries.reduce((sum, row) => sum + (row.count || 1), 0), takers: tries.length, passed: tries.filter(row => row.passed || row.best >= lesson.quiz.passScore).length,
        averageScore: tries.length ? Math.round(tries.reduce((sum, row) => sum + (row.best ?? row.score ?? 0), 0) / tries.length) : 0 });
    }
    if (lesson.kind === 'assignment') {
      const sent = students.map(member => member.assignments?.[course.id]?.[lesson.id]).filter(Boolean);
      Object.assign(out, { submitted: sent.length, pending: sent.filter(row => row.status === 'submitted').length, approved: sent.filter(row => row.status === 'approved').length });
    }
    return out;
  });
  const completed = rows.filter(row => row.percent === 100);
  return {
    days, students: rows.length, started: rows.filter(row => row.done > 0).length, completed: completed.length,
    completionRate: rows.length ? Math.round(completed.length / rows.length * 100) : 0,
    averageProgress: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length) : 0,
    active: rows.filter(row => row.lastActivity && Date.parse(row.lastActivity) >= since).length,
    newStudents: rows.filter(row => row.grantedAt && Date.parse(row.grantedAt) >= since).length,
    certificates: certificates.size, lessons: lessons.length,
    series: [...series].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)), funnel, rows
  };
}
