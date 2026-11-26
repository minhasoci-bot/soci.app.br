// Painel AI Gateway (dentro da página Plataforma): só o dono da plataforma (sessão de GO_AGENCY_OWNER_ID, ou o
// servidor local sem login). Para qualquer outro as rotas não existem (404), como as de /api/platform/.
// As chaves dos provedores ficam nas variáveis de ambiente: nenhuma rota recebe, guarda ou devolve chave.
import { NEXT_ROUTE } from './next-route.mjs';
import { canFallback, ERROR_KINDS, userMessage } from '../ai-gateway/errors.mjs';
import { formatMicros } from '../ai-gateway/accounting.mjs';

const ROUTES = new Set([
  'GET /api/platform/ai/overview', 'GET /api/platform/ai/settings', 'POST /api/platform/ai/settings', 'GET /api/platform/ai/models', 'POST /api/platform/ai/model',
  'POST /api/platform/ai/model/add', 'POST /api/platform/ai/provider/sync', 'POST /api/platform/ai/provider/test', 'POST /api/platform/ai/provider/reset',
  'POST /api/platform/ai/simulate', 'POST /api/platform/ai/playground', 'GET /api/platform/ai/logs', 'POST /api/platform/ai/prompts'
]);
const SIMULATED_FAILURES = new Set(['rate_limit', 'quota_exhausted', 'timeout', 'unavailable', 'auth', 'model_gone', 'context_exceeded', 'policy', 'structured_output']);

const csvCell = value => {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Fórmula no Excel/Sheets começa com = + - @: prefixa para não executar.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function createAiGatewayRoutes({ gateway, verifiedUser, agencyOwnerId, auth, localAccess, error, payload }) {
  async function owner(req, res) {
    if (!auth) {
      if (localAccess) return { id: 'local', email: '' };
      throw error('Not found.', 404);
    }
    const session = await Promise.resolve(verifiedUser(req, res)).catch(() => null);
    if (!session || !agencyOwnerId || session.id !== agencyOwnerId) throw error('Not found.', 404);
    return session;
  }

  const actorOf = session => session.email || session.id || 'local';
  const asNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function playgroundInput(body) {
    const needs = body.needs || {};
    return {
      feature: 'admin.playground', mode: String(body.mode || 'auto'), task: body.task, model: body.model ? String(body.model) : '',
      system: String(body.system || '').slice(0, 20_000), messages: [{ role: 'user', content: String(body.prompt || '').slice(0, 50_000) }],
      maxOutputTokens: asNumber(body.maxOutputTokens, 512), ...(body.temperature !== '' && body.temperature !== undefined && body.temperature !== null && { temperature: Number(body.temperature) }),
      ...(body.schema && typeof body.schema === 'object' && { schema: { name: 'resposta', schema: body.schema, strict: true } }),
      dataClass: body.dataClass, webSearch: Boolean(needs.webSearch),
      ...(needs.tools && { tools: [{ name: 'consultar_hora', description: 'Devolve a data e hora atuais do servidor (ferramenta de teste, sem efeito externo).', parameters: { type: 'object', properties: {}, additionalProperties: false } }] })
    };
  }

  return async function aiGatewayRoute({ req, res, p, method, url, json }) {
    if (!p.startsWith('/api/platform/ai/')) return NEXT_ROUTE;
    const route = `${method} ${p}`;
    if (!ROUTES.has(route)) return NEXT_ROUTE;
    const session = await owner(req, res);
    const actor = actorOf(session);
    const ctx = plan => ({ org: 'platform:playground', user: session.id || 'local', plan: ['free', 'paid'].includes(plan) ? plan : 'paid' });

    if (route === 'GET /api/platform/ai/overview') return json(await gateway.admin.overview());
    if (route === 'GET /api/platform/ai/settings') return json(await gateway.admin.settingsView());
    if (route === 'GET /api/platform/ai/models') {
      const q = url.searchParams;
      return json(await gateway.admin.modelsView({ provider: q.get('provider') || '', q: q.get('q') || '', eligible: q.get('eligible') || '', limit: q.get('limit') || '' }));
    }
    if (route === 'GET /api/platform/ai/logs') {
      const q = url.searchParams;
      const query = Object.fromEntries(['org_id', 'feature', 'provider', 'status', 'tier', 'after', 'from', 'to', 'limit'].map(key => [key, q.get(key) || '']).filter(([, value]) => value));
      if (q.get('format') !== 'csv') return json(await gateway.admin.logs(query));
      const page = await gateway.admin.logs({ ...query, limit: 500 });
      const columns = ['created_at', 'org_id', 'feature', 'mode', 'plan', 'provider', 'model', 'tier', 'status', 'error_kind', 'attempts', 'input_tokens', 'output_tokens',
        'usage_source', 'cost_micros', 'cost_source', 'latency_ms', 'ttft_ms', 'cache_hit'];
      const body = [columns.join(','), ...page.rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ai-gateway-requisicoes.csv"', 'Cache-Control': 'no-store' });
      res.end(`﻿${body}`);
      return true;
    }

    const body = (await payload(req)) || {};
    if (route === 'POST /api/platform/ai/settings') return json(await gateway.admin.saveSettings(body, actor));
    if (route === 'POST /api/platform/ai/provider/sync') return json(await gateway.admin.syncProvider(String(body.id || ''), actor));
    if (route === 'POST /api/platform/ai/provider/test') return json(await gateway.admin.testProvider(String(body.id || '')));
    if (route === 'POST /api/platform/ai/provider/reset') return json(await gateway.admin.resetProvider(String(body.id || ''), actor));
    if (route === 'POST /api/platform/ai/model') return json(await gateway.admin.updateModel(String(body.key || ''), body.patch || {}, actor));
    if (route === 'POST /api/platform/ai/model/add') return json(await gateway.admin.createModel(body, actor));
    if (route === 'POST /api/platform/ai/prompts') return json(await gateway.admin.prompts(String(body.action || ''), body, actor));
    if (route === 'POST /api/platform/ai/simulate') {
      return json(await gateway.admin.simulate({ ...playgroundInput(body), estimatedInputTokens: body.estimatedInputTokens }, ctx(body.plan)));
    }

    // Playground: chamada real (consome cota e orçamento como qualquer outra) ou falha simulada (sem chamar ninguém).
    const input = playgroundInput(body);
    if (body.simulateFailure) {
      const kind = String(body.simulateFailure);
      if (!SIMULATED_FAILURES.has(kind) || !ERROR_KINDS.includes(kind)) throw error('Falha simulada desconhecida.', 400);
      const decision = await gateway.admin.simulate(input, ctx(body.plan));
      const [first, ...rest] = decision.candidates;
      return json({
        simulated: true, kind, userMessage: userMessage(kind), fallback: canFallback(kind),
        first: first?.key || null, next: canFallback(kind) ? rest.find(candidate => candidate.key.split('/')[0] !== first?.key.split('/')[0])?.key || rest[0]?.key || null : null,
        explanation: !first ? 'Nenhum modelo elegível: o pedido pararia antes de chamar um provedor.'
          : canFallback(kind) ? 'O gateway registraria a falha, atualizaria o circuit breaker e tentaria o próximo modelo elegível.'
            : 'Esta falha não troca de modelo (política, pedido inválido ou cancelamento): o erro volta para quem pediu.',
        decision
      });
    }
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      const controller = new AbortController();
      req.on('close', () => controller.abort());
      try {
        for await (const event of gateway.stream(input, ctx(body.plan), { signal: controller.signal })) {
          res.write(`data: ${JSON.stringify(event.type === 'done' ? { type: 'done', result: { ...event.result, cost: formatMicros(event.result.costMicros || 0) } } : event)}\n\n`);
        }
      } catch (failure) {
        res.write(`data: ${JSON.stringify({ type: 'error', kind: failure.kind || 'unavailable', message: failure.kind ? failure.message : userMessage('unavailable') })}\n\n`);
      }
      res.end();
      return true;
    }
    const call = input.schema ? gateway.structured : gateway.generate;
    try {
      const result = await call(input, ctx(body.plan));
      return json({ ...result, cost: result.costMicros === null ? 'desconhecido' : formatMicros(result.costMicros) });
    } catch (failure) {
      if (!failure.kind) throw failure;
      return json({ error: failure.message, kind: failure.kind });
    }
  };
}
