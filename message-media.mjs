// Mídia das mensagens recebidas no WhatsApp (imagem, GIF, figurinha, vídeo, áudio e documento).
// Os bytes nunca entram no documento da subconta: com R2, cada arquivo fica em ws/<subconta>/messages/<mensagem>,
// copiado logo depois do webhook ou, se não deu, na primeira abertura. Sem R2, cada abertura busca na Evolution.
import { R2_MAX_BYTES } from './r2-storage.mjs';
import { messageMedia } from './ui/message-media.js';

const fail = (message, status) => Object.assign(new Error(message), { status });

// Só estes tipos abrem na página; o resto (HTML, SVG, executável…) é baixado.
const INLINE = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|3gpp|quicktime)|audio\/(ogg|mpeg|mp4|aac|amr|wav|webm)|application\/pdf)$/;
const servedType = mime => INLINE.test(mime) ? mime : 'application/octet-stream';
const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' };
const fileName = (media, mime) => media.name || `${{ image: 'imagem', video: 'video', gif: 'gif', audio: 'audio', sticker: 'figurinha', document: 'documento' }[media.kind]}${EXTENSION[mime] ? `.${EXTENSION[mime]}` : ''}`;

const keyOf = (workspace, messageId) => `ws/${workspace}/messages/${messageId}`;

/** Mensagens com mídia que ainda existem na subconta, contando as da lixeira de contatos (dá para restaurar). */
export function mediaMessageIds(state) {
  const trashed = (state.contactTrash || []).flatMap(row => row.related?.messages || []);
  return new Set([...(state.messages || []), ...trashed].filter(messageMedia).map(message => message.id));
}

const INDEX_MS = 60_000;

/** load(workspace) → estado · fetchMedia(agencyId, workspace, waId) → { mime, name, bytes } (whatsapp.mjs). redirect(res, key, options): link assinado do R2. */
export function createMessageMedia({ r2, load, fetchMedia, redirect, clock = Date.now }) {
  // Uma conversa com vinte fotos pede vinte arquivos: sem este índice, cada um leria o documento inteiro da subconta.
  const indexes = new Map(); // workspace -> { at, rows: Promise<Map id -> mensagem enxuta> }
  async function indexOf(workspace, freshMs) {
    const kept = indexes.get(workspace);
    if (kept && clock() - kept.at < freshMs) return kept.rows;
    const rows = Promise.resolve().then(() => load(workspace)).then(state => new Map(state.messages.filter(messageMedia)
      .map(({ id, waId, channel, direction, body, media }) => [id, { id, waId, channel, direction, media, body: media ? '' : body }])));
    indexes.set(workspace, { at: clock(), rows });
    rows.catch(() => indexes.delete(workspace));
    return rows;
  }
  const running = new Map(); // a mesma mídia pedida duas vezes ao mesmo tempo é baixada uma vez só

  async function download(agencyId, workspace, message) {
    const file = await fetchMedia(agencyId, workspace, message.waId);
    if (file.bytes.length > R2_MAX_BYTES) throw fail('O arquivo passa de 50 MB.', 413);
    return { ...file, mime: servedType(file.mime) };
  }

  function keep(agencyId, workspace, message) {
    const key = keyOf(workspace, message.id);
    if (!running.has(key)) {
      running.set(key, (async () => {
        const file = await download(agencyId, workspace, message);
        await r2.put(key, file.bytes, file.mime);
        return { type: file.mime };
      })().finally(() => running.delete(key)));
    }
    return running.get(key);
  }

  return {
    enabled: Boolean(r2),
    /** A mensagem com mídia, ou undefined. A que acabou de chegar ainda não está no índice: lê de novo. */
    async find(workspace, id) {
      return (await indexOf(workspace, INDEX_MS)).get(id) || (await indexOf(workspace, 0)).get(id);
    },
    /** Depois do webhook: copia para o R2 uma a uma. O que falhar fica para a primeira abertura. */
    async store(agencyId, workspace, messages) {
      for (const message of messages) {
        try { await keep(agencyId, workspace, message); }
        catch (problem) { console.error(`Message media (${workspace}): ${problem.message}`); }
      }
    },
    async serve({ res, agencyId, workspace, message, attachment = false }) {
      const media = messageMedia(message);
      if (!media) throw fail('Mídia não encontrada.', 404);
      if (r2) {
        const key = keyOf(workspace, message.id);
        const { type } = await r2.head(key) || await keep(agencyId, workspace, message);
        return redirect(res, key, { type, filename: fileName(media, type), attachment: attachment || !INLINE.test(type) });
      }
      const file = await download(agencyId, workspace, message);
      const name = encodeURIComponent(fileName(media, file.mime)).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      res.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': file.bytes.length, 'Cache-Control': 'private, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${attachment || !INLINE.test(file.mime) ? 'attachment' : 'inline'}; filename*=UTF-8''${name}` });
      return res.end(file.bytes);
    },
    /** Apaga do R2 o que saiu de vez (contato excluído da lixeira). Uma falha só deixa um arquivo órfão. */
    async removeMissing(workspace, before, after) {
      indexes.delete(workspace);
      if (!r2) return;
      for (const id of before) if (!after.has(id)) await r2.remove(keyOf(workspace, id)).catch(problem => console.error(`R2 delete (${workspace}): ${problem.message}`));
    }
  };
}
