// Academia tab of a community in the client portal: the courses the owner picked, each one open, waiting for
// the member to join, for sale through an offer or unavailable.
import { icon } from './icons.js';
import { empty, h } from './portal-community-feed.js';

const startLabel = ({ done, total }) => !done ? 'Começar' : done >= total ? 'Rever curso' : 'Continuar';
const bar = ({ percent }) => `<span class="cp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Progresso"><span style="width:${percent}%"></span></span>`;

function action(course) {
  if (course.state === 'open') return `<button type="button" class="cp-public-primary" data-cm-public="course" data-course="${h(course.id)}">${startLabel(course.progress)} ${icon('right', 16)}</button>`;
  if (course.state === 'join') return `<p class="cp-cm-course-note">${icon('lock', 14)} Entre na comunidade para assistir</p>`;
  if (course.state === 'buy') return `<a class="cp-public-ghost" href="${h(course.offerUrl)}" target="_blank" rel="noopener">Quero acesso ${icon('external', 15)}</a>`;
  return `<p class="cp-cm-course-note">${icon('lock', 14)} Indisponível no momento</p>`;
}

/** The course cards of the community's Academia. */
export function academyTab(view) {
  const courses = view.academy || [];
  if (!courses.length) return empty('book', 'A Academia ainda está vazia', 'Os cursos da comunidade aparecem aqui assim que forem publicados.');
  return `<div class="cp-cm-courses">${courses.map(course => `<article class="cp-public-card cp-cm-course${course.state === 'open' ? '' : ' locked'}">
    <div class="cp-cm-course-cover">${course.cover ? `<img src="${h(course.cover)}" alt="">` : `<span>${icon('book', 28)}</span>`}
      <span class="cp-tag">${course.mode === 'included' ? 'Incluso' : h(course.priceLabel || 'À parte')}</span></div>
    <div class="cp-cm-course-body"><h3>${h(course.name)}</h3>${course.description ? `<p>${h(course.description)}</p>` : ''}
      ${course.state === 'open' ? `<div class="cp-course-progress">${bar(course.progress)}<small>${course.progress.done} de ${course.progress.total} aulas · ${course.progress.percent}%</small></div>` : ''}
      ${action(course)}</div></article>`).join('')}</div>`;
}
