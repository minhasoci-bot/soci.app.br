// Camada HTTP comum aos adapters: prazo por tentativa, cancelamento, sem redirecionamento, erros classificados
// e leitura de Server-Sent Events. A chave só vive no cabeçalho desta chamada; nunca em log nem em erro.
import { classifyHttp, classifyThrown, GatewayError } from '../errors.mjs';
import { redact } from '../privacy.mjs';

export function combinedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(Math.max(1000, timeoutMs || 30_000));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** POST/GET com prazo. Devolve a Response quando ok; lança GatewayError classificado quando não. */
export async function send(request, url, { method = 'POST', headers = {}, body = undefined, signal = undefined, timeoutMs = undefined, provider = '', model = '' }) {
  let response;
  try {
    response = await request(url, {
      method, redirect: 'error', signal: combinedSignal(signal, timeoutMs),
      headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      ...(body !== undefined && { body: JSON.stringify(body) })
    });
  } catch (error) {
    throw classifyThrown(error, { provider, model, cancelled: Boolean(signal?.aborted) });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const failure = classifyHttp(response.status, redact(text, 600), response.headers, { provider, model });
    failure.rateLimit = readRateLimit(response.headers);
    throw failure;
  }
  return response;
}

export async function json(response, { provider = '', model = '' }) {
  try { return await response.json(); }
  catch { throw new GatewayError('unavailable', { provider, model, internal: 'resposta não é JSON' }); }
}

const number = value => {
  const parsed = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed;
};
// "2m59.56s", "7.66s", "120ms" → milissegundos
export function parseDuration(value) {
  if (!value) return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return Math.round(direct * 1000);
  let total = 0, matched = false;
  for (const [, amount, unit] of String(value).matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    matched = true;
    total += Number(amount) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 })[unit];
  }
  return matched ? Math.round(total) : null;
}

/**
 * Cabeçalhos de limite que os provedores devolvem (Groq: x-ratelimit-* em toda resposta; OpenRouter: X-RateLimit-* nos erros).
 * Os nomes são os mesmos em minúsculas; o significado (por dia, por minuto) fica com o catálogo do provedor.
 */
export function readRateLimit(headers) {
  if (!headers?.get) return null;
  const info = {
    limitRequests: number(headers.get('x-ratelimit-limit-requests') ?? headers.get('x-ratelimit-limit')),
    remainingRequests: number(headers.get('x-ratelimit-remaining-requests') ?? headers.get('x-ratelimit-remaining')),
    resetRequestsMs: parseDuration(headers.get('x-ratelimit-reset-requests')),
    limitTokens: number(headers.get('x-ratelimit-limit-tokens')),
    remainingTokens: number(headers.get('x-ratelimit-remaining-tokens')),
    resetTokensMs: parseDuration(headers.get('x-ratelimit-reset-tokens'))
  };
  return Object.values(info).some(value => value !== null) ? info : null;
}

/** Lê um corpo SSE e devolve cada `data:` como string (sem o "[DONE]"). */
export async function* sseData(response, { provider, model, signal }) {
  if (!response.body) throw new GatewayError('unavailable', { provider, model, internal: 'stream vazio' });
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (error) { throw classifyThrown(error, { provider, model, cancelled: Boolean(signal?.aborted) }); }
      if (chunk.done) break;
      buffer += chunk.value;
      for (let index = buffer.search(/\r?\n\r?\n/); index >= 0; index = buffer.search(/\r?\n\r?\n/)) {
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, '');
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        if (data === '[DONE]') return;
        yield data;
      }
    }
    const rest = buffer.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (rest && rest !== '[DONE]') yield rest;
  } finally {
    reader.releaseLock?.();
  }
}

export function parseJsonEvent(data, { provider, model }) {
  try { return JSON.parse(data); }
  catch { throw new GatewayError('unavailable', { provider, model, internal: 'evento de stream inválido' }); }
}
