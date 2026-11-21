// Reputation, part 2: review widgets for websites and video testimonials. Videos never live in the
// workspace state: they are uploaded in chunks to their own rows (media-<workspace>-<video>-<n>) and the
// state keeps only the metadata. New testimonials wait for approval before any public page shows them.
import { randomUUID } from 'node:crypto';

export const mediaCollections = ['reviewWidgets', 'videoCollectors', 'videoTestimonials', 'videoUploads'];
export const widgetLayouts = [['carousel', 'Carrossel'], ['grid', 'Grade'], ['list', 'Lista'], ['badge', 'Selo com a nota']];
export const widgetThemes = [['auto', 'Automático (claro ou escuro, como o aparelho do visitante)'], ['light', 'Claro'], ['dark', 'Escuro']];
export const videoMimes = ['video/webm', 'video/mp4', 'video/quicktime'];
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024;
export const CHUNK_BYTES = 700 * 1024;
const UPLOAD_TTL = 60 * 60000;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clip = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const pick = (value, list, fallback) => (list.some(([id]) => id === value) ? value : fallback);
const int = (value, min, max, fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

export const mediaRowId = (workspace, videoId, index) => `media-${workspace}-${videoId}-${index}`;

export const mediaFields = {
  reviewWidgets: (s, d) => ({
    name: clip(d.name, 80) || fail('Dê um nome ao widget.'), title: clip(d.title, 120),
    layout: pick(d.layout, widgetLayouts, 'carousel'), theme: pick(d.theme, widgetThemes, 'auto'),
    accent: /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent.toLowerCase() : '#d6246e',
    minScore: int(d.minScore, 1, 5, 4), max: int(d.max, 1, 30, 9),
    showReplies: d.showReplies === true || d.showReplies === 'on', showVideos: d.showVideos === true || d.showVideos === 'on',
    active: d.active !== false && d.active !== 'off'
  }),
  videoCollectors: (s, d) => ({
    name: clip(d.name, 80) || fail('Dê um nome ao coletor.'),
    question: clip(d.question, 300) || fail('Escreva a pergunta que a pessoa vai responder no vídeo.'),
    maxSeconds: int(d.maxSeconds, 15, 120, 60), thanks: clip(d.thanks, 300) || 'Obrigado! Seu depoimento foi enviado.',
    active: d.active !== false && d.active !== 'off'
  }),
  // Testimonials are created only by the public upload; the team changes the status or the shown name.
  videoTestimonials: (s, d) => {
    if (!s.videoTestimonials.some(row => row.id === d.id)) fail('Os depoimentos chegam pelo link do coletor.');
    return { status: pick(d.status, [['pending'], ['approved'], ['hidden']], 'pending'), name: clip(d.name, 80) || 'Cliente' };
  }
};

export function startVideoUpload(s, collectorId, d) {
  const collector = s.videoCollectors.find(row => row.id === collectorId && row.active) || fail('Este link de depoimento não está ativo.', 404);
  const mime = String(d.mime || '').split(';')[0].trim().toLowerCase();
  if (!videoMimes.includes(mime)) fail('Envie o vídeo em WebM, MP4 ou MOV.');
  const size = Number(d.size);
  if (!Number.isInteger(size) || size < 1000) fail('O vídeo está vazio.');
  if (size > VIDEO_MAX_BYTES) fail('O vídeo passa de 15 MB. Grave um depoimento mais curto.', 413);
  const seconds = Number(d.seconds) || 0;
  if (seconds > collector.maxSeconds + 5) fail(`O depoimento pode ter até ${collector.maxSeconds} segundos.`);
  const now = Date.now();
  s.videoUploads = (s.videoUploads || []).filter(row => now - Date.parse(row.created) < UPLOAD_TTL);
  if (s.videoUploads.filter(row => row.collectorId === collectorId).length >= 20) fail('Muitos envios em andamento. Tente de novo em alguns minutos.', 429);
  if (s.videoTestimonials.length >= 200) fail('Esta empresa já recebeu o máximo de depoimentos. Fale com ela.', 409);
  const upload = { id: randomUUID(), collectorId, mime, size, seconds: Math.round(seconds), total: Math.ceil(size / CHUNK_BYTES), received: 0, bytes: 0, created: new Date(now).toISOString() };
  s.videoUploads.push(upload);
  return { uploadId: upload.id, chunkBytes: CHUNK_BYTES, total: upload.total };
}

// Checks one chunk against the upload (order and size). The caller stores the bytes in its own row.
export function acceptVideoChunk(s, collectorId, d) {
  const upload = (s.videoUploads || []).find(row => row.id === d.uploadId && row.collectorId === collectorId) || fail('Envio não encontrado. Comece de novo.', 404);
  const index = Number(d.index);
  if (index !== upload.received) fail('Parte fora de ordem. Comece de novo.', 409);
  const data = typeof d.data === 'string' && /^[A-Za-z0-9+/]+=*$/.test(d.data) ? d.data : fail('Parte do vídeo inválida.');
  const bytes = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  const last = index === upload.total - 1;
  if (bytes < 1 || bytes > CHUNK_BYTES || (!last && bytes !== CHUNK_BYTES) || upload.bytes + bytes > upload.size) fail('Parte do vídeo com tamanho inesperado.');
  if (index === 0) {
    const head = Buffer.from(data.slice(0, 24), 'base64');
    const webm = head.readUInt32BE(0) === 0x1a45dfa3;
    const mp4 = head.subarray(4, 8).toString('latin1') === 'ftyp';
    if (!(upload.mime === 'video/webm' ? webm : mp4)) fail('O arquivo não parece um vídeo válido.');
  }
  upload.received += 1;
  upload.bytes += bytes;
  return { index, data, upload };
}

export function finishVideoUpload(s, collectorId, d, { emit }) {
  const upload = (s.videoUploads || []).find(row => row.id === d.uploadId && row.collectorId === collectorId) || fail('Envio não encontrado. Comece de novo.', 404);
  if (upload.received !== upload.total || upload.bytes !== upload.size) fail('O vídeo não chegou inteiro. Tente enviar de novo.', 409);
  if (d.consent !== true) fail('Marque a autorização para a empresa usar o seu depoimento.');
  const name = clip(d.name, 80) || fail('Diga o seu nome.');
  const email = clip(d.email, 160).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Use um e-mail válido ou deixe em branco.');
  const contact = email ? s.contacts.find(row => String(row.email || '').toLowerCase() === email) : null;
  const at = new Date().toISOString();
  const row = { id: upload.id, collectorId, name, email, contactId: contact?.id || '', consent: true, consentAt: at, mime: upload.mime, size: upload.size,
    seconds: upload.seconds, chunks: upload.total, status: 'pending', created: at, updated: at };
  s.videoTestimonials.unshift(row);
  s.videoUploads = s.videoUploads.filter(item => item.id !== upload.id);
  emit(s, 'video_testimonial', { contactId: row.contactId, collectorId });
  return row;
}

const initial = name => {
  const [first = '', ...rest] = String(name || 'Cliente').trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)[0].toUpperCase()}.` : first;
};

// What a public widget may show: approved content only, names shortened, nothing about contacts.
export function widgetContent(s, widget) {
  const reviews = [...(s.reviews || [])].filter(row => !row.hidden && Number(row.score) >= widget.minScore && String(row.text || '').trim() && row.text !== '(sem comentário)')
    .sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, widget.max)
    .map(row => ({ author: initial(row.author), score: Number(row.score), text: String(row.text).slice(0, 600), reply: widget.showReplies ? String(row.reply || '').slice(0, 400) : '', date: String(row.created || '').slice(0, 10) }));
  const all = s.reviews || [];
  const average = all.length ? all.reduce((sum, row) => sum + Number(row.score || 0), 0) / all.length : 0;
  const videos = widget.showVideos ? (s.videoTestimonials || []).filter(row => row.status === 'approved').slice(0, 6).map(row => ({ id: row.id, name: initial(row.name), mime: row.mime })) : [];
  return { reviews, videos, average, total: all.length };
}
