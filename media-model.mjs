// Media Storage: files kept inline as data URLs, organized in nested folders, with a trash that can be
// restored or emptied. Upload by URL is fetched server-side and parsed here.
export const mediaCollections = ['mediaFolders'];
export const mediaLimitBytes = 700_000;

// Accepted MIME types and the filter group each one belongs to.
export const mediaTypes = {
  'image/png': 'photo', 'image/jpeg': 'photo', 'image/gif': 'photo', 'image/webp': 'photo',
  'video/mp4': 'video', 'video/webm': 'video',
  'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio',
  'application/pdf': 'doc', 'text/plain': 'doc', 'text/csv': 'doc'
};

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const now = () => new Date().toISOString();
const dataPattern = /^data:([a-z]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/]+=*$/;

export const mediaMime = data => String(data || '').slice(5, String(data || '').indexOf(';'));
export const mediaKind = data => mediaTypes[mediaMime(data)] || 'other';

export function mediaFile(value) {
  const type = typeof value === 'string' && value.length <= 1_000_000 && value.match(dataPattern)?.[1];
  if (!type || !mediaTypes[type]) fail('Escolha um arquivo de imagem, vídeo, áudio, PDF, TXT ou CSV de até 700 KB.');
  return value;
}

const folderParent = (s, value, self) => {
  const id = str(value, 60);
  if (!id) return '';
  const folders = new Map(s.mediaFolders.map(folder => [folder.id, folder]));
  if (!folders.has(id)) fail('Pasta não encontrada.', 404);
  for (let cursor = id; cursor; cursor = folders.get(cursor)?.parentId) {
    if (self && cursor === self) fail('Uma pasta não pode ficar dentro dela mesma.');
  }
  return id;
};

export const mediaFields = {
  files: (s, d) => {
    const prior = d.id ? s.files.find(row => row.id === d.id) : null;
    return {
      name: str(d.name ?? prior?.name, 240) || fail('Dê um nome ao arquivo.'),
      data: d.data === undefined && prior ? prior.data : mediaFile(d.data),
      folderId: d.folderId === undefined ? prior?.folderId || '' : folderParent(s, d.folderId),
      trashedAt: prior?.trashedAt || ''
    };
  },
  mediaFolders: (s, d) => {
    if (!d.id && s.mediaFolders.length >= 200) fail('O limite é de 200 pastas por subconta.');
    return { name: str(d.name, 100) || fail('Informe o nome da pasta.'), parentId: folderParent(s, d.parentId, d.id) };
  }
};

// A deleted folder hands its files and subfolders to its own parent, so nothing is lost by accident.
export function mediaBeforeDelete(s, key, id) {
  if (key !== 'mediaFolders') return;
  const parent = s.mediaFolders.find(folder => folder.id === id)?.parentId || '';
  for (const file of s.files) if (file.folderId === id) file.folderId = parent;
  for (const folder of s.mediaFolders) if (folder.parentId === id) folder.parentId = parent;
}

const chosen = (s, d) => {
  const ids = Array.isArray(d?.ids) ? new Set(d.ids.slice(0, 200)) : new Set();
  return s.files.filter(file => ids.has(file.id));
};

export const mediaCommandTypes = ['media-trash', 'media-restore', 'media-empty-trash'];

export function mediaCommand(s, type, d, remove) {
  if (type === 'media-trash') {
    const stamp = now();
    for (const file of chosen(s, d)) file.trashedAt ||= stamp;
  } else if (type === 'media-restore') {
    for (const file of chosen(s, d)) {
      file.trashedAt = '';
      if (file.folderId && !s.mediaFolders.some(folder => folder.id === file.folderId)) file.folderId = '';
    }
  } else if (type === 'media-empty-trash') {
    for (const file of s.files.filter(row => row.trashedAt)) remove(s, 'files', file.id);
  }
  return '';
}

// Turns a fetched response into a file record, or explains why the link cannot be imported.
export function importedFile(response, address) {
  if (response.status !== 200) fail(`O endereço respondeu com o status ${response.status}.`, 422);
  const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!mediaTypes[type]) fail('Use um link direto para o arquivo (imagem, vídeo, áudio ou documento). Páginas como YouTube, Vimeo ou Loom não são aceitas.', 422);
  const declared = Number(response.headers['content-length']);
  if (response.truncated || response.body.length > mediaLimitBytes || declared > mediaLimitBytes) fail('O arquivo tem mais de 700 KB.', 413);
  if (!response.body.length) fail('O arquivo está vazio.', 422);
  let name = '';
  try { name = decodeURIComponent(new URL(address).pathname.split('/').filter(Boolean).pop() || ''); } catch { /* keep fallback */ }
  return { name: str(name, 240) || 'arquivo-importado', data: `data:${type};base64,${response.body.toString('base64')}` };
}
