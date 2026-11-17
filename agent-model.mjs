import { randomUUID } from 'node:crypto';
import { agentDraft, agentLimits, agentRevision, changedAgentFields } from './ui/agents-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function requiredText(value, limit, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > limit) fail(`Preencha ${label} com até ${limit.toLocaleString('pt-BR')} caracteres.`);
  return text;
}

function validateDraft(draft) {
  if (!Array.isArray(draft.knowledge) || draft.knowledge.length > agentLimits.sources) {
    fail(`Adicione até ${agentLimits.sources} fontes de conhecimento.`);
  }
  return {
    name: requiredText(draft.name, agentLimits.name, 'o nome'),
    role: requiredText(draft.role, agentLimits.role, 'a função'),
    instructions: requiredText(draft.instructions, agentLimits.instructions, 'as instruções'),
    knowledge: draft.knowledge.map(source => ({
      title: requiredText(source?.title, agentLimits.sourceName, 'o título da fonte'),
      text: requiredText(source?.text, agentLimits.sourceText, 'o conteúdo da fonte')
    }))
  };
}

function findAgent(state, id) {
  const agent = state.agents.find(item => item.id === id);
  if (!agent) fail('Agente não encontrado nesta subconta.', 404);
  return agent;
}

export function editAgent(state, operation, input) {
  const at = new Date().toISOString();
  if (operation === 'create') {
    const agent = {
      id: randomUUID(), created: at, revision: randomUUID(),
      name: requiredText(input.name, agentLimits.name, 'o nome'),
      role: 'Assistente de IA',
      instructions: 'Ajude o usuário com clareza. Faça perguntas quando precisar de mais contexto e informe quando não souber uma resposta.',
      knowledge: [], active: false
    };
    state.agents.push(agent);
    return agent;
  }
  const agent = findAgent(state, input.id);
  if (input.revision !== agentRevision(agent)) {
    fail('O agente foi alterado em outra sessão. Recarregue antes de editar novamente.', 409);
  }
  switch (operation) {
    case 'save':
      Object.assign(agent, validateDraft(input));
      break;
    case 'publish':
      if (agent.published && !changedAgentFields(agent).length && agent.published.model === input.model) return agent;
      agent.version = (agent.version || 0) + 1;
      agent.published = { ...validateDraft(agentDraft(agent)), version: agent.version, at, model: input.model };
      agent.active = true;
      break;
    case 'unpublish':
      agent.published = null;
      agent.active = false;
      break;
    case 'delete':
      state.agents = state.agents.filter(item => item.id !== agent.id);
      return null;
    default:
      fail('Operação desconhecida.', 404);
  }
  agent.revision = randomUUID();
  agent.updated = at;
  return agent;
}

export function agentPreview(state, input) {
  const agent = findAgent(state, input.id);
  if (input.revision !== agentRevision(agent)) fail('O agente foi alterado. Recarregue a página para testar a versão atual.', 409);
  if (!['draft', 'published'].includes(input.version)) fail('Escolha o rascunho ou a versão publicada para testar.');
  const draft = input.version === 'published' ? agent.published : agentDraft(agent);
  if (!draft) fail('Publique uma versão do agente para testá-la.', 404);
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 9 || messages.length % 2 !== 1) {
    fail('Envie uma mensagem ou reinicie a conversa de teste.');
  }
  return {
    draft: validateDraft(draft),
    model: input.version === 'published' ? draft.model : undefined,
    messages: messages.map((message, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: requiredText(message, index % 2 ? 12000 : agentLimits.message, 'a mensagem')
    }))
  };
}

export function agentTemplate(agent) {
  const { published, version, revision, ...template } = agent;
  return { ...template, ...agentDraft(agent), active: false };
}
