// Camada de animação dos modelos de site (páginas com <html data-motion>).
// O servidor embute `(${siteMotion})()` na página publicada e libera só esse texto exato pelo hash
// SHA-256 na CSP (studio-site.mjs, withMotion). Nada aqui pode depender de variáveis de fora da função.
// Sem este script a página continua completa: o CSS do kit já anima o que dá sem JavaScript.
export function siteMotion() {
  const d = document;
  const root = d.documentElement;
  if (root.dataset.motionReady) return;
  root.dataset.motionReady = '1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const timeline = CSS.supports('animation-timeline: view()');
  root.classList.add('js');
  if (!timeline) root.classList.add('no-tl');
  const all = sel => Array.from(d.querySelectorAll(sel));
  const raf = fn => requestAnimationFrame(fn);

  // 1. Títulos revelados palavra por palavra ([data-split]).
  for (const el of all('[data-split]')) {
    let i = 0;
    const walk = node => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = d.createDocumentFragment();
          for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const w = d.createElement('span'); w.className = 'w';
            const inner = d.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', String(i++));
            w.append(inner); frag.append(w);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && !child.matches('br')) walk(child);
      }
    };
    walk(el);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  }

  // 2. Entrar na tela: marca .is-in uma vez (títulos divididos, contadores e, sem scroll-timeline, as revelações).
  const watch = all(`[data-split], .count${timeline ? '' : ', .rv, .rv-s, .clip'}`);
  const counters = new Set(all('.count'));
  const fmt = new Intl.NumberFormat(root.lang || 'pt-BR');
  const count = el => {
    const to = parseFloat(getComputedStyle(el).getPropertyValue('--to')) || 0;
    const suffix = (getComputedStyle(el).getPropertyValue('--suf') || '').trim().replace(/^['"]|['"]$/g, '');
    const prefix = el.dataset.prefix || '';
    if (reduce) { el.textContent = prefix + fmt.format(to) + suffix; return; }
    const start = performance.now(), dur = 1600;
    const tick = now => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 4);
      el.textContent = prefix + fmt.format(Math.round(to * e)) + suffix;
      if (t < 1) raf(tick);
    };
    raf(tick);
  };
  for (const el of counters) el.textContent = (el.dataset.prefix || '') + '0';
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      if (counters.has(entry.target)) count(entry.target);
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  for (const el of watch) io.observe(el);

  // 3. Cabeçalho: some ao descer e volta ao subir; ganha fundo depois do topo.
  const bar = d.querySelector('[data-bar]');
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    if (bar) {
      bar.classList.toggle('scrolled', y > 40);
      bar.classList.toggle('away', y > 240 && y > lastY && !root.classList.contains('menu-open'));
    }
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const toggle = d.getElementById('nav-t');
  if (toggle) toggle.addEventListener('change', () => root.classList.toggle('menu-open', toggle.checked));

  // 4. Texto que ocupa a largura toda ([data-fit]): a marca gigante cabe exata, seja qual for o nome.
  const fits = all('[data-fit]');
  if (fits.length) {
    const fit = () => {
      for (const el of fits) {
        el.style.fontSize = '';
        const range = d.createRange(); range.selectNodeContents(el.querySelector(".ln > span") || el);
        const width = range.getBoundingClientRect().width;
        const room = el.clientWidth;
        if (width > 0 && room > 0) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * room / width * 0.985}px`;
      }
    };
    fit();
    addEventListener('resize', fit);
    if (d.fonts) d.fonts.ready.then(fit);
  }

  if (reduce) return;

  // 5. Rolagem suave com a roda do mouse (o teclado, o toque e as âncoras seguem nativos).
  if (fine) {
    let target = scrollY, current = scrollY, running = false;
    const max = () => root.scrollHeight - innerHeight;
    const loop = () => {
      current += (target - current) * 0.1;
      if (Math.abs(target - current) < 0.5) current = target;
      scrollTo({ top: current, behavior: 'instant' });
      if (current !== target) raf(loop); else running = false;
    };
    addEventListener('wheel', event => {
      if (event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const t = event.target;
      if (t instanceof Element && t.closest('textarea, select, [data-native-scroll], .rail')) return;
      event.preventDefault();
      if (!running) { target = current = scrollY; }
      target = Math.max(0, Math.min(max(), target + event.deltaY * (event.deltaMode === 1 ? 32 : 1)));
      if (!running) { running = true; raf(loop); }
    }, { passive: false });
    addEventListener('scroll', () => { if (!running) target = current = scrollY; }, { passive: true });
  }

  // 5. Letreiros aceleram com a velocidade da rolagem e voltam ao ritmo normal.
  const marquees = all('.mq-t');
  if (marquees.length) {
    let prev = scrollY, boost = 0;
    const tick = () => {
      const v = Math.abs(scrollY - prev); prev = scrollY;
      boost = Math.max(boost * 0.92, Math.min(v / 6, 5));
      for (const m of marquees) for (const a of m.getAnimations()) a.playbackRate = 1 + boost;
      raf(tick);
    };
    raf(tick);
  }

  // 6. Parallax nos navegadores sem scroll-timeline.
  if (!timeline) {
    const items = all('.par');
    const tick = () => {
      for (const el of items) {
        const box = el.parentElement.getBoundingClientRect();
        const p = (box.top + box.height / 2 - innerHeight / 2) / (innerHeight + box.height);
        el.style.transform = `translateY(${(-p * 16).toFixed(2)}%) scale(1.16)`;
      }
      raf(tick);
    };
    if (items.length) raf(tick);
  }

  if (!fine) return;

  // 7. Botões magnéticos ([data-magnetic]).
  for (const el of all('[data-magnetic]')) {
    el.addEventListener('pointermove', event => {
      const r = el.getBoundingClientRect();
      const x = (event.clientX - r.left - r.width / 2) * 0.22, y = (event.clientY - r.top - r.height / 2) * 0.3;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  // 8. Cursor próprio: um ponto que cresce sobre links e mostra um rótulo em [data-cursor].
  if (root.hasAttribute('data-cursor-root')) {
    const dot = d.createElement('div'); dot.className = 'cursor'; dot.setAttribute('aria-hidden', 'true');
    const label = d.createElement('span'); dot.append(label); d.body.append(dot);
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('pointermove', event => { x = event.clientX; y = event.clientY; dot.classList.add('on'); }, { passive: true });
    d.addEventListener('pointerleave', () => dot.classList.remove('on'));
    d.addEventListener('pointerover', event => {
      const t = event.target instanceof Element ? event.target : null;
      const named = t && t.closest('[data-cursor]');
      dot.classList.toggle('link', Boolean(t && t.closest('a, button, label, summary')));
      dot.classList.toggle('named', Boolean(named));
      label.textContent = named ? named.getAttribute('data-cursor') : '';
    });
    const follow = () => {
      cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
      dot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf(follow);
    };
    raf(follow);
  }
}
