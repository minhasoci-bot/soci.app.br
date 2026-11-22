// Notificações push (6.6 e a ação "Notificação push" do T.1): the devices subscribed in the sub-account. The team
// subscribes in the mobile app (app mode), contacts in the client portal. The server sends (web-push.mjs).
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const LIMIT = 300;

export function pushCommand(s, type, d, { now }) {
  if (type === 'push-subscribe') {
    // Server only: one row per device (endpoint); the newest subscription of the same device wins.
    s.pushSubscriptions ||= [];
    const endpoint = str(d.endpoint, 1000), kind = d.kind === 'contact' ? 'contact' : 'team';
    if (!/^https:\/\//.test(endpoint) || !str(d.p256dh, 200) || !str(d.auth, 100)) return '';
    s.pushSubscriptions = s.pushSubscriptions.filter(row => row.endpoint !== endpoint);
    const row = { id: `push-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind, endpoint, p256dh: str(d.p256dh, 200), auth: str(d.auth, 100),
      userId: kind === 'team' ? str(d.userId, 80) : '', contactId: kind === 'contact' ? str(d.contactId, 80) : '', app: str(d.app, 80), messages: d.messages !== false, created: now() };
    s.pushSubscriptions.push(row);
    if (s.pushSubscriptions.length > LIMIT) s.pushSubscriptions.splice(0, s.pushSubscriptions.length - LIMIT);
    return row.id;
  }
  if (type === 'push-unsubscribe' || type === 'push-gone') {
    const gone = new Set([].concat(d.endpoints || d.endpoint || []).map(String));
    const before = (s.pushSubscriptions || []).length;
    s.pushSubscriptions = (s.pushSubscriptions || []).filter(row => !gone.has(row.endpoint));
    return before - s.pushSubscriptions.length;
  }
  return undefined;
}

/** The devices a notification goes to: the team (optionally only those that want message alerts) or one contact. */
export function pushTargets(s, { target = 'team', contactId = '', messagesOnly = false } = {}) {
  return (s.pushSubscriptions || []).filter(row => target === 'contact' ? row.kind === 'contact' && row.contactId === contactId : row.kind === 'team' && (!messagesOnly || row.messages));
}

/** A new client message: the team's devices that want message alerts get a notification (through the outbox). */
export function pushInbound(s, type, ctx) {
  if (type !== 'customer_replied' || !ctx.contactId || !pushTargets(s, { messagesOnly: true }).length) return;
  const contact = s.contacts.find(row => row.id === ctx.contactId);
  if (!contact) return;
  s.workflowOutbox ||= [];
  s.workflowOutbox.push({ kind: 'push', target: 'team', messagesOnly: true, title: `${contact.name || 'Cliente'} (${ctx.channel || 'mensagem'})`,
    body: str(String(ctx.body || ''), 160) || 'Nova mensagem', url: '/app#conversations', tag: `msg-${contact.id}` });
}
