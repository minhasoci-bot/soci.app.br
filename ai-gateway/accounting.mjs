// Contabilização de tokens e custo. Tudo em inteiros: tokens e micro-dólares (1 US$ = 1.000.000 micros).
// Estimativas são marcadas como tal; custo real vem do preço do registro sobre os tokens informados pelo provedor,
// e o custo informado pelo próprio provedor (quando vem) é guardado ao lado, sem substituir a conta.

const CHARS_PER_TOKEN = 3; // conservador para português (estimativa para reserva, nunca para cobrança)
const IMAGE_TOKENS = 1500;

export function estimateInputTokens(messages = [], tools = []) {
  let chars = 0, images = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') chars += message.content.length;
    else for (const part of message.content || []) {
      if (part.type === 'image') images++;
      else chars += String(part.text || '').length;
    }
    chars += 8;
  }
  chars += JSON.stringify(tools || []).length;
  return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
}

/** Custo em micros de uma chamada pelo preço do registro. null quando o preço é desconhecido. */
export function costMicros(pricing, { inputTokens = 0, outputTokens = 0 } = {}) {
  if (!pricing || !Number.isInteger(pricing.inputMicrosPerM) || !Number.isInteger(pricing.outputMicrosPerM)) return null;
  const tokens = inputTokens * pricing.inputMicrosPerM + outputTokens * pricing.outputMicrosPerM;
  return Math.ceil(tokens / 1_000_000) + Math.max(0, pricing.requestMicros || 0);
}

/** Pior caso de uma chamada (para reservar orçamento antes de executar). */
export function worstCaseMicros(pricing, inputTokens, maxOutputTokens) {
  return costMicros(pricing, { inputTokens, outputTokens: maxOutputTokens });
}

export const microsToDollars = micros => (Number(micros) || 0) / 1_000_000;
export function formatMicros(micros) {
  const value = Number(micros) || 0;
  return `US$ ${(value / 1_000_000).toFixed(value > 0 && value < 10_000 ? 4 : 2)}`;
}
