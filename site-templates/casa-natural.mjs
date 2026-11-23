// Modelo "Casa Natural": loja de móveis e decoração. Claro, quente e editorial, com vitrine de produtos.
import { document, esc, formCss, img, leadForm } from './kit.mjs';

const fonts = ['Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400', 'Hanken Grotesk:wght@400;500;600'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const icon = d => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  truck: icon('<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>'),
  card: icon('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  back: icon('<path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-2"/>'),
  tool: icon('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.3 2.3-2.4-.6-.6-2.4z"/>')
};

const css = `${formCss}
:root{--bg:#f6f2ec;--paper:#fffdf9;--ink:#25241f;--muted:#6f6b62;--faint:#a29d92;--line:rgba(37,36,31,.11);--accent:#41533b;--on-accent:#fff;--sale:#b5502c;--cursor:#25241f;--r:16px}
body{background:var(--bg);color:var(--ink);font-family:"Hanken Grotesk",system-ui,sans-serif;font-size:16px;line-height:1.6}
h1,h2,h3.serif{font-family:Newsreader,Georgia,serif;font-weight:400;letter-spacing:-.025em;line-height:1;margin:0}
h1 i,h2 i{font-style:italic;color:var(--accent)}
h3{margin:0}p{margin:0}
.wrap{width:min(1360px,100% - 40px);margin-inline:auto}
.btn{display:inline-flex;align-items:center;gap:10px;height:50px;padding:0 24px;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-weight:500;font-size:15px;transition:background .3s,gap .5s cubic-bezier(.16,1,.3,1)}
.btn:hover{background:var(--accent);gap:14px}.btn.soft{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}.btn.soft:hover{box-shadow:inset 0 0 0 1px var(--ink);background:transparent}
.notice{background:var(--accent);color:#eef1e8;font-size:13px;padding:9px 0}
.notice .mq-t span{white-space:nowrap}.notice .mq-t span::after{content:"·";margin-left:48px;opacity:.6}
.bar{position:sticky;top:0;z-index:50;background:rgba(246,242,236,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar .wrap{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:70px;gap:20px}
.links{display:flex;gap:26px;font-size:15px}.links a{text-decoration:none;color:var(--muted);transition:color .2s}.links a:hover{color:var(--ink)}
.brand{font-family:Newsreader,serif;font-size:28px;letter-spacing:-.02em;text-decoration:none}
.bar .end{justify-self:end;display:flex;gap:22px;align-items:center;font-size:15px}.bar .end a{text-decoration:none}
.bag{display:inline-flex;align-items:center;gap:8px}.bag b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px;font-weight:500}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
.hero{padding:14px 0 0}
.hero .grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:14px;height:calc(100svh - 120px);min-height:620px;max-height:880px}
.hero .copy{background:var(--paper);border-radius:var(--r);padding:clamp(28px,3.6vw,56px);display:flex;flex-direction:column;justify-content:space-between;gap:30px}
.hero .kick{font-size:13px;font-weight:500;color:var(--sale)}
.hero h1{font-size:clamp(46px,5.2vw,84px);margin:18px 0 22px}
.hero .copy p{color:var(--muted);font-size:18px;max-width:420px;margin-bottom:30px}
.trust{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding-top:22px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}.trust b{display:block;color:var(--ink);font-weight:500;font-size:14px}
.hero .photo{position:relative;border-radius:var(--r);overflow:hidden}.hero .photo>img{width:100%;height:100%;object-fit:cover}
.promo{position:absolute;right:20px;bottom:20px;display:flex;gap:14px;align-items:center;padding:10px 18px 10px 10px;border-radius:14px;background:rgba(255,253,249,.94);backdrop-filter:blur(10px);text-decoration:none}
.promo img{width:58px;height:58px;border-radius:10px;object-fit:cover}.promo b{display:block;font-weight:500}.promo small{color:var(--muted);font-size:13px}
.sec{padding:clamp(100px,11vw,160px) 0}
.head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:40px}
.head h2{font-size:clamp(42px,5vw,76px)}.head a{font-weight:500;text-decoration:none}
.cats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.cat{text-decoration:none;display:grid;gap:14px}
.cat .ph{aspect-ratio:3/4;border-radius:var(--r);overflow:hidden;background:#e9e3d9}.cat img{width:100%;height:100%;object-fit:cover}
.cat .row{display:flex;justify-content:space-between;align-items:center;font-weight:500}.cat small{color:var(--muted);font-weight:400}
.shop{display:grid;grid-template-columns:repeat(4,1fr);gap:34px 18px}
.item{text-decoration:none;display:grid;gap:12px}
.item .ph{position:relative;aspect-ratio:4/5;border-radius:var(--r);overflow:hidden;background:#ebe5db}
.item .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .6s,transform 1.2s cubic-bezier(.16,1,.3,1)}
.item .ph img+img{opacity:0}.item:hover .ph img+img{opacity:1}.item:hover .ph img{transform:scale(1.03)}
.badge{position:absolute;z-index:2;top:12px;left:12px;padding:5px 10px;border-radius:999px;background:var(--paper);font-size:12px;font-weight:600}.badge.sale{background:var(--sale);color:#fff}
.add{position:absolute;z-index:2;left:12px;right:12px;bottom:12px;height:46px;display:grid;place-items:center;border-radius:999px;background:var(--ink);color:#fff;font-size:14px;font-weight:500;opacity:0;transform:translateY(12px);transition:opacity .4s,transform .6s cubic-bezier(.16,1,.3,1)}
.item:hover .add{opacity:1;transform:none}
.item h3{font-size:16px;font-weight:500;letter-spacing:-.01em}.price{display:flex;gap:10px;align-items:baseline}.price b{font-weight:600;font-size:17px}.price s{color:var(--faint);font-size:14px}.item small{color:var(--muted);font-size:13px}
.story{display:grid;grid-template-columns:1.2fr 1fr;border-radius:var(--r);overflow:hidden;background:#e7e0d3}
.story .ph{position:relative;min-height:560px}.story .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.story .tx{padding:clamp(30px,5vw,80px);display:grid;align-content:center;gap:22px}.story h2{font-size:clamp(44px,5vw,80px)}.story p{color:var(--muted);font-size:18px;max-width:420px}
.story .kick{color:var(--sale);font-weight:500;font-size:14px}
.perks{display:grid;grid-template-columns:repeat(4,1fr);border-block:1px solid var(--line)}
.perk{padding:34px 26px;display:grid;gap:12px}.perk+.perk{border-left:1px solid var(--line)}.perk svg{color:var(--accent)}
.perk h3{font-size:17px;font-weight:600}.perk p{color:var(--muted);font-size:14.5px}
.reviews{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.rev{padding:30px;border-radius:var(--r);background:var(--paper);display:grid;gap:18px;align-content:space-between}
.rev p{font-family:Newsreader,serif;font-size:24px;line-height:1.25;letter-spacing:-.01em}.rev small{color:var(--muted);font-size:14px}.stars{color:#c99a3b;letter-spacing:3px;font-size:13px}
.news{border-radius:var(--r);background:#41533b;color:#f0f2ea;padding:clamp(32px,5vw,80px);display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,5vw,80px);align-items:center;--line:rgba(255,255,255,.22);--accent:#f0f2ea;--on-accent:#25241f;--field:rgba(255,255,255,.08)}
.news h2{font-size:clamp(44px,5vw,80px)}.news h2 i{color:#d9e4c9}.news p{color:rgba(240,242,234,.78);margin-top:18px;max-width:420px}
.form input,.form select,.form textarea{border-radius:12px}.form label{font-weight:500;letter-spacing:0}.form button{height:52px}
.foot{padding:80px 0 30px}
.foot .grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:28px;padding-bottom:50px;border-bottom:1px solid var(--line)}
.foot .brand{font-size:36px}.foot .grid p{color:var(--muted);max-width:320px;margin-top:14px}
.foot h4{margin:0 0 14px;font-size:14px;font-weight:600}.foot .grid a,.foot .grid span{display:block;color:var(--muted);text-decoration:none;margin:8px 0;font-size:15px;width:max-content}
.foot .base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:22px;font-size:13px;color:var(--faint)}
.contact{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,96px);align-items:start}.contact h1{font-size:clamp(52px,7vw,110px);margin:18px 0 24px}.contact .txt>p{color:var(--muted);font-size:18px;max-width:440px}
.contact .lines{display:grid;margin-top:40px;border-top:1px solid var(--line)}.contact .lines span{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--line)}.contact .lines small{color:var(--muted)}
.panel{background:var(--paper);border-radius:var(--r);padding:clamp(24px,3.4vw,44px)}
@media (max-width:1000px){
  .links{display:none}.bar .wrap{grid-template-columns:auto 1fr auto}.brand{grid-column:2;justify-self:center}.bar .end .ul{display:none}
  .burger{display:grid;place-items:center;width:44px;height:44px;cursor:pointer;grid-column:1;grid-row:1}.burger::before{content:"";width:18px;height:7px;border-block:1.5px solid currentColor}
  .nav-t:checked~.links{display:flex;position:fixed;inset:105px 0 auto;flex-direction:column;gap:0;padding:8px 20px 24px;background:var(--bg);border-bottom:1px solid var(--line)}
  .nav-t:checked~.links a{padding:16px 0;border-bottom:1px solid var(--line);font-size:20px;color:var(--ink)}
  .hero .grid{grid-template-columns:1fr;height:auto;max-height:none}.hero .photo{aspect-ratio:4/5}
  .cats{grid-template-columns:repeat(3,1fr)}.shop{grid-template-columns:1fr 1fr}.perks{grid-template-columns:1fr 1fr}.perk:nth-child(3){border-left:0}
  .story,.news,.reviews,.contact{grid-template-columns:1fr}.foot .grid{grid-template-columns:1fr 1fr}.add{opacity:1;transform:none}
}
@media (max-width:560px){.cats{grid-template-columns:1fr 1fr}.trust{grid-template-columns:1fr 1fr}.trust div:last-child{display:none}}`;

const notices = ['Frete grátis acima de R$ 999', 'Até 10x sem juros no cartão', '5% de desconto no Pix', 'Troca fácil em 30 dias', 'Montagem inclusa nas capitais'];
const products = [
  ['Aparador Palha Natural', 'R$ 1.890', 'R$ 2.290', 'photo-1764930680939-bfed8542e40c', 'photo-1749704648247-cc78c8909ed3', '-17%'],
  ['Cômoda Freijó e Palhinha', 'R$ 2.450', '', 'photo-1696774278451-c6ee5d685839', 'photo-1696774276977-131fc18de2a0', ''],
  ['Poltrona Linho Cru', 'R$ 1.590', '', 'photo-1785535573662-417e82193598', 'photo-1567538096630-e0c55bd6374c', 'Novo'],
  ['Cadeira Compensado', 'R$ 890', '', 'photo-1699588772787-1eed3b726e0a', 'photo-1622880355742-af182a61b362', ''],
  ['Mesa de Apoio Carvalho', 'R$ 1.180', 'R$ 1.390', 'photo-1597072689227-8882273e8f6a', 'photo-1597960194599-22929afc25b1', '-15%'],
  ['Vaso Cerâmica Areia', 'R$ 189', '', 'photo-1633000116322-d7f5cb7d3ebb', 'photo-1631125915361-b749fdeea230', ''],
  ['Cadeira Haste', 'R$ 760', '', 'photo-1650476524564-f94dc9669067', 'photo-1622880355742-af182a61b362', 'Novo'],
  ['Armário Trama Alto', 'R$ 3.290', '', 'photo-1696774276977-131fc18de2a0', 'photo-1643148636541-bca753f22846', '']
];
const installment = price => `ou 10x de R$ ${(Number(price.replace(/\D/g, '')) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const header = brand => `<div class="notice"><div class="mq" style="--mq-s:40s;--mq-gap:48px"><div class="mq-t">${[...notices, ...notices].map(n => `<span>${n}</span>`).join('')}</div></div></div>
<header class="bar" data-bar><div class="wrap"><input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"></label>
<nav class="links"><a href="page:index#produtos">Sala</a><a href="page:index#produtos">Quarto</a><a href="page:index#produtos">Decoração</a><a href="page:index#ofertas">Ofertas</a></nav>
<a class="brand" href="page:index">${esc(brand)}</a>
<div class="end"><a class="ul" href="page:contato">Atendimento</a><a class="bag" href="page:contato">Sacola <b>0</b></a></div></div></header>`;
const footer = brand => `<footer class="foot"><div class="wrap"><div class="grid"><div><a class="brand" href="page:index">${esc(brand)}</a><p>Móveis e objetos de materiais naturais para uma casa leve e acolhedora.</p></div>
<div><h4>Loja</h4><a class="ul" href="page:index#produtos">Sala</a><a class="ul" href="page:index#produtos">Quarto</a><a class="ul" href="page:index#produtos">Decoração</a></div>
<div><h4>Ajuda</h4><a class="ul" href="page:contato">Atendimento</a><a class="ul" href="page:contato">Trocas e devoluções</a><a class="ul" href="page:contato">Prazos de entrega</a></div>
<div><h4>Loja física</h4><span>Rua Oscar Freire, Jardins</span><span>Seg. a sáb., 10h às 19h</span><a class="ul" href="#">Instagram</a></div></div>
<div class="base"><span>© ${new Date().getFullYear()} ${esc(brand)}</span><span>Pix, cartão e boleto · Fotos: Unsplash</span></div></div></footer>`;

function home(brand) {
  return document({ title: `${brand} · Móveis e decoração`, description: 'Móveis e objetos de decoração em materiais naturais, com frete grátis e montagem inclusa.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero"><div class="wrap grid">
  <div class="copy"><div><span class="kick ld">Coleção de verão · 30 peças novas</span>
    <h1><span class="ln"><span>Móveis naturais</span></span><span class="ln"><span style="--d:.08s">para uma casa <i>leve</i>.</span></span></h1>
    <p class="ld" style="--d:.3s">Madeira, palhinha e linho para montar ambientes acolhedores, com entrega e montagem inclusas.</p>
    <div class="ld" style="--d:.4s;display:flex;flex-wrap:wrap;gap:10px"><a class="btn" data-magnetic href="#produtos">Comprar agora ${arrow}</a><a class="btn soft" href="#ofertas">Ver ofertas</a></div></div>
    <div class="trust ld" style="--d:.55s"><div><b>Frete grátis</b>acima de R$ 999</div><div><b>10x sem juros</b>no cartão</div><div><b>Troca em 30 dias</b>sem burocracia</div></div></div>
  <div class="photo ld" style="--d:.1s"><img class="kb" src="${img('photo-1764930680939-bfed8542e40c', 1800)}" alt="Aparador de palhinha sob uma janela redonda">
    <a class="promo" href="#produtos"><img src="${img('photo-1749704648247-cc78c8909ed3', 200)}" alt=""><span><b>Aparador Palha Natural</b><small>R$ 1.890 · 17% off</small></span></a></div>
</div></section>

<section class="sec"><div class="wrap"><div class="head"><h2 data-split>Compre por <i>ambiente</i></h2></div>
<div class="cats">${[['Sala', 'photo-1724582586458-a51791349977', '86 itens'], ['Quarto', 'photo-1729605412224-147d072d3667', '54 itens'], ['Jantar', 'photo-1777041097323-2f2ab6734a82', '41 itens'], ['Escritório', 'photo-1597072689227-8882273e8f6a', '32 itens'], ['Decoração', 'photo-1633000116322-d7f5cb7d3ebb', '120 itens']]
  .map(([n, p, c]) => `<a class="cat rv" href="#produtos" data-cursor="Ver"><div class="ph ph-zoom"><img src="${img(p, 600)}" alt="${n}" loading="lazy"></div><div class="row"><span>${n}</span><small>${c}</small></div></a>`).join('')}</div></div></section>

<section id="produtos" style="padding-bottom:clamp(100px,11vw,160px)"><div class="wrap"><div class="head"><h2 data-split>Mais <i>vendidos</i></h2><a class="ul" href="page:contato">Ver catálogo completo</a></div>
<div class="shop">${products.map(([n, price, old, a, b, badge]) => `<a class="item" href="page:contato" data-cursor="Comprar"><div class="ph">${badge ? `<span class="badge${badge.startsWith('-') ? ' sale' : ''}">${badge}</span>` : ''}<img src="${img(a, 700)}" alt="${n}" loading="lazy"><img src="${img(b, 700)}" alt="" loading="lazy"><span class="add">Adicionar à sacola</span></div>
<h3>${n}</h3><div class="price"><b>${price}</b>${old ? `<s>${old}</s>` : ''}</div><small>${installment(price)}</small></a>`).join('')}</div></div></section>

<section id="ofertas" style="padding-bottom:clamp(100px,11vw,160px)"><div class="wrap"><div class="story"><div class="ph clip"><img class="par" src="${img('photo-1772797583328-f83bc3f94f80', 1500)}" alt="Sala iluminada com estante de madeira natural" loading="lazy"></div>
<div class="tx"><span class="kick">Semana da Sala · até 30% off</span><h2 data-split>Renove a sala <i>sem reformar</i> nada.</h2><p>Sofás, poltronas e aparadores com desconto e entrega em até 15 dias.</p><a class="btn" data-magnetic style="justify-self:start" href="#produtos">Ver ofertas ${arrow}</a></div></div></div></section>

<section style="padding-bottom:clamp(100px,11vw,160px)"><div class="wrap perks">${[[icons.truck, 'Frete grátis', 'Em compras acima de R$ 999 para todo o Brasil.'], [icons.card, '10x sem juros', 'No cartão, ou 5% de desconto no Pix.'], [icons.back, 'Troca em 30 dias', 'Não gostou? Buscamos na sua casa.'], [icons.tool, 'Montagem inclusa', 'Equipe própria nas capitais.']]
  .map(([i, t, d]) => `<div class="perk">${i}<h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>

<section style="padding-bottom:clamp(100px,11vw,160px)"><div class="wrap"><div class="head"><h2 data-split>Quem comprou, <i>recomenda</i></h2><span class="stars">★★★★★ 4,9 de 5</span></div>
<div class="reviews">${[['“O aparador chegou muito bem embalado e é ainda mais bonito pessoalmente.”', 'Fernanda · São Paulo'], ['“Atendimento rápido pelo WhatsApp e montagem no dia combinado.”', 'Gustavo · Belo Horizonte'], ['“A qualidade da madeira é impecável. Já estou de olho na mesa.”', 'Larissa · Curitiba']]
  .map(([t, n]) => `<div class="rev rv"><span class="stars">★★★★★</span><p>${t}</p><small>${n}</small></div>`).join('')}</div></div></section>

<section style="padding-bottom:clamp(100px,11vw,160px)"><div class="wrap"><div class="news"><div><h2 data-split>Ganhe <i>10%</i> na primeira compra.</h2><p>Receba lançamentos, ofertas e ideias de decoração. Sem spam, e você sai quando quiser.</p></div>
${leadForm({ button: 'Quero meu cupom', note: 'O cupom chega no seu e-mail em instantes.' })}</div></div></section>
</main>
${footer(brand)}` });
}

function contact(brand) {
  return document({ title: `Atendimento · ${brand}`, description: 'Tire dúvidas sobre produtos, prazos e trocas, ou peça um orçamento.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="sec"><div class="wrap contact"><div class="txt"><span class="kick ld" style="color:var(--sale);font-weight:500;font-size:14px">Atendimento</span><h1><span class="ln"><span>Como podemos</span></span><span class="ln"><span style="--d:.08s"><i>ajudar</i>?</span></span></h1>
<p class="ld" style="--d:.2s">Tire dúvidas sobre produtos, prazos e trocas, ou peça um orçamento para vários itens.</p>
<div class="lines ld" style="--d:.3s"><span>WhatsApp <small>Seg. a sáb., 9h às 19h</small></span><span>Rua Oscar Freire, Jardins <small>Loja física</small></span><span>Entrega em todo o Brasil <small>Prazos na finalização</small></span></div></div>
<div class="panel ld" style="--d:.2s">${leadForm({ button: 'Enviar mensagem', note: 'Respondemos no mesmo dia útil.', extra: '<label>Assunto<select name="message"><option>Dúvida sobre produto</option><option>Orçamento</option><option>Entrega</option><option>Troca ou devolução</option></select></label>' })}</div></div></section></main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:72svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:24px;padding:90px 24px}.thx h1{font-size:clamp(56px,8vw,120px)}.thx p{color:var(--muted);font-size:18px;max-width:460px}`, cursor: true, body: `${header(brand)}
<main class="thx"><h1><span class="ln"><span>Recebemos, <i>obrigado</i>!</span></span></h1><p class="ld" style="--d:.2s">Nossa equipe responde ainda hoje pelo WhatsApp ou e-mail que você informou.</p><a class="btn ld" style="--d:.3s" href="page:index">Continuar comprando ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'casa-natural',
  pages: brand => [{ name: 'Início', slug: 'index', html: home(brand) }, { name: 'Atendimento', slug: 'contato', html: contact(brand) }],
  thanks
};
