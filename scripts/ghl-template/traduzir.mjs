// Tradução dos templates convertidos do GHL para o português, com um dicionário revisável (traducao-pt.json).
//
// Nas páginas, a unidade de tradução é a frase: o texto entre duas tags de bloco, com as tags de formatação de dentro
// (strong, em, span, a, br...) trocadas por marcadores numerados <1>…</1>, <2/>. A tradução devolve os marcadores
// no lugar certo e as tags originais voltam neles, com os atributos intactos. Nos ativos (fluxos, formulários,
// e-mails...), a unidade é o texto inteiro de cada campo de texto.
import { readFileSync } from 'node:fs';

const INLINE = new Set(['a', 'abbr', 'b', 'big', 'br', 'code', 'em', 'font', 'i', 'mark', 'q', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'u']);
const VOID = new Set(['br', 'wbr', 'img', 'input', 'hr', 'meta', 'link', 'source']);
const ATTRS = ['alt', 'placeholder', 'aria-label', 'title'];

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encodeAttr = s => encode(s).replace(/"/g, '&quot;');
const squash = s => s.replace(/\s+/g, ' ').trim();

/** Texto com cara de inglês: palavras comuns do inglês que não existem em português. */
// Fronteiras de palavra que entendem acentos (o \b do JavaScript acha "In" dentro de "Início").
const words = list => new RegExp(`(?<![\\p{L}\\d])(${list})(?![\\p{L}\\d])`, 'giu');
const EN = words(String.raw`the|and|your|you|our|we|with|for|of|to|is|are|get|free|quote|services?|contact|about|home|reviews?|call|now|read|more|learn|book|today|us|privacy|policy|terms|conditions|gallery|areas?|team|clients?|company|business|hours|closed|copyright|rights|reserved|submit|send|thank|thanks|please|here|what|why|how|who|best|quality|professional|lawn|garden|care|maintenance|landscaping|customers?|phone|name|address|message|click|view|browser|week|day|month|years?|experience|satisfaction|guaranteed|request|schedule|appointment|new|page|website|welcome|hello|hi|dear|team|sign|in|out|step|next|back|yes|from|by|at|on|it|this|that|all|any|can|will|have|has|be|does|not|or|if|an|star|feedback|garden|design|directions|process|start|blog|full|type|needed|owner|birth|date|scratch|missed|referral|refer|friend|return|gallery|photo|survey|discount|followup|rate`);
// "lead", "e-mail", "follow-up" e "a"/"do"/"no" (que também são palavras do português) não contam como inglês.
const PT = words('de|do|da|dos|das|que|não|nao|você|voce|seu|sua|para|com|uma|um|o|a|e|os|as|na|no|em|por|mais|é|são|está|olá|obrigad[oa]|aqui|agora|contato|serviços?|página|empresa|nosso|nossa|até|mensal|orçamento|início|solicitar|ilimitado|testes|análise|lead|leads|agendada|interno|criar|ganho|fechamento|captar|consultoria|gratuita|respondeu|qualificação|encaminhamento|cliente|anúncio');
const BRANDS = /^(facebook|instagram|google|youtube|linkedin|tiktok|whatsapp|x|twitter|pinterest|yelp|email|e-mail|ok|cpf|cnpj|crm|nps|ia|ai|faq|seo|sms|url|pix|lorem)$/i;
export function looksEnglish(text) {
  const plain = squash(String(text).replace(/<\/?\d+\/?>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/https?:\/\/\S+/g, ' '));
  // Corpos JSON de webhook e nomes de evento ficam como estão.
  if (!/[a-z]{2}/i.test(plain) || BRANDS.test(plain) || /^[{[]\s*"/.test(String(text).trim())) return false;
  if (/lorem ipsum|dolor sit amet/i.test(plain)) return true;
  const en = (plain.match(EN) || []).length, pt = (plain.match(PT) || []).length;
  return en > pt;
}

/* ───────── Páginas ───────── */

// Quebra o corpo em tokens: tags, comentários e texto. <style> e <script> viram um token só.
function tokens(html) {
  const out = [];
  const re = /<(style|script)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+|</g;
  for (const m of html.matchAll(re)) {
    const raw = m[0];
    if (m[1] || raw.startsWith('<!--')) out.push({ kind: 'block', raw });
    else if (m[2]) {
      const name = m[2].toLowerCase(), close = raw.startsWith('</'), self = VOID.has(name) || /\/>$/.test(raw);
      out.push({ kind: INLINE.has(name) ? 'inline' : 'block', raw, name, close, self });
    } else out.push({ kind: 'text', raw });
  }
  return out;
}

// Uma frase (sequência de texto e tags de formatação) vira { key, tags, lead, tail }: key com marcadores numerados.
function sentence(run) {
  let lead = '', tail = '';
  let parts = run.slice();
  // Tags vazias ou que embrulham a frase inteira ficam de fora da chave.
  const peel = () => {
    let changed = true;
    while (changed && parts.length) {
      changed = false;
      const first = parts[0], last = parts.at(-1);
      if (first.kind === 'text' && !first.raw.trim()) { lead += first.raw; parts.shift(); changed = true; continue; }
      if (last.kind === 'text' && !last.raw.trim()) { tail = last.raw + tail; parts.pop(); changed = true; continue; }
      if (first.kind === 'inline' && (first.self || first.name === 'br')) { lead += first.raw; parts.shift(); changed = true; continue; }
      if (last.kind === 'inline' && (last.self || last.name === 'br')) { tail = last.raw + tail; parts.pop(); changed = true; continue; }
      if (first.kind === 'inline' && !first.close && parts[1]?.kind === 'inline' && parts[1].close && parts[1].name === first.name) { lead += first.raw + parts[1].raw; parts.splice(0, 2); changed = true; continue; }
      if (last.kind === 'inline' && last.close && parts.at(-2)?.kind === 'inline' && !parts.at(-2).close && parts.at(-2).name === last.name) { tail = parts.at(-2).raw + last.raw + tail; parts.splice(-2, 2); changed = true; continue; }
      if (first.kind === 'inline' && !first.close && last.kind === 'inline' && last.close && last.name === first.name) {
        // Só desembrulha se a tag que abre fecha mesmo no fim.
        let depth = 0, wraps = true;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.kind === 'inline' && p.name === first.name && !p.self) depth += p.close ? -1 : 1;
          if (depth === 0 && i < parts.length - 1) { wraps = false; break; }
        }
        if (wraps) { lead += first.raw; tail = last.raw + tail; parts = parts.slice(1, -1); changed = true; }
      }
    }
  };
  peel();
  const tags = [];
  const stack = [];
  let key = '';
  for (const p of parts) {
    if (p.kind === 'text') key += decode(p.raw);
    else if (p.self || p.name === 'br') { tags.push(p.raw); key += `<${tags.length}/>`; }
    else if (!p.close) { tags.push(p.raw); stack.push({ n: tags.length, name: p.name }); key += `<${tags.length}>`; }
    else {
      const at = stack.map(s => s.name).lastIndexOf(p.name);
      const open = at >= 0 ? stack.splice(at, 1)[0] : null;
      if (open) { tags[open.n - 1] = [tags[open.n - 1], p.raw]; key += `</${open.n}>`; }
      else { tags.push(p.raw); key += `<${tags.length}/>`; }
    }
  }
  for (const s of stack) tags[s.n - 1] = [tags[s.n - 1], ''];
  return { key: squash(key), tags, lead, tail, parts };
}

// Recoloca as tags originais nos marcadores da tradução.
function rebuild(text, tags) {
  return text.split(/(<\/?\d+\/?>)/).map(piece => {
    const m = /^<(\/?)(\d+)(\/?)>$/.exec(piece);
    if (!m) return encode(piece);
    const tag = tags[Number(m[2]) - 1];
    if (tag === undefined) return '';
    if (m[3]) return Array.isArray(tag) ? tag.join('') : tag;
    return Array.isArray(tag) ? tag[m[1] ? 1 : 0] : (m[1] ? '' : tag);
  }).join('');
}

/** Percorre as frases de uma página. `visit(key)` devolve a tradução (ou undefined para manter). */
export function mapPage(html, visit) {
  const headEnd = html.search(/<body\b/i);
  const head = headEnd < 0 ? '' : html.slice(0, headEnd);
  let body = headEnd < 0 ? html : html.slice(headEnd);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    if (run.some(p => p.kind === 'text' && /[A-Za-z]/.test(p.raw))) {
      const s = sentence(run);
      const translated = s.key ? visit(s.key) : undefined;
      out.push(translated === undefined ? run.map(p => p.raw).join('') : s.lead + rebuild(translated, s.tags) + s.tail);
    } else out.push(run.map(p => p.raw).join(''));
    run = [];
  };
  for (const t of tokens(body)) {
    if (t.kind === 'block') { flush(); out.push(t.raw); } else run.push(t);
  }
  flush();
  body = out.join('');
  const attr = (all, name, value) => {
    const key = squash(decode(value));
    const translated = key && /[A-Za-z]/.test(key) ? visit(key) : undefined;
    return translated === undefined ? all : ` ${name}="${encodeAttr(translated)}"`;
  };
  const attrRe = new RegExp(`\\s(${ATTRS.join('|')})="([^"]*)"`, 'g');
  body = body.replace(/<[a-zA-Z][^>]*>/g, tag => tag.replace(attrRe, attr));
  const newHead = head.replace(/<title>([^<]*)<\/title>/i, (all, title) => {
    const translated = visit(squash(decode(title)));
    return translated === undefined ? all : `<title>${encode(translated)}</title>`;
  });
  return newHead + body;
}

/* ───────── Ativos ───────── */

const TEXT_KEYS = new Set(['name', 'label', 'placeholder', 'message', 'subject', 'body', 'text', 'title', 'button', 'description',
  'help', 'closedMessage', 'headline', 'summary', 'greeting', 'welcome', 'welcomeMessage', 'cta', 'value', 'options', 'preview', 'previewText', 'content']);
const HTML_KEYS = new Set(['html']);

// Campos que nunca se traduzem: ids, chaves de campo e valor, prompts dos agentes (já em português) e endereços.
const KEEP_KEYS = new Set(['id', 'key', 'slug', 'siteId', 'formId', 'page', 'op', 'match', 'change', 'object', 'instructions', 'url', 'type', 'action', 'subject_type', 'kind', 'segment', 'customId', 'fieldKey']);

/**
 * Percorre os textos dos ativos. visit(text, { html, key }) devolve a tradução ou undefined.
 * Na extração, só os campos de texto (TEXT_KEYS) importam; na aplicação, qualquer campo cujo texto inteiro esteja no
 * dicionário muda, para que uma tag, uma opção ou um nome renomeado mude também onde é citado (condições, ações).
 */
export function mapAssets(value, visit, key = '', { onlyText = false } = {}) {
  if (typeof value === 'string') {
    if (HTML_KEYS.has(key)) return mapPage(value, k => visit(k, { html: true, key }));
    if ((onlyText && !TEXT_KEYS.has(key)) || !/[A-Za-z]{2}/.test(value) || /^https?:\/\//.test(value)) return value;
    const translated = visit(value.trim(), { html: false, key });
    return translated === undefined ? value : value.replace(value.trim(), () => translated);
  }
  if (Array.isArray(value)) return value.map(entry => mapAssets(entry, visit, key, { onlyText }));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, KEEP_KEYS.has(k) ? v : mapAssets(v, visit, k, { onlyText })]));
  return value;
}

export function loadDictionary(file = new URL('./traducao-pt.json', import.meta.url)) {
  try { return new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8')))); } catch { return new Map(); }
}

/**
 * Forma de um texto: cada {{ marcador }} vira {v1}, {v2}… e cada número vira {n1}, {n2}…, para que
 * "What Is {{ custom_values.service_5 }}?" e "What Is {{ custom_values.service_8 }}?" usem a mesma entrada.
 */
export function shapeOf(text) {
  const vars = [], nums = [];
  const shape = text.replace(/\{\{[^{}]*\}\}/g, m => { vars.push(m); return `{v${vars.length}}`; })
    .replace(/(?<![\w{<\/])\d+(?![\w}>\/])/g, m => { nums.push(m); return `{n${nums.length}}`; });
  return { shape, vars, nums };
}

/** Tradução de um texto: a entrada exata primeiro, depois a da forma. undefined quando não há. */
export function translator(dict) {
  return text => {
    if (dict.has(text)) return dict.get(text);
    const { shape, vars, nums } = shapeOf(text);
    if (shape === text || !dict.has(shape)) return undefined;
    return dict.get(shape).replace(/\{v(\d+)\}/g, (m, i) => vars[i - 1] ?? m).replace(/\{n(\d+)\}/g, (m, i) => nums[i - 1] ?? m);
  };
}
