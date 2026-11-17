// soci motion layer: vanilla ports of microkit.co interactions (MIT).
// The app re-renders whole regions with innerHTML, so every enhancement is re-applied
// after each render. Indicators remember their last spot by key and slide from there,
// which makes a full re-render read as one continuous motion.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const last = new Map();   // indicator key -> {x,y,w,h}
const counts = new Map(); // metric key -> last shown value

const rel = (el, host) => {
  const a = el.getBoundingClientRect(), b = host.getBoundingClientRect();
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  return {
    x: (a.left - b.left) / z + host.scrollLeft - host.clientLeft,
    y: (a.top - b.top) / z + host.scrollTop - host.clientTop,
    w: a.width / z,
    h: a.height / z
  };
};
const keyOf = (host, items, prefix) => `${prefix}:${host.getAttribute('aria-label') || ''}:${items.map(n => n.textContent.trim()).join('|')}`;

// Moves `node` to `to`, starting from where the same key last was (FLIP across re-renders).
function slide(node, key, to, apply) {
  const from = last.get(key);
  if (from && !reduce && (from.x !== to.x || from.y !== to.y || from.w !== to.w || from.h !== to.h)) {
    node.style.transition = 'none'; apply(node, from); void node.offsetWidth; node.style.transition = '';
  }
  apply(node, to);
  last.set(key, to);
}

/* Glide Pill Tabs: selected pill + hover glide */
function pillTabs(track) {
  const tabs = [...track.querySelectorAll(':scope > button')];
  if (!tabs.length) return;
  track.classList.add('g-pill');
  const pill = Object.assign(document.createElement('span'), { className: 'g-indicator', ariaHidden: 'true' });
  track.prepend(pill);
  const key = keyOf(track, tabs, 'tabs');
  const place = () => {
    const on = track.querySelector(':scope > button.selected, :scope > button[aria-selected="true"]');
    if (!on) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    slide(pill, key, { x: on.offsetLeft, y: 0, w: on.offsetWidth, h: 0 }, (n, r) => { n.style.transform = `translateX(${r.x}px)`; n.style.width = `${r.w}px`; });
  };
  place();
  // Tabs that only toggle a class (no re-render) still move the pill.
  new MutationObserver(place).observe(track, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  glide(track, 'button');
}

/* Hover Glide: one highlight travels between siblings instead of each lighting up on its own */
function glide(host, selector, ring = false, deep = false) {
  const g = Object.assign(document.createElement('span'), { className: `g-glide${ring ? ' g-ring' : ''}`, ariaHidden: 'true' });
  host.prepend(g);
  let shown = false;
  const place = item => {
    const r = rel(item, host);
    if (!shown) g.style.transition = 'opacity 180ms ease';
    g.style.transform = `translate(${r.x}px,${r.y}px)`; g.style.width = `${r.w}px`; g.style.height = `${r.h}px`;
    if (ring) g.style.borderRadius = getComputedStyle(item).borderTopLeftRadius;
    if (!shown) { void g.offsetWidth; g.style.transition = ''; shown = true; }
    g.dataset.visible = '';
  };
  const hide = () => { shown = false; delete g.dataset.visible; };
  // By default only direct children count, so nested matches (a button inside a card) never steal the highlight.
  // `deep` lets grouped items (sidebar sections) share one highlight.
  const pick = e => {
    let item = e.target instanceof Element && e.target.closest(selector);
    if (!deep) while (item && item.parentElement !== host) item = item.parentElement?.closest(selector);
    if (item && host.contains(item)) place(item);
  };
  host.addEventListener('pointerover', pick);
  host.addEventListener('focusin', pick);
  host.addEventListener('pointerleave', hide);
  host.addEventListener('focusout', e => { if (!(e.relatedTarget instanceof Node && host.contains(e.relatedTarget)) && !host.matches(':hover')) hide(); });
}

/* Spotlight Indicator: glowing bar beside the current nav item */
function spotlight(nav, label) {
  // CSS handles native hover and .current::before spotlight indicator cleanly without coordinate jitter
}

/* Sidebar open/close: the shell is rebuilt on toggle, so the column width is replayed from its last state. */
const shellState = new Map();
function shellMotion(shell) {
  const kind = shell.classList.contains('ag-shell') ? 'agency' : 'app';
  const wide = shell.classList.contains('wide'), before = shellState.get(kind);
  shellState.set(kind, wide);
  if (before === undefined || before === wide || reduce || innerWidth <= 700) return;
  shell.style.transition = 'none';
  shell.style.gridTemplateColumns = `${before ? 248 : 64}px minmax(0,1fr)`;
  void shell.offsetWidth;
  shell.style.transition = ''; shell.style.gridTemplateColumns = '';
  if (wide) { shell.classList.add('g-expanding'); setTimeout(() => shell.classList.remove('g-expanding'), 700); }
}

/* Tooltips for the collapsed rail (labels are hidden there) */
const tip = Object.assign(document.createElement('div'), { className: 'g-tip', role: 'tooltip' });
tip.id = 'g-tip';
document.body.append(tip);
let tipFor = null;
const showTip = el => {
  tipFor = el;
  tip.textContent = el.dataset.tip;
  const r = el.getBoundingClientRect();
  tip.style.setProperty('--tx', `${Math.round(r.right + 12)}px`);
  tip.style.setProperty('--ty', `${Math.round(r.top + r.height / 2 - tip.offsetHeight / 2)}px`);
  tip.dataset.show = '';
};
const hideTip = () => { tipFor = null; delete tip.dataset.show; };
const tipTarget = e => e.target instanceof Element ? e.target.closest('.shell:not(.wide) .g-side [data-tip]') : null;
document.addEventListener('pointerover', e => { const el = tipTarget(e); if (el && el !== tipFor) showTip(el); else if (!el && tipFor) hideTip(); });
document.addEventListener('focusin', e => { const el = tipTarget(e); if (el && el.matches(':focus-visible')) showTip(el); else hideTip(); });
for (const type of ['pointerdown', 'scroll', 'hashchange', 'blur']) addEventListener(type, hideTip, true);

/* Sliding Underline Tabs for link-based sub-navigation */
function underline(nav) {
  const on = nav.querySelector(':scope > a[aria-current]');
  if (!on) return;
  const u = Object.assign(document.createElement('span'), { className: 'g-underline', ariaHidden: 'true' });
  nav.append(u);
  slide(u, `under:${nav.closest('[class]')?.className}`, { x: on.offsetLeft, y: 0, w: on.offsetWidth, h: 0 }, (n, p) => { n.style.transform = `translateX(${p.x}px)`; n.style.width = `${p.w}px`; });
}

/* Count Up Number: expo-out, counts from what was last on screen */
function countUp(b, key) {
  const node = [...b.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
  if (!node) return;
  const m = node.textContent.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s);
  if (!m) return;
  const [, pre, num, post] = m;
  const decimals = (num.split('.')[1] || '').length;
  const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: num.includes(',') });
  const target = Number(num.replace(/,/g, ''));
  if (!Number.isFinite(target) || fmt.format(target) !== num.replace(/^-/, '-')) return;
  const from = counts.get(key) ?? 0;
  counts.set(key, target);
  if (reduce || from === target) return;
  // Keep the settled width so the layout never jitters while digits climb.
  b.style.minWidth = `${b.getBoundingClientRect().width}px`;
  const run = () => {
    const start = performance.now(), length = 1400;
    const step = now => {
      if (!node.isConnected) return;
      const p = Math.min(1, (now - start) / length), eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      node.textContent = `${pre}${fmt.format(from + (target - from) * eased)}${post}`;
      if (p < 1) requestAnimationFrame(step); else b.style.minWidth = '';
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio >= .5) { io.disconnect(); run(); } }, { threshold: .5 });
  io.observe(b);
}

function enhance(root) {
  const fresh = (sel, fn) => root.querySelectorAll(sel).forEach(el => { if (el.dataset.g) return; el.dataset.g = '1'; fn(el); });
  fresh('.tabs', pillTabs);
  fresh('.shell', shellMotion);
  fresh('.g-side .side-nav', n => spotlight(n, `${n.closest('.ag-shell') ? 'agency' : 'app'}-nav`));
  fresh('.g-side .side-foot', n => spotlight(n, `${n.closest('.ag-shell') ? 'agency' : 'app'}-foot`));
  fresh('.conversations-nav nav', underline);
  // fresh('.choices', n => glide(n, '.choice', true));
  fresh('.card-grid', n => glide(n, '.surface', true));
  fresh('.metrics', n => { glide(n, '.surface', true); n.querySelectorAll(':scope > .metric').forEach(m => { const b = m.querySelector('b'); if (b) countUp(b, `${location.hash}:${m.firstElementChild?.textContent.trim()}`); }); });
  fresh('.studio-tiles', n => glide(n, '.studio-tile', true));
}

/* Staggered entrance when the route changes (not on every data re-render) */
let entering = true;
const section = () => location.hash.slice(1).split('/')[0];
let shownSection = section();
// Switching tabs inside a screen keeps the page in place; only a new screen plays the entrance.
addEventListener('hashchange', () => { if (section() !== shownSection) { shownSection = section(); entering = true; } });

let queued = false;
const run = () => {
  queued = false;
  if (tipFor && !tipFor.isConnected) hideTip();
  document.documentElement.classList.add('g-ready');
  enhance(document);
  if (entering) {
    const page = document.querySelector('#screen > .page, #screen > .dashboard-page, #screen .studio-main, #screen > .conversations-shell, .ag-shell .screen > .page, #app .workspace .page');
    if (page) {
      entering = false;
      if (!reduce) { page.classList.add('g-enter'); setTimeout(() => page.classList.remove('g-enter'), 1100); }
    }
  }
};
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
  .observe(document.body, { childList: true, subtree: true });
run();

/* Cursor-tracked light inside CTA buttons */
document.addEventListener('pointermove', e => {
  const btn = e.target instanceof Element && e.target.closest('.primary, .continue, .studio-create');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--gx', `${e.clientX - r.left}px`);
  btn.style.setProperty('--gy', `${e.clientY - r.top}px`);
}, { passive: true });

// Indicators measured before web fonts finished loading are re-measured once they land.
document.fonts?.ready.then(() => document.querySelectorAll('[data-g]').forEach(el => {
  el.querySelectorAll(':scope > .g-indicator, :scope > .g-spot, :scope > .g-underline, :scope > .g-glide').forEach(n => n.remove());
  delete el.dataset.g;
})).then(() => { last.clear(); run(); });

/* Theme toggle: microkit diagonal wipe via View Transitions API */
let themeBusy = null;
export function toggleTheme(to) {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = to === 'light' || to === 'dark' ? to : current === 'dark' ? 'light' : 'dark';
  if (current === next) return Promise.resolve();

  const swap = () => {
    if (next === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
    try { localStorage.setItem('soci.theme', next); } catch {}
  };

  if (themeBusy) {
    try { themeBusy.skipTransition(); } catch {}
  }

  if (reduce || !document.startViewTransition || document.visibilityState !== 'visible') {
    swap();
    return Promise.resolve();
  }

  html.setAttribute('data-theme-to', next);
  html.setAttribute('data-g-theme-to', next);
  const transition = (themeBusy = document.startViewTransition(swap));
  const done = () => {
    if (themeBusy === transition) {
      themeBusy = null;
      html.removeAttribute('data-theme-to');
      html.removeAttribute('data-g-theme-to');
    }
  };
  transition.finished.then(done, done);
  return transition.updateCallbackDone;
}
window.toggleTheme = toggleTheme;

try {
  const savedTheme = localStorage.getItem('soci.theme') || localStorage.getItem('graao.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
} catch {}

document.addEventListener('click', e => {
  const btn = e.target instanceof Element && e.target.closest('[data-theme-toggle]');
  if (!btn) return;
  toggleTheme();
});
