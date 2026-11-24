// Modelo "Ateliê de Interiores": página única para estúdio de design de interiores. Quente, editorial e calmo.
import { document, esc, formCss, img, leadForm, video, videos } from './kit.mjs';

const fonts = ['Instrument Serif:ital@0;1', 'Manrope:wght@400;500;600'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 11 11 3M5 3h6v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `${formCss}
:root{--bg:#f3eee6;--paper:#fbf8f3;--ink:#211d18;--muted:#756c61;--faint:#a79e92;--line:rgba(33,29,24,.12);--accent:#a85b2a;--on-accent:#fff;--cursor:#211d18;--r:22px}
body{background:var(--bg);color:var(--ink);font-family:Manrope,system-ui,sans-serif;font-size:16px;line-height:1.65}
h1,h2,h3,.serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-.02em;line-height:1;margin:0}
h2 i,h1 i{color:var(--accent)}
p{margin:0}
.wrap{width:min(1300px,100% - 40px);margin-inline:auto}
.tag{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:500;color:var(--muted)}
.tag::before{content:"";width:22px;height:1px;background:currentColor}
.btn{display:inline-flex;align-items:center;gap:10px;height:50px;padding:0 24px;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-weight:500;font-size:15px;transition:background .35s}
.btn:hover{background:var(--accent)}.btn.light{background:var(--paper);color:var(--ink)}.btn.light:hover{background:#fff}
.bar{position:fixed;top:16px;left:50%;z-index:50;width:min(720px,100% - 24px);translate:-50% 0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 8px 8px 22px;border-radius:999px;background:rgba(251,248,243,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 12px 40px rgba(33,29,24,.08)}
.bar .brand{font-family:"Instrument Serif",serif;font-size:23px;text-decoration:none}
.links{display:flex;gap:26px;font-size:14px;color:var(--muted)}.links a{text-decoration:none;color:inherit;transition:color .2s}.links a:hover{color:var(--ink)}
.bar .btn{height:42px;padding:0 18px;font-size:14px}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
.hero{position:relative;height:100svh;min-height:680px;overflow:hidden;color:#fff}
.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(33,25,18,.18),rgba(33,25,18,0) 35%,rgba(33,25,18,.62))}
.hero .in{position:absolute;z-index:2;inset:auto 0 0;padding:0 clamp(18px,2.6vw,36px) clamp(18px,2.6vw,34px)}
.hero .top{display:flex;justify-content:space-between;align-items:end;gap:30px;flex-wrap:wrap;margin-bottom:14px}
.hero .top p{max-width:360px;color:rgba(255,255,255,.88)}
.hero h1{font-size:clamp(72px,16vw,280px);line-height:.8;letter-spacing:-.04em;white-space:nowrap}
.sec{padding:clamp(110px,13vw,190px) 0}
.manifest{font-family:"Instrument Serif",serif;font-size:clamp(36px,4.6vw,74px);line-height:1.1;letter-spacing:-.02em;max-width:1180px}
.manifest .chip{display:inline-block;width:1.7em;height:.95em;border-radius:999px;overflow:hidden;vertical-align:-.08em;margin:0 .08em}
.manifest .chip img{width:100%;height:100%;object-fit:cover}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:80px;padding-top:30px;border-top:1px solid var(--line)}
.nums span{display:block;font-family:"Instrument Serif",serif;font-size:clamp(54px,6vw,96px);line-height:1}
.nums small{color:var(--muted);font-size:14px}
.head{display:flex;justify-content:space-between;align-items:end;gap:30px;flex-wrap:wrap;margin-bottom:56px}
.head h2{font-size:clamp(48px,6.4vw,104px);max-width:820px}.head p{color:var(--muted);max-width:340px}
.rooms{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.room{position:relative;aspect-ratio:3/4.6;border-radius:var(--r);overflow:hidden;color:#fff;text-decoration:none}
.room img{width:100%;height:100%;object-fit:cover}
.room::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(28,20,14,.72))}
.room .tx{position:absolute;z-index:2;inset:auto 22px 22px}
.room h3{font-size:clamp(34px,3vw,46px)}
.room p{font-size:14px;color:rgba(255,255,255,.85);max-height:0;opacity:0;overflow:hidden;transition:max-height .7s cubic-bezier(.16,1,.3,1),opacity .5s,margin .5s}
.room:hover p{max-height:90px;opacity:1;margin-top:10px}
.process{display:grid;grid-template-columns:5fr 7fr;gap:clamp(30px,6vw,100px);align-items:start}
.process .side{position:sticky;top:120px;display:grid;gap:26px}
.process h2{font-size:clamp(46px,5.4vw,86px)}
.process .side .pic{border-radius:var(--r);overflow:hidden;aspect-ratio:4/3.2}.process .side img{width:100%;height:100%;object-fit:cover}
.step{display:grid;grid-template-columns:120px 1fr;gap:24px;padding:40px 0;border-bottom:1px solid var(--line)}
.step:first-child{border-top:1px solid var(--line)}
.step b{font-family:"Instrument Serif",serif;font-weight:400;font-size:84px;line-height:.8;color:var(--faint)}
.step h3{font-family:Manrope,sans-serif;font-weight:600;font-size:21px;letter-spacing:-.02em;margin-bottom:10px}.step p{color:var(--muted);max-width:480px}
.reel .mq-t{align-items:center}
.reel .mq-t img{height:clamp(260px,32vw,460px);width:auto;aspect-ratio:3/4;object-fit:cover;border-radius:var(--r)}
.reel .mq-t img:nth-child(3n+2){aspect-ratio:4/3}
.cta{position:relative;border-radius:calc(var(--r) + 8px);overflow:hidden;color:#fff;min-height:88svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:30px;padding:60px 24px}
.cta::before{content:"";position:absolute;inset:0;background:rgba(33,25,18,.5);z-index:1}.cta>*:not(video){position:relative;z-index:2}
.cta h2{font-size:clamp(54px,8vw,136px);max-width:1100px}.cta h2 i{color:#f0c9a5}
.quotes{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(24px,4vw,60px)}
.q{display:grid;gap:26px;align-content:space-between;padding-top:28px;border-top:1px solid var(--line)}
.q p{font-family:"Instrument Serif",serif;font-size:clamp(26px,2.3vw,34px);line-height:1.18}
.q footer{display:flex;gap:14px;align-items:center;font-size:14px}.q img{width:46px;height:46px;border-radius:50%;object-fit:cover}.q b{display:block;font-weight:600}.q small{color:var(--muted)}
.faqform{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(30px,6vw,96px);align-items:start}
.faqform h2{font-size:clamp(46px,5.4vw,84px);margin-bottom:36px}
.faq details{border-bottom:1px solid var(--line);padding:24px 0}.faq details:first-of-type{border-top:1px solid var(--line)}
.faq summary{display:flex;justify-content:space-between;gap:16px;font-size:19px;font-weight:500;letter-spacing:-.01em}
.faq summary::after{content:"";flex:none;width:12px;height:12px;margin-top:6px;background:linear-gradient(currentColor,currentColor) center/12px 1.5px no-repeat,linear-gradient(currentColor,currentColor) center/1.5px 12px no-repeat;transition:transform .5s cubic-bezier(.16,1,.3,1)}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{margin-top:14px;color:var(--muted);max-width:560px}
.card{position:sticky;top:110px;padding:clamp(26px,3vw,40px);border-radius:calc(var(--r) + 6px);background:var(--ink);color:#fff;--line:rgba(255,255,255,.14);--field:rgba(255,255,255,.05);--accent:#e9b88f;--on-accent:#211d18}
.card .form h3{font-family:"Instrument Serif",serif;font-weight:400;font-size:40px}
.form input,.form select,.form textarea{border-radius:14px}.form label{font-weight:500;letter-spacing:0}.form button{height:52px}
.foot{padding:70px 0 30px}
.foot .big{font-family:"Instrument Serif",serif;font-size:clamp(72px,17vw,300px);line-height:.8;letter-spacing:-.04em;text-align:center;margin:0 0 50px;white-space:nowrap;overflow:hidden}
.foot .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:24px}.foot a{text-decoration:none}
@media (max-width:960px){
  .links,.bar .btn{display:none}.burger{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--ink);color:#fff;cursor:pointer}
  .burger::before{content:"";width:14px;height:6px;border-block:1.5px solid currentColor}
  .nav-t:checked~.links{display:flex;position:absolute;top:calc(100% + 8px);left:0;right:0;flex-direction:column;gap:0;padding:10px 22px;border-radius:24px;background:var(--paper);box-shadow:0 20px 50px rgba(0,0,0,.12);font-size:18px;color:var(--ink)}
  .nav-t:checked~.links a{padding:14px 0;border-bottom:1px solid var(--line)}
  .rooms{grid-template-columns:1fr 1fr}.process,.faqform,.quotes{grid-template-columns:1fr}.process .side,.card{position:static}
  .room p{max-height:none;opacity:1;margin-top:8px}
}
@media (max-width:560px){.rooms{grid-template-columns:1fr}.nums{grid-template-columns:1fr 1fr}.nums div:last-child{display:none}.step{grid-template-columns:70px 1fr}.step b{font-size:56px}}`;

const gallery = ['photo-1637412816281-f80ec9948fea', 'photo-1777041097323-2f2ab6734a82', 'photo-1772797583328-f83bc3f94f80', 'photo-1618221195710-dd6b41faaea6', 'photo-1729605412184-8d796f9c6f66', 'photo-1632829882891-5047ccc421bc', 'photo-1724582586458-a51791349977'];

const header = brand => `<header class="bar" data-bar><a class="brand" href="#inicio">${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"></label>
<nav class="links"><a href="#estudio">Estúdio</a><a href="#ambientes">Ambientes</a><a href="#processo">Processo</a><a href="#perguntas">Perguntas</a></nav>
<a class="btn" href="#orcamento">Orçamento</a></header>`;
const footer = brand => `<footer class="foot"><div class="wrap"><p class="big" data-fit aria-hidden="true">${esc(brand)}</p><div class="row"><span>© ${new Date().getFullYear()} ${esc(brand)} · Design de interiores</span><span>Rua Fradique Coutinho, Vila Madalena</span><span><a class="ul" href="#">Instagram</a> · <a class="ul" href="#">Pinterest</a></span><span>Fotos: Unsplash · Vídeo: Pexels</span></div></div></footer>`;

function home(brand) {
  return document({ title: `${brand} · Design de interiores`, description: 'Projetos de interiores sob medida para casas e apartamentos, do conceito à obra entregue.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero" id="inicio"><img class="kb" src="${img('photo-1637412816281-f80ec9948fea', 2400)}" alt="Sala clara com sofá de linho e luz natural">
<div class="in"><div class="top"><p class="ld" style="--d:.35s">Medimos, desenhamos, construímos e entregamos. Você só decide onde fica a poltrona.</p>
<a class="btn light ld" data-magnetic style="--d:.45s" href="#orcamento">Pedir orçamento ${arrow}</a></div>
<h1 data-fit><span class="ln"><span>${esc(brand)}</span></span></h1></div></section>

<section class="sec" id="estudio"><div class="wrap"><span class="tag rv">O estúdio</span>
<p class="manifest" data-split style="margin-top:34px">Desenhamos casas que acolhem <span class="chip"><img src="${img('photo-1724582586458-a51791349977', 200)}" alt=""></span> a rotina de cada família: onde a luz entra de manhã, onde os amigos se sentam, onde <span class="chip"><img src="${img('photo-1772797583328-f83bc3f94f80', 200)}" alt=""></span> os livros moram.</p>
<div class="nums"><div class="rv"><span class="count" style="--to:240;--suf:'+'"></span><small>projetos entregues</small></div><div class="rv"><span class="count" style="--to:15"></span><small>anos de estúdio</small></div><div class="rv"><span class="count" style="--to:98;--suf:'%'"></span><small>de clientes que indicam</small></div></div></div></section>

<section id="ambientes" style="padding-bottom:clamp(110px,13vw,190px)"><div class="wrap"><div class="head"><h2 data-split>Um projeto para <i>cada</i> ambiente</h2><p>Um cômodo ou a casa inteira, com o mesmo cuidado em cada detalhe.</p></div>
<div class="rooms">${[['Salas', 'Conforto para receber e espaço para não fazer nada.', 'photo-1724582586458-a51791349977'], ['Quartos', 'Luz baixa, tecidos naturais e silêncio.', 'photo-1729605412224-147d072d3667'], ['Cozinhas', 'Marcenaria sob medida que facilita o dia a dia.', 'photo-1484154218962-a197022b5858'], ['Estúdios', 'Para trabalhar em casa sem levar o trabalho para a sala.', 'photo-1772797583328-f83bc3f94f80']]
  .map(([n, d, p]) => `<a class="room rv ph-zoom" href="#orcamento" data-cursor="Orçar"><img src="${img(p, 800)}" alt="${n}" loading="lazy"><div class="tx"><h3>${n}</h3><p>${d}</p></div></a>`).join('')}</div></div></section>

<section id="processo" style="padding-bottom:clamp(110px,13vw,190px)"><div class="wrap process"><div class="side"><span class="tag">Como trabalhamos</span><h2 data-split>Do primeiro esboço à <i>última almofada</i>.</h2>
<div class="pic ph-zoom"><img src="${img('photo-1618221195710-dd6b41faaea6', 1000)}" alt="Sala de estar com madeira, couro e banquetas cor de terra" loading="lazy"></div></div>
<div>${[['Conversa e briefing', 'Visitamos o espaço, entendemos a rotina da casa e o orçamento disponível.'], ['Projeto em 3D', 'Você vê cada ambiente pronto, com materiais reais, antes de qualquer obra.'], ['Marcenaria e obra', 'Móveis sob medida na nossa oficina e uma arquiteta acompanhando a obra toda semana.'], ['Entrega com tudo no lugar', 'Quadros pendurados, cama arrumada e casa limpa no dia da mudança.']]
  .map(([t, d], i) => `<div class="step rv"><b>0${i + 1}</b><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}</div></div></section>

<div class="reel" style="padding-bottom:clamp(110px,13vw,190px)" data-cursor="Projetos"><div class="mq" style="--mq-s:60s;--mq-gap:16px"><div class="mq-t">${[...gallery, ...gallery].map(p => `<img src="${img(p, 800)}" alt="" loading="lazy">`).join('')}</div></div></div>

<section style="padding-bottom:clamp(110px,13vw,190px)"><div class="wrap"><div class="cta">${video(videos.ambiente, img('photo-1637412816281-f80ec9948fea', 1800))}
<span class="tag" style="color:#fff">Agenda aberta para o próximo semestre</span><h2 data-split>Vamos desenhar a <i>sua</i> casa?</h2><a class="btn light" data-magnetic href="#orcamento">Agendar uma conversa ${arrow}</a></div></div></section>

<section style="padding-bottom:clamp(110px,13vw,190px)"><div class="wrap"><div class="head"><h2 data-split>Quem já mora num projeto nosso</h2></div>
<div class="quotes">${[['“Parece que sempre moramos aqui. Cada canto tem a nossa cara.”', 'Camila e Pedro', 'Apartamento em Pinheiros', 'photo-1494790108377-be9c29b29330'], ['“Entregaram no prazo e no valor combinado. Isso não tem preço.”', 'Ricardo Menezes', 'Casa em Campinas', 'photo-1507003211169-0a1dd7228f2d'], ['“O 3D foi idêntico ao resultado. Mudei sem nenhuma surpresa.”', 'Juliana Prates', 'Cobertura na Vila Nova', 'photo-1438761681033-6461ffad8d80']]
  .map(([t, n, w, p]) => `<blockquote class="q rv" style="margin:0"><p>${t}</p><footer><img src="${img(p, 120)}" alt=""><span><b>${n}</b><small>${w}</small></span></footer></blockquote>`).join('')}</div></div></section>

<section id="perguntas" style="padding-bottom:clamp(110px,13vw,190px)"><div class="wrap faqform"><div class="faq"><h2 data-split>Perguntas <i>frequentes</i></h2>
${[['Quanto custa um projeto?', 'Depende do tamanho e da complexidade. Depois da primeira conversa enviamos uma proposta fechada, sem custo.'], ['Vocês atendem fora de São Paulo?', 'Sim. Fazemos projetos a distância com visitas planejadas e acompanhamento por vídeo.'], ['Quanto tempo leva?', 'O projeto leva de 4 a 8 semanas. A obra, de 2 a 6 meses, conforme o escopo.'], ['Posso aproveitar meus móveis?', 'Claro. Fazemos o inventário do que você tem e incorporamos ao projeto.'], ['Vocês cuidam da obra?', 'Sim, com equipe própria e parceiros de confiança, da demolição à limpeza final.']]
  .map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
<div class="card" id="orcamento">${leadForm({ title: 'Peça seu orçamento', text: 'Conte um pouco do seu espaço e marcamos uma conversa.', button: 'Quero meu orçamento', note: 'Respondemos em até um dia útil.', extra: '<label>Ambientes<select name="message"><option>Casa inteira</option><option>Sala</option><option>Quarto</option><option>Cozinha</option><option>Estúdio</option></select></label>' })}</div></div></section>
</main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:100svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:24px;padding:120px 24px}.thx h1{font-size:clamp(60px,9vw,140px)}.thx p{color:var(--muted);max-width:460px;font-size:18px}`, cursor: true, body: `${header(brand).replace(/href="#/g, 'href="page:index#')}
<main class="thx"><span class="tag ld">Mensagem recebida</span><h1><span class="ln"><span>Obrigada, <i>até já</i>.</span></span></h1><p class="ld" style="--d:.2s">Respondemos em até um dia útil para marcar a primeira conversa.</p><a class="btn ld" style="--d:.3s" href="page:index">Voltar ao início ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'interiores',
  pages: brand => [{ name: 'Início', slug: 'index', html: home(brand) }],
  thanks
};
