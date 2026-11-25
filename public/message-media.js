// O que uma mensagem mostra além do texto: mídia recebida, anexos por endereço e links.
// Usado pela tela (ui/inbox.js) e pelo servidor (message-media.mjs); sem DOM e sem escapar HTML.
const KINDS = ['image', 'video', 'gif', 'audio', 'document', 'sticker'];

/** O texto que fica no lugar da mídia sem legenda: lista de conversas, busca e fluxos leem daqui. */
export const mediaPlaceholder = (kind, name = '') =>
  kind === 'document' ? `[Documento${name ? `: ${name}` : ''}]` : `[${{ image: 'Imagem', video: 'Vídeo', gif: 'GIF', audio: 'Áudio', sticker: 'Figurinha' }[kind]}]`;

const PLACEHOLDER = /^\[(Imagem|Vídeo|GIF|Áudio|Figurinha|Documento)(?:: ([^\n]+))?\]$/;
const PLACEHOLDER_KIND = { Imagem: 'image', Vídeo: 'video', GIF: 'gif', Áudio: 'audio', Figurinha: 'sticker', Documento: 'document' };

/**
 * A mídia do WhatsApp desta mensagem, ou null. Antes de existir `media`, só o texto [Imagem] era guardado: com o id
 * do WhatsApp, o arquivo ainda pode ser buscado.
 */
export function messageMedia(message) {
  if (!message?.waId || message.channel !== 'WhatsApp' || message.direction !== 'Inbound') return null;
  if (KINDS.includes(message.media?.kind)) return message.media;
  const match = String(message.body || '').match(PLACEHOLDER);
  return match ? { kind: PLACEHOLDER_KIND[match[1]], mime: '', name: match[2] || '', size: 0 } : null;
}

// Anexo por endereço, uma linha por arquivo: "[Imagem: foto.png] https://…" (fluxos) ou "[image] https://…" (Meta).
const ATTACHMENT = /^\[(Imagem|Vídeo|Áudio|Documento|image|video|audio|file|animated_image)(?:: ([^\]\n]+))?\] (https:\/\/\S+)$/;
const ATTACHMENT_KIND = { Imagem: 'image', Vídeo: 'video', Áudio: 'audio', Documento: 'document', image: 'image', animated_image: 'image', video: 'video', audio: 'audio', file: 'document' };
const META_HOST = /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com)$/i;

// O navegador da equipe só abre sozinho o que a subconta enviou ou o que está nos servidores da Meta: um endereço
// escolhido pelo contato revelaria quem abriu a conversa, e quando.
function trusted(message, address) {
  if (message.direction === 'Outbound') return true;
  if (!['Instagram', 'Facebook'].includes(message.channel)) return false;
  try { return META_HOST.test(new URL(address).hostname); } catch { return false; }
}

/** { text, attachments }: o texto que sobra e os anexos. A mídia do WhatsApp não tem `url`; o servidor a entrega. */
export function messageParts(message) {
  const body = String(message.body || ''), media = messageMedia(message);
  if (media) return { text: PLACEHOLDER.test(body) ? '' : body, attachments: [{ kind: media.kind, name: media.name || '', size: media.size || 0, ...(media.width && media.height ? { width: media.width, height: media.height } : {}) }] };
  const attachments = [];
  const lines = body.split('\n').filter(line => {
    const match = line.match(ATTACHMENT);
    if (!match || !trusted(message, match[3])) return true;
    attachments.push({ kind: ATTACHMENT_KIND[match[1]], url: match[3], name: match[2] || '' });
    return false;
  });
  return { text: lines.join('\n'), attachments };
}

// Endereço completo, www., link de rastreamento (/r/…) ou domínio solto. O trecho antes do domínio não pode ser
// parte de um e-mail ou de outra palavra.
const LINK = /https?:\/\/[^\s<>"]+|\/r\/(?:demo|[a-f0-9-]{36})\/[a-f0-9-]{36}|(?<![\w@./-])(?:www\.[^\s<>"]+\.[^\s<>"]+|(?:[a-z0-9-]+\.)+(?:com|br|net|org|io|app)(?![\w.-]*@)(?![a-z0-9-])(?:\/[^\s<>"]*)?|(?:[a-z0-9-]+\.)+[a-z]{2,10}\/[^\s<>"]+)/gi;

// A pontuação da frase não faz parte do endereço; um parêntese só fica se abriu dentro dele.
function trimEnd(value) {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (/[.,;:!?'*~\]}]/.test(char)) end--;
    else if (char === ')' && value.slice(0, end).split('(').length < value.slice(0, end).split(')').length) end--;
    else break;
  }
  return value.slice(0, end);
}

/** O texto em pedaços: { text } ou { text, href }. Juntos, os `text` dão o texto original. */
export function textPieces(value) {
  const source = String(value || ''), out = [];
  let from = 0;
  for (const match of source.matchAll(LINK)) {
    const text = trimEnd(match[0]);
    const href = /^(https?:\/\/|\/r\/)/i.test(text) ? text : `https://${text}`;
    if (!href.startsWith('/')) try { if (!new URL(href).hostname.includes('.') && !/^https?:\/\/localhost/i.test(href)) continue; } catch { continue; }
    if (match.index > from) out.push({ text: source.slice(from, match.index) });
    out.push({ text, href });
    from = match.index + text.length;
  }
  if (from < source.length) out.push({ text: source.slice(from) });
  return out;
}
