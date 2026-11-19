// Social Planner captions written with the workspace's OpenAI connection: one caption tuned to the
// chosen networks plus hashtag suggestions kept apart, so the composer can insert them separately.
import { openAIResponse } from './openai.mjs';
import { network } from './ui/social-data.js';

const clip = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const fail = (message, status) => Object.assign(new Error(message), { status });
export const captionTones = ['profissional', 'descontraído', 'inspirador', 'divertido', 'urgente', 'educativo'];

/** Validated input. Throws 400 when there is nothing to write about. */
export function captionRequest(input = {}) {
  const brief = clip(input.brief, 1500), current = String(input.current || '').trim().slice(0, 4000);
  if (!brief && !current) throw fail('Descreva sobre o que é o post ou escreva um rascunho para a IA melhorar.', 400);
  const providers = [...new Set(Array.isArray(input.providers) ? input.providers : [])].filter(id => network(id)).slice(0, 9);
  const limit = Math.min(...providers.map(id => network(id).limit), 2200);
  return { brief, current, providers, limit, tone: captionTones.includes(input.tone) ? input.tone : 'profissional',
    language: input.language === 'es' ? 'es' : 'pt', hashtags: input.hashtags !== false, cta: clip(input.cta, 200) };
}

export async function writeCaption(connection, input) {
  const req = captionRequest(input);
  const where = req.providers.length ? req.providers.map(id => network(id).name).join(', ') : 'redes sociais em geral';
  const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 2000,
    instructions: `You are a senior social media copywriter for small businesses. Write one ready-to-post caption for ${where}.
Write in ${req.language === 'es' ? 'Latin American Spanish' : 'Brazilian Portuguese'}, with a ${req.tone} tone. Open with a strong hook in the first line, keep short paragraphs, use at most three emojis and end with a clear call to action.
The caption must have at most ${Math.max(200, req.limit - 300)} characters and must not contain hashtags; put hashtags only in the hashtags list (${req.hashtags ? '5 to 12 relevant hashtags without the # sign, mixing broad and niche ones' : 'return an empty list'}).
Never invent prices, discounts, dates, statistics, awards, client names or testimonials. When the post needs a fact the owner must supply, write a placeholder in double brackets, like [[preço]].
If a draft is given, improve it and keep its facts.`,
    input: `Sobre o post: ${req.brief || '(use o rascunho)'}\nRascunho atual: ${req.current || '(nenhum)'}\nChamada para ação desejada: ${req.cta || '(escolha a mais natural)'}`,
    text: { format: { type: 'json_schema', name: 'social_caption', strict: true, schema: object({ caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } }) } }
  }, { ...connection, timeout: 60000, problem: 'A OpenAI não concluiu a legenda. Tente de novo.' });
  const content = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text');
  if (result.status !== 'completed' || !content) throw fail('A OpenAI retornou uma legenda incompleta. Tente de novo.', 422);
  let parsed;
  try { parsed = JSON.parse(content.text); } catch { throw fail('A OpenAI retornou a legenda em formato inválido.', 502); }
  const hashtags = [...new Set((parsed.hashtags || []).map(t => String(t).replace(/^#+/, '').replace(/\s+/g, ''))
    .filter(t => /^[\p{L}\p{N}_]{1,60}$/u.test(t)))].slice(0, 15);
  return { caption: String(parsed.caption || '').trim().slice(0, req.limit), hashtags: req.hashtags ? hashtags : [] };
}
