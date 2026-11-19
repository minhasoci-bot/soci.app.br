import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { memberCourse, memberCourseCard } from './course-model.mjs';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const emailOf = value => text(value, 254).toLowerCase();
const secret = () => randomBytes(32).toString('base64url');
const digest = token => createHash('sha256').update(token).digest('hex');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const sessionSeconds = 8 * 60 * 60;
const linkSeconds = { magic: 15 * 60, login: 24 * 60 * 60, invite: 7 * 24 * 60 * 60 };
const linkLifetime = { magic: '15 minutos', login: '24 horas', invite: '7 dias' };
const portalId = workspace => `portal-${workspace}`;
const portalPath = workspace => `/portal/${workspace}`;
const blankPortal = () => ({
  profile: { name: 'Portal do cliente' },
  settings: { title: '', introduction: '', color: '#b71889', enabled: true },
  members: [], links: [], sessions: []
});

export function portalCookie(req, res, workspace, token, secure) {
  const name = secure ? '__Secure-soci_portal' : 'soci_portal';
  if (token !== undefined) {
    res.appendHeader('Set-Cookie', `${name}=${token}; Path=/api/client-portal/${workspace}/; HttpOnly; SameSite=Lax; Max-Age=${token ? sessionSeconds : 0}${secure ? '; Secure' : ''}`);
    return;
  }
  const prefix = name + '=';
  return req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length) || '';
}

function courseIds(state, input) {
  if (!Array.isArray(input) || input.length > 500 || input.some(id => !state.courses.some(course => course.id === id))) {
    fail('Selecione cursos desta subconta.');
  }
  return [...new Set(input)];
}

// Remembers when each course was granted, so drip lessons count days from that moment.
function grant(member, ids) {
  const at = new Date().toISOString(), previous = new Set(member.courseIds || []);
  member.grantedAt = Object.fromEntries(ids.map(id => [id, previous.has(id) && member.grantedAt?.[id] || at]));
  member.courseIds = ids;
}

function recipient(state, input, action) {
  const contact = input.contactId && state.contacts.find(row => row.id === input.contactId);
  if (input.contactId && !contact) fail('Contato não encontrado nesta subconta.', 404);
  if (!contact && action !== 'invite') fail('Selecione um contato para gerar o link.');
  const email = emailOf(contact ? contact.email : input.email);
  if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email)) fail('Informe um e-mail válido.');
  return { email, name: contact?.name || '', contactId: contact?.id || '' };
}

function person(doc, address) {
  return (address.contactId && doc.members.find(member => address.contactId === member.contactId)) ||
    doc.members.find(member => member.email === address.email);
}

export function makeClientPortal({
  store, mailKey = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM,
  publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN, request = fetch
}) {
  let mailOrigin;
  try {
    const url = new URL(publicOrigin);
    if (url.protocol === 'https:' && url.origin === url.href.slice(0, -1)) mailOrigin = url.origin;
  } catch { /* The dashboard exposes when delivery needs configuration. */ }
  const emailConfigured = Boolean(mailKey && from && mailOrigin);

  async function load(workspace) {
    try { return await store.load(portalId(workspace)); }
    catch (error) { if (error.status !== 404) throw error; return null; }
  }

  async function change(workspace, mutate) {
    const id = portalId(workspace);
    try { return await store.change(id, mutate); }
    catch (error) {
      if (error.status !== 404 || error.message !== 'Workspace not found.') throw error;
      await store.insert(id, blankPortal());
      return store.change(id, mutate);
    }
  }

  function view(workspace, doc, state) {
    return {
      title: doc.settings.title || state.profile.name,
      introduction: doc.settings.introduction,
      color: doc.settings.color,
      path: portalPath(workspace)
    };
  }

  function dashboard(workspace, doc, state) {
    return {
      ...view(workspace, doc, state), settings: doc.settings, emailConfigured, mailOrigin,
      stats: {
        invited: doc.members.filter(member => member.invitedAt).length,
        users: doc.members.filter(member => member.joinedAt && !member.revokedAt).length
      },
      members: doc.members
    };
  }

  function requireEnabled(doc) {
    if (!doc.settings.enabled) fail('O portal desta subconta está indisponível.', 404);
  }

  async function deliver(to, url, action, title, fingerprint) {
    const invite = action === 'invite';
    const subject = invite ? 'Convite para o portal do cliente' : 'Seu link de acesso ao portal do cliente';
    let response;
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${mailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `portal-${fingerprint}` },
        body: JSON.stringify({ from, to: [to], subject,
          text: `${subject} de ${title}.\n\nAcesse: ${url}\n\nO link pode ser usado uma vez. Ele expira em ${linkLifetime[action]}.` })
      });
    } catch { fail('O serviço de e-mail não confirmou o envio. Você pode gerar um link para compartilhar.', 502); }
    if (!response.ok) fail('O serviço de e-mail recusou o envio. Verifique a configuração do remetente.', 502);
  }

  async function admin(workspace, state, input) {
    if (!input) return dashboard(workspace, await load(workspace) || blankPortal(), state);
    const { action } = input;
    if (['magic', 'invite', 'login'].includes(action)) {
      const sendEmail = action === 'login' || input.sendEmail === true;
      if (sendEmail && !emailConfigured) fail('O envio por e-mail ainda não foi configurado.', 503);
      const address = action === 'login' && input.memberId ? null : recipient(state, input, action);
      const grants = input.courseIds === undefined ? undefined : courseIds(state, input.courseIds);
      const token = secret(), fingerprint = digest(token);
      const issued = await change(workspace, doc => {
        requireEnabled(doc);
        const now = Date.now(), created = new Date(now).toISOString();
        let member = address ? person(doc, address) : doc.members.find(row => row.id === input.memberId);
        if (!address && !member) fail('Cliente não encontrado.', 404);
        if (member?.revokedAt) fail('Reative o acesso deste cliente antes de gerar um link.', 409);
        if (!member) {
          member = { id: randomUUID(), ...address, courseIds: [], created };
          doc.members.push(member);
        } else if (address?.contactId && !member.contactId) {
          member.contactId = address.contactId;
          member.name ||= address.name;
        }
        if (grants !== undefined) grant(member, grants);
        if (action === 'invite') member.invitedAt = created;
        doc.links = doc.links.filter(link => link.expires > now);
        if (doc.links.filter(link => link.memberId === member.id).length >= 20) {
          fail('Já há vários links ativos para este cliente. Aguarde a expiração de um deles.', 429);
        }
        const expires = now + linkSeconds[action] * 1000;
        doc.links.push({ memberId: member.id, fingerprint, expires });
        return { ...dashboard(workspace, doc, state), expires, email: member.email };
      });
      const accessPath = `${portalPath(workspace)}#access=${token}`;
      if (sendEmail) {
        await deliver(issued.email, mailOrigin + accessPath, action, issued.title, fingerprint);
        return { ...issued, sent: true };
      }
      return { ...issued, accessPath };
    }

    return change(workspace, doc => {
      if (action === 'settings') {
        const color = text(input.color, 8);
        if (!/^#[\da-f]{6}$/i.test(color)) fail('Escolha uma cor válida.');
        doc.settings = { title: text(input.title, 100), introduction: text(input.introduction, 400), color, enabled: input.enabled === true };
        if (!doc.settings.enabled) { doc.links = []; doc.sessions = []; }
      } else if (['permissions', 'revoke', 'reactivate'].includes(action)) {
        const member = doc.members.find(row => row.id === input.id);
        if (!member) fail('Cliente não encontrado.', 404);
        if (action === 'permissions') grant(member, courseIds(state, input.courseIds));
        if (action === 'reactivate') delete member.revokedAt;
        if (action === 'revoke') {
          member.revokedAt = new Date().toISOString();
          doc.links = doc.links.filter(link => link.memberId !== member.id);
          doc.sessions = doc.sessions.filter(session => session.memberId !== member.id);
        }
      } else fail('Ação do portal não encontrada.', 404);
      return dashboard(workspace, doc, state);
    });
  }

  async function exchange(workspace, token) {
    if (!validToken(token)) fail('Este link é inválido, expirou ou já foi usado.', 401);
    const fingerprint = digest(token), sessionToken = secret();
    try {
      return await store.change(portalId(workspace), doc => {
        requireEnabled(doc);
        const now = Date.now();
        const link = doc.links.find(row => row.fingerprint === fingerprint && row.expires > now);
        const member = link && doc.members.find(row => row.id === link.memberId && !row.revokedAt);
        if (!member) fail('Este link é inválido, expirou ou já foi usado.', 401);
        member.joinedAt ||= new Date(now).toISOString();
        doc.links = doc.links.filter(row => row !== link && row.expires > now);
        doc.sessions = doc.sessions.filter(row => row.expires > now);
        doc.sessions.push({ memberId: member.id, fingerprint: digest(sessionToken), expires: now + sessionSeconds * 1000 });
        return sessionToken;
      });
    } catch (error) {
      if (error.status === 404 && error.message === 'Workspace not found.') fail('Este link é inválido, expirou ou já foi usado.', 401);
      throw error;
    }
  }

  async function signOut(workspace, token) {
    if (!validToken(token)) return;
    const fingerprint = digest(token);
    try { await store.change(portalId(workspace), doc => { doc.sessions = doc.sessions.filter(row => row.fingerprint !== fingerprint); }); }
    catch (error) { if (error.status !== 404) throw error; }
  }

  function signedMember(doc, token) {
    const fingerprint = validToken(token) && digest(token);
    const session = fingerprint && doc.sessions.find(row => row.fingerprint === fingerprint && row.expires > Date.now());
    return session && doc.members.find(row => row.id === session.memberId && !row.revokedAt);
  }

  function grantedCourse(state, member, courseId) {
    const course = state.courses.find(row => row.id === courseId && row.active && member.courseIds.includes(row.id));
    if (!course) fail('Curso indisponível para este cliente.', 404);
    return course;
  }

  async function content(workspace, state, token, courseId, lessonId = '') {
    const doc = await load(workspace);
    if (!doc && !courseId) return { ...view(workspace, blankPortal(), { profile: { name: 'Portal do cliente' } }), signedIn: false };
    if (!doc) fail('Entre no portal para acessar sua aula.', 401);
    requireEnabled(doc);
    const member = signedMember(doc, token);
    const base = view(workspace, doc, state);
    if (!member) {
      if (courseId) fail('Entre no portal para acessar sua aula.', 401);
      return { ...base, signedIn: false };
    }
    if (courseId) {
      return { ...base, signedIn: true, member: { name: member.name }, course: memberCourse(state, grantedCourse(state, member, courseId), member, { lessonId }) };
    }
    const courses = state.courses.filter(course => course.active && member.courseIds.includes(course.id));
    return { ...base, signedIn: true, member: { name: member.name }, courses: courses.map(course => memberCourseCard(state, course, member)) };
  }

  // Marks one lesson as done (or not) for the signed-in member and returns the refreshed course.
  async function progress(workspace, state, token, courseId, input) {
    if (typeof input?.lessonId !== 'string' || typeof input.done !== 'boolean') fail('Informe a aula.', 400);
    try {
      return await store.change(portalId(workspace), doc => {
        requireEnabled(doc);
        const member = signedMember(doc, token);
        if (!member) fail('Entre no portal para acessar sua aula.', 401);
        const course = grantedCourse(state, member, courseId);
        memberCourse(state, course, member, { lessonId: input.lessonId });
        member.progress ||= {};
        const done = member.progress[courseId] ||= {};
        if (input.done) done[input.lessonId] ||= new Date().toISOString();
        else delete done[input.lessonId];
        return { ...view(workspace, doc, state), signedIn: true, member: { name: member.name },
          course: memberCourse(state, course, member, { lessonId: input.lessonId }) };
      });
    } catch (error) {
      if (error.status === 404 && error.message === 'Workspace not found.') fail('Entre no portal para acessar sua aula.', 401);
      throw error;
    }
  }

  // The signed-in member and the portal document, for features that build on the portal session.
  async function session(workspace, token) {
    const doc = await load(workspace);
    if (!doc) fail('Entre no portal para acessar a comunidade.', 401);
    requireEnabled(doc);
    const member = signedMember(doc, token);
    if (!member) fail('Entre no portal para acessar a comunidade.', 401);
    return { doc, member };
  }

  // The portal document for staff screens (empty when the portal was never used).
  const directory = async workspace => await load(workspace) || blankPortal();

  return { admin, exchange, signOut, content, progress, session, directory };
}
