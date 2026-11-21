// Courses 6.4: the course's look (theme tokens shared with communities), its product page (instructor, progress,
// cross-sell) and lesson page options, the checkout offer it points to, and the credentials issued automatically:
// an enrollment badge when the student first opens the course and a completion certificate at 100%.
import { randomBytes } from 'node:crypto';
import { themePresets, themeTokens } from './ui/community-data.js';

export const credentialCollections = ['credentialsIssued'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const image = (s, id, label) => { const value = str(id, 60); if (value && !s.files.some(file => file.id === value && file.data.startsWith('data:image/'))) fail(`${label} precisa ser uma imagem da Mídia Drive.`); return value; };

export const defaultCredentials = () => ({ badge: { enabled: true, title: 'Aluno matriculado' }, certificate: { enabled: true, title: 'Certificado de conclusão', signer: '', signerRole: '' } });

/** Theme, instructor, page options, credentials and checkout offer of a course, merged over what it had. */
export function courseExtras(s, d, prior = {}) {
  const pick = key => d[key] === undefined ? prior[key] : d[key];
  const themeInput = pick('theme') || null;
  let theme = null;
  if (themeInput) {
    const preset = themePresets.find(row => row.id === themeInput.preset);
    theme = { preset: preset ? preset.id : 'custom', tokens: Object.fromEntries(themeTokens.map(([key, label]) => {
      const value = String(themeInput.tokens?.[key] ?? preset?.tokens[key] ?? themePresets[0].tokens[key]).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(value)) fail(`A cor "${label}" precisa estar no formato #RRGGBB.`);
      return [key, value];
    })) };
  }
  const instructorInput = pick('instructor') || {};
  const instructor = { name: str(instructorInput.name, 80), title: str(instructorInput.title, 80), bio: str(instructorInput.bio, 1000), photoFileId: image(s, instructorInput.photoFileId, 'A foto do instrutor') };
  const pageInput = pick('page') || {};
  const crossSellOfferId = str(pageInput.crossSellOfferId, 60);
  if (crossSellOfferId && !s.offers.some(row => row.id === crossSellOfferId)) fail('Escolha uma oferta desta subconta para a oferta cruzada.');
  const page = { productPage: pageInput.productPage !== false, showInstructor: pageInput.showInstructor !== false, showProgress: pageInput.showProgress !== false,
    crossSellOfferId, crossSellText: str(pageInput.crossSellText, 200), nextCard: pageInput.nextCard !== false, autoComplete: Boolean(pageInput.autoComplete) };
  const credInput = pick('credentials') || {};
  const template = (id, kind) => { const value = str(id, 60); if (value && !(s.certificateTemplates || []).some(row => row.id === value && row.kind === kind)) fail('Escolha um modelo de certificado desta subconta.'); return value; };
  const credentials = {
    badge: { enabled: Boolean(credInput.badge?.enabled), title: str(credInput.badge?.title, 80) || 'Aluno matriculado', templateId: template(credInput.badge?.templateId, 'badge') },
    certificate: { enabled: Boolean(credInput.certificate?.enabled), title: str(credInput.certificate?.title, 120) || 'Certificado de conclusão',
      signer: str(credInput.certificate?.signer, 80), signerRole: str(credInput.certificate?.signerRole, 80), templateId: template(credInput.certificate?.templateId, 'certificate') }
  };
  const offerId = str(pick('offerId'), 60);
  if (offerId && !s.offers.some(row => row.id === offerId)) fail('A oferta de checkout do curso não existe mais.');
  return { theme, instructor, page, credentials, offerId };
}

/** Deleting an offer unlinks it from the courses that sold through it or cross-sold it. */
export function courseOfferBeforeDelete(s, key, id) {
  if (key !== 'offers') return;
  for (const course of s.courses || []) {
    if (course.offerId === id) course.offerId = '';
    if (course.page?.crossSellOfferId === id) course.page.crossSellOfferId = '';
  }
}

const code = () => randomBytes(6).toString('hex').toUpperCase();

/**
 * 'course-credential': the badge (kind 'badge') or the certificate (kind 'certificate') of a course for one
 * student, once. Fires "Badge emitido" / "Certificado emitido" (and "Curso concluído" with the certificate).
 */
export function issueCredential(s, d, { add, run, contactFor }) {
  const course = s.courses.find(row => row.id === d.courseId) || fail('Curso não encontrado.', 404);
  const kind = d.kind === 'certificate' ? 'certificate' : 'badge';
  const memberId = str(d.memberId, 60) || fail('Aluno não informado.');
  const rows = s.credentialsIssued ||= [];
  const existing = rows.find(row => row.kind === kind && row.courseId === course.id && row.memberId === memberId && !row.revokedAt);
  if (existing) return existing.id;
  const config = course.credentials?.[kind];
  if (!config?.enabled) return '';
  const contact = contactFor();
  const look = config.templateId && (s.certificateTemplates || []).find(row => row.id === config.templateId);
  const row = add(s, 'credentialsIssued', { kind, courseId: course.id, memberId, contactId: contact?.id || '', name: str(d.name, 120) || contact?.name || '', email: str(d.email, 254),
    title: look?.title || config.title, courseName: course.name, signer: look?.signer || config.signer || '', signerRole: look?.signerRole || config.signerRole || '',
    templateId: look?.id || '', code: code(), issuedAt: new Date().toISOString(), source: 'course' });
  if (rows.length > 20000) rows.splice(0, rows.length - 20000);
  if (contact) {
    run(s, kind === 'certificate' ? 'certificate_issued' : 'badge_issued', { contactId: contact.id, courseId: course.id, title: config.title, course: course.name, code: row.code });
    if (kind === 'certificate') run(s, 'course_completed', { contactId: contact.id, courseId: course.id, course: course.name });
  }
  return row.id;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const certificateCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** The public, printable certificate (or badge) page, also used to verify the code. */
export function certificatePage(state, row) {
  const look = row.templateId && (state.certificateTemplates || []).find(item => item.id === row.templateId);
  const color = look?.color || state.courses.find(course => course.id === row.courseId)?.theme?.tokens?.primary || '#b71889';
  const logo = look?.logoFileId && state.files.find(file => file.id === look.logoFileId && file.data.startsWith('data:image/'))?.data;
  const style = look?.style || 'classico';
  const zone = state.profile?.timezone || 'America/Sao_Paulo';
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: zone }).format(new Date(row.issuedAt));
  const badge = row.kind === 'badge';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(row.title)} · ${esc(row.name)}</title><style>
:root{--c:${esc(color)}}*{box-sizing:border-box}body{margin:0;background:#f4f2f5;font:16px/1.5 Georgia,'Times New Roman',serif;color:#1d1720;display:grid;place-items:center;min-height:100vh;padding:24px}
.sheet{width:min(960px,100%);aspect-ratio:1.414;background:#fff;border:14px solid var(--c);outline:2px solid color-mix(in srgb,var(--c) 40%,white);outline-offset:-28px;padding:7% 8%;display:grid;align-content:center;justify-items:center;text-align:center;gap:10px}
.kicker{font:600 13px/1 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--c)}h1{margin:0;font-size:clamp(26px,4.4vw,44px);font-weight:400}
.name{font-size:clamp(28px,5vw,52px);font-style:italic;border-bottom:2px solid color-mix(in srgb,var(--c) 50%,white);padding:0 24px 6px;margin:8px 0}
.course{font-size:clamp(17px,2.4vw,24px);max-width:80%}.meta{display:flex;gap:48px;justify-content:center;margin-top:24px;font:14px/1.4 system-ui,sans-serif;color:#5d5560;flex-wrap:wrap}
.meta b{display:block;color:#1d1720;font-size:15px}.seal{width:92px;height:92px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font:700 34px/1 system-ui,sans-serif;margin-bottom:6px}
.code{font:12px/1.4 ui-monospace,monospace;color:#7a727d;margin-top:18px}.logo{max-height:64px;max-width:200px;object-fit:contain}.extra{max-width:80%;color:#5d5560}
.revoked{background:#fdeeed;color:#b42318;border:1px solid #f4b4ae;border-radius:10px;padding:10px 16px;font:600 14px system-ui,sans-serif}
.moderno .sheet{border:0;outline:0;border-left:18px solid var(--c);font-family:system-ui,sans-serif}.moderno h1{font-weight:800;letter-spacing:-.02em}.moderno .name{font-style:normal;font-weight:700}
.minimalista .sheet{border:1px solid #e3dfe5;outline:0}.minimalista h1{font-size:clamp(22px,3.4vw,34px)}.minimalista .name{border-bottom-width:1px}.print{margin-top:18px;font:600 14px system-ui,sans-serif;background:var(--c);color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer}
@media print{body{background:#fff;padding:0}.print{display:none}.sheet{width:100%;border-width:10px}}
</style></head><body class="${esc(style)}"><main class="sheet">
${row.revokedAt ? '<p class="revoked" role="alert">Este certificado foi revogado e não é mais válido.</p>' : ''}
${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ''}${badge ? '<div class="seal" aria-hidden="true">★</div>' : ''}<p class="kicker">${esc(state.profile?.name || '')}</p><h1>${esc(row.title)}</h1>
<p>${esc(look?.lead || (badge ? 'Concedido a' : 'Certificamos que'))}</p><p class="name">${esc(row.name || row.email)}</p>
<p class="course">${esc(look?.verb || (badge ? 'matriculou-se no curso' : 'concluiu o curso'))} <b>${esc(row.courseName)}</b></p>${look?.body ? `<p class="extra">${esc(look.body)}</p>` : ''}
<div class="meta"><span>Data<b>${esc(date)}</b></span>${row.signer ? `<span>${esc(row.signerRole || 'Responsável')}<b>${esc(row.signer)}</b></span>` : ''}</div>
<p class="code">Código de verificação: ${esc(row.code)}</p>
<button class="print" type="button" onclick="print()">Imprimir ou salvar em PDF</button></main></body></html>`;
}
