// Blog writing with the workspace's OpenAI connection, and a local outline when none is connected.
import { openAIResponse } from './openai.mjs';
import { slugify } from './ui/blog-data.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const clip = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

async function respond(connection, { instructions, input, name, schema }) {
  const result = await openAIResponse({ model: connection.model, max_output_tokens: 16000, instructions, input, text: { format: { type: 'json_schema', name, strict: true, schema } } },
    { ...connection, timeout: 150000, problem: 'A OpenAI não concluiu o artigo. Tente de novo.' });
  const content = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text');
  if (result.status !== 'completed' || !content) throw Object.assign(new Error('A OpenAI retornou um artigo incompleto. Tente um tema mais específico.'), { status: 422 });
  try { return JSON.parse(content.text); } catch { throw Object.assign(new Error('A OpenAI retornou o artigo em formato inválido.'), { status: 502 }); }
}

const rules = `Write in the language of the brief (Brazilian Portuguese and Latin American Spanish supported; all new creations are born ready in Portuguese and Spanish). Use Markdown only with: ## and ### headings, paragraphs, - lists, 1. lists, > quotes, **bold**, *italic* and [links](https://...).
Never use HTML. Never invent statistics, studies, prices, quotes, client names, awards or personal experiences. When a fact the owner must supply is needed, write a placeholder in double brackets, like [[dado real do negócio]].
The seoTitle has up to 60 characters and the seoDescription up to 155 characters. The summary has one or two sentences.`;

export async function writePost(connection, input) {
  const words = { curto: 500, medio: 900, longo: 1500 }[input.length] || 900;
  const post = await respond(connection, {
    name: 'blog_post',
    schema: object({ title: { type: 'string' }, summary: { type: 'string' }, body: { type: 'string' }, seoTitle: { type: 'string' }, seoDescription: { type: 'string' } }),
    instructions: `You are a senior content writer for a small business blog. Write one complete, useful article of about ${words} words with a clear structure, a short introduction and a conclusion with a call to action. Do not repeat the title as a heading in the body.\n${rules}${typeof input.voice === 'string' && input.voice ? `\n${input.voice.slice(0, 4000)}` : ''}`,
    input: `Tema: ${clip(input.topic, 1500)}\nTítulo sugerido: ${clip(input.title, 160) || '(escolha o melhor)'}\nPalavras-chave: ${clip(input.keywords, 300) || '(nenhuma)'}\nTom: ${clip(input.tone, 60) || 'profissional e próximo'}\nPúblico: ${clip(input.audience, 200) || '(clientes do negócio)'}`
  });
  return { ...post, slug: slugify(post.title) };
}

export function postSeo(connection, { title, body }) {
  return respond(connection, {
    name: 'blog_seo', schema: object({ seoTitle: { type: 'string' }, seoDescription: { type: 'string' }, summary: { type: 'string' } }),
    instructions: `You write search metadata and a summary for one blog article. Describe only what the article says.\n${rules}`,
    input: `Título: ${clip(title, 160)}\n\nArtigo:\n${String(body || '').slice(0, 12000)}`
  });
}

// Without OpenAI: a structured outline with placeholders for the owner to fill in.
export function localDraft(input) {
  const topic = clip(input.topic, 300) || clip(input.title, 160) || 'Tema do artigo';
  const title = clip(input.title, 160) || topic.charAt(0).toUpperCase() + topic.slice(1);
  const keywords = clip(input.keywords, 300);
  const body = [
    `Neste artigo, você vai entender ${topic.charAt(0).toLowerCase() + topic.slice(1)} e como aplicar isso no seu dia a dia. [[Conte em uma frase por que o tema importa para o seu cliente.]]`,
    '## O que é e por que importa', '[[Explique o conceito com palavras simples e um exemplo do seu negócio.]]',
    '## Principais pontos', '- [[Primeiro ponto]]', '- [[Segundo ponto]]', '- [[Terceiro ponto]]',
    '## Como colocar em prática', '1. [[Primeiro passo]]', '2. [[Segundo passo]]', '3. [[Terceiro passo]]',
    '## Erros comuns', '[[Liste os erros que você mais vê e como evitá-los.]]',
    '## Conclusão', `[[Resuma a ideia principal e convide o leitor a falar com você.]]${keywords ? `\n\n> Palavras-chave para usar no texto: ${keywords}` : ''}`
  ].join('\n\n');
  return { title, slug: slugify(title), summary: `[[Resumo de uma ou duas frases sobre ${topic.charAt(0).toLowerCase() + topic.slice(1)}.]]`, body, seoTitle: title.slice(0, 60), seoDescription: `Entenda ${topic.charAt(0).toLowerCase() + topic.slice(1)} e veja como aplicar no seu negócio.`.slice(0, 155) };
}
