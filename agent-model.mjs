import { randomUUID } from 'node:crypto';
import {
  agentDraft, agentIcons, agentLimits, agentResources, agentRevision, agentTemplate as templateById, changedAgentFields,
  memoryKinds, scheduleOptions, triggerType
} from './ui/agents-data.js';
import { agentKnowledge, validBases } from './ai-model.mjs';
import { kbLimits } from './ui/ai-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = value => (typeof value === 'string' ? value.trim() : '');

function requiredText(value, limit, label) {
  const result = text(value);
  if (!result || result.length > limit) fail(`Preencha ${label} com até ${limit.toLocaleString('pt-BR')} caracteres.`);
  return result;
}

function optionalText(value, limit, label) {
  const result = text(value);
  if (result.length > limit) fail(`Use até ${limit.toLocaleString('pt-BR')} caracteres em ${label}.`);
  return result;
}

function validTriggers(list) {
  if (!Array.isArray(list) || list.length > agentLimits.triggers) fail(`Adicione até ${agentLimits.triggers} gatilhos.`);
  const seen = new Set();
  return list.flatMap(trigger => {
    const type = triggerType(trigger?.type);
    if (!type) fail('Escolha um gatilho da lista.');
    let value = '';
    if (type.field) {
      value = requiredText(trigger.value, agentLimits.triggerValue, `o campo ${type.field.label.toLowerCase()} do gatilho`);
      if (type.field.options && !type.field.options.includes(value)) fail(`Escolha a frequência entre ${scheduleOptions.join(', ')}.`);
    }
    const key = `${type.id}:${value.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [value ? { type: type.id, value } : { type: type.id }];
  });
}

function validSubagents(list) {
  if (!Array.isArray(list) || list.length > agentLimits.subagents) fail(`Adicione até ${agentLimits.subagents} subagentes.`);
  return list.map(item => ({
    name: requiredText(item?.name, agentLimits.subagentName, 'o nome do subagente'),
    when: requiredText(item?.when, agentLimits.subagentWhen, 'quando o subagente é chamado'),
    instructions: requiredText(item?.instructions, agentLimits.subagentInstructions, 'as instruções do subagente')
  }));
}

function validDraft(draft) {
  if (!Array.isArray(draft.knowledge) || draft.knowledge.length > agentLimits.sources) {
    fail(`Adicione até ${agentLimits.sources} fontes de conhecimento.`);
  }
  const resources = draft.resources && typeof draft.resources === 'object' ? draft.resources : {};
  return {
    name: requiredText(draft.name, agentLimits.name, 'o nome'),
    icon: agentIcons.includes(draft.icon) ? draft.icon : 'spark',
    description: optionalText(draft.description, agentLimits.description, 'a descrição'),
    instructions: requiredText(draft.instructions, agentLimits.instructions, 'as instruções'),
    knowledge: draft.knowledge.map(source => ({
      title: requiredText(source?.title, agentLimits.sourceName, 'o título da fonte'),
      text: requiredText(source?.text, agentLimits.sourceText, 'o conteúdo da fonte')
    })),
    bases: Array.isArray(draft.bases) ? [...new Set(draft.bases.filter(id => typeof id === 'string'))].slice(0, kbLimits.agentBases) : [],
    triggers: validTriggers(draft.triggers ?? [{ type: 'chat' }]),
    subagents: validSubagents(draft.subagents ?? []),
    resources: Object.fromEntries(agentResources.map(([key]) => [key, resources[key] === true]))
  };
}

function findAgent(state, id) {
  const agent = state.agents.find(item => item.id === id);
  if (!agent) fail('Agente não encontrado nesta subconta.', 404);
  return agent;
}

function checkRevision(agent, revision) {
  if (revision !== agentRevision(agent)) fail('O agente foi alterado em outra sessão. Recarregue antes de editar novamente.', 409);
}

function created(state, input) {
  const custom = input.template ? (state.agentTemplatesCustom || []).find(item => item.id === input.template) : null;
  const template = custom || (input.template ? templateById(input.template) : null);
  if (input.template && !template) fail('Modelo de agente não encontrado.', 404);
  const known = new Set((state.knowledgeBases || []).map(base => base.id));
  const base = template ? validDraft({ ...agentDraft(template), bases: (template.bases || []).filter(id => known.has(id)) }) : {
    ...validDraft({
      name: requiredText(input.name || 'Novo agente / Nuevo agente', agentLimits.name, 'o nome'),
      description: input.description,
      instructions: text(input.instructions) || 'Ajude o usuário com clareza em português e espanhol latino. / Ayude al usuario con claridad en portugués y español latino.',
      knowledge: []
    })
  };
  const at = new Date().toISOString();
  const agent = { id: randomUUID(), created: at, updated: at, revision: randomUUID(), ...base, folder: '', memory: [], active: false };
  state.agents.push(agent);
  return agent;
}

export function editAgent(state, operation, input) {
  if (operation === 'create') return created(state, input);
  const agent = findAgent(state, input.id);
  const at = new Date().toISOString();
  if (operation === 'memory') return editMemory(agent, input);
  checkRevision(agent, input.revision);
  switch (operation) {
    case 'save':
      Object.assign(agent, validDraft(input), { bases: validBases(state, input.bases) });
      delete agent.role;
      break;
    case 'publish':
      if (agent.published && !changedAgentFields(agent).length && agent.published.model === input.model) return agent;
      agent.version = (agent.version || 0) + 1;
      agent.published = { ...validDraft(agentDraft(agent)), version: agent.version, at, model: input.model };
      agent.active = true;
      break;
    case 'unpublish':
      agent.published = null;
      agent.active = false;
      break;
    case 'move':
      agent.folder = optionalText(input.folder, agentLimits.folder, 'o nome da pasta');
      break;
    case 'delete':
      state.agents = state.agents.filter(item => item.id !== agent.id);
      state.agentRuns = (state.agentRuns || []).filter(run => run.agent !== agent.id);
      return null;
    default:
      fail('Operação desconhecida.', 404);
  }
  agent.revision = randomUUID();
  agent.updated = at;
  return agent;
}

// Memory is runtime data, not configuration: it never changes the revision an open editor holds.
function editMemory(agent, input) {
  agent.memory ||= [];
  if (input.action === 'remove') {
    agent.memory = agent.memory.filter(item => item.id !== input.memoryId);
    return agent;
  }
  if (input.action !== 'add') fail('Operação de memória desconhecida.', 404);
  if (!memoryKinds.some(([kind]) => kind === input.kind)) fail('Escolha o tipo de memória.');
  if (agent.memory.length >= agentLimits.memory) fail(`O agente guarda até ${agentLimits.memory} memórias. Remova uma para adicionar outra.`);
  agent.memory.push({ id: randomUUID(), kind: input.kind, text: requiredText(input.text, agentLimits.memoryText, 'a memória'), at: new Date().toISOString() });
  return agent;
}

export function agentPreview(state, input) {
  const agent = findAgent(state, input.id);
  if (input.revision !== agentRevision(agent)) fail('O agente foi alterado. Recarregue a página para testar a versão atual.', 409);
  if (!['draft', 'published'].includes(input.version)) fail('Escolha o rascunho ou a versão publicada para testar.');
  const config = input.version === 'published' ? agent.published : agent;
  if (!config) fail('Publique uma versão do agente para testá-la.', 404);
  const draft = validDraft(agentDraft(config));
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 9 || messages.length % 2 !== 1) {
    fail('Envie uma mensagem ou reinicie a conversa de teste.');
  }
  return {
    draft,
    retrieved: agentKnowledge(state, draft.bases, typeof messages.at(-1) === 'string' ? messages.at(-1) : ''),
    model: input.version === 'published' ? config.model : undefined,
    memory: draft.resources.memory ? (agent.memory || []).map(({ kind, text: fact }) => ({ kind, text: fact })) : [],
    messages: messages.map((message, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: requiredText(message, index % 2 ? 12000 : agentLimits.message, 'a mensagem')
    }))
  };
}

// The current draft plus a validated change request, for the builder chat.
export function agentBuildRequest(state, input) {
  const agent = findAgent(state, input.id);
  checkRevision(agent, input.revision);
  return { current: agentDraft(agent), request: requiredText(input.request, agentLimits.request, 'o pedido') };
}

// The builder may rewrite the configuration but never the knowledge sources.
export function applyAgentDesign(state, input, design) {
  const agent = findAgent(state, input.id);
  const draft = { ...agentDraft(agent), ...design, knowledge: agentDraft(agent).knowledge };
  return editAgent(state, 'save', { ...draft, id: input.id, revision: input.revision });
}

export function recordAgentRun(state, { agent, version, input, output, kind = 'test', model = '', usage, ms, error, sources }) {
  state.agentRuns ||= [];
  const run = {
    id: randomUUID(), agent, version, kind, at: new Date().toISOString(),
    input: String(input || '').slice(0, 280), output: String(output || '').slice(0, 600),
    ...(model && { model }), ...(usage && { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cost: usage.cost }),
    ...(ms !== undefined && { ms }), ...(error && { error: String(error).slice(0, 200) }),
    ...(sources?.length && { sources: sources.slice(0, 8) })
  };
  state.agentRuns.unshift(run);
  state.agentRuns.length = Math.min(state.agentRuns.length, 100);
  return run;
}

// Snapshot copy: configuration only, never versions or what the agent remembers about people.
export function agentTemplate(agent) {
  const { published, version, revision, memory, role, ...template } = agent;
  return { ...template, ...agentDraft(agent), bases: [], memory: [], active: false };
}
