// Visibility AI (6b.8): asks the question the way a customer would ask ChatGPT (with web search, located in
// Brazil) and returns the answer as written plus the pages it cited. Which names appear is decided afterwards,
// by plain text matching in seo-model.mjs, never by asking the model about itself.
import { openAIResponse } from './openai.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export async function askAssistant(connection, { prompt, language = 'pt' }) {
  const question = String(prompt || '').trim().slice(0, 300);
  if (!question) throw fail('Escreva a pergunta.');
  const problem = 'A IA não respondeu a esta pergunta. Tente de novo.';
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 1500,
    tools: [{ type: 'web_search', user_location: { type: 'approximate', country: language === 'es' ? 'MX' : 'BR' } }],
    instructions: `You are a helpful assistant answering a consumer in ${language === 'es' ? 'Latin America, in Spanish' : 'Brazil, in Brazilian Portuguese'}. Search the web and answer the way you normally would. When the question asks for providers, businesses or products, name specific ones and say briefly why.`,
    input: question
  }, { ...connection, timeout: 90000, problem });
  const parts = (result.output || []).flatMap(item => item.type === 'message' ? item.content || [] : []).filter(item => item.type === 'output_text');
  const text = parts.map(item => item.text || '').join('\n').trim();
  if (!text) throw fail(problem, 502);
  const seen = new Set();
  const sources = parts.flatMap(item => item.annotations || []).filter(note => note.type === 'url_citation' && /^https?:\/\//.test(note.url || ''))
    .filter(note => { const key = note.url.split('#')[0]; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 12).map(note => ({ url: note.url.split('#')[0].replace(/[?&]utm_source=openai$/, ''), title: String(note.title || '').slice(0, 200) }));
  return { text: text.slice(0, 6000), sources, model: result.model || connection.model || '' };
}
