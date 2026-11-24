// Modelo "Litoral Noturno": imobiliária de alto padrão no litoral. Escuro, serifado e cinematográfico.
import { document, esc, formCss, img, leadForm, video, videos } from './kit.mjs';

const fonts = ['Instrument Serif:ital@0;1', 'Inter:wght@300;400;500'];
const arrow = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 11 11 3M5 3h6v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const css = `${formCss}
:root{--bg:#060b14;--panel:#0b1422;--ink:#eceae4;--muted:rgba(236,234,228,.6);--faint:rgba(236,234,228,.38);--line:rgba(236,234,228,.12);--accent:#d6b98c;--on-accent:#060b14;--cursor:#d6b98c;--field:rgba(255,255,255,.03)}
body{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-weight:300;font-size:16px;line-height:1.7}
h1,h2,h3,.serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-.015em;line-height:.98;margin:0}
p{margin:0}
.wrap{width:min(1320px,100% - 48px);margin-inline:auto}
.k{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);font-weight:400}
.link{display:inline-flex;align-items:center;gap:12px;font-size:12px;letter-spacing:.24em;text-transform:uppercase;text-decoration:none;color:var(--ink);padding:16px 0;border-bottom:1px solid var(--line);transition:gap .5s cubic-bezier(.16,1,.3,1),border-color .4s}
.link:hover{gap:18px;border-color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:12px;height:52px;padding:0 28px;border-radius:999px;border:1px solid rgba(236,234,228,.35);color:var(--ink);text-decoration:none;font-size:12px;letter-spacing:.22em;text-transform:uppercase;backdrop-filter:blur(8px);transition:background .4s,color .4s,border-color .4s}
.btn:hover{background:var(--ink);color:var(--bg);border-color:var(--ink)}
/* cabeçalho */
.bar{position:fixed;inset:0 0 auto;z-index:50}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;height:88px;gap:20px}
.bar.scrolled{background:rgba(6,11,20,.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.brand{font-family:"Instrument Serif",serif;font-size:22px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
.links{display:flex;gap:36px}.links a{font-size:12px;letter-spacing:.22em;text-transform:uppercase;text-decoration:none;color:var(--muted);transition:color .3s}.links a:hover{color:var(--ink)}
.nav-t{position:absolute;opacity:0;pointer-events:none}.burger{display:none}
/* topo */
.hero{position:relative;height:100svh;min-height:680px;overflow:hidden;display:flex;align-items:flex-end}
.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,11,20,.55) 0%,rgba(6,11,20,0) 28%,rgba(6,11,20,0) 52%,rgba(6,11,20,.92) 100%)}
.hero .wrap{position:relative;z-index:2;padding-bottom:clamp(32px,5vw,64px)}
.hero h1{font-size:clamp(64px,11.5vw,190px);line-height:.86;letter-spacing:-.03em}
.hero h1 i{color:var(--accent)}
.hero .base{display:flex;justify-content:space-between;align-items:end;gap:30px;flex-wrap:wrap;margin-top:40px;padding-top:26px;border-top:1px solid var(--line)}
.hero .base p{max-width:420px;color:var(--muted)}
.hero .base ul{display:flex;gap:28px;list-style:none;margin:0;padding:0;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
/* intro */
.sec{padding:clamp(120px,14vw,200px) 0}
.intro{display:grid;grid-template-columns:2fr 1fr;gap:clamp(40px,7vw,120px);align-items:end}
.intro h2{font-size:clamp(34px,3.9vw,60px);line-height:1.08;margin-top:30px}
.intro h2 span.m{color:var(--faint)}
.intro .pic{aspect-ratio:3/4;overflow:hidden;border-radius:2px}.intro .pic img{width:100%;height:100%;object-fit:cover}
/* residências */
.head{display:flex;justify-content:space-between;align-items:end;gap:30px;flex-wrap:wrap;margin-bottom:70px}
.head h2{font-size:clamp(52px,7.4vw,118px)}.head h2 i{color:var(--accent)}
.homes{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(18px,2.2vw,32px)}
.home{text-decoration:none;display:grid;gap:18px}
.homes{align-items:start}.home:nth-child(3n+2){margin-top:110px}
.home .pic{aspect-ratio:3/4;overflow:hidden;border-radius:2px;position:relative}.home img{width:100%;height:100%;object-fit:cover}
.home .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.home h3{font-size:clamp(28px,2.4vw,36px)}.home .price{font-family:"Instrument Serif",serif;font-size:22px;color:var(--accent);white-space:nowrap}
.home small{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);padding-top:12px;border-top:1px solid var(--line)}
/* filme */
.dusk{position:relative;height:110svh;min-height:700px;overflow:hidden;display:grid;place-items:center;text-align:center;margin-top:90px}
.dusk::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(6,11,20,.35),rgba(6,11,20,.85))}
.dusk .in{position:relative;z-index:2;display:grid;gap:34px;justify-items:center;padding:0 24px}
.dusk h2{font-size:clamp(44px,6.6vw,104px);max-width:1100px}.dusk h2 i{color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(3,minmax(140px,220px));gap:30px;margin-top:20px}
.stats span{display:block;font-family:"Instrument Serif",serif;font-size:clamp(44px,5vw,72px);line-height:1}
.stats small{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
/* regiões */
.regions .cards{display:grid;gap:18svh;padding-bottom:10svh}
.panel{position:sticky;top:12svh;display:grid;grid-template-columns:1.25fr 1fr;min-height:72svh;background:var(--panel);border:1px solid var(--line);overflow:hidden}
.panel:nth-child(2){top:14svh}.panel:nth-child(3){top:16svh}
.panel .pic{overflow:hidden}.panel img{width:100%;height:100%;object-fit:cover}
.panel .tx{padding:clamp(28px,4vw,64px);display:flex;flex-direction:column;justify-content:space-between;gap:34px}
.panel h3{font-size:clamp(48px,5.4vw,88px)}.panel p{color:var(--muted);max-width:380px;margin-top:18px}
.panel dl{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0;padding-top:24px;border-top:1px solid var(--line)}
.panel dt{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--faint)}.panel dd{margin:6px 0 0;font-family:"Instrument Serif",serif;font-size:34px}
/* interiores */
.inside{display:grid;grid-template-columns:1.4fr 1fr;gap:clamp(16px,2vw,28px);align-items:end}
.inside .a{aspect-ratio:16/11}.inside .b{aspect-ratio:3/4}
.inside .pic{overflow:hidden;border-radius:2px}.inside img{width:100%;height:100%;object-fit:cover}
.inside-head{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:end;margin-bottom:60px}
.inside-head h2{font-size:clamp(46px,5.6vw,90px)}.inside-head p{color:var(--muted);max-width:420px;justify-self:end}
/* serviços */
.svc{display:grid;grid-template-columns:110px 1fr 1fr 40px;gap:24px;align-items:baseline;padding:38px 0;border-bottom:1px solid var(--line);text-decoration:none;transition:padding .6s cubic-bezier(.16,1,.3,1)}
.svc:first-child{border-top:1px solid var(--line)}
.svc span{font-size:11px;letter-spacing:.26em;color:var(--accent)}.svc h3{font-size:clamp(34px,3.6vw,54px)}.svc p{color:var(--muted)}
.svc i{font-style:normal;color:var(--faint);transition:transform .6s cubic-bezier(.16,1,.3,1),color .3s}
.svc:hover{padding-left:20px}.svc:hover i{transform:rotate(45deg);color:var(--accent)}
/* depoimento */
.quote{text-align:center;max-width:1100px;margin:0 auto;display:grid;gap:36px;justify-items:center}
.quote blockquote{margin:0;font-family:"Instrument Serif",serif;font-size:clamp(34px,4.4vw,68px);line-height:1.08}
.quote cite{font-style:normal;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
/* contato */
.enquiry{display:grid;grid-template-columns:1fr 1fr;min-height:100svh}
.enquiry .pic{position:relative;overflow:hidden}.enquiry .pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.enquiry .tx{background:var(--panel);padding:clamp(36px,6vw,110px);display:grid;align-content:center;gap:30px}
.enquiry h2{font-size:clamp(50px,5.8vw,92px)}.enquiry .tx>p{color:var(--muted);max-width:420px}
.form input,.form select,.form textarea{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:14px 0;background:transparent}
.form input:focus,.form select:focus,.form textarea:focus{border-color:var(--accent)}
.form select option{background:var(--panel)}
.form label{font-weight:400;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
.form button{height:56px;border-radius:999px;font-size:12px;letter-spacing:.24em;text-transform:uppercase;font-weight:500}
/* rodapé */
.foot{padding:110px 0 34px}
.foot .big{font-family:"Instrument Serif",serif;font-size:clamp(70px,15vw,240px);line-height:.82;letter-spacing:-.03em;text-transform:uppercase;margin:0 0 70px;white-space:nowrap;overflow:hidden}
.foot .cols{display:grid;grid-template-columns:2fr 1fr 1fr;gap:30px;padding-bottom:60px}
.foot h4{margin:0 0 16px;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);font-weight:400}
.foot a,.foot span{display:block;color:var(--muted);text-decoration:none;margin:9px 0;width:max-content}.foot a:hover{color:var(--ink)}
.foot .base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:26px;border-top:1px solid var(--line);font-size:12px;color:var(--faint)}
.page-top{padding:clamp(160px,18vw,240px) 0 70px}.page-top h1{font-size:clamp(64px,10vw,160px)}.page-top h1 i{color:var(--accent)}
@media (max-width:960px){
  .links{display:none}.burger{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;border:1px solid var(--line);cursor:pointer}
  .burger::before{content:"";width:16px;height:7px;border-block:1px solid currentColor}
  .nav-t:checked~.links{display:flex;position:fixed;inset:88px 0 auto;flex-direction:column;gap:0;padding:10px 24px 30px;background:var(--bg)}
  .nav-t:checked~.links a{padding:18px 0;border-bottom:1px solid var(--line);font-size:14px}
  .bar .btn{display:none}
  .intro,.homes,.panel,.inside,.inside-head,.enquiry,.foot .cols{grid-template-columns:1fr}
  .home:nth-child(3n+2){margin-top:0}.panel .pic{aspect-ratio:4/3}.svc{grid-template-columns:1fr 40px;gap:10px 16px}.svc span,.svc h3,.svc p{grid-column:1}.svc i{grid-column:2;grid-row:1}
  .inside-head p{justify-self:start}.enquiry .pic{min-height:60svh}.stats{grid-template-columns:1fr 1fr 1fr;gap:14px}
}`;

const homes = [
  ['Casa Arrebentação', 'Trancoso · BA', 'photo-1711567741004-36ec757572b6', 'R$ 18,4 mi', '6 suítes', '1.200 m²'],
  ['Casa Restinga', 'Ilhabela · SP', 'photo-1730005523015-422bd53dda0b', 'R$ 9,8 mi', '5 suítes', '780 m²'],
  ['Casa Costão', 'Paraty · RJ', 'photo-1668015641954-d3685b7236e7', 'R$ 12,6 mi', '5 suítes', '950 m²'],
  ['Casa Duna', 'Florianópolis · SC', 'photo-1598737652470-59ef13fa352c', 'R$ 7,2 mi', '4 suítes', '640 m²'],
  ['Casa Coqueiral', 'Búzios · RJ', 'photo-1792830362359-f046d2b1320c', 'R$ 15,9 mi', '7 suítes', '1.400 m²'],
  ['Casa Enseada', 'Ubatuba · SP', 'photo-1707190205120-228c6656086c', 'R$ 11,3 mi', '5 suítes', '880 m²']
];

const header = brand => `<header class="bar" data-bar><div class="wrap"><a class="brand" href="page:index">${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"></label>
<nav class="links"><a href="page:index#residencias">Casas</a><a href="page:index#regioes">Regiões</a><a href="page:index#sobre">Sobre</a><a href="page:contato">Contato</a></nav>
<a class="btn" data-magnetic href="page:contato">Agendar visita</a></div></header>`;

const footer = brand => `<footer class="foot"><div class="wrap"><p class="big" data-fit aria-hidden="true">${esc(brand)}</p>
<div class="cols"><div><h4>Escritório</h4><span>Rua das Pedras, Trancoso</span><span>Visitas somente com hora marcada</span></div>
<div><h4>Navegue</h4><a class="ul" href="page:index#residencias">Casas</a><a class="ul" href="page:index#regioes">Regiões</a><a class="ul" href="page:contato">Contato</a></div>
<div><h4>Redes</h4><a class="ul" href="#">Instagram</a><a class="ul" href="#">Vimeo</a></div></div>
<div class="base"><span>© ${new Date().getFullYear()} ${esc(brand)} · CRECI</span><span>Fotos: Unsplash · Vídeo: Pexels</span></div></div></footer>`;

const enquiry = (photo, title, intro, extra) => `<section class="enquiry" id="contato"><div class="pic"><img class="kb" src="${img(photo, 1600)}" alt="Casa com piscina iluminada ao anoitecer" loading="lazy"></div>
<div class="tx"><span class="k">Agende uma visita</span><h2 data-split>${title}</h2><p>${intro}</p>
${leadForm({ button: 'Solicitar visita', note: 'Atendimento reservado. Seus dados não são compartilhados.', extra })}</div></section>`;

function home(brand) {
  return document({ title: `${brand} · Casas de praia para morar`, description: 'Casas de praia para quem quer morar o ano inteiro, com vizinhança, escola e internet mapeadas.', fonts, css, cursor: true, body: `${header(brand)}
<main>
<section class="hero"><img class="kb" src="${img('photo-1753151847465-67bebb645b40', 2400)}" alt="Casa iluminada à beira-mar à noite">
<div class="wrap"><span class="k ld">Casas de praia · Da Bahia a Santa Catarina</span>
<h1 style="margin-top:22px"><span class="ln"><span>More onde</span></span><span class="ln"><span style="--d:.1s">o <i>mar</i> manda</span></span></h1>
<div class="base ld" style="--d:.45s"><p>Casas para o ano inteiro, com a vizinhança, a escola e a internet de cada praia já mapeadas.</p>
<a class="btn" data-magnetic href="#residencias">Ver casas ${arrow}</a></div></div></section>

<section class="sec" id="sobre"><div class="wrap intro"><div><span class="k">Sobre nós</span>
<h2 data-split>Em janeiro toda praia é boa. <span class="m">A gente conta como ela é em julho: quem fica, o que abre e quanto demora o pão quentinho.</span></h2>
<a class="link" style="margin-top:40px" href="page:contato">Conversar com um consultor ${arrow}</a></div>
<div class="pic clip"><img class="par" src="${img('photo-1777041097323-2f2ab6734a82', 900)}" alt="Sala de jantar em madeira escura com luz baixa" loading="lazy"></div></div></section>

<section id="residencias" style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap"><div class="head"><h2 data-split>Prontas para <i>morar</i></h2><a class="link" href="page:contato">Lista completa sob consulta ${arrow}</a></div>
<div class="homes">${homes.map(([n, l, p, price, s, a]) => `<a class="home rv" href="page:contato" data-cursor="Ver casa"><div class="pic ph-zoom"><img src="${img(p, 1000)}" alt="${n}" loading="lazy"></div><div class="row"><h3>${n}</h3><span class="price">${price}</span></div><small><span>${l}</span><span>${s} · ${a}</span></small></a>`).join('')}</div></div></section>

<section class="dusk">${video(videos.mar, img('photo-1753151847465-67bebb645b40', 1800))}
<div class="in"><span class="k">Fora da temporada</span><h2 data-split>Passe <i>uma semana</i> na casa antes de decidir.</h2>
<div class="stats"><div><span class="count" style="--to:20"></span><small>Casas</small></div><div><span class="count" style="--to:14"></span><small>Anos no litoral</small></div><div><span class="count" style="--to:6"></span><small>Estados</small></div></div></div></section>

<section class="sec regions" id="regioes"><div class="wrap"><div class="head"><h2 data-split>Onde <i>atuamos</i></h2></div>
<div class="cards">${[['Trancoso', 'Falésias, vilas de pescadores e o Quadrado iluminado à noite. Casas escondidas na mata, a poucos passos do mar.', 'photo-1711567741004-36ec757572b6', '8', '40 min'],
  ['Ilhabela', 'Mata atlântica descendo até a água, acesso por balsa ou barco e praias que só se alcançam por trilha.', 'photo-1730005523015-422bd53dda0b', '6', '25 min'],
  ['Búzios', 'Pedras, enseadas calmas e villas com vista para o pôr do sol, a duas horas do Rio de Janeiro.', 'photo-1792830362359-f046d2b1320c', '6', '2 h']]
  .map(([n, t, p, c, d]) => `<article class="panel"><div class="pic"><img class="par" src="${img(p, 1400)}" alt="${n}" loading="lazy"></div><div class="tx"><span class="k">Região</span><div><h3>${n}</h3><p>${t}</p></div><dl><div><dt>Casas</dt><dd>${c}</dd></div><div><dt>Do aeroporto</dt><dd>${d}</dd></div></dl></div></article>`).join('')}</div></div></section>

<section style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap"><div class="inside-head"><h2 data-split>Por dentro, o mesmo <i style="color:var(--accent)">silêncio</i>.</h2><p>Interiores pensados para a luz do fim do dia: madeira escura, pedra natural e janelas que enquadram o mar.</p></div>
<div class="inside"><div class="pic a clip"><img class="par" src="${img('photo-1729605412224-147d072d3667', 1500)}" alt="Quarto com parede de vidro e vista para o entardecer" loading="lazy"></div><div class="pic b clip"><img class="par" src="${img('photo-1772411650649-f88111bcb8a5', 900)}" alt="Sala escura com janela para o lago ao pôr do sol" loading="lazy"></div></div></div></section>

<section style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap">${[['Venda assessorada', 'Do primeiro contato à escritura, com análise completa do imóvel e da documentação.'], ['Semana de teste', 'Você mora na casa por sete dias, fora da temporada, e só depois decide.'], ['Gestão para temporada', 'Locação curta, manutenção e equipe para proprietários que vivem longe.'], ['Avaliação reservada', 'Estudo de preço com comparáveis da região, sem anúncio público.']]
  .map(([t, d], i) => `<a class="svc" href="page:contato"><span>0${i + 1}</span><h3>${t}</h3><p>${d}</p><i>${arrow}</i></a>`).join('')}</div></section>

<section style="padding-bottom:clamp(120px,14vw,200px)"><div class="wrap quote"><span class="k">Depoimento</span>
<blockquote data-split>“Na semana de teste descobrimos a padaria, o pediatra e os vizinhos. A casa foi a parte fácil.”</blockquote><cite>Família Andrade · Casa Arrebentação</cite></div></section>

${enquiry('photo-1707190205120-228c6656086c', 'Conte o que você procura.', 'Um consultor responde em até um dia útil, por WhatsApp ou e-mail, no idioma que você preferir.', '<label>Região de interesse<select name="message"><option>Trancoso</option><option>Ilhabela</option><option>Búzios</option><option>Outra região</option></select></label>')}
</main>
${footer(brand)}` });
}

function contact(brand) {
  return document({ title: `Agendar visita · ${brand}`, description: 'Agende uma visita com hora marcada.', fonts, css, cursor: true, body: `${header(brand)}
<main><section class="page-top"><div class="wrap"><span class="k ld">Visitas com hora marcada</span><h1 style="margin-top:24px"><span class="ln"><span>Vamos <i>conversar</i>.</span></span></h1></div></section>
${enquiry('photo-1792830362359-f046d2b1320c', 'Agende sua visita.', 'Diga quais casas despertaram seu interesse e as datas em que você pode vir. Organizamos o resto.', '<label>Mensagem<textarea name="message" rows="3" placeholder="Casas de interesse, datas…"></textarea></label>')}</main>
${footer(brand)}` });
}

function thanks(brand) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}.thx{min-height:100svh;display:grid;place-content:center;justify-items:center;text-align:center;gap:26px;padding:120px 24px}.thx h1{font-size:clamp(56px,8vw,130px)}.thx p{color:var(--muted);max-width:460px}`, cursor: true, body: `${header(brand)}
<main class="thx"><span class="k ld">Pedido recebido</span><h1><span class="ln"><span>Até <i style="color:var(--accent)">breve</i>.</span></span></h1><p class="ld" style="--d:.2s">Um consultor entra em contato em até um dia útil para combinar a sua visita.</p><a class="btn ld" style="--d:.3s" href="page:index">Voltar ao início ${arrow}</a></main>
${footer(brand)}` });
}

export default {
  id: 'litoral',
  pages: brand => [{ name: 'Início', slug: 'index', html: home(brand) }, { name: 'Contato', slug: 'contato', html: contact(brand) }],
  thanks
};
