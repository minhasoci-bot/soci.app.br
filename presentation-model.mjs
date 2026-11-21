import { randomBytes } from 'node:crypto';
import { uid, now } from './model.mjs';
import {
  PRESENTATION_LAYOUTS,
  PRESENTATION_ICONS,
  canonicalSymbolsSvg,
  defaultBrandSvgMark,
  createCanonicalPresentationTemplates,
  createBlankPresentation,
  createPresentationFromTemplate,
  renderSlideInnerHtml
} from './ui/presentation-data.js';

export {
  PRESENTATION_LAYOUTS,
  PRESENTATION_ICONS,
  canonicalSymbolsSvg,
  defaultBrandSvgMark,
  createCanonicalPresentationTemplates,
  createBlankPresentation,
  createPresentationFromTemplate,
  renderSlideInnerHtml
};

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value).slice(0, limit) : '';

export function sanitizePresentation(input, company = {}) {
  const title = str(input.name || input.title, 120) || fail('Informe o título da apresentação.');
  const name = title;
  const description = str(input.description, 300);
  const agencyName = str(input.agencyName, 80) || company.name || 'Minha Agência';
  const agencyLogo = typeof input.agencyLogo === 'string' ? input.agencyLogo : (company.logo || '');
  const primaryColor = /^#[0-9a-f]{6}$/i.test(input.primaryColor || '') ? input.primaryColor.toLowerCase() : (company.primary || '#0b315c');
  const accentColor = /^#[0-9a-f]{6}$/i.test(input.accentColor || input.secondaryColor || '') ? (input.accentColor || input.secondaryColor).toLowerCase() : (company.secondary || '#f65b00');
  const secondaryColor = accentColor;

  const rawSlides = Array.isArray(input.slides) && input.slides.length ? input.slides : [];
  if (!rawSlides.length) fail('A apresentação precisa ter pelo menos uma lâmina.');
  if (rawSlides.length > 50) fail('A apresentação pode ter no máximo 50 lâminas.');

  const slides = rawSlides.map((s, idx) => {
    const layout = PRESENTATION_LAYOUTS.includes(s.layout) ? s.layout : 'cover';
    const id = str(s.id, 64) || `slide-${idx + 1}`;
    const eyebrow = str(s.eyebrow, 100);
    const headline = str(s.headline, 500) || 'Título do slide';
    const subheadline = str(s.subheadline, 500);
    const pill = str(s.pill, 100);
    const rule = Boolean(s.rule);
    const footer = str(s.footer, 100);

    const pills = Array.isArray(s.pills)
      ? s.pills.map(p => str(p, 80)).filter(Boolean).slice(0, 8)
      : [];

    const items = Array.isArray(s.items)
      ? s.items.map(it => ({
          icon: str(it.icon, 30) || 'i-browser',
          text: str(it.text, 150)
        })).filter(it => it.text).slice(0, 10)
      : [];

    const cards = Array.isArray(s.cards)
      ? s.cards.map(c => ({
          icon: str(c.icon, 30) || 'i-browser',
          title: str(c.title, 150),
          desc: str(c.desc, 300),
          price: str(c.price, 80),
          features: Array.isArray(c.features) ? c.features.map(f => str(f, 150)).filter(Boolean).slice(0, 10) : [],
          badge: str(c.badge, 50),
          accent: Boolean(c.accent)
        })).filter(c => c.title).slice(0, 8)
      : [];

    const steps = Array.isArray(s.steps)
      ? s.steps.map((st, sidx) => ({
          number: str(st.number, 10) || String(sidx + 1),
          title: str(st.title, 200),
          desc: str(st.desc, 300)
        })).filter(st => st.title).slice(0, 8)
      : [];

    return { id, layout, eyebrow, headline, subheadline, pill, rule, footer, pills, items, cards, steps };
  });

  return { id: input.id || undefined, title, name, description, agencyName, agencyLogo, primaryColor, accentColor, secondaryColor, slides };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export function presentationPageHtml(presentation, options = {}) {
  const { lang = 'pt', autoPrint = false } = options;
  const primary = presentation.primaryColor || '#0b315c';
  const accent = presentation.accentColor || '#f65b00';
  const slides = presentation.slides || [];
  const total = slides.length;

  const slidesHtml = slides.map((s, idx) => `
    <section class="slide ${s.layout} ${idx === 0 ? 'active' : ''}" data-index="${idx}" aria-roledescription="slide" aria-label="Slide ${idx + 1}: ${escapeHtml(s.headline)}">
      ${renderSlideInnerHtml(s, idx, total, presentation)}
    </section>
  `).join('\n');

  const overviewLabelsJson = JSON.stringify(slides.map(s => [
    s.eyebrow || presentation.agencyName,
    (s.headline || '').replace(/<[^>]+>/g, '').slice(0, 40)
  ]));

  return `<!doctype html>
<html lang="${lang === 'es' ? 'es' : 'pt-BR'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a1422">
  <meta name="description" content="${escapeHtml(presentation.description || presentation.title)}">
  <title>${escapeHtml(presentation.title)} · ${escapeHtml(presentation.agencyName)}</title>
  <style>
    :root {
      --navy: ${primary};
      --navy-dark: #08284d;
      --orange: ${accent};
      --soft: #f3f9f9;
      --soft-blue: #eff5f7;
      --muted: #45617d;
      --white: #ffffff;
      --scale: 1;
    }
    * { box-sizing: border-box; }
    html,body {height:100%;margin:0;}
    body {
      background: radial-gradient(ellipse at 55% 18%, #24364e 0%,#101a2a 55%,#080e18 100%);
      color: #f8fafc;
      overflow:hidden;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    button{font:inherit;cursor:pointer}
    button:focus-visible{outline:3px solid var(--orange);outline-offset:4px}
    .shell {position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 22px 72px;gap:12px}
    .screen {position:relative;flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
    #deck {
      width:1440px;height:810px;position:relative;flex:0 0 auto;
      transform:scale(var(--scale));transform-origin:center center;
      box-shadow:0 38px 100px rgba(0,0,0,.43), 0 0 0 1px rgba(255,255,255,.15);
      background:white;
      overflow:hidden;
    }
    .slide {
      display:none;position:absolute;inset:0;
      padding:0 90px;
      background:#fff;color:var(--navy);
      border-top:8px solid var(--orange);
      overflow:hidden;
      isolation:isolate;
    }
    .slide.active{display:block}
    .slide::after{content:"";position:absolute;bottom:0;left:0;right:0;height:1px;background:#e9eef0;pointer-events:none}
    .brand {position:absolute;top:29px;right:91px;width:auto;min-width:180px;height:52px;display:flex;align-items:center;gap:12px;color:var(--navy-dark);z-index:2}
    .brand-mark{width:40px;height:40px;flex:none}
    .brand-mark-img{height:40px;width:auto;max-width:140px;object-fit:contain;flex:none}
    .brand-text{font-family:"Arial Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", Arial, sans-serif;font-stretch:condensed;font-size:35px;font-weight:900;letter-spacing:-1.75px;transform:scaleX(.92);transform-origin:left center;white-space:nowrap}
    .eyebrow{font-size:19px;font-weight:800;letter-spacing:.285em;color:var(--orange);line-height:1.4;margin:0 0 19px;text-transform:uppercase}
    h1,h2,h3,p{margin:0}
    .headline{font-size:64px;line-height:1.035;letter-spacing:-1.5px;font-weight:800;color:var(--navy);}
    .accent{color:var(--orange)}
    .rule {display:block;width:114px;height:7px;background:var(--orange);margin-top:22px}
    .section-top {padding-top:114px}
    .section-headline{font-size:65px;letter-spacing:-1.9px;line-height:1.06;font-weight:800}
    .slide-footer {position:absolute;bottom:32px;left:90px;right:90px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:700;letter-spacing:.18em;color:#b6c1c7}
    .slide-number{color:#b8c5cf;font-size:15px;letter-spacing:.08em}
    .ico{width:30px;height:30px;stroke:var(--navy);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
    .ico.orange{stroke:var(--orange)}
    .ico.big{width:53px;height:53px}
    .icon-pair .accent-part {stroke:var(--orange)}

    /* Slide 1 - Cover */
    .cover .cover-inner{padding-top:105px}
    .cover .eyebrow{margin-bottom:20px}
    .cover h1 {font-size:61px;line-height:1.073;letter-spacing:-1.55px;max-width:1205px}
    .pills {display:flex;gap:16px;flex-wrap:nowrap;margin-top:52px}
    .pill{border:2.5px solid var(--navy);color:var(--navy);border-radius:60px;background:white;font-size:22px;font-weight:800;padding:12px 23px;white-space:nowrap;line-height:1.25}
    .cover .slide-footer{bottom:43px}

    /* Slide 2 - Pain */
    .pain-list{list-style:none;margin:31px 0 0;padding:0;display:flex;flex-direction:column;gap:21px}
    .pain-list li{display:flex;align-items:center;gap:26px;min-height:69px;font-size:33px;font-weight:800;letter-spacing:-.5px}
    .pain-icon{width:64px;height:64px;background:var(--soft-blue);border-radius:50%;display:grid;place-items:center;flex:none}
    .pain-icon svg{width:34px;height:34px}
    .pain .section-top{padding-top:108px}

    /* Slide 3 - Solution */
    .solution .section-top{padding-top:118px}
    .solution .headline{max-width:965px;font-size:68px;line-height:1.035}
    .duo-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:50px}
    .duo-card{height:260px;position:relative;background:var(--soft);display:flex;align-items:center;flex-direction:column;justify-content:center;gap:13px;text-align:center}
    .duo-card::before{content:"";position:absolute;top:0;bottom:0;left:0;width:9px;border-radius:8px 0 0 8px;background:var(--navy)}
    .duo-card.orange-bar::before{background:var(--orange)}
    .duo-card h3{font-size:39px;font-weight:800;letter-spacing:-.5px}
    .duo-card p{font-size:26px;color:var(--muted)}
    .duo-card .ico{width:51px;height:51px}

    /* Slide 4 - Services */
    .services .section-top{padding-top:137px}
    .services-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:23px;margin-top:36px}
    .service-card{position:relative;background:var(--soft);height:282px;text-align:center;padding:42px 25px 30px;display:flex;flex-direction:column;align-items:center}
    .service-card::before{content:"";position:absolute;left:0;right:0;top:0;height:6px;border-radius:6px 6px 0 0;background:var(--orange)}
    .service-card .ico{height:47px;width:47px;margin-bottom:24px}
    .service-card h3{font-size:27px;line-height:1.14;letter-spacing:-.2px;font-weight:800;max-width:345px}
    .service-card p{font-size:20px;line-height:1.43;color:var(--muted);margin-top:17px;max-width:340px}
    .star-icon{font-size:48px;line-height:48px;color:var(--orange);margin-bottom:24px}

    /* Slide 5 - Sales */
    .sales .section-top{padding-top:137px}
    .sales-grid{display:grid;grid-template-columns:1fr 1fr;gap:27px;margin-top:34px}
    .sales-card{position:relative;background:var(--soft);height:323px;padding:40px 43px 30px}
    .sales-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:var(--navy);border-radius:8px 0 0 8px}
    .sales-card.orange-bar::before{background:var(--orange)}
    .sales-card .ico{width:49px;height:49px;margin-bottom:28px}
    .sales-card h3{font-size:32px;font-weight:800;letter-spacing:-.4px;line-height:1.13;max-width:460px}
    .sales-card p{font-size:23px;line-height:1.52;color:var(--muted);margin-top:22px;max-width:485px}

    /* Slide 6 - Bundle */
    .bundle .section-top{padding-top:110px}
    .bundle-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;margin-top:26px}
    .bundle-card{height:215px;background:var(--soft);position:relative;padding:31px 16px 20px;display:flex;align-items:center;flex-direction:column;text-align:center}
    .bundle-card::before{content:"";position:absolute;left:0;right:0;top:0;background:var(--orange);height:6px;border-radius:6px 6px 0 0}
    .bundle-card .ico{width:43px;height:43px;margin:0 0 33px}
    .bundle-card .star-icon{font-size:43px;margin-bottom:33px}
    .bundle-card h3{font-size:22px;line-height:1.14;letter-spacing:-.15px;font-weight:800}
    .bundle .pills{margin-top:42px;gap:15px}
    .bundle .pill{font-size:19px;padding:12px 24px}

    /* Slide 7 - Process */
    .process .section-top{padding-top:105px}
    .steps{margin:35px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:22px}
    .step{display:flex;align-items:flex-start;gap:26px;min-height:64px}
    .step-number{width:54px;height:54px;border-radius:50%;flex:none;color:#fff;background:var(--orange);font-weight:800;display:grid;place-items:center;font-size:25px;line-height:1}
    .step-content{padding-top:6px}
    .step-title{font-size:27px;line-height:1.2;font-weight:800;letter-spacing:-.35px}
    .step-desc{font-size:19px;line-height:1.3;color:var(--muted);margin-top:8px}

    /* Presentation controls */
    .controls {position:absolute;bottom:13px;left:50%;transform:translateX(-50%);height:47px;display:flex;align-items:center;gap:10px;padding:6px 11px;border:1px solid rgba(255,255,255,.18);border-radius:13px;background:rgba(6,13,25,.79);backdrop-filter:blur(12px);box-shadow:0 12px 36px rgba(0,0,0,.2);z-index:20}
    .ctrl {width:35px;height:35px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:#f2f7fb}
    .ctrl:hover:not(:disabled){background:rgba(255,255,255,.13)}
    .ctrl:disabled{opacity:.3;cursor:default}
    .ctrl svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .counter{font-size:13px;font-weight:700;min-width:48px;text-align:center;letter-spacing:.09em;font-variant-numeric:tabular-nums;color:#e9eff6}
    .control-divider{width:1px;height:22px;background:rgba(255,255,255,.2);margin:0 2px}
    .progress{position:fixed;bottom:0;left:0;width:100%;height:4px;background:rgba(255,255,255,.13);z-index:10}
    .progress-inner{height:100%;width:calc(100% / ${total || 1});background:var(--orange);transition:width .25s ease}
    .hint{position:fixed;left:22px;bottom:29px;font-size:12px;letter-spacing:.025em;color:#a4b2c2;z-index:3;user-select:none}
    .header-tag{position:absolute;top:17px;left:23px;color:#a2b1c0;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
    .help{position:fixed;inset:0;background:rgba(4,10,20,.83);display:none;align-items:center;justify-content:center;z-index:100;padding:20px;backdrop-filter:blur(9px)}
    .help.open{display:flex}
    .help-dialog{width:min(510px,100%);border:1px solid #384456;border-radius:20px;background:#121d2e;padding:30px 33px;color:#eaf0f6;box-shadow:0 25px 90px #0007}
    .help-dialog h2{font-size:26px;margin-bottom:12px}
    .help-dialog p{line-height:1.6;color:#b7c6d7;margin-bottom:18px}
    .kbd-list{display:grid;grid-template-columns:1fr auto;gap:12px 22px;font-size:15px;align-items:center}
    kbd{border:1px solid #627084;border-radius:6px;padding:4px 8px;background:#263348;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:white}
    .close-help{margin-top:25px;padding:10px 17px;border-radius:8px;background:var(--orange);color:white;font-weight:800;border:none}
    .overview{position:fixed;inset:0;display:none;z-index:90;background:rgba(7,14,25,.94);padding:6vh 7vw;overflow:auto;backdrop-filter:blur(12px)}
    .overview.open{display:block}
    .overview-header{max-width:1100px;margin:auto auto 25px;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .overview h2{font-size:27px;margin:0}
    .overview-header button{border:1px solid #627084;background:#1a2d46;color:#fff;border-radius:9px;padding:10px 15px}
    .overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));max-width:1100px;gap:15px;margin:auto}
    .overview-item{border:1px solid #41536b;background:#f5f8f9;border-radius:12px;padding:22px;text-align:left;min-height:140px;color:var(--navy);transition:transform .15s ease,border-color .15s ease}
    .overview-item:hover{transform:translateY(-3px);border-color:var(--orange)}
    .overview-item b{color:var(--orange);font-size:12px;letter-spacing:.17em;display:block;margin-bottom:17px}
    .overview-item strong{font-size:22px;line-height:1.16;display:block}
    .overview-item em{display:block;margin-top:10px;color:#45617d;font-size:13px;font-style:normal}

    @keyframes enter {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .slide.active .eyebrow,.slide.active .headline,.slide.active .section-headline,.slide.active .rule {animation:enter .44s ease both}
    .slide.active .headline,.slide.active .section-headline{animation-delay:.07s}
    .slide.active .rule{animation-delay:.13s}
    .slide.active .pain-list li,.slide.active .service-card,.slide.active .duo-card,.slide.active .sales-card,.slide.active .bundle-card,.slide.active .step,.slide.active .pills .pill {animation:enter .47s ease both}

    @media (max-width:650px){.shell{padding:18px 7px 66px}.header-tag,.hint{display:none}.controls{bottom:12px;gap:4px}.ctrl{width:33px;height:33px}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    @media print{
      @page{size:15in 8.4375in;margin:0}
      html,body{height:auto!important;overflow:visible!important;margin:0!important;padding:0!important;background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .shell,.screen{display:block!important;position:static!important;padding:0!important;margin:0!important;width:1440px!important;height:auto!important;overflow:visible!important}
      #deck{position:static!important;display:block!important;transform:none!important;width:1440px!important;height:auto!important;box-shadow:none!important;overflow:visible!important}
      .slide{position:relative!important;display:block!important;width:1440px!important;height:810px!important;page-break-after:always;break-after:page;overflow:hidden!important;animation:none!important}
      .slide *{animation:none!important}
      .controls,.progress,.hint,.header-tag,.help,.overview,.brand-symbols{display:none!important}
    }
  </style>
</head>
<body>
  ${canonicalSymbolsSvg()}
  <main class="shell">
    <div class="header-tag" aria-hidden="true">${escapeHtml(presentation.agencyName)} / APRESENTAÇÃO COMERCIAL</div>
    <div class="screen" id="screen">
      <div id="deck" aria-label="${escapeHtml(presentation.title)}, ${total} slides">
        ${slidesHtml}
      </div>
    </div>
    <nav class="controls" aria-label="Controles da apresentação">
      <button class="ctrl" id="prev" type="button" aria-label="Slide anterior" title="Anterior (←)"><svg viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7"/></svg></button>
      <span id="counter" class="counter" aria-live="polite">01 / ${String(total).padStart(2, '0')}</span>
      <button class="ctrl" id="next" type="button" aria-label="Próximo slide" title="Próximo (→)"><svg viewBox="0 0 24 24"><path d="m9.5 5 7 7-7 7"/></svg></button>
      <span class="control-divider"></span>
      <button class="ctrl" id="overviewButton" aria-label="Visão geral dos slides" title="Ver todos os slides (G)"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
      <button class="ctrl" id="fullscreen" aria-label="Alternar tela cheia" title="Tela cheia (F)"><svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button>
      <button class="ctrl" id="print" aria-label="Imprimir ou salvar como PDF" title="Salvar como PDF (P)"><svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z"/></svg></button>
      <button class="ctrl" id="helpButton" aria-label="Ajuda com atalhos" title="Atalhos (?)"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a3 3 0 0 1 5.3 2c0 2-2.8 2.2-2.8 4.2m0 2.5v.1"/></svg></button>
    </nav>
  </main>
  <div class="hint">← → PARA NAVEGAR &nbsp;·&nbsp; F PARA TELA CHEIA &nbsp;·&nbsp; G PARA VER TODOS</div>
  <div class="progress" aria-hidden="true"><div class="progress-inner" id="progress"></div></div>
  <div class="help" id="help" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <div class="help-dialog">
      <h2 id="helpTitle">Como navegar</h2><p>Esta é uma apresentação HTML interativa. Funciona online ou offline.</p>
      <div class="kbd-list"><span>Slide anterior / próximo</span><span><kbd>←</kbd> <kbd>→</kbd></span><span>Primeiro / último slide</span><span><kbd>Home</kbd> <kbd>End</kbd></span><span>Tela cheia</span><span><kbd>F</kbd></span><span>Visão geral</span><span><kbd>G</kbd></span><span>Salvar em PDF / imprimir</span><span><kbd>P</kbd></span><span>Fechar janela</span><span><kbd>Esc</kbd></span></div>
      <button class="close-help" id="closeHelp">Entendi</button>
    </div>
  </div>
  <div class="overview" id="overview" role="dialog" aria-modal="true" aria-label="Lista de slides">
    <div class="overview-header"><h2>Todos os slides</h2><button type="button" id="closeOverview">Voltar à apresentação ✕</button></div>
    <div class="overview-grid" id="overviewGrid"></div>
  </div>
  <script>
    (() => {
      'use strict';
      const slides = Array.from(document.querySelectorAll('.slide'));
      const screen = document.getElementById('screen');
      const deck = document.getElementById('deck');
      const counter = document.getElementById('counter');
      const progress = document.getElementById('progress');
      const prev = document.getElementById('prev');
      const next = document.getElementById('next');
      const overview = document.getElementById('overview');
      const help = document.getElementById('help');
      const labels = ${overviewLabelsJson};
      let current = 0;
      function fit() {
        const w = screen.clientWidth;
        const h = screen.clientHeight;
        const scale = Math.max(.1, Math.min(w/1440, h/810));
        deck.style.setProperty('--scale', scale.toString());
      }
      function setSlide(index, updateHash = true) {
        current = Math.min(slides.length - 1, Math.max(0, index));
        slides.forEach((slide, i) => {slide.classList.toggle('active', i === current);slide.setAttribute('aria-hidden', String(i !== current));});
        counter.textContent = String(current + 1).padStart(2,'0') + ' / ' + String(slides.length).padStart(2,'0');
        progress.style.width = ((current + 1) / slides.length * 100) + '%';
        prev.disabled = current === 0;
        next.disabled = current === slides.length - 1;
        if (updateHash) history.replaceState(null, '', '#slide-' + (current + 1));
      }
      function openOverview() {overview.classList.add('open');}
      function closeOverview() {overview.classList.remove('open');}
      function toggleFullscreen() {if (!document.fullscreenElement) {document.documentElement.requestFullscreen?.().catch(() => {});}else{document.exitFullscreen?.().catch(() => {});}}
      prev.addEventListener('click', () => setSlide(current - 1));
      next.addEventListener('click', () => setSlide(current + 1));
      document.getElementById('fullscreen').addEventListener('click', toggleFullscreen);
      document.getElementById('print').addEventListener('click', () => window.print());
      document.getElementById('overviewButton').addEventListener('click', openOverview);
      document.getElementById('closeOverview').addEventListener('click', closeOverview);
      document.getElementById('helpButton').addEventListener('click', () => help.classList.add('open'));
      document.getElementById('closeHelp').addEventListener('click', () => help.classList.remove('open'));
      overview.addEventListener('click', e => {if (e.target === overview) closeOverview();});
      help.addEventListener('click', e => {if (e.target === help) help.classList.remove('open');});
      const grid = document.getElementById('overviewGrid');
      labels.forEach(([tag, title], i) => {
        const b = document.createElement('button');b.className = 'overview-item';b.type = 'button';
        b.innerHTML = '<b>SLIDE '+String(i+1).padStart(2,'0')+' · '+tag.toUpperCase()+'</b><strong>'+title+'</strong><em>Ir para este slide →</em>';
        b.addEventListener('click', () => {setSlide(i);closeOverview();});grid.appendChild(b);
      });
      document.addEventListener('keydown', e => {
        const interactive = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
        if (interactive) return;
        if (e.key === 'Escape') {help.classList.remove('open');closeOverview();return;}
        if (help.classList.contains('open')) return;
        if (overview.classList.contains('open')) return;
        if (['ArrowRight','PageDown',' ','ArrowDown'].includes(e.key)) {e.preventDefault();setSlide(current + 1);}
        else if (['ArrowLeft','PageUp','ArrowUp'].includes(e.key)) {e.preventDefault();setSlide(current - 1);}
        else if (e.key === 'Home') {e.preventDefault();setSlide(0);}
        else if (e.key === 'End') {e.preventDefault();setSlide(slides.length - 1);}
        else if (e.key.toLowerCase() === 'f') {toggleFullscreen();}
        else if (e.key.toLowerCase() === 'g') {openOverview();}
        else if (e.key.toLowerCase() === 'p') {window.print();}
        else if (e.key === '?') {help.classList.add('open');}
      });
      let startX = null, startY = null;
      screen.addEventListener('touchstart', e => {startX = e.changedTouches[0].screenX;startY = e.changedTouches[0].screenY;},{passive:true});
      screen.addEventListener('touchend', e => {
        if(startX === null) return;
        const dx = e.changedTouches[0].screenX-startX, dy = e.changedTouches[0].screenY-startY;
        if(Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)*1.25) setSlide(current + (dx < 0 ? 1 : -1));
        startX = null;startY = null;
      },{passive:true});
      const m = location.hash.match(/^#slide-(\d+)$/);
      setSlide(m ? Number(m[1])-1 : 0, false);
      window.addEventListener('hashchange', () => {const m=location.hash.match(/^#slide-(\d+)$/);if(m)setSlide(Number(m[1])-1,false);});
      window.addEventListener('resize', fit);
      document.addEventListener('fullscreenchange', fit);
      fit();
      ${autoPrint ? 'setTimeout(() => window.print(), 500);' : ''}
    })();
  </script>
</body>
</html>`;
}
