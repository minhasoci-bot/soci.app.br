export const agentLimits = {
  name: 50, role: 250, instructions: 15000,
  sources: 5, sourceName: 80, sourceText: 6000, message: 2000
};

const roles = { Support: 'Atendimento', Sales: 'Vendas', Scheduling: 'Agendamento' };

export function agentDraft(agent) {
  return {
    name: agent.name,
    role: !agent.knowledge && Object.hasOwn(roles, agent.role) ? roles[agent.role] : agent.role,
    instructions: agent.instructions || '',
    knowledge: agent.knowledge || []
  };
}

export const agentRevision = agent => agent.revision || agent.updated || agent.created || '';

export function changedAgentFields(agent) {
  if (!agent.published) return [];
  const draft = agentDraft(agent);
  return Object.keys(draft).filter(field => JSON.stringify(draft[field]) !== JSON.stringify(agent.published[field]));
}
