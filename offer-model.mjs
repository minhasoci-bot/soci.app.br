// Offers: a price for one course or a bundle of courses and communities. Free offers enroll at once;
// one-time offers create the buyer's contact and an invoice that AbacatePay charges, and enroll on payment.
export const offerCollections = ['offers'];
export const offerTypes = ['free', 'one_time'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const ids = (s, key, value, label) => {
  const list = [...new Set(Array.isArray(value) ? value : [])].slice(0, 100);
  for (const id of list) if (!s[key].some(row => row.id === id)) fail(`Escolha um ${label} desta subconta.`);
  return list;
};
const mail = value => { const email = str(value, 254).toLowerCase(); return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ? email : ''; };
const today = () => new Date().toISOString().slice(0, 10);

export const offerFields = {
  offers: (s, d) => {
    const prior = d.id ? s.offers.find(row => row.id === d.id) : null;
    const pick = key => d[key] === undefined ? prior?.[key] : d[key];
    const courseIds = ids(s, 'courses', pick('courseIds'), 'curso');
    const communityIds = ids(s, 'communities', pick('communityIds'), 'comunidade');
    if (!courseIds.length && !communityIds.length) fail('Inclua pelo menos um curso ou comunidade na oferta.');
    const type = offerTypes.includes(pick('type')) ? pick('type') : 'free';
    const price = type === 'free' ? 0 : Math.round(Number(pick('price')) * 100) / 100;
    if (type !== 'free' && !(price >= 1 && price <= 1e6)) fail('Ofertas pagas custam a partir de R$ 1,00.');
    const coverFileId = str(pick('coverFileId'), 60);
    if (coverFileId && !s.files.some(file => file.id === coverFileId && file.data.startsWith('data:image/'))) fail('A capa precisa ser uma imagem da Mídia Drive.');
    return {
      title: str(pick('title'), 255) || fail('Dê um título à oferta.'), description: str(pick('description'), 2000),
      courseIds, communityIds, type, price, priceLabel: str(pick('priceLabel'), 255), coverFileId,
      status: pick('status') === 'published' ? 'published' : 'draft'
    };
  }
};

// Deleting a course or community takes it out of every offer.
export function offerBeforeDelete(s, key, id) {
  if (key === 'courses') for (const offer of s.offers) offer.courseIds = offer.courseIds.filter(row => row !== id);
  if (key === 'communities') for (const offer of s.offers) offer.communityIds = offer.communityIds.filter(row => row !== id);
}

// A buyer fills name and e-mail: the contact is found or created; paid offers also get an open invoice.
export function offerCheckout(s, offerId, d, { add, run }) {
  const offer = s.offers.find(row => row.id === offerId && row.status === 'published') || fail('Esta oferta não está disponível.', 404);
  const email = mail(d.email) || fail('Informe um e-mail válido.');
  const name = str(d.name, 120) || fail('Informe seu nome.');
  let contact = s.contacts.find(row => (row.email || '').toLowerCase() === email);
  if (!contact) {
    contact = add(s, 'contacts', { name, email, phone: '', tags: ['oferta'], company: '', notes: '', custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  }
  if (offer.type === 'free') return contact.id;
  const invoice = add(s, 'invoices', { title: offer.title, contactId: contact.id, value: offer.price, due: today(), status: 'Open' });
  invoice.offerId = offer.id;
  return invoice.id;
}

export const offerPrice = offer => offer.priceLabel || (offer.type === 'free' ? 'Gratuito' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.price));
