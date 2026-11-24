// Da copy do planejador ao que sai no WhatsApp. Usado pela tela (prévia) e pelo servidor (envio), para os dois verem o mesmo.
// "## Título" separa mensagens e não é enviado. Títulos internos (roteiro, orientação, nota) ficam de fora com o seu texto.
// "## Enquete · Pergunta" com uma lista vira enquete.

const internal = /^(roteiro|orienta|antes de enviar|nota\b|notas\b)/i;
const poll = /^enquete\b\s*[·:–-]?\s*/i;
const option = /^(?:[-•]|\d+\.)\s+(.+)$/;
const plain = text => text.replace(/^([*_~])(.+)\1$/, '$2').trim();
export const MESSAGE_LIMIT = 4000;

export function messageParts(notes) {
  const sections = [{ title: '', lines: [] }];
  for (const line of String(notes ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const title = line.match(/^##\s+(.+)$/);
    if (title) sections.push({ title: title[1].trim(), lines: [] });
    else sections.at(-1).lines.push(line);
  }
  const parts = [];
  const text = lines => { const value = lines.join('\n').trim(); if (value) parts.push({ kind: 'text', text: value }); };
  for (const { title, lines } of sections) {
    if (internal.test(title)) continue;
    if (!poll.test(title)) { text(lines); continue; }
    const first = lines.findIndex(line => option.test(line.trim()));
    if (first === -1) { text(lines); continue; }
    let last = first;
    while (last + 1 < lines.length && option.test(lines[last + 1].trim())) last++;
    text(lines.slice(0, first));
    parts.push({ kind: 'poll', question: title.replace(poll, '').trim(), options: lines.slice(first, last + 1).map(line => plain(line.trim().match(option)[1])) });
    text(lines.slice(last + 1));
  }
  return parts;
}

const contents = part => part.kind === 'poll' ? [part.question, ...part.options].join('\n') : part.text;
const found = (parts, pattern) => [...new Set(parts.flatMap(part => contents(part).match(pattern) || []))];
export const openMarkers = parts => found(parts, /\[[^[\]\n]+\]/g);

/** Por que a mensagem não pode sair ainda; '' quando pode. */
export function partsProblem(parts, channel) {
  if (!parts.length) return 'A mensagem não tem texto para enviar.';
  const markers = openMarkers(parts);
  if (markers.length) return `Preencha os marcadores: ${markers.join(', ')}.`;
  if (channel === 'grupos' && found(parts, /\{\{\s*contact\./g).length) return 'Mensagem de grupo não pode usar variáveis de contato.';
  const unknown = found(parts, /\{\{[^}]*\}\}/g).filter(token => !/^\{\{\s*contact\.(first_name|name)\s*\}\}$/.test(token));
  if (unknown.length) return `Variável não reconhecida: ${unknown.join(', ')}.`;
  for (const part of parts) {
    if (part.kind === 'poll' && channel !== 'grupos') return 'Enquete só pode ir para grupo.';
    if (part.kind === 'poll' && (part.options.length < 2 || part.options.length > 12)) return 'A enquete precisa de 2 a 12 opções.';
    if (part.kind === 'poll' && !part.question) return 'Escreva a pergunta da enquete.';
    if (contents(part).length > MESSAGE_LIMIT) return 'Cada mensagem pode ter até 4.000 caracteres.';
  }
  return '';
}

/** Aplica as variáveis do contato. Sem nome, some também a vírgula que o acompanhava. */
export function renderPart(part, contact) {
  if (part.kind !== 'text') return part;
  const name = String(contact?.name || '').trim();
  const values = { first_name: name.split(/\s+/)[0] || '', name };
  let text = part.text;
  for (const [key, value] of Object.entries(values)) {
    const token = `\\{\\{\\s*contact\\.${key}\\s*\\}\\}`;
    if (value) { text = text.replace(new RegExp(token, 'g'), () => value); continue; }
    text = text.replace(new RegExp(`(^|\\n)([*_~]?)${token}\\2\\s*,?\\s*(\\S?)`, 'g'), (_all, start, _mark, letter) => start + letter.toUpperCase());
    text = text.replace(new RegExp(`,?[ \\t]*([*_~]?)${token}\\1`, 'g'), '');
  }
  return { ...part, text: text.trim() };
}
