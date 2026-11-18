// Shared by the browser and the server: the conditions a conversation filter or saved view can use.
export const inboxFilterFields = [
  ['assigned', 'Atribuída a'],
  ['follower', 'Seguidor'],
  ['mention', 'Menção'],
  ['direction', 'Direção da última mensagem'],
  ['outboundType', 'Tipo da última mensagem enviada'],
  ['channel', 'Canal da última mensagem'],
  ['tag', 'Tag'],
  ['sla', 'SLA']
];
export const inboxSorts = [
  ['latest', 'Mais recentes · todas as mensagens'],
  ['oldest', 'Mais antigas · todas as mensagens'],
  ['latest-manual', 'Mais recentes · mensagens manuais'],
  ['oldest-manual', 'Mais antigas · mensagens manuais'],
  ['sla-overdue', 'SLA mais atrasado'],
  ['sla-next', 'Próximo prazo de SLA']
];
// Values that do not depend on the workspace's data.
export const fixedRuleValues = {
  direction: [['Inbound', 'Recebida'], ['Outbound', 'Enviada']],
  outboundType: [['human', 'Manual'], ['workflow', 'Automação'], ['internal', 'Interna']],
  channel: [['Note', 'Nota'], ['Email', 'E-mail'], ['SMS', 'SMS'], ['WhatsApp', 'WhatsApp'], ['Live chat', 'Chat ao vivo']],
  sla: [['Overdue', 'Atrasado'], ['Due soon', 'Vence em breve'], ['Waiting', 'No prazo']]
};
const fieldIds = inboxFilterFields.map(([id]) => id);

// Returns a clean rule, or null when the input is not a valid condition.
export function inboxRule(rule) {
  if (!rule || typeof rule !== 'object' || !fieldIds.includes(rule.field) || !['is', 'not'].includes(rule.op)) return null;
  const value = typeof rule.value === 'string' ? rule.value.trim().slice(0, 120) : '';
  if (fixedRuleValues[rule.field] && !fixedRuleValues[rule.field].some(([id]) => id === value)) return null;
  if (!value && rule.field !== 'assigned') return null;
  return { field: rule.field, op: rule.op, value };
}
