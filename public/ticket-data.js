// Tickets: statuses and priorities shared by the server (ticket-model.mjs) and the Tickets screen.
export const ticketStatuses = [['open', 'Aberto', 'blue'], ['pending', 'Em andamento', 'gold'], ['waiting', 'Aguardando cliente', 'pink'], ['resolved', 'Resolvido', 'green'], ['closed', 'Fechado', '']];
export const ticketPriorities = [['low', 'Baixa', ''], ['medium', 'Média', 'blue'], ['high', 'Alta', 'gold'], ['urgent', 'Urgente', 'red']];

/** Where a ticket stands against its SLA: 'late', 'soon' (under 25% of the time left) or ''. */
export function slaState(ticket, at = Date.now()) {
  if (['resolved', 'closed'].includes(ticket.status)) return '';
  const due = Date.parse(ticket.firstResponseAt ? ticket.dueResolution : ticket.dueFirstResponse), start = Date.parse(ticket.created);
  if (!due) return '';
  if (at > due) return 'late';
  return (due - at) / Math.max(1, due - start) < 0.25 ? 'soon' : '';
}
