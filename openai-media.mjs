// Geração de imagem e vídeo com a OpenAI para os fluxos ("Gerar imagem com IA" e "Gerar vídeo com IA").
// Imagem: uma chamada a /v1/images/generations (gpt-image-1), em WebP comprimido para caber no armazenamento
// de arquivos (até 700 KB). Vídeo: /v1/videos (sora-2) é assíncrono — o servidor cria o trabalho, consulta o
// andamento a cada ciclo e baixa o MP4 quando fica pronto.
const endpoint = 'https://api.openai.com/v1';
const fail = (message, status = 502) => Object.assign(new Error(message), { status });
export const IMAGE_MAX_BYTES = 700_000;
export const imageSizes = ['1024x1024', '1536x1024', '1024x1536'];
export const videoSizes = ['1280x720', '720x1280'];
export const videoSeconds = ['4', '8', '12'];

async function call(connection, path, { method = 'GET', body, timeout = 60000, raw = false } = {}) {
  const request = connection.request || fetch;
  const response = await request(endpoint + path, {
    method, signal: AbortSignal.timeout(timeout), redirect: 'error',
    headers: { Authorization: `Bearer ${connection.apiKey}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body)
  }).catch(() => null);
  if (response?.status === 401) throw fail('A OpenAI recusou a chave. Verifique a chave ou conecte uma nova.', 422);
  if (response?.status === 429) throw fail('Verifique o saldo e os limites de uso do seu projeto na OpenAI.', 429);
  if (!response?.ok) {
    const data = await response?.json?.().catch(() => null);
    throw fail(String(data?.error?.message || 'A OpenAI não respondeu. Tente de novo.').slice(0, 200), response?.status === 400 ? 422 : 502);
  }
  return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
}

/** One image from a prompt, as a data URL (image/webp). */
export async function generateImage(connection, { prompt, size = '1024x1024', quality = 'medium' }) {
  const started = Date.now();
  try {
    const result = await call(connection, '/images/generations', { method: 'POST', timeout: 120000, body: {
      model: 'gpt-image-1', prompt: String(prompt).slice(0, 4000), n: 1, size: imageSizes.includes(size) ? size : '1024x1024',
      quality: ['low', 'medium', 'high'].includes(quality) ? quality : 'medium', output_format: 'webp', output_compression: 70 } });
    await connection.onUsage?.({ model: 'gpt-image-1', usage: result.usage || {}, ms: Date.now() - started });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw fail('A OpenAI não devolveu a imagem.');
    if (b64.length * 0.75 > IMAGE_MAX_BYTES) throw fail('A imagem gerada passou de 700 KB. Use qualidade baixa ou média.', 422);
    return `data:image/webp;base64,${b64}`;
  } catch (error) {
    await connection.onUsage?.({ model: 'gpt-image-1', usage: {}, ms: Date.now() - started, error: error.message });
    throw error;
  }
}

/** Starts a video job; returns its id. */
export async function startVideo(connection, { prompt, seconds = '4', size = '1280x720' }) {
  const result = await call(connection, '/videos', { method: 'POST', body: { model: 'sora-2', prompt: String(prompt).slice(0, 4000),
    seconds: videoSeconds.includes(String(seconds)) ? String(seconds) : '4', size: videoSizes.includes(size) ? size : '1280x720' } });
  await connection.onUsage?.({ model: 'sora-2', usage: {}, ms: 0 });
  if (!result.id) throw fail('A OpenAI não criou o vídeo.');
  return String(result.id);
}

/** queued | in_progress | completed | failed, with the error message when it failed. */
export async function videoStatus(connection, id) {
  const result = await call(connection, `/videos/${encodeURIComponent(id)}`);
  return { status: String(result.status || ''), progress: Number(result.progress) || 0, error: String(result.error?.message || '').slice(0, 200) };
}

/** The finished MP4. */
export const videoContent = (connection, id) => call(connection, `/videos/${encodeURIComponent(id)}/content`, { timeout: 120000, raw: true });
