// Modelo "Corretora": site de corretora de imóveis com marca pessoal.
// Direção: editorial e contida, como os templates premium do Framer. Topo emoldurado (texto + foto),
// tipografia de peso 500 com espaçamento apertado, muito respiro, fotos de tom quente e coerente.
import { document, esc, formCss, img, leadForm, video, videos } from './kit.mjs';

const fonts = ['Plus Jakarta Sans:wght@400;500;600', 'Inter:wght@400;500'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 11 11 3M5 3h6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `${formCss}
:root{--bg:#fbfaf7;--soft:#f2f0ea;--ink:#0d0d0f;--muted:#5f6067;--faint:#9b9ca3;--line:rgba(13,13,15,.09);--accent:#0d0d0f;--on-accent:#fff;--live:#22a06b;--r:28px}
body{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.6;letter-spacing:-.01em}
h1,h2,h3,.disp{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-weight:500;letter-spacing:-.045em;line-height:1;margin:0}
p{margin:0}
.wrap{width:min(1280px,100% - 40px);margin-inline:auto}
.label{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--muted);letter-spacing:0}
.label::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.6}
.btn{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 22px;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-weight:500;font-size:15px;transition:transform .5s cubic-bezier(.16,1,.3,1),background .3s}
.btn svg{transition:transform .5s cubic-bezier(.16,1,.3,1)}.btn:hover svg{transform:translate(2px,-2px)}.btn:hover{transform:translateY(-1px)}.btn:active{transform:scale(.98)}
.btn.soft{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
/* cabeçalho */
.top{position:sticky;top:0;z-index:50;background:rgba(251,250,247,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;height:76px;gap:20px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-family:"Plus Jakarta Sans";font-weight:600;letter-spacing:-.03em;font-size:18px}
.brand i{width:28px;height:28px;border-radius:50%;background:var(--ink);display:grid;place-items:center;color:#fff;font-style:normal;font-size:13px}
.links{display:flex;gap:30px;font-size:15px;color:var(--muted)}.links a{text-decoration:none;color:inherit;transition:color .2s}.links a:hover{color:var(--ink)}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
/* topo */
.hero{padding:8px 0 0}
.hero .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;height:calc(100svh - 92px);min-height:640px;max-height:900px}
.hero .copy{background:var(--soft);border-radius:var(--r);padding:clamp(28px,3.6vw,56px);display:flex;flex-direction:column;justify-content:space-between}
.hero h1{font-size:clamp(46px,5.8vw,88px);margin:22px 0 26px}
.hero .lead{font-size:18px;color:var(--muted);max-width:430px;margin-bottom:34px}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line);padding-top:22px;gap:16px}
.facts b{display:block;font-family:"Plus Jakarta Sans";font-weight:500;font-size:28px;letter-spacing:-.04em;line-height:1.1}
.facts small{font-size:13px;color:var(--muted)}
.hero .photo{position:relative;border-radius:var(--r);overflow:hidden;background:#d9d6cf}
.hero .photo>img{width:100%;height:100%;object-fit:cover}
.chip{position:absolute;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.9);backdrop-filter:blur(10px);font-size:13px;font-weight:500}
.chip.tr{top:20px;right:20px}
.agent{position:absolute;left:20px;bottom:20px;display:flex;align-items:center;gap:14px;padding:10px 20px 10px 10px;border-radius:20px;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.agent img{width:52px;height:52px;border-radius:14px;object-fit:cover}
.agent b{display:block;font-weight:500;font-size:15px}.agent small{font-size:13px;color:var(--muted)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--live);box-shadow:0 0 0 4px rgba(34,160,107,.16)}
/* bairros */
.areas{padding:72px 0 0}
.areas .mq-t span{font-family:"Plus Jakarta Sans";font-weight:500;letter-spacing:-.05em;font-size:clamp(44px,6vw,92px);line-height:1;white-space:nowrap;color:transparent;-webkit-text-stroke:1px #c9c7c0}
.areas .mq-t span:nth-child(odd){color:var(--ink);-webkit-text-stroke:0}
/* seções */
.sec{padding:clamp(110px,12vw,170px) 0}
.sec-head{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:56px;flex-wrap:wrap}
.sec-head h2{font-size:clamp(38px,4.4vw,64px);max-width:760px;margin-top:18px}
.sec-head p{color:var(--muted);max-width:340px}
/* serviços */
.services{display:grid;grid-template-columns:5fr 7fr;gap:clamp(30px,6vw,96px);align-items:start}
.services .side{position:sticky;top:110px;display:grid;gap:26px}
.services h2{font-size:clamp(38px,4.2vw,62px)}
.services .side p{color:var(--muted);font-size:17px;max-width:420px}
.services .side .pic{border-radius:22px;overflow:hidden;aspect-ratio:4/3}.services .side .pic img{width:100%;height:100%;object-fit:cover}
.rows{border-top:1px solid var(--line)}
.row{position:relative;display:grid;grid-template-columns:56px 1fr 44px;gap:18px;align-items:center;padding:34px 0;border-bottom:1px solid var(--line);text-decoration:none}
.row .n{font-size:13px;color:var(--faint);font-weight:500}
.row h3{font-size:clamp(26px,2.4vw,34px);transition:transform .6s cubic-bezier(.16,1,.3,1)}
.row p{color:var(--muted);margin-top:8px;max-width:460px;font-size:15px}
.row .go{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--line);transition:background .4s,color .4s,transform .6s cubic-bezier(.16,1,.3,1)}
.row .peek{position:absolute;right:76px;top:50%;width:150px;aspect-ratio:4/3;border-radius:14px;object-fit:cover;opacity:0;transform:translateY(-50%) scale(.92) rotate(-2deg);transition:opacity .45s,transform .7s cubic-bezier(.16,1,.3,1);pointer-events:none}
.row:hover h3{transform:translateX(8px)}.row:hover .go{background:var(--ink);color:#fff;transform:rotate(45deg)}
.row:hover .peek{opacity:1;transform:translateY(-50%) scale(1) rotate(0)}
/* imóveis */
.homes{display:grid;grid-template-columns:repeat(2,1fr);gap:28px 20px}
.home{text-decoration:none;display:grid;gap:16px}
.home.big{grid-column:span 2}
.home .pic{position:relative;border-radius:22px;aspect-ratio:4/3;background:#e3e0d8}
.home.big .pic{aspect-ratio:21/9}
.home .pic img{width:100%;height:100%;object-fit:cover}
.home .tags{position:absolute;left:16px;top:16px;display:flex;gap:6px}
.home .tags span{padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.92);font-size:12.5px;font-weight:500}
.home .meta{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
.home h3{font-size:22px;letter-spacing:-.03em}
.home .where{color:var(--muted);font-size:14.5px;margin-top:4px}
.home .price{font-family:"Plus Jakarta Sans";font-weight:500;font-size:20px;letter-spacing:-.03em;white-space:nowrap}
/* vídeo */
.film{position:relative;border-radius:var(--r);overflow:hidden;height:min(86svh,820px);min-height:520px;color:#fff;display:flex;align-items:flex-end;padding:clamp(24px,4vw,56px)}
.film::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.55))}
.film>div{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:end;gap:30px;width:100%;flex-wrap:wrap}
.film h2{font-size:clamp(38px,4.8vw,72px);max-width:720px}
.film p{color:rgba(255,255,255,.82);max-width:360px;margin-top:16px}
.film .chip{position:static;color:var(--ink)}
/* sobre */
.about{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,100px);align-items:center}
.about .pic{border-radius:var(--r);overflow:hidden;aspect-ratio:4/5}.about .pic img{width:100%;height:100%;object-fit:cover}
.about h2{font-size:clamp(38px,4.2vw,62px);margin:20px 0 24px}
.about .txt>p{font-size:18px;color:var(--muted);margin-bottom:18px;max-width:520px}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:40px 0;padding-top:28px;border-top:1px solid var(--line)}
.nums span{display:block;font-family:"Plus Jakarta Sans";font-weight:500;font-size:clamp(38px,4vw,56px);letter-spacing:-.05em;line-height:1}
.nums small{font-size:13px;color:var(--muted)}
/* depoimentos */
.voices{background:var(--ink);color:#fff;border-radius:var(--r);padding:clamp(36px,6vw,96px)}
.voices .label{color:rgba(255,255,255,.6)}
.voices blockquote{margin:28px 0 0;font-family:"Plus Jakarta Sans";font-weight:400;letter-spacing:-.035em;font-size:clamp(28px,3.4vw,50px);line-height:1.12;max-width:1060px}
.who{display:flex;align-items:center;gap:14px;margin-top:34px}.who img{width:48px;height:48px;border-radius:50%;object-fit:cover}.who b{display:block;font-weight:500}.who small{color:rgba(255,255,255,.6);font-size:14px}
.more{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px;padding-top:36px;border-top:1px solid rgba(255,255,255,.14)}
.more p{font-size:18px;color:rgba(255,255,255,.85);line-height:1.5}.more .who{margin-top:20px}
.stars{color:#f2c04b;letter-spacing:3px;font-size:13px}
/* contato */
.contact{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,100px);align-items:start}
.contact h2{font-size:clamp(40px,4.8vw,72px);margin:20px 0 24px}
.contact .txt>p{color:var(--muted);font-size:18px;max-width:440px}
.ways{display:grid;margin-top:40px;border-top:1px solid var(--line)}
.ways a,.ways span{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-bottom:1px solid var(--line);text-decoration:none;font-size:16px}
.ways small{color:var(--muted);font-size:14px}
.panel{background:var(--soft);border-radius:var(--r);padding:clamp(24px,3.4vw,44px)}
.form{--field:#fff}.form input,.form select,.form textarea{border:0;box-shadow:inset 0 0 0 1px var(--line);border-radius:14px;padding:15px 16px}
.form input:focus,.form select:focus,.form textarea:focus{box-shadow:inset 0 0 0 1.5px var(--ink)}
.form label{font-weight:500;letter-spacing:0;color:var(--muted)}.form button{height:52px;font-weight:500}
/* rodapé */
.foot{padding:90px 0 28px}
.foot .cols{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:30px;padding-bottom:60px}
.foot .cols p{color:var(--muted);max-width:300px;margin-top:14px}
.foot h4{margin:0 0 14px;font-size:13px;font-weight:500;color:var(--faint)}
.foot .cols a,.foot .cols span{display:block;color:var(--ink);text-decoration:none;margin:8px 0;font-size:15px;width:max-content}
.foot .word{font-family:"Plus Jakarta Sans";font-weight:500;letter-spacing:-.065em;font-size:clamp(64px,13.4vw,210px);line-height:.8;color:#e6e3dc;margin:0;white-space:nowrap;overflow:hidden}
.foot .base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:24px;font-size:13px;color:var(--faint)}
/* páginas internas */
.page-head{padding:clamp(70px,9vw,130px) 0 56px}.page-head h1{font-size:clamp(48px,6.4vw,96px);margin:18px 0 22px}.page-head p{color:var(--muted);font-size:18px;max-width:520px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:34px}.filters span{height:40px;display:inline-flex;align-items:center;padding:0 18px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);font-size:14px;font-weight:500}.filters span:first-child{background:var(--ink);color:#fff;box-shadow:none}
@media (max-width:980px){
  .links{display:none}
  .burger{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);cursor:pointer}
  .burger::before{content:"";width:16px;height:7px;border-block:1.5px solid currentColor}
  .nav-t:checked~.links{display:flex;position:fixed;inset:76px 0 auto;flex-direction:column;gap:0;padding:8px 20px 24px;background:var(--bg);font-size:22px;color:var(--ink);box-shadow:0 30px 40px rgba(0,0,0,.06)}
  .nav-t:checked~.links a{padding:14px 0;border-bottom:1px solid var(--line)}
  .top .btn{display:none}
  .hero .grid{grid-template-columns:1fr;height:auto;max-height:none}
  .hero .photo{aspect-ratio:4/5}
  .services,.about,.contact,.more{grid-template-columns:1fr}.services .side{position:static}
  .homes{grid-template-columns:1fr}.home.big{grid-column:auto}.home.big .pic{aspect-ratio:4/3}
  .row .peek{display:none}.foot .cols{grid-template-columns:1fr 1fr}
}
@media (max-width:520px){.facts{grid-template-columns:1fr 1fr}.facts div:last-child{display:none}.nums{grid-template-columns:1fr 1fr}.nums div:last-child{display:none}.actions .btn{flex:1;justify-content:center}}`;

const homes = [
  ['Casa Jardim Europa', 'Jardim Europa, São Paulo', 'photo-1613490493576-7fde63acd811', ['Venda', '5 suítes', '640 m²'], 'R$ 8.900.000'],
  ['Casa Alto de Pinheiros', 'Alto de Pinheiros, São Paulo', 'photo-1600566753190-17f0baa2a6c3', ['Venda', '4 suítes', '410 m²'], 'R$ 4.350.000'],
  ['Casa do Lago', 'Granja Viana, Cotia', 'photo-1512917774080-9991f1c4c750', ['Venda', '4 suítes', '380 m²'], 'R$ 3.180.000'],
  ['Sobrado Vila Nova', 'Vila Nova Conceição, São Paulo', 'photo-1768200498972-fd56353d73fc', ['Locação', '3 suítes', '290 m²'], 'R$ 22.000/mês'],
  ['Casa da Serra', 'Campos do Jordão', 'photo-1568605114967-8130f3a36994', ['Venda', '4 suítes', '350 m²'], 'R$ 2.750.000'],
  ['Casa com Piscina', 'Alphaville, Barueri', 'photo-1580587771525-78b9dba3b914', ['Venda', '5 suítes', '520 m²'], 'R$ 5.400.000']
];
const areas = ['Jardins', 'Pinheiros', 'Vila Nova Conceição', 'Itaim Bibi', 'Moema', 'Alto de Pinheiros', 'Granja Viana', 'Alphaville'];

const header = brand => `<header class="top" data-bar><div class="wrap"><a class="brand" href="page:index"><i aria-hidden="true">${esc(brand.trim()[0] || 'H')}</i>${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"></label>
<nav class="links"><a href="page:index#servicos">Serviços</a><a href="page:imoveis">Imóveis</a><a href="page:index#sobre">Sobre</a><a href="page:contato">Contato</a></nav>
<a class="btn" href="page:contato">Agendar visita ${arrow}</a></div></header>`;

const footer = brand => `<footer class="foot"><div class="wrap"><div class="cols">
<div><a class="brand" href="page:index"><i aria-hidden="true">${esc(brand.trim()[0] || 'H')}</i>${esc(brand)}</a><p>Compra, venda e locação de casas em São Paulo, com atendimento do primeiro contato às chaves.</p></div>
<div><h4>Navegue</h4><a class="ul" href="page:imoveis">Imóveis</a><a class="ul" href="page:index#servicos">Serviços</a><a class="ul" href="page:index#sobre">Sobre</a></div>
<div><h4>Contato</h4><a class="ul" href="page:contato">Agendar visita</a><a class="ul" href="page:contato">Avaliar meu imóvel</a><span>Rua Oscar Freire, Jardins</span></div>
<div><h4>Redes</h4><a class="ul" href="#">Instagram</a><a class="ul" href="#">YouTube</a><a class="ul" href="#">LinkedIn</a></div></div>
<p class="word" data-fit aria-hidden="true">${esc(brand)}</p>
<div class="base"><span>© ${new Date().getFullYear()} ${esc(brand)} · CRECI-SP</span><span>Fotos: Unsplash · Vídeo: Pexels</span></div></div></footer>`;

const homeCard = ([name, where, photo, tags, price], i, big = false) => `<a class="home lift rv${big ? ' big' : ''}" href="page:contato" data-cursor="Ver imóvel">
<div class="pic ph-zoom" style="border-radius:22px"><img src="${img(photo, big ? 2000 : 1100)}" alt="${esc(name)}" loading="lazy"><div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div></div>
<div class="meta"><div><h3>${name}</h3><p class="where">${where}</p></div><span class="price">${price}</span></div></a>`;

function home(brand) {
  return document({ title: `${brand} · Corretora de imóveis em São Paulo`, description: 'Casas à venda e para alugar em São Paulo, com atendimento pessoal da primeira visita à entrega das chaves.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero"><div class="wrap grid">
  <div class="copy">
    <div><span class="label ld">Corretora em São Paulo · CRECI-SP</span>
      <h1><span class="ln"><span>Menos visitas,</span></span><span class="ln"><span style="--d:.08s">mais certeza</span></span><span class="ln"><span style="--d:.16s">na escolha.</span></span></h1>
      <p class="lead ld" style="--d:.3s">Casas à venda e para alugar nos melhores bairros de São Paulo. Eu vou com você em cada visita e cuido de toda a papelada.</p>
      <div class="actions ld" style="--d:.4s"><a class="btn" data-magnetic href="page:imoveis">Ver imóveis ${arrow}</a><a class="btn soft" href="page:contato">Avaliar meu imóvel</a></div></div>
    <div class="facts ld" style="--d:.55s"><div><b>12 anos</b><small>de mercado</small></div><div><b>1.200+</b><small>imóveis negociados</small></div><div><b>4,9 ★</b><small>nas avaliações</small></div></div>
  </div>
  <div class="photo ld" style="--d:.1s"><img class="kb" src="${img('photo-1600585154340-be6161a56a0c', 1800)}" alt="Casa moderna de concreto e vidro ao entardecer">
    <span class="chip tr">Em destaque · Alto de Pinheiros</span>
    <div class="agent"><img src="${img('photo-1772987438485-ac832640c8a5', 200)}" alt="Retrato da corretora"><div><b>${esc(brand)}</b><small>Corretora de imóveis</small></div><span class="dot" title="Atendendo hoje"></span></div></div>
</div></section>

<div class="areas" aria-label="Bairros atendidos"><div class="mq" style="--mq-s:60s;--mq-gap:56px"><div class="mq-t">${[...areas, ...areas].map(a => `<span>${a}</span>`).join('')}</div></div></div>

<section class="sec" id="servicos"><div class="wrap services">
  <div class="side"><span class="label rv">Serviços</span><h2 data-split>Um só contato para comprar, vender ou alugar.</h2>
    <p class="rv">Documentação, financiamento e negociação ficam comigo. Você só decide.</p>
    <div class="pic rv ph-zoom"><img src="${img('photo-1600607687939-ce8a6c25118c', 1100)}" alt="Sala integrada clara com sofá e cozinha" loading="lazy"></div></div>
  <div class="rows">${[
    ['Compra assistida', 'Seleciono só os imóveis que combinam com o seu pedido e vou junto em todas as visitas.', 'photo-1600210492486-724fe5c67fb0'],
    ['Venda do seu imóvel', 'Fotos e vídeo profissionais, anúncio nos maiores portais e visitas só de compradores qualificados.', 'photo-1600596542815-ffad4c1539a9'],
    ['Locação sem dor de cabeça', 'Análise do inquilino, contrato, vistoria e repasse mensal, tudo acompanhado de perto.', 'photo-1586023492125-27b2c045efd7'],
    ['Avaliação gratuita', 'Preço justo com base em vendas reais do bairro, entregue em até três dias úteis.', 'photo-1768200498972-fd56353d73fc'],
    ['Financiamento', 'Comparo as condições dos bancos e acompanho a aprovação do crédito até a assinatura.', 'photo-1600566753190-17f0baa2a6c3']
  ].map(([t, d, p], i) => `<a class="row" href="page:contato"><span class="n">0${i + 1}</span><div><h3>${t}</h3><p>${d}</p></div><span class="go">${arrow}</span><img class="peek" src="${img(p, 400)}" alt="" loading="lazy"></a>`).join('')}</div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="sec-head"><div><span class="label rv">Imóveis em destaque</span><h2 data-split>Casas que eu visitei pessoalmente.</h2></div><a class="btn soft rv" href="page:imoveis">Ver todos os imóveis ${arrow}</a></div>
  <div class="homes">${homeCard(homes[0], 0, true)}${homes.slice(1, 3).map((h, i) => homeCard(h, i + 1)).join('')}</div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap"><div class="film rv">${video(videos.casaClara, img('photo-1600607687939-ce8a6c25118c', 1800))}
  <div><div><span class="chip">● Tour em vídeo</span><h2 style="margin-top:22px">Conheça a casa antes de sair da sua.</h2><p>Todo imóvel da carteira tem tour em vídeo e planta. Você visita pessoalmente só o que realmente gostou.</p></div>
  <a class="btn soft" href="page:imoveis">Ver tours ${arrow}</a></div></div></div></section>

<section class="sec" id="sobre" style="padding-top:0"><div class="wrap about">
  <div class="pic rv ph-zoom"><img src="${img('photo-1770199105692-9e52ff137cad', 1200)}" alt="Corretora segurando as chaves de um imóvel" loading="lazy"></div>
  <div class="txt"><span class="label rv">Quem vai te atender</span><h2 data-split>Conheço cada rua dos bairros em que trabalho.</h2>
    <p class="rv">Comecei no mercado ajudando a minha própria família a comprar a primeira casa. Desde então, o meu trabalho é transformar uma decisão grande em algo simples e seguro.</p>
    <p class="rv">Atendo poucos clientes por vez, de propósito. Assim consigo estar em cada visita, cada vistoria e cada assinatura.</p>
    <div class="nums rv"><div><span class="count" style="--to:12"></span><small>anos de mercado</small></div><div><span class="count" style="--to:1200;--suf:'+'"></span><small>imóveis negociados</small></div><div><span class="count" style="--to:45"></span><small>dias, em média, para vender</small></div></div>
    <a class="btn rv" href="page:contato">Conversar comigo ${arrow}</a></div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap"><div class="voices">
  <span class="label rv">Clientes</span>
  <blockquote class="rv">“Vendemos o apartamento em trinta dias, pelo preço que queríamos, e ainda encontramos a casa nova no mesmo mês. Ela cuidou de tudo.”</blockquote>
  <div class="who rv"><img src="${img('photo-1494790108377-be9c29b29330', 120)}" alt=""><div><b>Mariana e Pedro Souza</b><small>Venderam em Moema e compraram em Pinheiros</small></div></div>
  <div class="more">${[['“Visitamos só quatro casas e a terceira já era a nossa. Nunca imaginei que seria tão simples.”', 'Rafael Lima', 'Comprou na Granja Viana', 'photo-1507003211169-0a1dd7228f2d'], ['“Explicou cada cláusula do financiamento com paciência. Me senti segura do começo ao fim.”', 'Beatriz Alves', 'Primeiro imóvel', 'photo-1438761681033-6461ffad8d80']]
    .map(([q, n, w, p]) => `<div class="rv"><span class="stars">★★★★★</span><p style="margin-top:12px">${q}</p><div class="who"><img src="${img(p, 120)}" alt=""><div><b>${n}</b><small>${w}</small></div></div></div>`).join('')}</div>
</div></div></section>

<section class="sec" id="contato" style="padding-top:0"><div class="wrap contact">
  <div class="txt"><span class="label rv">Contato</span><h2 data-split>Por onde começamos?</h2><p class="rv">Conte o que você procura. Respondo no mesmo dia, de segunda a sábado.</p>
    <div class="ways rv"><a class="ul" href="#">Falar no WhatsApp <small>Resposta em minutos</small></a><a href="page:contato">Agendar uma visita <small>Seg. a sáb., 8h às 20h</small></a><span>Rua Oscar Freire, Jardins <small>Escritório</small></span></div></div>
  <div class="panel rv">${leadForm({ button: 'Quero ser atendido', note: 'Seus dados ficam só comigo. Nada de spam.', extra: '<label>O que você procura?<select name="message"><option>Comprar uma casa</option><option>Vender meu imóvel</option><option>Alugar</option><option>Avaliação gratuita</option></select></label>' })}</div>
</div></section>
</main>
${footer(brand)}` });
}

function listing(brand) {
  return document({ title: `Imóveis · ${brand}`, description: 'Casas à venda e para alugar em São Paulo, visitadas pessoalmente pela corretora.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="page-head"><div class="wrap"><span class="label ld">Carteira atualizada toda semana</span>
<h1><span class="ln"><span>Imóveis disponíveis</span></span></h1><p class="ld" style="--d:.15s">Casas que eu visitei pessoalmente. Escolha uma e agende a visita.</p>
<div class="filters ld" style="--d:.25s"><span>Todos</span><span>Venda</span><span>Locação</span><span>Até R$ 3 milhões</span><span>4 suítes ou mais</span></div></div></section>
<section style="padding-bottom:clamp(110px,12vw,170px)"><div class="wrap homes">${homes.map((h, i) => homeCard(h, i, i === 0)).join('')}</div></section></main>
${footer(brand)}` });
}

function contact(brand) {
  return document({ title: `Contato · ${brand}`, description: 'Agende uma visita ou peça uma avaliação gratuita do seu imóvel.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="page-head"><div class="wrap"><span class="label ld">Resposta no mesmo dia</span><h1><span class="ln"><span>Vamos conversar.</span></span></h1></div></section>
<section style="padding-bottom:clamp(110px,12vw,170px)"><div class="wrap contact">
  <div class="txt"><p class="ld">Agende uma visita, peça uma avaliação gratuita ou tire dúvidas sobre financiamento.</p>
    <div class="ways ld" style="--d:.1s"><a class="ul" href="#">Falar no WhatsApp <small>Resposta em minutos</small></a><span>Seg. a sáb., 8h às 20h <small>Atendimento</small></span><span>Rua Oscar Freire, Jardins <small>Escritório</small></span></div></div>
  <div class="panel ld" style="--d:.15s">${leadForm({ button: 'Enviar mensagem', note: 'Seus dados ficam só comigo.', extra: '<label>Mensagem<textarea name="message" rows="4" placeholder="Bairro, faixa de preço, número de quartos…"></textarea></label>' })}</div>
</div></section></main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:72svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:22px;padding:80px 20px}.thx h1{font-size:clamp(44px,6vw,84px)}.thx p{color:var(--muted);font-size:18px;max-width:480px}`, body: `${header(brand)}
<main class="thx"><span class="label ld">Mensagem recebida</span><h1><span class="ln"><span>Obrigada pelo contato!</span></span></h1><p class="ld" style="--d:.15s">Eu respondo ainda hoje pelo WhatsApp ou e-mail que você informou.</p><a class="btn ld" style="--d:.25s" href="page:imoveis">Ver imóveis enquanto isso ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'corretora',
  pages: brand => [
    { name: 'Início', slug: 'index', html: home(brand) },
    { name: 'Imóveis', slug: 'imoveis', html: listing(brand) },
    { name: 'Contato', slug: 'contato', html: contact(brand) }
  ],
  thanks
};
