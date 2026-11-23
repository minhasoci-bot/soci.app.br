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
const previewHeight = 740;
const mounted = new WeakMap();

export function mountDesignStage(stage, viewport) {
  if (!stage || mounted.has(stage)) return;
  const scroller = stage.querySelector('.dw-scroll');
  const artboard = stage.querySelector('.dw-artboard');
  const frame = artboard.querySelector('iframe');
  const label = stage.querySelector('.dw-board-label');
  const percent = stage.querySelector('[data-dw-percent]');
  const pan = stage.querySelector('[data-dw-pan]');
  const listeners = new AbortController();
  const scrollStyle = getComputedStyle(scroller);
  const horizontalPadding = parseFloat(scrollStyle.paddingLeft) + parseFloat(scrollStyle.paddingRight);
  const verticalPadding = parseFloat(scrollStyle.paddingTop) + parseFloat(scrollStyle.paddingBottom) + parseFloat(getComputedStyle(label).marginBottom);
  let scale = 1, drag, pageHeight = previewHeight, measureId = 0, stopWatchingFrame;

  const resize = () => {
    const width = Number(stage.dataset.dwStage);
    let fit = (scroller.clientWidth - horizontalPadding) / width;
    if (frame) fit = Math.min(fit, (scroller.clientHeight - verticalPadding - label.offsetHeight) / pageHeight);
    scale = viewport.zoom || Math.min(1, Math.max(.1, fit));
    stage.style.setProperty('--dw-width', `${width}px`);
    stage.style.setProperty('--dw-zoom', scale);
    percent.textContent = `${Math.round(scale * 100)}%`;
    stage.querySelector('[data-dw-zoom="out"]').disabled = scale <= zoomLevels[0];
    stage.querySelector('[data-dw-zoom="in"]').disabled = scale >= zoomLevels.at(-1);
  };

  const onWheel = (event, fromFrame = false) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-60, Math.min(60, event.deltaY * unit));
    const next = Math.max(Math.min(zoomLevels[0], scale), Math.min(zoomLevels.at(-1), scale * 2 ** (-delta / 100)));
    if (next === scale) return;

    const before = artboard.getBoundingClientRect();
    let x = event.clientX, y = event.clientY;
    if (fromFrame) {
      const bounds = frame.getBoundingClientRect();
      x = bounds.left + x * bounds.width / frame.clientWidth;
      y = bounds.top + y * bounds.height / frame.clientHeight;
    }
    const ratio = next / scale;
    viewport.zoom = next;
    resize();
    const after = artboard.getBoundingClientRect();
    const outerZoom = scroller.currentCSSZoom || 1;
    scroller.scrollBy({ left: (after.left + (x - before.left) * ratio - x) / outerZoom,
      top: (after.top + (y - before.top) * ratio - y) / outerZoom, behavior: 'instant' });
  };
  const wheelOptions = { passive: false, signal: listeners.signal };
  stage.addEventListener('wheel', onWheel, wheelOptions);

  const queueMeasure = () => {
    if (measureId) return;
    measureId = requestAnimationFrame(() => {
      measureId = 0;
      const doc = frame.contentDocument;
      if (!doc?.body || doc.URL === 'about:blank') return;
      const documentHeight = () => Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      let height = previewHeight;
      frame.style.height = `${height}px`;
      // Re-measure at a stable viewport height so repeated edits can also shrink the artboard.
      // Stop when viewport-height units make the document grow with the frame itself.
      let previousOverflow = Infinity;
      for (let pass = 0; pass < 5; pass++) {
        const overflow = documentHeight() - height;
        if (overflow <= 0 || overflow >= previousOverflow) break;
        height += overflow;
        previousOverflow = overflow;
        frame.style.height = `${height}px`;
      }
      pageHeight = height;
      resize();
    });
  };

  if (frame) {
    const fitButton = percent.closest('button');
    fitButton.setAttribute('aria-label', 'Ajustar página à tela');
    fitButton.title = 'Ajustar página à tela';
    const watchFrame = () => {
      stopWatchingFrame?.();
      const doc = frame.contentDocument;
      if (!doc?.body || doc.URL === 'about:blank') return;
      const onFrameWheel = event => onWheel(event, true);
      doc.addEventListener('wheel', onFrameWheel, wheelOptions);
      doc.addEventListener('load', queueMeasure, { capture: true, signal: listeners.signal });
      const contentObserver = new ResizeObserver(queueMeasure);
      contentObserver.observe(doc.body);
      const edits = new MutationObserver(queueMeasure);
      edits.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['style', 'class', 'src', 'width', 'height', 'hidden'] });
      stopWatchingFrame = () => {
        doc.removeEventListener('wheel', onFrameWheel);
        doc.removeEventListener('load', queueMeasure, true);
        contentObserver.disconnect();
        edits.disconnect();
      };
      queueMeasure();
    };
    frame.addEventListener('load', watchFrame, { signal: listeners.signal });
    watchFrame();
  }
  const togglePan = () => {
    const active = stage.classList.toggle('dw-pan');
    pan.setAttribute('aria-pressed', String(active));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(scroller);
  mounted.set(stage, { resize, widthChanged: frame && queueMeasure, dispose: () => {
    observer.disconnect();
    listeners.abort();
    stopWatchingFrame?.();
    cancelAnimationFrame(measureId);
  } });
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
  mounted.get(stage)?.widthChanged?.();
}

export function unmountDesignStage(stage) {
  mounted.get(stage)?.dispose();
  mounted.delete(stage);
}
