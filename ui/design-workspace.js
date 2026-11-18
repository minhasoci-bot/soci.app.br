import { icon } from './icons.js';

export function designStage({ label, width, content, tools = '' }) {
  return `<section class="dw-stage" aria-label="Área de criação" data-dw-stage="${width}">
    <div class="dw-scroll" tabindex="0" aria-label="Prancheta">
      <div class="dw-board"><div class="dw-board-label">${label}</div><div class="dw-artboard">${content}</div></div>
    </div>
    <div class="dw-dock" role="group" aria-label="Ferramentas da prancheta">
      ${tools}${tools ? '<span class="dw-divider" aria-hidden="true"></span>' : ''}
      <button type="button" data-dw-pan aria-pressed="false" title="Mover prancheta" aria-label="Mover prancheta">${icon('hand', 16)}</button>
      <button type="button" data-dw-zoom="out" aria-label="Diminuir zoom" title="Diminuir zoom">−</button>
      <button type="button" data-dw-zoom="fit" aria-label="Ajustar à largura" title="Ajustar à largura"><span data-dw-percent>100%</span></button>
      <button type="button" data-dw-zoom="in" aria-label="Aumentar zoom" title="Aumentar zoom">${icon('plus', 15)}</button>
    </div>
  </section>`;
}

const zoomLevels = [.25, .33, .5, .67, .8, 1, 1.25, 1.5, 2];
const mounted = new WeakMap();

export function mountDesignStage(stage, viewport) {
  if (!stage || mounted.has(stage)) return;
  const scroller = stage.querySelector('.dw-scroll');
  const percent = stage.querySelector('[data-dw-percent]');
  const pan = stage.querySelector('[data-dw-pan]');
  let scale = 1, drag;

  const resize = () => {
    const width = Number(stage.dataset.dwStage);
    scale = viewport.zoom || Math.min(1, Math.max(.1, (scroller.clientWidth - 32) / width));
    stage.style.setProperty('--dw-width', `${width}px`);
    stage.style.setProperty('--dw-zoom', scale);
    percent.textContent = `${Math.round(scale * 100)}%`;
    stage.querySelector('[data-dw-zoom="out"]').disabled = scale <= zoomLevels[0];
    stage.querySelector('[data-dw-zoom="in"]').disabled = scale >= zoomLevels.at(-1);
  };
  const togglePan = () => {
    const active = stage.classList.toggle('dw-pan');
    pan.setAttribute('aria-pressed', String(active));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(scroller);
  mounted.set(stage, { observer, resize });
  resize();
  scroller.scrollTo({ left: viewport.left || 0, top: viewport.top || 0, behavior: 'instant' });
  scroller.addEventListener('scroll', () => {
    viewport.left = scroller.scrollLeft;
    viewport.top = scroller.scrollTop;
  });
  stage.addEventListener('click', event => {
    if (event.target.closest('[data-dw-pan]')) togglePan();
    const command = event.target.closest('[data-dw-zoom]')?.dataset.dwZoom;
    if (!command) return;
    viewport.zoom = command === 'fit' ? 0 : command === 'in'
      ? zoomLevels.find(level => level > scale + .001) : zoomLevels.findLast(level => level < scale - .001);
    resize();
  });
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape' && stage.classList.contains('dw-pan')) togglePan();
  });
  scroller.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !stage.classList.contains('dw-pan')) return;
    event.preventDefault();
    scroller.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
  });
  scroller.addEventListener('pointermove', event => {
    if (!drag) return;
    const zoom = scroller.currentCSSZoom || 1;
    scroller.scrollTo({ left: drag.left - (event.clientX - drag.x) / zoom, top: drag.top - (event.clientY - drag.y) / zoom, behavior: 'instant' });
  });
  scroller.addEventListener('lostpointercapture', () => { drag = null; });
}

export function resizeDesignStage(stage, width) {
  if (!stage) return;
  stage.dataset.dwStage = width;
  mounted.get(stage)?.resize();
}

export function unmountDesignStage(stage) {
  mounted.get(stage)?.observer.disconnect();
  mounted.delete(stage);
}
