// Modelo "Marcenaria de Origem" (id bosque): madeira rastreada. Terra escura, serifada editorial e fotos de luz baixa.
import { document, esc, formCss, img, leadForm } from './kit.mjs';

const fonts = ['Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300', 'DM Sans:wght@400;500'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `${formCss}
:root{--bg:#1b1412;--panel:#261c18;--ink:#f1e6dc;--muted:rgba(241,230,220,.64);--faint:rgba(241,230,220,.36);--line:rgba(241,230,220,.14);--accent:#e08a5f;--on-accent:#1b1412;--cursor:#e08a5f;--field:rgba(255,255,255,.03)}
body{background:var(--bg);color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;font-size:16px;line-height:1.65}
h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:300;letter-spacing:-.025em;line-height:1;margin:0}
h1 i,h2 i{font-style:italic;color:var(--accent)}
p{margin:0}
.wrap{width:min(1320px,100% - 44px);margin-inline:auto}
.tag{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:12px;height:50px;padding:0 24px;border-radius:999px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:500;font-size:15px;transition:gap .5s cubic-bezier(.16,1,.3,1),background .3s}
.btn:hover{gap:18px;background:#fff}.btn.line{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}.btn.line:hover{box-shadow:inset 0 0 0 1px var(--accent)}
.bar{position:fixed;inset:0 0 auto;z-index:50}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;height:84px;gap:20px}
.bar.scrolled{background:rgba(27,20,18,.8);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.brand{font-family:Fraunces,serif;font-size:24px;text-decoration:none;font-weight:400}
.links{display:flex;gap:30px;font-size:15px}.links a{text-decoration:none;color:var(--muted);transition:color .2s}.links a:hover{color:var(--ink)}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
.hero{position:relative;height:100svh;min-height:680px;overflow:hidden;display:flex;align-items:flex-end}
.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,15,12,.5),rgba(22,15,12,0) 30%,rgba(22,15,12,.1) 55%,rgba(22,15,12,.9))}
.hero .wrap{position:relative;z-index:2;padding-bottom:clamp(28px,4vw,52px)}
.hero h1{font-size:clamp(62px,10.5vw,180px);line-height:.9;max-width:1200px}
.hero .base{display:flex;justify-content:space-between;align-items:end;gap:30px;flex-wrap:wrap;margin-top:34px;padding-top:24px;border-top:1px solid var(--line)}
.hero .base p{max-width:380px;color:var(--muted)}
.sec{padding:clamp(120px,14vw,200px) 0}
.manifesto p{font-family:Fraunces,serif;font-weight:300;font-size:clamp(34px,4.6vw,70px);line-height:1.12;letter-spacing:-.02em;max-width:1180px;margin-top:30px}
.manifesto p span.dim{color:var(--faint)}
.top{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:50px}
.top h2{font-size:clamp(52px,7vw,116px)}
.rail{display:flex;gap:22px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 max(22px,calc((100vw - 1320px)/2)) 30px;scrollbar-width:thin;scrollbar-color:var(--accent) transparent}
.piece{flex:0 0 clamp(280px,30vw,440px);scroll-snap-align:start;text-decoration:none;display:grid;gap:16px}
.piece .ph{aspect-ratio:4/5;overflow:hidden;border-radius:4px;background:var(--panel)}.piece img{width:100%;height:100%;object-fit:cover}
.piece .row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.piece h3{font-size:32px}.piece small{color:var(--muted)}
.workshop{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(30px,6vw,100px);align-items:center}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.pair .ph{overflow:hidden;border-radius:4px;aspect-ratio:3/4}.pair .ph:last-child{margin-top:110px}.pair img{width:100%;height:100%;object-fit:cover}
.workshop h2{font-size:clamp(44px,5.4vw,86px);margin:22px 0 26px}.workshop .txt>p{color:var(--muted);font-size:17px;max-width:520px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:44px 0;padding-top:24px;border-top:1px solid var(--line)}
.facts span{display:block;font-family:Fraunces,serif;font-weight:300;font-size:clamp(44px,4.6vw,68px);line-height:1}.facts small{color:var(--muted);font-size:14px}
.journal{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.post{text-decoration:none;display:grid;gap:16px}.post .ph{aspect-ratio:4/3;overflow:hidden;border-radius:4px}.post img{width:100%;height:100%;object-fit:cover}
.post small{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}.post h3{font-size:clamp(26px,2.2vw,32px);line-height:1.12}
.order{display:grid;grid-template-columns:1fr 1fr;min-height:100svh}
.order .ph{position:relative;overflow:hidden}.order .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.order .tx{background:var(--panel);padding:clamp(36px,6vw,104px);display:grid;align-content:center;gap:28px}
.order h2{font-size:clamp(48px,5.6vw,90px)}.order .tx>p{color:var(--muted);max-width:420px}
.form input,.form select,.form textarea{border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;padding:14px 0}
.form input:focus,.form textarea:focus,.form select:focus{border-color:var(--accent)}.form select option{background:var(--panel)}
.form label{font-weight:400;color:var(--faint);letter-spacing:.04em}.form button{height:54px;border-radius:999px;font-weight:500}
.foot{padding:100px 0 30px}
.foot .big{font-family:Fraunces,serif;font-weight:300;font-size:clamp(64px,13vw,220px);line-height:.85;letter-spacing:-.035em;margin:0 0 70px;white-space:nowrap;overflow:hidden}.foot .big i{color:var(--accent)}
.foot .grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:28px;padding-bottom:50px}
.foot h4{margin:0 0 14px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:400}
.foot a,.foot span{display:block;color:var(--muted);text-decoration:none;margin:8px 0;width:max-content}
.foot .base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:22px;border-top:1px solid var(--line);font-size:13px;color:var(--faint)}
.page-top{padding:clamp(160px,18vw,230px) 0 70px}.page-top h1{font-size:clamp(64px,9vw,150px)}
@media (max-width:960px){
  .links,.bar .btn{display:none}.burger{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);cursor:pointer}
  .burger::before{content:"";width:16px;height:7px;border-block:1px solid currentColor}
  .nav-t:checked~.links{display:flex;position:fixed;inset:84px 0 auto;flex-direction:column;gap:0;padding:10px 22px 28px;background:var(--bg)}
  .nav-t:checked~.links a{padding:16px 0;border-bottom:1px solid var(--line);font-size:20px;color:var(--ink)}
  .workshop,.journal,.order,.foot .grid{grid-template-columns:1fr}.order .ph{min-height:60svh}
}`;

const pieces = [['Sofá Clareira', 'R$ 14.900', 'photo-1768946131536-39b5f3ec329d'], ['Mesa Raiz', 'R$ 9.800', 'photo-1597072689227-8882273e8f6a'], ['Cadeira Seiva', 'R$ 2.150', 'photo-1622880355742-af182a61b362'], ['Aparador Casca', 'R$ 5.400', 'photo-1643148636541-bca753f22846'], ['Cadeira Galho', 'R$ 1.980', 'photo-1650476524564-f94dc9669067'], ['Vaso Barro', 'R$ 380', 'photo-1631125915361-b749fdeea230']];

const header = brand => `<header class="bar" data-bar><div class="wrap"><a class="brand" href="page:index">${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"></label>
<nav class="links"><a href="page:index#colecao">Coleção</a><a href="page:index#oficina">Oficina</a><a href="page:index#diario">Diário</a><a href="page:contato">Contato</a></nav>
<a class="btn" data-magnetic href="page:contato">Encomendar ${arrow}</a></div></header>`;
const footer = brand => `<footer class="foot"><div class="wrap"><p class="big" data-fit aria-hidden="true">${esc(brand)}</p>
<div class="grid"><div><h4>Oficina</h4><span>Estrada do Capivari, Campos do Jordão</span><span>Ter. a sáb., 10h às 18h</span></div>
<div><h4>Navegue</h4><a class="ul" href="page:index#colecao">Coleção</a><a class="ul" href="page:index#oficina">Oficina</a><a class="ul" href="page:contato">Encomendas</a></div>
<div><h4>Siga</h4><a class="ul" href="#">Instagram</a><a class="ul" href="#">Pinterest</a></div></div>
<div class="base"><span>© ${new Date().getFullYear()} ${esc(brand)} · Feito à mão, no Brasil</span><span>Fotos: Unsplash</span></div></div></footer>`;
const order = (photo, title, intro, extra) => `<section class="order"><div class="ph"><img class="kb" src="${img(photo, 1500)}" alt="Marceneiro trabalhando a madeira" loading="lazy"></div>
<div class="tx"><span class="tag">Encomendas</span><h2 data-split>${title}</h2><p>${intro}</p>${leadForm({ button: 'Enviar pedido', note: 'Respondemos com desenho, prazo e valor em até três dias úteis.', extra })}</div></section>`;

function home(brand) {
  return document({ title: `${brand} · Marcenaria autoral`, description: 'Móveis com a origem da madeira registrada, da árvore à sua sala.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero"><img class="kb" src="${img('photo-1768946131536-39b5f3ec329d', 2200)}" alt="Sofá texturizado sob luz do fim de tarde">
<div class="wrap"><span class="tag ld">Marcenaria autoral</span>
<h1 style="margin-top:20px"><span class="ln"><span>Madeira com</span></span><span class="ln"><span style="--d:.1s"><i>sobrenome</i>.</span></span></h1>
<div class="base ld" style="--d:.45s"><p>Cada peça sai com a origem da árvore, a data do corte e o nome de quem montou.</p><a class="btn line" href="#colecao">Ver a coleção ${arrow}</a></div></div></section>

<section class="sec manifesto"><div class="wrap"><span class="tag">Manifesto</span>
<p data-split>Fazemos poucos móveis por ano. Cada um começa numa tora escolhida à mão, seca devagar no galpão <span class="dim">e só sai da oficina quando está pronto para atravessar gerações.</span></p></div></section>

<section id="colecao" style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap top"><h2 data-split>A <i>coleção</i></h2><span class="tag">Arraste para o lado</span></div>
<div class="rail" data-cursor="Arrastar">${pieces.map(([n, price, p]) => `<a class="piece" href="page:contato"><div class="ph ph-zoom"><img src="${img(p, 1000)}" alt="${n}" loading="lazy"></div><div class="row"><h3>${n}</h3><small>${price}</small></div><small>Sob encomenda · 45 dias</small></a>`).join('')}</div></section>

<section id="oficina" style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap workshop"><div class="pair"><div class="ph clip"><img class="par" src="${img('photo-1547609434-b732edfee020', 900)}" alt="Marceneiro serrando madeira na oficina" loading="lazy"></div><div class="ph clip"><img class="par" src="${img('photo-1497219055242-93359eeed651', 900)}" alt="Formão esculpindo a madeira" loading="lazy"></div></div>
<div class="txt"><span class="tag">A oficina</span><h2 data-split>Quatro pessoas, um galpão e <i>muita paciência</i>.</h2>
<p>Trabalhamos com madeira de demolição e de manejo certificado. Os encaixes são feitos à mão e o acabamento é com óleo natural, para você tocar, usar e envelhecer junto com a peça.</p>
<div class="facts"><div><span class="count" style="--to:120"></span><small>peças por ano</small></div><div><span class="count" style="--to:18"></span><small>anos de ofício</small></div><div><span class="count" style="--to:100;--suf:'%'"></span><small>madeira rastreada</small></div></div>
<a class="btn line" href="page:contato">Agendar visita à oficina ${arrow}</a></div></div></section>

<section id="diario" style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap"><div class="top"><h2 data-split><i>Diário</i></h2><span class="tag">Histórias da oficina</span></div>
<div class="journal">${[['Por que deixamos a madeira secar por um ano', 'Processo', 'photo-1590880795696-20c7dfadacde'], ['Como cuidar de móveis com acabamento a óleo', 'Cuidados', 'photo-1597960194599-22929afc25b1'], ['Uma casa de campo mobiliada do zero', 'Projeto', 'photo-1777041097323-2f2ab6734a82']]
  .map(([t, c, p]) => `<a class="post rv" href="page:contato" data-cursor="Ler"><div class="ph ph-zoom"><img src="${img(p, 900)}" alt="" loading="lazy"></div><small>${c}</small><h3>${t}</h3></a>`).join('')}</div></div></section>

${order('photo-1590880795696-20c7dfadacde', 'Quer uma peça <i>sob medida</i>?', 'Conte o que você imagina: medidas, madeira, onde a peça vai morar.', '<label>Peça e medidas<textarea name="message" rows="3" placeholder="Ex.: mesa de jantar para 8 pessoas, 2,40 m"></textarea></label>')}
</main>
${footer(brand)}` });
}

function contact(brand) {
  return document({ title: `Encomendar · ${brand}`, description: 'Encomende uma peça sob medida ou agende uma visita à oficina.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="page-top"><div class="wrap"><span class="tag ld">Encomendas e visitas</span><h1 style="margin-top:22px"><span class="ln"><span>Vamos <i>conversar</i>.</span></span></h1></div></section>
${order('photo-1497219055242-93359eeed651', 'Conte o que você imagina.', 'Respondemos com desenho, prazo e valor. Visitas à oficina às terças e sábados.', '<label>Mensagem<textarea name="message" rows="4"></textarea></label>')}</main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:100svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:26px;padding:120px 24px}.thx h1{font-size:clamp(60px,9vw,150px)}.thx p{color:var(--muted);max-width:460px}`, cursor: true, body: `${header(brand)}
<main class="thx"><span class="tag ld">Pedido recebido</span><h1><span class="ln"><span>Obrigado, <i>sem pressa</i>.</span></span></h1><p class="ld" style="--d:.2s">Respondemos com desenho, prazo e valor em até três dias úteis.</p><a class="btn ld" style="--d:.3s" href="page:index">Voltar ao início ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'bosque',
  pages: brand => [{ name: 'Início', slug: 'index', html: home(brand) }, { name: 'Contato', slug: 'contato', html: contact(brand) }],
  thanks
};
