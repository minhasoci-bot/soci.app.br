// Rolagem suave da comunidade: a roda do mouse move a página com inércia (a posição persegue o alvo a cada quadro).
// Fica de fora quando o sistema pede menos movimento, com Ctrl (zoom), em rolagem horizontal e quando o cursor está
// sobre algo que rola por conta própria (caixa de texto, lista, modal). Teclado, barra de rolagem, âncoras e toque
// continuam nativos; se a página rolar por outro meio no meio da animação, a animação para e segue de onde estiver.
const ease = 0.14;          // fração da distância percorrida por quadro (60 fps ≈ 0,5 s até parar)
const lineHeight = 40;      // deltaMode 1: rodas que contam em linhas
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let on = false, frame = 0, target = 0, last = 0;

const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
const scrollsItself = (node, dy) => {
  for (let el = node instanceof Element ? node : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
    if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  }
  return false;
};

function step() {
  const y = scrollY, next = y + (target - y) * ease;
  if (Math.abs(target - next) < 0.5) { scrollTo({ top: target, behavior: 'instant' }); last = target; frame = 0; return; }
  scrollTo({ top: next, behavior: 'instant' });
  last = scrollY;
  frame = requestAnimationFrame(step);
}

function onWheel(event) {
  if (reduced.matches || event.ctrlKey || event.defaultPrevented) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) return;
  const dy = event.deltaY * (event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? innerHeight : 1);
  if (!dy || scrollsItself(event.target, dy) || document.querySelector('dialog[open]')) return;
  if (getComputedStyle(document.body).overflowY === 'hidden' || maxScroll() === 0) return;
  event.preventDefault();
  if (!frame) target = scrollY;
  target = Math.max(0, Math.min(maxScroll(), target + dy));
  if (!frame) frame = requestAnimationFrame(step);
}

// Outra rolagem (teclado, arrastar a barra, âncora) durante a animação: ela manda.
function onScroll() {
  if (frame && Math.abs(scrollY - last) > 2) { cancelAnimationFrame(frame); frame = 0; }
}

export function smoothScroll(enable) {
  if (enable === on) return;
  on = enable;
  if (on) {
    addEventListener('wheel', onWheel, { passive: false });
    addEventListener('scroll', onScroll, { passive: true });
  } else {
    removeEventListener('wheel', onWheel);
    removeEventListener('scroll', onScroll);
    cancelAnimationFrame(frame); frame = 0;
  }
}
