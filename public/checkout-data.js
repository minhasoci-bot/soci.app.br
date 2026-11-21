// Pedidos e Checkouts abandonados (Pagamentos): labels and defaults shared by the server and the app.

export const checkoutStatuses = [['open', 'Em andamento', 'blue'], ['abandoned', 'Abandonado', 'gold'], ['recovered', 'Recuperado', 'green'], ['converted', 'Concluído', '']];
export const checkoutTabs = [['all', 'Todos'], ['abandoned', 'Abandonados'], ['recovered', 'Recuperados'], ['open', 'Em andamento'], ['converted', 'Concluídos']];
export const checkoutVariables = [['cliente', 'Nome do cliente'], ['loja', 'Nome da loja'], ['itens', 'Itens do carrinho'], ['valor', 'Valor do carrinho'], ['empresa', 'Nome da empresa']];
export const abandonedDefaults = () => ({
  enabled: true, afterMinutes: 60,
  subject: '{{cliente}}, seu carrinho na {{loja}} está guardado',
  message: 'Olá, {{cliente}}.\n\nVocê deixou {{itens}} no carrinho da {{loja}}, num total de {{valor}}. Guardamos tudo para você terminar quando quiser.'
});

export const orderStatusNames = { Pending: ['Pendente', 'blue'], Paid: ['Pago', 'green'], Fulfilled: ['Entregue', 'green'], Cancelled: ['Cancelado', ''] };
export const orderTabs = [['all', 'Todos'], ['Pending', 'Pendentes'], ['Paid', 'Pagos'], ['Fulfilled', 'Entregues'], ['Cancelled', 'Cancelados']];

/**
 * Pedidos of the sub-account: store orders and offer sales (invoices with an offer), as one list with the
 * columns of GoHighLevel's Orders (customer, source, items, date, amount, status).
 */
export function orderRows(s) {
  const stores = new Map((s.stores || []).map(row => [row.id, row.name]));
  const offers = new Map((s.offers || []).map(row => [row.id, row.title]));
  const contacts = new Map((s.contacts || []).map(row => [row.id, row]));
  const store = (s.orders || []).map(order => ({ id: order.id, kind: 'store', number: `#${order.number}`, created: order.created, name: order.name || contacts.get(order.contactId)?.name || '',
    email: order.email || contacts.get(order.contactId)?.email || '', contactId: order.contactId, source: `Loja · ${stores.get(order.storeId) || 'excluída'}`, storeId: order.storeId,
    items: (order.items || []).map(line => ({ name: line.name, qty: line.qty, price: line.price, total: line.total })), total: order.total, status: order.status, order }));
  const sales = (s.invoices || []).filter(row => row.offerId).map(invoice => {
    const contact = contacts.get(invoice.contactId);
    return { id: invoice.id, kind: 'offer', number: invoice.number || '—', created: invoice.created, name: contact?.name || '', email: contact?.email || '', contactId: invoice.contactId,
      source: `Oferta · ${offers.get(invoice.offerId) || invoice.title}`, items: [{ name: offers.get(invoice.offerId) || invoice.title, qty: 1, price: invoice.value, total: invoice.value }],
      total: invoice.value, status: invoice.status === 'Paid' ? 'Paid' : invoice.status === 'Void' ? 'Cancelled' : 'Pending', invoice };
  });
  return [...store, ...sales].sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
}
