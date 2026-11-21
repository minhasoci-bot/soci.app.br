// The public review page of a sub-account: stars, a comment and, after sending, the public review sites.
// Every customer sees the same options whatever the score (no review gating, as Google requires).
import { reputationOf } from './reputation-model.mjs';

export const reviewPageCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const color = value => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#d6246e');

export function renderReviewPage(state, { workspace, token = '', contactName = '', done = false, tint = '' }) {
  const settings = reputationOf(state);
  const business = state.profile?.name || 'Nossa empresa';
  const accent = color(tint);
  const sites = [['Google', settings.googleUrl], ['Facebook', settings.facebookUrl], [settings.otherLabel || 'Outro site', settings.otherUrl]].filter(([, href]) => href);
  const first = String(contactName || '').split(/\s+/)[0];
  const siteLinks = sites.map(([label, href]) => `<a class="site" href="${h(href)}" target="_blank" rel="noopener noreferrer">Avaliar no ${h(label)}</a>`).join('');
  const thanks = `<section class="thanks" data-thanks ${done ? '' : 'hidden'}><h2>Obrigado pela avaliação!</h2>
    <p>${sites.length ? 'Se puder, publique também a sua avaliação. Isso ajuda outras pessoas a nos encontrar.' : 'Recebemos a sua opinião.'}</p>${siteLinks ? `<div class="sites">${siteLinks}</div>` : ''}</section>`;
  const form = done ? '' : `<form data-review novalidate>
      <fieldset class="stars-field"><legend>Sua nota</legend><div class="stars">
        ${[5, 4, 3, 2, 1].map(score => `<input type="radio" name="score" id="s${score}" value="${score}" required><label for="s${score}" title="${score} de 5"><span class="sr">${score} de 5</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/></svg></label>`).join('')}
      </div></fieldset>
      <label>Conte como foi (opcional)<textarea name="text" rows="4" maxlength="2500" placeholder="O que você mais gostou? O que podemos melhorar?"></textarea></label>
      ${token ? '' : '<label>Seu nome<input name="name" maxlength="80" autocomplete="name"></label>'}
      <label class="hp" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
      <button>Enviar avaliação</button>
      <p class="status" role="alert" data-status></p>
    </form>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Avalie ${h(business)}</title>
<style>
:root{--accent:${accent};--ink:#101828;--dim:#475467;--line:#e4e7ec;--bg:#f5f6f8;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#f2f4f7;--dim:#a6adbb;--line:#2a2f3a;--bg:#0f1115;--card:#171a21}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{width:100%;max-width:460px;padding:28px 24px;border-radius:20px;background:var(--card);border:1px solid var(--line)}
.brand{margin:0 0 4px;color:var(--dim);font-size:14px;font-weight:600}h1{margin:0 0 6px;font-size:24px;line-height:1.25;letter-spacing:-.02em}h2{margin:0 0 6px;font-size:20px}
p{margin:0 0 16px;color:var(--dim)}form{display:grid;gap:16px}label{display:grid;gap:6px;font-size:14px;font-weight:600}
textarea,input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;color:inherit;background:transparent}
textarea:focus,input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
.stars-field{margin:0;padding:0;border:0}.stars-field legend{margin-bottom:6px;padding:0;font-size:14px;font-weight:600}.stars{display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:6px}
.stars input{position:absolute;opacity:0;width:1px;height:1px}.stars label{cursor:pointer}.stars svg{width:42px;height:42px;fill:var(--line);transition:fill .15s}
.stars input:checked~label svg,.stars label:hover svg,.stars label:hover~label svg{fill:#f5b301}.stars input:focus-visible+label svg{outline:2px solid var(--accent);border-radius:6px}
button,.site{display:inline-flex;justify-content:center;align-items:center;min-height:46px;padding:0 18px;border:0;border-radius:12px;background:var(--accent);color:#fff;font:600 16px system-ui,sans-serif;text-decoration:none;cursor:pointer}
button[disabled]{opacity:.6;cursor:wait}.sites{display:grid;gap:10px}.site{background:transparent;color:var(--ink);border:1px solid var(--line)}
.status{margin:0;min-height:1.5em;color:#b42318;font-size:14px}.hp{position:absolute;left:-9999px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.stars svg{transition:none}}
</style></head><body><main>
<p class="brand">${h(business)}</p>
<h1>${h(first && !done ? `${first}, ${settings.title.charAt(0).toLowerCase()}${settings.title.slice(1)}` : settings.title)}</h1>
${done ? '' : `<p>${h(settings.intro)}</p>`}
${form}${thanks}
</main>
<script>
const form = document.querySelector('[data-review]');
if (form) form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = form.querySelector('[data-status]'), button = form.querySelector('button');
  const data = Object.fromEntries(new FormData(form));
  if (!data.score) { status.textContent = 'Escolha de 1 a 5 estrelas.'; return; }
  button.disabled = true; status.textContent = '';
  try {
    const response = await fetch(${JSON.stringify(`/api/avaliar/${workspace}`)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, token: ${JSON.stringify(token)} }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível enviar. Tente de novo.');
    form.remove(); document.querySelector('[data-thanks]').hidden = false; document.querySelector('h1 + p')?.remove();
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
</script></body></html>`;
}
