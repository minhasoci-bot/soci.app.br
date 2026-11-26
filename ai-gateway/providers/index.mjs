// Fábrica de adapters: o gateway só conhece este ponto. Novo provedor = entrada no catálogo + (se o formato
// for novo) um adapter que implemente o mesmo contrato. Funcionalidades consumidoras não mudam.
import { createAnthropicAdapter } from './anthropic.mjs';
import { createOpenAICompatibleAdapter } from './openai-compatible.mjs';
import { createOpenAIResponsesAdapter } from './openai-responses.mjs';

const FACTORIES = {
  'openai-compatible': createOpenAICompatibleAdapter,
  'openai-responses': createOpenAIResponsesAdapter,
  anthropic: createAnthropicAdapter
};

/** @param {{ provider: object, baseUrl: string, apiKey: string, request?: typeof fetch }} options */
export function createAdapter(options) {
  const factory = FACTORIES[options.provider.adapter];
  if (!factory) throw new Error(`Adapter desconhecido: ${options.provider.adapter}`);
  return factory(options);
}

export { PROVIDERS, providerById, globalCredential } from './catalog.mjs';
