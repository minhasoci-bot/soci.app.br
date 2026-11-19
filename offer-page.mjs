// Public offer page: what is included, the price, and a name + e-mail form that enrolls or opens the payment.
import { courseOutline } from './course-model.mjs';
import { offerPrice } from './offer-model.mjs';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const offerPageCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function renderOfferPage(state, offer, { workspace, status = '', color: tint = '' }) {
  const color = /^#[\da-f]{6}$/i.test(tint) ? tint : '#b71889';
  const cover = offer.coverFileId && state.files.find(file => file.id === offer.coverFileId && file.data.startsWith('data:image/'))?.data;
  const courses = offer.courseIds.map(id => state.courses.find(row => row.id === id)).filter(Boolean);
  const groups = offer.communityIds.map(id => state.communities.find(row => row.id === id)).filter(Boolean);
  const lessons = course => courseOutline(course).reduce((sum, module) => sum + module.lessons.length, 0);
  const paid = offer.type !== 'free';
  const notice = status === 'pago' ? '<p class="note ok" role="status">Pagamento enviado! Assim que o AbacatePay confirmar, você recebe o acesso por e-mail.</p>'
    : status === 'voltou' ? '<p class="note" role="status">O pagamento não foi concluído. Você pode tentar de novo quando quiser.</p>' : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(offer.title)} · ${h(state.profile.name)}</title><meta name="description" content="${h(offer.description.slice(0, 160))}">
<style>
:root{--c:${color};--ink:#1e1821;--muted:#635a66;--line:#e8e1e9}
*{box-sizing:border-box}body{margin:0;background:#f8f6f8;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(980px,100%);margin:auto;padding:28px 16px 48px;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,1fr);gap:24px;align-items:start}
.brand{grid-column:1/-1;font-weight:750}
.cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;display:block;margin-bottom:18px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.03em;margin:0 0 12px}
.desc{white-space:pre-wrap;color:var(--muted);margin:0 0 22px}
h2{font-size:17px;margin:0 0 10px}
ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
li{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}
li b{display:block}li small{color:var(--muted)}
.mark{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--c) 12%,white);color:var(--c);font-weight:800}
aside{position:sticky;top:16px;padding:22px;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 10px 30px #1e182112}
.price{font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
.kind{color:var(--muted);margin:0 0 18px;font-size:14px}
form{display:grid;gap:12px}label{display:grid;gap:5px;font-weight:650;font-size:14px}
input{font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:10px}
input:focus-visible,button:focus-visible{outline:2px solid var(--c);outline-offset:2px}
button{font:inherit;font-weight:750;padding:13px 16px;border:0;border-radius:10px;background:color-mix(in srgb,var(--c) 75%,#151015);color:#fff;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
.note{padding:11px 13px;border-radius:10px;background:#f3eef4;margin:0 0 12px}.note.ok{background:#e8f7ef;color:#0b6b48}
.error{background:#fff5f7;color:#921c42}
.fine{font-size:12.5px;color:var(--muted);margin:4px 0 0}
@media(max-width:760px){main{grid-template-columns:1fr}aside{position:static}}
</style></head><body><main>
<div class="brand">${h(state.profile.name)}</div>
<section>${cover ? `<img class="cover" src="${h(cover)}" alt="">` : ''}<h1>${h(offer.title)}</h1>
${offer.description ? `<p class="desc">${h(offer.description)}</p>` : ''}
<h2>O que está incluído</h2><ul>
${courses.map(course => `<li><span class="mark" aria-hidden="true">▶</span><span><b>${h(course.name)}</b><small>Curso · ${courseOutline(course).length} ${courseOutline(course).length === 1 ? 'módulo' : 'módulos'} · ${lessons(course)} ${lessons(course) === 1 ? 'aula' : 'aulas'}</small></span></li>`).join('')}
${groups.map(group => `<li><span class="mark" aria-hidden="true">#</span><span><b>${h(group.name)}</b><small>Comunidade${group.description ? ` · ${h(group.description.slice(0, 120))}` : ''}</small></span></li>`).join('')}
</ul></section>
<aside aria-labelledby="buy">${notice}<p class="price" id="buy">${h(offerPrice(offer))}</p><p class="kind">${paid ? 'Pagamento único via Pix ou cartão' : 'Acesso gratuito'}</p>
<form id="offer" novalidate><label>Nome<input name="name" required maxlength="120" autocomplete="name"></label>
<label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
<p class="note error" id="error" role="alert" hidden></p>
<button type="submit">${paid ? 'Comprar agora' : 'Quero acesso gratuito'}</button>
<p class="fine">O acesso é liberado no portal do cliente e o link de entrada chega no seu e-mail.</p></form></aside>
</main><script>
const form=document.getElementById('offer'),error=document.getElementById('error');
form.addEventListener('submit',async event=>{event.preventDefault();error.hidden=true;
  if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;
  try{const response=await fetch(${JSON.stringify(`/api/offer/${workspace}/${offer.id}`)},{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:form.elements.name.value,email:form.elements.email.value})});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Não foi possível concluir agora.');
    if(result.payUrl){location.href=result.payUrl;return;}
    form.innerHTML='<p class="note ok" role="status" tabindex="-1">'+(result.emailed?'Pronto! Enviamos o link de acesso para o seu e-mail.':'Pronto! Seu acesso foi liberado. A equipe vai enviar o link de entrada para o seu e-mail.')+'</p>';
    form.querySelector('p').focus();
  }catch(failure){error.textContent=failure.message;error.hidden=false;button.disabled=false;}});
</script></body></html>`;
}
