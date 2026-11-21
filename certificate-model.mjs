// Certificados (6.5): templates for certificates and badges (category, wording, signer, color, style, logo),
// issued by hand, by the "Emitir certificado/badge" workflow actions or by a course; issued ones can be revoked.
// Every issued credential lives in `credentialsIssued` and has a public page with its verification code.
import { randomBytes } from 'node:crypto';
import { certificateCategories, certificateStyles } from './ui/certificate-data.js';

export const certificateCollections = ['certificateTemplates'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const code = () => randomBytes(6).toString('hex').toUpperCase();

export const certificateFields = {
  certificateTemplates: (s, d) => {
    const kind = d.kind === 'badge' ? 'badge' : 'certificate';
    const logoFileId = str(d.logoFileId, 60);
    if (logoFileId && !s.files.some(file => file.id === logoFileId && file.data.startsWith('data:image/'))) fail('O logo precisa ser uma imagem da Mídia Drive.');
    return {
      name: str(d.name, 80) || fail('Dê um nome ao modelo.'), kind,
      category: certificateCategories.some(([key]) => key === d.category) ? d.category : 'completion',
      title: str(d.title, 120) || fail('Escreva o título do certificado.'), lead: str(d.lead, 80), verb: str(d.verb, 80), body: str(d.body, 500),
      signer: str(d.signer, 80), signerRole: str(d.signerRole, 80),
      color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color.toLowerCase() : '#b71889',
      style: certificateStyles.some(([key]) => key === d.style) ? d.style : 'classico', logoFileId
    };
  }
};

/** Courses that issue with a template keep working when it is deleted: they fall back to the default look. */
export function certificateBeforeDelete(s, key, id) {
  if (key !== 'certificateTemplates') return;
  for (const course of s.courses || []) for (const kind of ['badge', 'certificate']) if (course.credentials?.[kind]?.templateId === id) course.credentials[kind].templateId = '';
}

/** One credential from a template for one contact, about `subject` (a course, an event, a goal). Not twice. */
export function issueFromTemplate(s, template, contact, subject, { add, run, source = 'manual', memberId = '', courseId = '' }) {
  const rows = s.credentialsIssued ||= [];
  const about = str(subject, 160);
  const existing = rows.find(row => row.templateId === template.id && row.contactId === contact.id && row.courseName === about && !row.revokedAt);
  if (existing) return existing;
  const row = add(s, 'credentialsIssued', { kind: template.kind, templateId: template.id, courseId, memberId, contactId: contact.id, name: contact.name || contact.email || '', email: contact.email || '',
    title: template.title, courseName: about, signer: template.signer, signerRole: template.signerRole, code: code(), issuedAt: new Date().toISOString(), source });
  if (rows.length > 20000) rows.splice(0, rows.length - 20000);
  run(s, template.kind === 'certificate' ? 'certificate_issued' : 'badge_issued', { contactId: contact.id, courseId, title: template.title, course: about, code: row.code });
  return row;
}

// 'credential-issue' (by hand, to several contacts) and 'credential-revoke'.
export function credentialCommand(s, command, { add, run }) {
  const { type, data: d = {} } = command;
  if (type === 'credential-revoke') {
    const row = (s.credentialsIssued || []).find(item => item.id === command.id) || fail('Certificado não encontrado.', 404);
    if (d.restore) delete row.revokedAt; else row.revokedAt = new Date().toISOString();
    return row.id;
  }
  if (type === 'credential-issue') {
    const template = (s.certificateTemplates || []).find(row => row.id === d.templateId) || fail('Escolha um modelo de certificado.', 404);
    const subject = str(d.subject, 160) || fail('Informe o curso, evento ou conquista do certificado.');
    const ids = [...new Set(Array.isArray(d.contactIds) ? d.contactIds : [])].slice(0, 500);
    if (!ids.length) fail('Escolha pelo menos um contato.');
    const issued = [];
    for (const id of ids) {
      const contact = s.contacts.find(row => row.id === id);
      if (!contact) continue;
      if (!contact.name && !contact.email) fail('O contato precisa de nome ou e-mail.');
      issued.push(issueFromTemplate(s, template, contact, subject, { add, run, source: 'manual' }).id);
    }
    if (!issued.length) fail('Nenhum dos contatos foi encontrado.', 404);
    return issued;
  }
  fail('Comando de certificado desconhecido.');
}
