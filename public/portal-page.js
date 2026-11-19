import { icon } from './icons.js';

const root = document.querySelector('#portal');
const workspace = location.pathname.split('/')[2];
const endpoint = `/api/client-portal/${encodeURIComponent(workspace)}`;
const h = value => String(value ?? '').replace(/[&<>"']/g,char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const day = value => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', year:'numeric' }).format(new Date(value));

let access = null;
function readAccessLink() {
  const token = new URLSearchParams(location.hash.slice(1)).get('access');
  if (token === null) return false;
  access = token;
  history.replaceState(null,'',location.pathname);
  return true;
}
readAccessLink();

async function api(route, body) {
  const response = await fetch(`${endpoint}/${route}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || 'Não foi possível abrir o portal.'),{status:response.status});
  return result;
}

const bar = ({ percent }) => `<span class="cp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Progresso"><span style="width:${percent}%"></span></span>`;
const startLabel = ({ done, total }) => !done ? 'Começar' : done >= total ? 'Rever curso' : 'Continuar';

function library(courses) {
  return `<section class="cp-library" id="cursos"><h2>Meus cursos</h2>
    ${courses?.length ? `<div class="cp-course-grid">${courses.map(item => `<article class="cp-public-card cp-course-card">
      <div class="cp-cover">${item.cover ? `<img src="${h(item.cover)}" alt="">` : `<span class="cp-course-icon">${icon('book',26)}</span>`}</div>
      <div class="cp-course-text"><h3>${h(item.name)}</h3>${item.description ? `<p>${h(item.description)}</p>` : ''}
        <div class="cp-course-progress">${bar(item.progress)}<small>${item.progress.done} de ${item.progress.total} aulas · ${item.progress.percent}%</small></div>
        <button type="button" class="cp-public-primary" data-course="${h(item.id)}">${startLabel(item.progress)} ${icon('right',16)}</button></div>
    </article>`).join('')}</div>` : '<p class="cp-public-card">Você ainda não tem cursos liberados.</p>'}</section>`;
}

function lessonBody(lesson) {
  if (!lesson) return '<p>Este curso ainda não tem aulas liberadas.</p>';
  let media = '';
  if (lesson.kind === 'video') media = lesson.embed
    ? `<div class="cp-video"><iframe src="${h(lesson.embed)}" title="${h(lesson.title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : `<div class="cp-video"><video src="${h(lesson.videoUrl)}" controls preload="metadata"></video></div>`;
  if (lesson.kind === 'file') media = lesson.file ? `<div class="cp-file">${lesson.file.data.startsWith('data:image/') ? `<img src="${h(lesson.file.data)}" alt="">` : `<span class="cp-course-icon">${icon('paperclip',22)}</span>`}
      <div><strong>${h(lesson.file.name)}</strong><small>Material da aula</small></div>
      <a class="cp-public-primary" href="${h(lesson.file.data)}" download="${h(lesson.file.name)}">${icon('download',16)} Baixar</a></div>`
    : '<p class="cp-public-error">O material desta aula não está mais disponível.</p>';
  return `${media}${lesson.body ? `<div class="cp-lesson-body">${h(lesson.body)}</div>` : ''}`;
}

function player(course) {
  const flat = course.modules.flatMap(module => module.lessons);
  const index = flat.findIndex(lesson => lesson.id === course.lesson?.id);
  const current = flat[index], next = flat.slice(index + 1).find(lesson => !lesson.locked);
  return `<div class="cp-player">
    <div class="cp-player-top"><button type="button" class="cp-public-link" data-portal-public="back">${icon('left',16)} Meus cursos</button>
      <div class="cp-player-title"><h1>${h(course.name)}</h1><div class="cp-course-progress">${bar(course.progress)}<small>${course.progress.percent}% concluído</small></div></div></div>
    <div class="cp-player-grid">
      <nav class="cp-public-card cp-outline" aria-label="Aulas do curso">${course.modules.map(module => `<section><h2>${h(module.title)}</h2><ol>
        ${module.lessons.map(lesson => `<li><button type="button" data-lesson="${h(lesson.id)}" ${lesson.id === current?.id ? 'aria-current="true"' : ''} ${lesson.locked ? 'disabled' : ''}>
          <span class="cp-state-icon ${lesson.done ? 'done' : ''}">${icon(lesson.locked ? 'lock' : lesson.done ? 'check' : lesson.kind === 'video' ? 'play' : lesson.kind === 'file' ? 'paperclip' : 'note',14)}</span>
          <span>${h(lesson.title)}${lesson.locked ? `<small>Disponível em ${h(day(lesson.availableAt))}</small>` : ''}</span></button></li>`).join('')}</ol></section>`).join('')}</nav>
      <article class="cp-public-card cp-lesson">${course.lesson ? `<p class="cp-lesson-kicker">Aula ${index + 1} de ${flat.length}</p><h2 class="cp-lesson-title">${h(course.lesson.title)}</h2>` : ''}
        ${lessonBody(course.lesson)}
        ${current ? `<footer class="cp-lesson-actions">
          <button type="button" class="${current.done ? 'cp-public-ghost' : 'cp-public-primary'}" data-portal-public="toggle" aria-pressed="${current.done}">${icon('check',16)} ${current.done ? 'Concluída' : 'Marcar como concluída'}</button>
          ${next ? `<button type="button" class="cp-public-link" data-lesson="${h(next.id)}">Próxima aula ${icon('right',16)}</button>` : ''}</footer>` : ''}
      </article></div></div>`;
}

let portal, course;
function draw(message = '') {
  const { title, introduction, color, signedIn, courses, member } = portal || { title: 'Portal do cliente' };
  document.title = course ? `${course.name} · ${title}` : title;
  if (/^#[\da-f]{6}$/i.test(color)) document.body.style.setProperty('--portal-color',color);
  root.innerHTML = `<div class="cp-public-shell ${course ? 'cp-wide' : ''}"><header class="cp-public-header">
      <div class="cp-public-brand">${icon('lock',20)}<span>${h(title)}</span></div>
      ${signedIn ? '<button type="button" class="cp-public-link" data-portal-public="logout">Sair</button>' : ''}
    </header>
    ${message ? `<p class="cp-public-error" role="alert">${h(message)}</p>` : ''}
    ${signedIn ? (course ? player(course) : `<section class="cp-public-welcome">
      <h1>${member?.name ? `Olá, ${h(member.name)}` : 'Bem-vindo ao portal'}</h1>
      ${introduction ? `<p>${h(introduction)}</p>` : ''}</section>${library(courses)}`) :
      `<section class="cp-public-card cp-signin"><div class="cp-course-icon">${icon('key',24)}</div>
        <h1>Acesse seu portal</h1>
        ${access ? '<p>Confirme para entrar com o seu link de acesso.</p><button type="button" class="cp-public-primary" data-portal-public="enter">Entrar no portal</button>' :
          '<p>Peça um link de acesso à equipe responsável por seus cursos.</p>'}</section>`}
  </div>`;
}

const openCourse = async (id, lesson = '') => {
  course = (await api(`course/${encodeURIComponent(id)}${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ''}`)).course;
};

root.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.portalPublic;
  button.disabled = true;
  let focus = '';
  try {
    if (action === 'enter') {
      await api('exchange',{ token:access });
      access = null;
      portal = await api('home');
    } else if (action === 'logout') {
      await api('logout',{});
      course = null;
      portal = await api('home');
    } else if (action === 'back') {
      course = null;
      portal = await api('home');
    } else if (action === 'toggle') {
      const lessonId = course.lesson.id, done = !course.modules.flatMap(module => module.lessons).find(lesson => lesson.id === lessonId).done;
      course = (await api(`progress/${encodeURIComponent(course.id)}`,{ lessonId, done })).course;
      focus = '[data-portal-public="toggle"]';
    } else if (button.dataset.lesson) {
      await openCourse(course.id, button.dataset.lesson);
      focus = '.cp-lesson-title';
    } else if (button.dataset.course) {
      await openCourse(button.dataset.course);
      focus = '.cp-lesson-title';
    }
    draw();
    if (focus) { const target = root.querySelector(focus); if (target && !target.matches('button')) target.setAttribute('tabindex','-1'); target?.focus(); }
  } catch (error) {
    if (error.status === 401) {
      access = null;
      course = null;
      if (portal) portal.signedIn = false;
    }
    draw(error.message);
  } finally {
    button.disabled = false;
  }
});

window.addEventListener('hashchange', () => {
  if (!readAccessLink()) return;
  course = null;
  if (portal) portal.signedIn = false;
  draw();
});

try {
  portal = await api('home');
  if (access !== null) portal.signedIn = false;
  draw();
  if (location.hash === '#cursos') root.querySelector('#cursos')?.scrollIntoView();
} catch (error) {
  access = null;
  draw(error.message);
}
