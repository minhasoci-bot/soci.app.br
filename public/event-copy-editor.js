// Editor de copy das mensagens do Planejador de eventos.
// O texto é guardado já no formato do WhatsApp (*negrito*, _itálico_, ~tachado~, listas com "- " e "1. "),
// então o que a equipe vê na prévia é o que sai no envio. "## Título" separa várias mensagens dentro do mesmo item.

const h = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const inlineMarks = { bold: '*', italic: '_', strike: '~' };

// O WhatsApp só formata quando o marcador encosta no texto e fecha na mesma linha: espaços das pontas (o duplo clique
// do Windows leva um), quebras de linha e prefixos de lista ficam fora do marcador.
const parts = line => line.match(/^(\s*(?:(?:-|\d+\.)\s+)?)(.*?)(\s*)$/).slice(1);
const isMarked = (text, char) => text.length > 1 && text.startsWith(char) && text.endsWith(char);
function inlineMark(value, start, end, char) {
  if (start === end) return { text: value.slice(0, start) + char + char + value.slice(end), start: start + 1, end: start + 1 };
  const lines = value.slice(start, end).split('\n').map(parts), filled = lines.filter(([, core]) => core);
  if (!filled.length) return { text: value, start, end };
  if (lines.length > 1) {
    const clear = filled.every(([, core]) => isMarked(core, char));
    const block = lines.map(([before, core, after]) => before + (!core ? '' : clear ? core.slice(1, -1) : isMarked(core, char) ? core : char + core + char) + after).join('\n');
    return { text: value.slice(0, start) + block + value.slice(end), start, end: start + block.length };
  }
  const [before, core] = lines[0], from = start + before.length, to = from + core.length;
  if (isMarked(core, char)) return { text: value.slice(0, from) + core.slice(1, -1) + value.slice(to), start: from, end: to - 2 };
  if (from > 0 && value[from - 1] === char && value[to] === char) return { text: value.slice(0, from - 1) + core + value.slice(to + 1), start: from - 1, end: to - 1 };
  return { text: value.slice(0, from) + char + core + char + value.slice(to), start: from + 1, end: to + 1 };
}
export function applyMark(text, start, end, mark) {
  const value = String(text ?? '');
  if (inlineMarks[mark]) return inlineMark(value, start, end, inlineMarks[mark]);
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const next = value.indexOf('\n', Math.max(end, start));
  const lineEnd = next === -1 ? value.length : next;
  const block = value.slice(lineStart, lineEnd).split('\n')
    .map((line, index) => (mark === 'number' ? `${index + 1}. ` : '- ') + line.replace(/^(- |\d+\. )/, ''))
    .join('\n');
  return { text: value.slice(0, lineStart) + block + value.slice(lineEnd), start: lineStart, end: lineStart + block.length };
}

export function insertAt(text, start, end, snippet) {
  const value = String(text ?? '');
  return { text: value.slice(0, start) + snippet + value.slice(end), start: start + snippet.length, end: start + snippet.length };
}

// Marcação inline do WhatsApp: o marcador precisa encostar no texto dos dois lados e fechar na mesma linha.
function inline(escaped) {
  return escaped
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,!?;:)])/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s.,!?;:)])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])~(\S(?:[^~\n]*?\S)?)~(?=$|[\s.,!?;:)])/g, '$1<s>$2</s>');
}

export function whatsappHtml(text) {
  const out = [];
  for (const paragraph of String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    let lines = [], list = null;
    const flushLines = () => { if (lines.length) out.push(`<p>${lines.join('<br>')}</p>`); lines = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map(item => `<li>${item}</li>`).join('')}</${list.tag}>`); list = null; };
    for (const raw of paragraph.split('\n')) {
      const heading = raw.match(/^##\s+(.+)$/);
      const bullet = raw.match(/^-\s+(.+)$/);
      const numbered = raw.match(/^\d+\.\s+(.+)$/);
      if (heading) { flushLines(); flushList(); out.push(`<h4>${inline(h(heading[1]))}</h4>`); continue; }
      const tag = bullet ? 'ul' : numbered ? 'ol' : '';
      if (tag) {
        flushLines();
        if (list?.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(inline(h((bullet || numbered)[1])));
        continue;
      }
      flushList();
      if (raw.trim()) lines.push(inline(h(raw)));
    }
    flushLines(); flushList();
  }
  return out.join('');
}

const toolbar = [
  ['bold', 'Negrito', '<b>N</b>'], ['italic', 'Itálico', '<i>I</i>'], ['strike', 'Tachado', '<s>T</s>'],
  ['bullet', 'Lista com marcadores', '• Lista'], ['number', 'Lista numerada', '1. Lista']
];

export function copyEditorField({ name, value = '', variables = [], label = 'Texto da mensagem' }) {
  const buttons = toolbar.map(([mark, title, glyph]) => `<button type="button" class="ec-tool" data-ec-mark="${mark}" title="${title}" aria-label="${title}">${glyph}</button>`).join('');
  const vars = variables.length ? `<select class="ec-var" data-ec-var aria-label="Inserir variável"><option value="">Inserir variável</option>${variables.map(([token, title]) => `<option value="${h(token)}">${h(title)}</option>`).join('')}</select>` : '';
  return `<div class="ec" data-ec><span class="ec-label">${h(label)}</span><div class="ec-toolbar" role="toolbar" aria-label="Formatação">${buttons}${vars}</div><div class="ec-panes"><textarea class="ec-input" name="${h(name)}" rows="10" maxlength="10000" aria-label="${h(label)}">${h(value)}</textarea><div class="ec-preview" aria-live="polite" aria-label="Prévia">${whatsappHtml(value)}</div></div><small class="dim">*negrito* · _itálico_ · ~tachado~ · "## Título" separa mensagens.</small></div>`;
}

// Troca o texto pela edição do próprio navegador, que mantém o Ctrl+Z; atribuir .value apagaria o histórico.
export function replaceText(input, text, start = text.length, end = start) {
  input.focus();
  input.setSelectionRange(0, input.value.length);
  if (!document.execCommand('insertText', false, text)) {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.setSelectionRange(start, end);
}

export function bindCopyEditor(root) {
  for (const editor of root.querySelectorAll('[data-ec]')) {
    const input = editor.querySelector('textarea');
    const preview = editor.querySelector('.ec-preview');
    if (!input || !preview || editor.dataset.ecBound) continue;
    editor.dataset.ecBound = '1';
    const update = next => replaceText(input, next.text, next.start, next.end);
    input.addEventListener('input', () => { preview.innerHTML = whatsappHtml(input.value); });
    editor.addEventListener('mousedown', event => { if (event.target.closest('[data-ec-mark]')) event.preventDefault(); });
    editor.addEventListener('click', event => {
      const button = event.target.closest('[data-ec-mark]');
      if (button) update(applyMark(input.value, input.selectionStart, input.selectionEnd, button.dataset.ecMark));
    });
    editor.querySelector('[data-ec-var]')?.addEventListener('change', event => {
      if (!event.target.value) return;
      update(insertAt(input.value, input.selectionStart, input.selectionEnd, event.target.value));
      event.target.value = '';
    });
  }
}
