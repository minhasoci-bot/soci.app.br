// Communities: the Academia — courses the owner shows inside a community, each one included for members with
// access or sold separately through an offer. Settings, the member's view of the cards and the courses a
// membership opens.
import { memberCourseCard } from './course-model.mjs';
import { hasAccess } from './community-config.mjs';
import { offerPrice } from './offer-model.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const MAX_COURSES = 30;

/** The academy of a group, validated against the workspace's courses and offers; `input` undefined keeps `prior`. */
export function academyConfig(s, input, prior) {
  const kept = prior?.courses ? prior : { courses: [] };
  if (input === undefined || !s) return kept;
  const rows = Array.isArray(input?.courses) ? input.courses : [];
  if (rows.length > MAX_COURSES) fail(`A Academia tem até ${MAX_COURSES} cursos.`);
  const seen = new Set(), courses = [];
  for (const row of rows) {
    const courseId = typeof row?.courseId === 'string' ? row.courseId : '';
    if (!(s.courses || []).some(course => course.id === courseId)) fail('Curso da Academia não encontrado.');
    if (seen.has(courseId)) continue;
    seen.add(courseId);
    const mode = row.mode === 'separate' ? 'separate' : 'included';
    const offerId = mode === 'separate' && typeof row.offerId === 'string' ? row.offerId : '';
    if (offerId && !(s.offers || []).find(item => item.id === offerId)?.courseIds?.includes(courseId)) fail('A oferta escolhida não inclui o curso.');
    courses.push({ courseId, mode, offerId });
  }
  return { courses };
}

/** The offer a "separate" course points to: the chosen one when published, else the first published offer with it. */
export function academyOfferFor(s, entry) {
  // Only an offer that still sells this course: an offer edited later may no longer include it.
  const selling = (s.offers || []).filter(offer => offer.status === 'published' && offer.courseIds?.includes(entry.courseId));
  return selling.find(offer => offer.id === entry.offerId) || selling[0] || null;
}

/** The academy cards one member sees; `allowed` says whether the membership gives access right now. */
export function academyView(s, group, member, { workspace, allowed }) {
  return (group.academy?.courses || []).map(entry => {
    const course = (s.courses || []).find(row => row.id === entry.courseId && row.active !== false);
    if (!course) return null;
    const { id, name, description, cover, progress } = memberCourseCard(s, course, { courseIds: [], ...member });
    const owned = (member?.courseIds || []).includes(course.id);
    const offer = entry.mode === 'separate' ? academyOfferFor(s, entry) : null;
    const state = owned || (entry.mode === 'included' && allowed) ? 'open' : entry.mode === 'included' ? 'join' : offer ? 'buy' : 'unavailable';
    return { id, name, description, cover, progress, mode: entry.mode, state,
      offerUrl: offer ? `/oferta/${workspace}/${offer.id}` : '',
      priceLabel: offer ? offerPrice(offer) : '' };
  }).filter(Boolean);
}

/** The included courses a member opens through the communities they have access to, each with the day access
 *  began (the earliest community join), which is when its drip lessons start counting. */
export function includedCourseGrants(s, doc, memberId) {
  const grants = {};
  for (const group of s.communities || []) {
    if (group.active === false || !group.academy?.courses?.length) continue;
    const membership = doc?.groups?.[group.id]?.members?.[memberId];
    if (!hasAccess(group, membership)) continue;
    for (const entry of group.academy.courses) {
      if (entry.mode !== 'included' || !(s.courses || []).some(course => course.id === entry.courseId && course.active !== false)) continue;
      const since = membership.joinedAt || new Date().toISOString();
      if (!grants[entry.courseId] || since < grants[entry.courseId]) grants[entry.courseId] = since;
    }
  }
  return grants;
}
export const includedCourseIds = (s, doc, memberId) => Object.keys(includedCourseGrants(s, doc, memberId));

/** The member as the course model sees them: community grants date the courses they do not own themselves. */
export const withCommunityGrants = (member, grants) => ({ ...member, grantedAt: { ...grants, ...(member.grantedAt || {}) } });

/** Deleting a course takes it out of every academy; deleting an offer clears it from the courses that used it. */
export function academyBeforeDelete(s, key, id) {
  for (const group of s.communities || []) {
    if (!group.academy?.courses) continue;
    if (key === 'courses') group.academy.courses = group.academy.courses.filter(entry => entry.courseId !== id);
    if (key === 'offers') for (const entry of group.academy.courses) if (entry.offerId === id) entry.offerId = '';
  }
}
