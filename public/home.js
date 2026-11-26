// soci — página inicial pública: menu do celular, números da abertura e abas da jornada.
(() => {
  // Menu do celular: folha branca sobre um véu escuro, abaixo do topo da abertura.
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('vh-menu');
  const overlay = document.getElementById('vh-overlay');
  const isOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
  const setMenu = open => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.sr').textContent = open ? 'Fechar o menu' : 'Abrir o menu';
    menu.hidden = !open;
    overlay.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };
  menuBtn.addEventListener('click', () => setMenu(!isOpen()));
  overlay.addEventListener('click', () => setMenu(false));
  menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) { setMenu(false); menuBtn.focus(); }
  });
  window.matchMedia('(min-width: 721px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

  // Números da abertura: contam do zero até o valor quando aparecem (uma vez só).
  const stats = [...document.querySelectorAll('.stat-value[data-target]')];
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = (el, value) => {
    const decimals = Number(el.dataset.decimals || 0);
    el.textContent = value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (el.dataset.suffix || '');
  };
  const count = (el, i) => {
    const target = Number(el.dataset.target);
    const duration = 1500 + i * 80;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    show(el, 0);
    setTimeout(() => {
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / duration);
        show(el, target * easeOutCubic(p));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 480 + i * 90);
  };
  if (!still && 'IntersectionObserver' in window && stats.length) {
    const seen = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        seen.unobserve(entry.target);
        count(entry.target, stats.indexOf(entry.target));
      }
    }, { threshold: 0.25 });
    for (const el of stats) seen.observe(el);
  }

  // Abas: clique, setas, Home e End (padrão WAI-ARIA de abas com ativação automática).
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = tab => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const i = tabs.indexOf(tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      select(target);
      target.focus();
    });
  }
})();
