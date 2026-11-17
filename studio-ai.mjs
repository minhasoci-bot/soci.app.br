import { studioTemplates, studioThemes } from './ui/studio-data.js';
import { openAIResponse } from './openai.mjs';

const rules = `Rules for every page:
- Return one complete HTML document: <!doctype html>, <html lang> matching the brief language, <head> with meta charset, meta viewport and <title>, then <body>.
- Put all CSS in a single <style> element in the head. Mobile-first and responsive. Clear visual hierarchy, generous spacing, accessible contrast, a professional design.
- Never use <script>, inline event handlers, <iframe>, <object>, <embed> or external resources, except Google Fonts stylesheets from fonts.googleapis.com.
- Do not use <img> with remote URLs. Create visuals with CSS (gradients, shapes) or small inline SVG.
- Include one lead form marked with the attribute data-go-lead, with inputs named name (required), email (type email, required) and phone (optional), and a submit button.
- Link to other pages of the site only with href="page:SLUG" (the home page is page:index). Use #ids for links within the page.
- Write all copy in the language of the brief.
- Never invent testimonials, client names, prices, ratings, statistics, awards, addresses or contact details. Write a clearly marked placeholder in double brackets, for example [[Real customer testimonial]], for the owner to replace.`;

async function respond(connection, { instructions, input, name, schema }) {
  const result = await openAIResponse({
    model: connection.model, max_output_tokens: 32000, instructions, input,
    text: { format: { type: 'json_schema', name, strict: true, schema } }
  }, { ...connection, timeout: 180000, problem: 'A OpenAI não concluiu a solicitação. Tente novamente ou use um modelo local.' });
  const content = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text');
  if (result.status !== 'completed' || !content) throw Object.assign(new Error('A OpenAI retornou uma página incompleta. Tente uma descrição mais curta.'), { status: 422 });
  try { return JSON.parse(content.text); }
  catch { throw Object.assign(new Error('A OpenAI retornou uma página em formato inválido.'), { status: 502 }); }
}
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export function generateSite(connection, brief, template, reference = '') {
  const kind = studioTemplates.find(item => item[0] === template);
  return respond(connection, {
    name: 'studio_site',
    schema: object({ name: { type: 'string' }, summary: { type: 'string' }, theme: { type: 'string', enum: studioThemes }, html: { type: 'string' } }),
    instructions: `You design and build the home page of a website from a short brief. Return a short project name, a one-sentence summary, the closest color theme, and the full HTML of the page.\n${rules}${reference ? '\nA summary of a reference website is included. Use only its structure and section order as inspiration. Do not copy its text, brand names or claims.' : ''}`,
    input: `Template: ${kind?.[1] || 'Landing page'}\n\nBrief:\n${brief}${reference ? `\n\nReference website structure:\n${reference}` : ''}`
  });
}

export function revisePage(connection, { html, instruction, selection = '' }) {
  return respond(connection, {
    name: 'studio_revision',
    schema: object({ html: { type: 'string' }, change: { type: 'string' } }),
    instructions: `You edit an existing web page. Apply the requested change and return the complete updated HTML document plus one short sentence describing what changed, in the language of the request. Keep every part that the request does not mention exactly as it is.${selection ? ' A selected element is given: limit the change to that element unless the request clearly asks for more.' : ''}\n${rules}`,
    input: `Request:\n${instruction}${selection ? `\n\nSelected element:\n${selection}` : ''}\n\nCurrent page:\n${html}`
  });
}

export function generatePage(connection, { name, description, home, slugs }) {
  return respond(connection, {
    name: 'studio_page',
    schema: object({ html: { type: 'string' } }),
    instructions: `You add a new page to an existing website. Reuse the same CSS, fonts, colors, header, navigation and footer as the existing home page, so both pages look like one site. Add a navigation link to the new page where it fits.\n${rules}`,
    input: `New page name: ${name}\nWhat the page should contain: ${description || name}\nExisting page slugs: ${slugs.join(', ')}\n\nHome page:\n${home}`
  });
}
