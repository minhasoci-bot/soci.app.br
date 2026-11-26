// Links de pagamento: cada link ativo tem uma página pública (/pagar/<subconta>/<link>) com o produto, o preço
// e nome + e-mail. A compra cria (ou acha) o contato e uma fatura em aberto que a AbacatePay cobra por Pix ou
// cartão, como a oferta; paga, a fatura vira transação com origem "Link de pagamento".
import { checkoutCss, offerPageCsp } from './offer-page.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const mail = value => { const email = str(value, 254).toLowerCase(); return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) ? email : ''; };
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const paymentLinkCsp = offerPageCsp;
export const paymentLinkPath = (workspace, linkId) => `/pagar/${encodeURIComponent(workspace)}/${encodeURIComponent(linkId)}`;

/** The link and its product when the link can be paid online: active, product active, one-time price of R$ 1,00 or more. */
export function sellableLink(s, linkId) {
  const link = (s.paymentLinks || []).find(row => row.id === linkId && row.active);
  const product = link && s.products.find(row => row.id === link.productId && row.active);
  if (!link || !product) fail('Este link de pagamento não está disponível.', 404);
  if (product.kind === 'Recurring') fail('Este link é de um produto recorrente. A assinatura é feita com a equipe.', 409);
  if (!(product.price >= 1)) fail('Este link ainda não tem um preço para cobrar.', 409);
  return { link, product };
}

// 'payment-link-checkout': name and e-mail find or create the contact; an open invoice holds the charge.
export function paymentLinkCheckout(s, linkId, d, { add, run }) {
  const { link, product } = sellableLink(s, linkId);
  const email = mail(d.email) || fail('Informe um e-mail válido.');
  const name = str(d.name, 120) || fail('Informe seu nome.');
  let contact = s.contacts.find(row => (row.email || '').toLowerCase() === email);
  if (!contact) {
    contact = add(s, 'contacts', { name, email, phone: '', tags: ['link-de-pagamento'], company: '', notes: '', custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  }
  const invoice = add(s, 'invoices', { title: product.name, contactId: contact.id, value: product.price, due: new Date().toISOString().slice(0, 10), status: 'Open' });
  invoice.paymentLinkId = link.id;
  return invoice.id;
}

export function renderPaymentLinkPage(state, { link, product }, { workspace, status = '', color: tint = '' }) {
  const color = /^#[\da-f]{6}$/i.test(tint) ? tint : '#b71889';
  const notice = status === 'pago' ? '<p class="note ok" role="status">Pagamento enviado! Assim que a confirmação chegar, você recebe o comprovante por e-mail.</p>'
    : status === 'voltou' ? '<p class="note" role="status">O pagamento não foi concluído. Você pode tentar de novo quando quiser.</p>' : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(product.name)} · ${h(state.profile.name)}</title><meta name="description" content="${h((product.description || link.name).slice(0, 160))}">
<meta name="robots" content="noindex">
<style>${checkoutCss(color)}</style></head><body><main>
<div class="brand">${h(state.profile.name)}</div>
<section><h1>${h(product.name)}</h1>${product.description ? `<p class="desc">${h(product.description)}</p>` : ''}</section>
<aside aria-labelledby="buy">${notice}<p class="price" id="buy">${h(brl(product.price))}</p><p class="kind">Pagamento único via Pix ou cartão</p>
<form id="pay" novalidate><label>Nome<input name="name" required maxlength="120" autocomplete="name"></label>
<label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
<p class="note error" id="error" role="alert" hidden></p>
<button type="submit">Pagar agora</button>
<p class="fine">Você conclui o pagamento na página segura da AbacatePay.</p></form></aside>
</main><script>
const form=document.getElementById('pay'),error=document.getElementById('error');
form.addEventListener('submit',async event=>{event.preventDefault();error.hidden=true;
  if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;
  try{const response=await fetch(${JSON.stringify(`/api${paymentLinkPath(workspace, link.id)}`)},{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:form.elements.name.value,email:form.elements.email.value})});const result=await response.json();
    if(!response.ok||!result.payUrl)throw new Error(result.error||'Não foi possível concluir agora.');
    location.href=result.payUrl;
  }catch(failure){error.textContent=failure.message;error.hidden=false;button.disabled=false;}});
</script></body></html>`;
}
