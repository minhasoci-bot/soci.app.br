// Rotas de IA e agentes (módulo ai-agents): consumo e limite mensal de IA, bases de conhecimento e modelos de agente
// (/api/ai/<op>) e o ciclo dos agentes, com teste e construção pela IA medidos no consumo (/api/agents/<op>).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { designAgent, replyAsAgent } from '../agent-ai.mjs';
import { agentBuildRequest, agentPreview, applyAgentDesign, editAgent, recordAgentRun } from '../agent-model.mjs';
import { checkAiBudget, editAgentTemplate, editKnowledgeBase, setAiLimit, usageMeter } from '../ai-model.mjs';
import { requireCapability } from '../authorization.mjs';
import { usageSummary } from '../ui/ai-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

function meteredUsage() {
  const meter = usageMeter();
  return {
    onUsage: meter.onUsage,
    record(state, kind, agent, run, error = '') {
      const charged = meter.charge(state, kind, agent, error);
      return recordAgentRun(state, { ...run, ...charged, error });
    }
  };
}

export function createAgentRoutes(deps) {
  const {
    store, localAccess, error, spaceId, privateSpace, agentModel, designAgentConfig, generateAgentReply, listWorkspaces, openAI, payload, recordAudit, workspaceAccess
  } = deps;
  return async function agentRoute({ req, res, p, method, url, id, json }) {
    const aiAction = p.match(/^\/api\/ai\/(kb-create|kb-save|kb-delete|template-save|template-delete|limit|usage)$/);
    if (aiAction && (method === 'POST' || aiAction[1] === 'usage')) {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['ai-agents'] });
      const operation = aiAction[1];
      if (operation === 'usage') {
        const month = url.searchParams.get('month') || undefined;
        if (month && !/^\d{4}-\d{2}$/.test(month)) throw error('Informe o mês como AAAA-MM.', 400);
        return json({ usage: usageSummary((await store.load(id)).ai, month) });
      }
      const input = await payload(req);
      if (operation === 'limit') {
        requireCapability(who, 'agency', 'Só a agência pode alterar o limite de gastos com IA desta subconta.');
        const usage = await store.change(id, state => setAiLimit(state, input));
        return json({ usage });
      }
      if (operation.startsWith('template-')) {
        const template = await store.change(id, state => editAgentTemplate(state, operation, input));
        return json({ template }, template ? 201 : 200);
      }
      const kbOperation = operation.slice(3);
      const base = await store.change(id, state => editKnowledgeBase(state, kbOperation, input));
      if (!privateSpace.test(id) && kbOperation !== 'save') {
        const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
        await recordAudit(who, kbOperation === 'create' ? 'Base de conhecimento criada' : 'Base de conhecimento excluída', account, base?.name || '');
      }
      return json({ base }, kbOperation === 'create' ? 201 : 200);
    }
    const agentAction = p.match(/^\/api\/agents\/(create|save|publish|unpublish|move|delete|memory|test|build)$/);
    if (agentAction && method==='POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      const who = await workspaceAccess(req, res, id, { modules: ['ai-agents'] });
      const operation = agentAction[1];
      const input = await payload(req);
      if (operation === 'test') {
        const current = await store.load(id);
        const preview = agentPreview(current, input);
        checkAiBudget(current);
        const meter = meteredUsage();
        const connection = localAccess && generateAgentReply !== replyAsAgent ? { onUsage: meter.onUsage } : { ...await openAI.requireConnection(who.session), onUsage: meter.onUsage };
        const message = preview.messages.at(-1).content;
        const runInput = { agent: input.id, version: input.version, input: message, kind: 'test', sources: [...new Set(preview.retrieved.map(item => item.title))] };
        let reply;
        try {
          reply = await generateAgentReply({ ...preview, model: preview.model || agentModel }, connection);
        } catch (problem) {
          await store.change(id, state => meter.record(state, 'agent-test', input.id, runInput, problem.message));
          throw problem;
        }
        const run = await store.change(id, state => meter.record(state, 'agent-test', input.id, { ...runInput, output: reply }));
        return json({ reply, run });
      }
      if (operation === 'build') {
        const current = await store.load(id);
        const build = agentBuildRequest(current, input);
        checkAiBudget(current);
        const meter = meteredUsage();
        const connection = localAccess && designAgentConfig !== designAgent ? { onUsage: meter.onUsage } : { ...await openAI.requireConnection(who.session), onUsage: meter.onUsage };
        const runInput = { agent: input.id, version: 'draft', input: build.request, kind: 'build' };
        let design;
        try {
          design = await designAgentConfig(build, connection);
        } catch (problem) {
          await store.change(id, state => meter.record(state, 'agent-build', input.id, runInput, problem.message));
          throw problem;
        }
        const agent = await store.change(id, state => {
          meter.record(state, 'agent-build', input.id, { ...runInput, output: design.summary });
          return applyAgentDesign(state, input, design.draft);
        });
        return json({ agent, summary: design.summary });
      }
      const agent = await store.change(id, state => editAgent(state, operation, { ...input, model: agentModel }));
      if (!privateSpace.test(id) && operation !== 'save') {
        const labels = { create: 'Agente criado', publish: 'Agente publicado', unpublish: 'Agente despublicado', delete: 'Agente excluído' };
        const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
        await recordAudit(who, labels[operation], account, agent?.name || '');
      }
      return json({ agent }, operation === 'create' ? 201 : 200);
    }
    return NEXT_ROUTE;
  };
}
