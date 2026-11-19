import { icon } from './icons.js';

const root = document.querySelector('#portal');
const workspace = location.pathname.split('/')[2];
const endpoint = `/api/client-portal/${encodeURIComponent(workspace)}`;
const h = value => String(value ?? '').replace(/[&<>"']/g,char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

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

let portal, course;
function draw(message = '') {
  const { title, introduction, color, signedIn, courses, member } = portal || { title: 'Portal do cliente' };
  document.title = title;
  if (/^#[\da-f]{6}$/i.test(color)) document.body.style.setProperty('--portal-color',color);
  const library = `<section class="cp-library" id="cursos"><h2>Meus cursos</h2>
    ${courses?.length ? `<div class="cp-course-grid">${courses.map(item => `<article class="cp-public-card">
      <div class="cp-course-icon">${icon('book',24)}</div><h3>${h(item.name)}</h3>
      ${item.description ? `<p>${h(item.description)}</p>` : ''}
      <button type="button" class="cp-public-link" data-course="${h(item.id)}">Abrir aula ${icon('right',16)}</button>
    </article>`).join('')}</div>` : '<p class="cp-public-card">Você ainda não tem cursos liberados.</p>'}</section>`;
  root.innerHTML = `<div class="cp-public-shell"><header class="cp-public-header">
      <div class="cp-public-brand">${icon('lock',20)}<span>${h(title)}</span></div>
      ${signedIn ? '<button type="button" class="cp-public-link" data-portal-public="logout">Sair</button>' : ''}
    </header>
    ${message ? `<p class="cp-public-error" role="alert">${h(message)}</p>` : ''}
    ${signedIn ? (course ? `<article class="cp-public-card cp-lesson">
      <button type="button" class="cp-public-link" data-portal-public="back">${icon('left',16)} Meus cursos</button>
      <p>${h(course.name)}</p><h1>${h(course.lesson)}</h1><div class="cp-lesson-body">${h(course.body)}</div>
    </article>` : `<section class="cp-public-welcome">
      <h1>${member?.name ? `Olá, ${h(member.name)}` : 'Bem-vindo ao portal'}</h1>
      ${introduction ? `<p>${h(introduction)}</p>` : ''}</section>${library}`) :
      `<section class="cp-public-card cp-signin"><div class="cp-course-icon">${icon('key',24)}</div>
        <h1>Acesse seu portal</h1>
        ${access ? '<p>Confirme para entrar com o seu link de acesso.</p><button type="button" class="cp-public-primary" data-portal-public="enter">Entrar no portal</button>' :
          '<p>Peça um link de acesso à equipe responsável por seus cursos.</p>'}</section>`}
  </div>`;
}

root.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.portalPublic;
  button.disabled = true;
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
    } else if (button.dataset.course) {
      course = (await api(`course/${encodeURIComponent(button.dataset.course)}`)).course;
    }
    draw();
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
