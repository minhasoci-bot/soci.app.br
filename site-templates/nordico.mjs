// Modelo "Estúdio Nórdico": estúdio de mobiliário. Creme e grafite, marca enorme, grade rigorosa e muito ar.
import { document, esc, formCss, img, leadForm } from './kit.mjs';

const fonts = ['Inter Tight:wght@300;400;500;600'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `${formCss}
:root{--bg:#efebe3;--paper:#f8f6f1;--ink:#151514;--muted:#6d6a64;--faint:#a19d95;--line:rgba(21,21,20,.13);--accent:#151514;--on-accent:#efebe3;--cursor:#151514}
body{background:var(--bg);color:var(--ink);font-family:"Inter Tight",system-ui,sans-serif;font-size:16px;line-height:1.55;letter-spacing:-.01em}
h1,h2,h3{font-weight:500;letter-spacing:-.045em;line-height:.95;margin:0}
p{margin:0}
.wrap{width:min(1360px,100% - 40px);margin-inline:auto}
.label{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:500}
.btn{display:inline-flex;align-items:center;justify-content:space-between;gap:48px;height:50px;padding:0 20px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:500;font-size:15px;min-width:220px;transition:gap .5s cubic-bezier(.16,1,.3,1)}
.btn:hover{gap:64px}.btn.line{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
/* cabeçalho */
.bar{position:sticky;top:0;z-index:50;background:rgba(239,235,227,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar .wrap{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:64px;gap:20px}
.brand{font-weight:600;letter-spacing:.04em;text-decoration:none;font-size:15px}
.links{display:flex;gap:28px;font-size:14px}.links a{text-decoration:none;color:var(--muted);transition:color .2s}.links a:hover{color:var(--ink)}
.bar .end{justify-self:end;display:flex;align-items:center;gap:18px;font-size:14px}.bar .end a{text-decoration:none}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
/* topo */
.hero{padding-top:18px;border-bottom:1px solid var(--line)}
.hero .word{font-size:clamp(96px,24.6vw,440px);font-weight:500;letter-spacing:-.075em;line-height:.76;margin:0 0 0 -.04em;white-space:nowrap}
.stage{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:20px;align-items:end;margin-top:28px}
.stage .ph{overflow:hidden;background:#e2ddd3}.stage img{width:100%;height:100%;object-fit:cover}
.stage .a{aspect-ratio:3/4}.stage .b{aspect-ratio:4/4.4}
.stage .side{display:grid;gap:22px;padding-bottom:6px}
.stage .side p{font-size:clamp(22px,2vw,30px);letter-spacing:-.035em;line-height:1.12}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;padding:20px 0;margin-top:28px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
.sec{padding:clamp(110px,12vw,180px) 0}
.head{display:flex;justify-content:space-between;align-items:end;gap:24px;flex-wrap:wrap;margin-bottom:48px}
.head h2{font-size:clamp(52px,7vw,120px)}
/* coleção */
.cats{border-top:1px solid var(--ink)}
.cat{position:relative;display:grid;grid-template-columns:90px 1fr auto 50px;align-items:center;gap:20px;padding:24px 0;border-bottom:1px solid var(--line);text-decoration:none}
.cat h3{font-size:clamp(40px,6vw,96px);font-weight:400;transition:transform .7s cubic-bezier(.16,1,.3,1),color .3s}
.cat small{color:var(--muted);font-size:14px}
.cat i{font-style:normal;justify-self:end;opacity:0;transform:translateX(-10px);transition:.5s cubic-bezier(.16,1,.3,1)}
.cat .thumb{position:absolute;left:58%;top:50%;width:clamp(150px,15vw,230px);aspect-ratio:4/5;object-fit:cover;opacity:0;transform:translate(-50%,-50%) scale(.8) rotate(-5deg);transition:opacity .4s,transform .8s cubic-bezier(.16,1,.3,1);pointer-events:none;z-index:2}
.cat:hover h3{transform:translateX(20px)}.cat:hover i{opacity:1;transform:none}
.cat:hover .thumb{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(3deg)}
/* processo */
.intro{display:grid;grid-template-columns:1fr 2fr;gap:24px;margin-bottom:70px}
.intro h2{font-size:clamp(38px,4.6vw,72px)}
.steps{display:grid;gap:28px}
.step{position:sticky;top:90px;display:grid;grid-template-columns:1fr 1fr;min-height:68svh;background:var(--paper);border:1px solid var(--line)}
.step:nth-child(2){top:106px}.step:nth-child(3){top:122px}.step:nth-child(4){top:138px}
.step .tx{padding:clamp(24px,3.6vw,52px);display:flex;flex-direction:column;justify-content:space-between;gap:30px}
.step .n{font-size:clamp(90px,10vw,160px);font-weight:300;letter-spacing:-.07em;line-height:.8;color:#cfc8bb}
.step h3{font-size:clamp(34px,3.6vw,56px);margin-bottom:14px}.step p{color:var(--muted);max-width:420px;font-size:17px}
.step .ph{overflow:hidden}.step img{width:100%;height:100%;object-fit:cover}
/* materiais */
.materials{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.mat .ph{aspect-ratio:4/5;overflow:hidden;margin-bottom:20px;background:#e2ddd3}.mat img{width:100%;height:100%;object-fit:cover}
.mat h3{font-size:34px;margin-bottom:10px}.mat p{color:var(--muted);max-width:340px}
/* peças */
.products{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border-block:1px solid var(--line)}
.prod{background:var(--bg);padding:20px;text-decoration:none;display:grid;gap:16px;transition:background .4s}
.prod:hover{background:var(--paper)}
.prod .ph{aspect-ratio:3/4;overflow:hidden;background:#e2ddd3}.prod img{width:100%;height:100%;object-fit:cover}
.prod .row{display:flex;justify-content:space-between;font-size:16px;font-weight:500}.prod small{color:var(--muted)}
/* chamada */
.studio{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;align-items:stretch}
.studio .ph{overflow:hidden;min-height:560px;position:relative}.studio .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.studio .tx{background:var(--ink);color:var(--bg);padding:clamp(28px,4vw,64px);display:flex;flex-direction:column;justify-content:space-between;gap:40px}
.studio h2{font-size:clamp(44px,5vw,84px)}.studio p{color:rgba(239,235,227,.7);max-width:380px}
.studio .btn{background:var(--bg);color:var(--ink);align-self:start}
/* contato */
.contact{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,100px)}
.contact h1{font-size:clamp(64px,9vw,150px)}
.contact .lines{display:grid;margin-top:46px;border-top:1px solid var(--line)}.contact .lines span{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--line)}.contact .lines small{color:var(--muted)}
.form input,.form textarea,.form select,.form button{border-radius:0}.form{--field:var(--paper)}.form label{font-weight:500;letter-spacing:.02em}.form button{height:54px}
/* rodapé */
.foot{border-top:1px solid var(--line);padding:30px 0 0;overflow:hidden}
.foot .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;font-size:13px;color:var(--muted)}.foot a{text-decoration:none}
.foot .word{font-size:clamp(90px,23vw,420px);font-weight:500;letter-spacing:-.075em;line-height:.76;margin:40px 0 -.06em -.04em;white-space:nowrap}
@media (max-width:960px){
  .links{display:none}.bar .wrap{grid-template-columns:1fr auto}.bar .end a:not(.burger){display:none}
  .burger{display:grid;place-items:center;width:44px;height:44px;cursor:pointer}.burger::before{content:"";width:18px;height:7px;border-block:1.5px solid currentColor}
  .nav-t:checked~.links{display:flex;position:fixed;inset:64px 0 auto;flex-direction:column;gap:0;padding:8px 20px 24px;background:var(--bg);border-bottom:1px solid var(--line)}
  .nav-t:checked~.links a{padding:16px 0;border-bottom:1px solid var(--line);font-size:20px;color:var(--ink)}
  .stage{grid-template-columns:1fr 1fr}.stage .side{grid-column:span 2}.meta{grid-template-columns:1fr 1fr}
  .intro,.step,.materials,.studio,.contact{grid-template-columns:1fr}.step .ph{aspect-ratio:16/10}
  .products{grid-template-columns:1fr 1fr}.cat{grid-template-columns:50px 1fr 30px}.cat small,.cat .thumb{display:none}
}`;

const products = [['Cadeira Fio', 'R$ 2.480', 'photo-1699588772787-1eed3b726e0a'], ['Cadeira Haste', 'R$ 1.960', 'photo-1650476524564-f94dc9669067'], ['Poltrona Ninho', 'R$ 5.650', 'photo-1785535573662-417e82193598'], ['Aparador Trama', 'R$ 4.320', 'photo-1696774276977-131fc18de2a0']];

const header = brand => `<header class="bar" data-bar><div class="wrap"><a class="brand" href="page:index">${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu">
<nav class="links"><a href="page:index#colecao">Coleção</a><a href="page:index#processo">Processo</a><a href="page:index#materiais">Materiais</a><a href="page:contato">Showroom</a></nav>
<div class="end"><a class="ul" href="page:contato">Pedir catálogo</a><label for="nav-t" class="burger" aria-hidden="true"></label></div></div></header>`;
const footer = brand => `<footer class="foot"><div class="wrap"><div class="row"><span>© ${new Date().getFullYear()} ${esc(brand)} · Estúdio de mobiliário</span><span>Showroom na Rua Harmonia, Vila Madalena</span><span><a class="ul" href="#">Instagram</a> · <a class="ul" href="page:contato">Contato</a></span><span>Fotos: Unsplash</span></div><p class="word" data-fit aria-hidden="true">${esc(brand)}</p></div></footer>`;

function home(brand) {
  return document({ title: `${brand} · Estúdio de mobiliário`, description: 'Móveis desenhados e produzidos em pequena escala, com madeira certificada e acabamento à mão.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero"><div class="wrap"><h1 class="word" data-fit><span class="ln"><span>${esc(brand)}</span></span></h1>
<div class="stage"><div class="ph a clip"><img class="par" src="${img('photo-1622880355742-af182a61b362', 900)}" alt="Cadeira de madeira junto a uma persiana"></div>
<div class="ph b clip"><img class="par" src="${img('photo-1699588772787-1eed3b726e0a', 1500)}" alt="Cadeira de compensado em fundo claro"></div>
<div class="side ld" style="--d:.4s"><span class="label">Estúdio de mobiliário</span><p>Peças que duram gerações, desenhadas para o uso de todo dia.</p><a class="btn" data-magnetic href="#colecao">Ver coleção ${arrow}</a></div></div>
<div class="meta ld" style="--d:.55s"><span>Madeira certificada FSC</span><span>Produção em pequena escala</span><span>Entrega em todo o Brasil</span><span>Garantia de 10 anos</span></div></div></section>

<section class="sec" id="colecao"><div class="wrap"><div class="head"><h2 data-split>Coleção</h2><span class="label">Passe o mouse para ver</span></div>
<div class="cats">${[['Cadeiras', 'photo-1650476524564-f94dc9669067', '12 modelos'], ['Mesas', 'photo-1597072689227-8882273e8f6a', '8 modelos'], ['Poltronas', 'photo-1785535573662-417e82193598', '6 modelos'], ['Aparadores', 'photo-1696774276977-131fc18de2a0', '5 modelos'], ['Objetos', 'photo-1631125915361-b749fdeea230', '14 modelos']]
  .map(([n, p, c], i) => `<a class="cat" href="page:contato" data-cursor="Ver"><span class="label">0${i + 1}</span><h3>${n}</h3><small>${c}</small><i>${arrow}</i><img class="thumb" src="${img(p, 500)}" alt="" loading="lazy"></a>`).join('')}</div></div></section>

<section id="processo" style="padding-bottom:clamp(110px,12vw,180px)"><div class="wrap"><div class="intro"><span class="label">Processo</span><h2 data-split>Do desenho à sua casa, cada peça passa por quatro etapas, todas feitas aqui.</h2></div>
<div class="steps">${[['Desenho', 'Cada peça começa no papel e passa por protótipos em escala real até ficar confortável e bonita.', 'photo-1597960194599-22929afc25b1'], ['Madeira', 'Carvalho, freijó e nogueira de manejo certificado, secos naturalmente por meses.', 'photo-1590880795696-20c7dfadacde'], ['Montagem', 'Encaixes tradicionais, sem parafusos aparentes, feitos por marceneiros com décadas de ofício.', 'photo-1547609434-b732edfee020'], ['Acabamento', 'Óleos naturais aplicados à mão em várias demãos, para a madeira envelhecer bem.', 'photo-1497219055242-93359eeed651']]
  .map(([t, d, p], i) => `<article class="step"><div class="tx"><span class="n">0${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div></div><div class="ph"><img src="${img(p, 1100)}" alt="${t}" loading="lazy"></div></article>`).join('')}</div></div></section>

<section id="materiais" style="padding-bottom:clamp(110px,12vw,180px)"><div class="wrap"><div class="head"><h2 data-split>Materiais</h2><span class="label">Escolhidos para durar</span></div>
<div class="materials">${[['Carvalho', 'Firme e claro, com veios marcados. Fica mais bonito com o tempo e com o uso.', 'photo-1597072689227-8882273e8f6a'], ['Linho', 'Tecido natural, respirável e resistente, nos estofados e nas almofadas.', 'photo-1785535573662-417e82193598'], ['Cerâmica', 'Peças feitas à mão por ateliês parceiros para completar a casa.', 'photo-1633000116322-d7f5cb7d3ebb']]
  .map(([t, d, p]) => `<article class="mat rv"><div class="ph ph-zoom"><img src="${img(p, 900)}" alt="${t}" loading="lazy"></div><h3>${t}</h3><p>${d}</p></article>`).join('')}</div></div></section>

<section style="padding-bottom:clamp(110px,12vw,180px)"><div class="wrap"><div class="head"><h2 data-split>Mais procurados</h2><a class="btn line" href="page:contato">Pedir catálogo ${arrow}</a></div>
<div class="products">${products.map(([n, price, p]) => `<a class="prod" href="page:contato" data-cursor="Encomendar"><div class="ph ph-zoom"><img src="${img(p, 800)}" alt="${n}" loading="lazy"></div><div class="row"><span>${n}</span><span>${price}</span></div><small>Sob encomenda · 30 dias</small></a>`).join('')}</div></div></section>

<section style="padding-bottom:clamp(110px,12vw,180px)"><div class="wrap studio"><div class="ph clip"><img class="par" src="${img('photo-1597960194599-22929afc25b1', 1500)}" alt="Oficina de marcenaria com bancadas e luz natural" loading="lazy"></div>
<div class="tx"><span class="label" style="color:rgba(239,235,227,.6)">Showroom</span><div><h2 data-split>Sente, toque e escolha a madeira.</h2><p style="margin-top:20px">Visite o showroom com hora marcada e conheça as peças, os tecidos e os acabamentos de perto.</p></div><a class="btn" data-magnetic href="page:contato">Agendar visita ${arrow}</a></div></div></section>
</main>
${footer(brand)}` });
}

function contact(brand) {
  return document({ title: `Showroom · ${brand}`, description: 'Visite o showroom ou peça o catálogo completo com medidas e prazos.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="sec"><div class="wrap contact"><div><span class="label ld">Showroom e encomendas</span><h1 style="margin-top:20px"><span class="ln"><span>Vamos</span></span><span class="ln"><span style="--d:.08s">conversar.</span></span></h1>
<div class="lines ld" style="--d:.3s"><span>Rua Harmonia, Vila Madalena <small>Showroom</small></span><span>Ter. a sáb., 10h às 19h <small>Com hora marcada</small></span><span>Encomendas em todo o Brasil <small>Entrega</small></span></div></div>
<div class="ld" style="--d:.2s">${leadForm({ button: 'Enviar', note: 'Respondemos em até um dia útil com catálogo e prazos.', extra: '<label>Mensagem<textarea name="message" rows="4" placeholder="Peça de interesse, medidas, prazo…"></textarea></label>' })}</div></div></section></main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:80svh;display:grid;align-content:center;gap:28px;padding:80px 0}.thx h1{font-size:clamp(64px,10vw,170px)}.thx p{color:var(--muted);font-size:20px;max-width:520px}`, cursor: true, body: `${header(brand)}
<main class="wrap thx"><span class="label ld">Mensagem recebida</span><h1><span class="ln"><span>Obrigado.</span></span></h1><p class="ld" style="--d:.2s">Enviamos o catálogo e os prazos em até um dia útil.</p><a class="btn ld" style="--d:.3s" href="page:index">Voltar ao início ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'nordico',
  pages: brand => [{ name: 'Início', slug: 'index', html: home(brand) }, { name: 'Contato', slug: 'contato', html: contact(brand) }],
  thanks
};
