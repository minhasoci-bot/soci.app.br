// Conversation SLA timers: one record per inbound message that started a timer, shared by the inbox, the
// SLA analytics and the workflow engine (trigger "SLA da conversa").

export const SLA_CHANNELS = ['WhatsApp', 'Email', 'SMS', 'Live chat', 'Instagram', 'Facebook'];

export function slaRecords(state, clock = Date.now()) {
  const settings = state.conversationSla;
  if (!settings?.enabled || !settings.startedAt) return [];
  const pending = new Map();
  const dismissedUntil = new Map();
  const records = [];
  for (const message of state.messages) {
    if (message.created < settings.startedAt || !SLA_CHANNELS.includes(message.channel)) continue;
    const key = `${message.contactId}:${message.channel}`;
    if (message.direction === 'Inbound') {
      if (message.created <= (dismissedUntil.get(key) || '')) continue;
      if (message.slaDismissedAt) {
        dismissedUntil.set(key,message.slaDismissedAt);
        const record = makeSlaRecord(settings, pending.get(key) || message, +new Date(message.slaDismissedAt), false);
        records.push({ ...record, state:'Dismissed' });
        pending.delete(key);
        continue;
      }
      if (!pending.has(key)) pending.set(key, message);
      continue;
    }
    const inbound = pending.get(key);
    if (!inbound || message.origin === 'internal') continue;
    if (message.origin === 'workflow' && (settings.automation === 'none' ||
      (settings.automation === 'selected' && !settings.workflows.includes(message.workflowId)))) continue;
    records.push(makeSlaRecord(settings,inbound,new Date(message.created).getTime(),true));
    pending.delete(key);
  }
  for (const inbound of pending.values()) records.push(makeSlaRecord(settings,inbound,clock,false));
  return records;
}

function makeSlaRecord(settings, inbound, until, answered) {
  const targets = settings.mode === 'channel' ? settings.channels?.[inbound.channel] || settings.common : settings.common;
  const elapsed = Math.max(0, (until - new Date(inbound.created).getTime()) / 60000);
  const state = answered ? (elapsed >= targets.overdue ? 'Breached' : 'Met') :
    elapsed >= targets.overdue ? 'Overdue' : elapsed >= targets.soon ? 'Due soon' : 'Waiting';
  return { id: inbound.id, contactId: inbound.contactId, channel: inbound.channel, started: inbound.created, elapsed, answered, state };
}
