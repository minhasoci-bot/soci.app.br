// Animated GIF of a countdown timer for e-mails (mail clients run no scripts, so the image itself ticks):
// 60 frames, one per second, starting at the time left when the image is requested; it stops on the
// last frame. Digits are seven-segment shapes and labels use a 5x7 pixel font, drawn into a 4-color
// indexed canvas and encoded with LZW. No dependencies.
import { DEFAULT_STYLE, UNITS, partsOf } from './ui/countdown-data.js';

export const WIDTH = 400, HEIGHT = 122;
const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100011000101010001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', '!': '00100001000010000100001000000000100', '.': '00000000000000000000000000110001100',
  ',': '00000000000000000000011000010001000', ':': '00000011000110000000011000110000000', '-': '00000000000000011111000000000000000', ' ': '0'.repeat(35)
};
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** Accents and lowercase map to the font's uppercase letters; anything else becomes a space. */
export const fontText = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split('').map(ch => FONT[ch] ? ch : ' ').join('');

function canvas() {
  const px = new Uint8Array(WIDTH * HEIGHT);
  const rect = (x, y, w, h, c) => {
    for (let j = Math.max(0, y | 0); j < Math.min(HEIGHT, (y + h) | 0); j++) px.fill(c, j * WIDTH + Math.max(0, x | 0), j * WIDTH + Math.min(WIDTH, (x + w) | 0));
  };
  const rounded = (x, y, w, h, r, c) => {
    rect(x, y + r, w, h - 2 * r, c);
    for (let j = 0; j < r; j++) {
      const dy = r - j - 0.5, inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
      rect(x + inset, y + j, w - 2 * inset, 1, c); rect(x + inset, y + h - 1 - j, w - 2 * inset, 1, c);
    }
  };
  const text = (str, cx, y, scale, c) => {
    const chars = fontText(str).split(''), w = chars.length * 6 * scale - scale;
    let x = Math.round(cx - w / 2);
    for (const ch of chars) {
      const g = FONT[ch];
      for (let i = 0; i < 35; i++) if (g[i] === '1') rect(x + (i % 5) * scale, y + Math.floor(i / 5) * scale, scale, scale, c);
      x += 6 * scale;
    }
  };
  const digit = (n, x, y, w, h, t, c) => {
    const half = Math.round(h / 2);
    const seg = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + half - Math.floor(t / 2), w - 2 * t, t],
      f: [x, y + t, t, half - t], b: [x + w - t, y + t, t, half - t], e: [x, y + half, t, h - half - t], c: [x + w - t, y + half, t, h - half - t] };
    for (const s of SEGMENTS[n]) rect(...seg[s], c);
  };
  return { px, rect, rounded, text, digit };
}

/** One frame as palette indexes (0 background, 1 box, 2 digits, 3 labels). */
export function frame(timer, remainingMs) {
  const style = { ...DEFAULT_STYLE, ...timer.style }, boxes = style.template === 'boxes', p = partsOf(remainingMs);
  const cv = canvas();
  if (p.total === 0 && timer.expired?.mode === 'text') {
    const label = fontText(timer.expired.text).trim() || 'ENCERRADO', scale = label.length <= 21 ? 3 : 2;
    cv.text(label, WIDTH / 2, Math.round((HEIGHT - 7 * scale) / 2), scale, 3);
    return cv.px;
  }
  const boxW = 84, boxH = 76, gap = 12, left = 14, top = 12;
  UNITS.forEach(([key, label], i) => {
    const x = left + i * (boxW + gap);
    if (boxes) cv.rounded(x, top, boxW, boxH, 10, 1);
    else if (i) { cv.rect(x - gap / 2 - 3, top + 22, 6, 6, 1); cv.rect(x - gap / 2 - 3, top + 46, 6, 6, 1); }
    const value = String(key === 'days' && p.days > 99 ? p.days : String(p[key]).padStart(2, '0'));
    const three = value.length === 3, dw = three ? 18 : 24, dg = three ? 5 : 8, t = three ? 5 : 6;
    const total = value.length * dw + (value.length - 1) * dg;
    value.split('').forEach((d, k) => cv.digit(Number(d), x + Math.round((boxW - total) / 2) + k * (dw + dg), top + 16, dw, 44, t, boxes ? 2 : 1));
    cv.text(label, x + boxW / 2, top + boxH + 9, 2, 3);
  });
  return cv.px;
}

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1, out = [];
  let codeSize = minCodeSize + 1, next = eoi + 1, cur = 0, bits = 0, dict = new Map();
  const emit = code => { cur |= code << bits; bits += codeSize; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix << 8 | k, found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); dict = new Map(); codeSize = minCodeSize + 1; next = eoi + 1; }
    else { if (next >= 1 << codeSize) codeSize++; dict.set(key, next++); }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

/** GIF89a bytes: `remainingMs` now, one frame per second for up to `frames` seconds, played once. */
export function countdownGif(timer, remainingMs, frames = 60) {
  const style = { ...DEFAULT_STYLE, ...timer.style };
  const palette = [style.background, style.template === 'boxes' ? style.box : style.box, style.digits, style.labels].flatMap(rgb);
  const bytes = [...Buffer.from('GIF89a'), WIDTH & 255, WIDTH >> 8, HEIGHT & 255, HEIGHT >> 8, 0x91, 0, 0, ...palette];
  const expired = timer.expired?.mode === 'text';
  const count = Math.max(1, Math.min(frames, Math.floor(Math.max(0, remainingMs) / 1000) + 1));
  const le = n => [n & 255, n >> 8];
  let prev = null;
  for (let i = 0; i < count; i++) {
    const left = remainingMs - i * 1000;
    if (left <= 0 && i && !expired) break;
    const px = frame(timer, left);
    // After the first frame only the rectangle that changed is stored (usually the seconds), which keeps
    // a 60-frame GIF small; disposal "keep" leaves the rest of the previous frame on screen.
    let x0 = 0, y0 = 0, x1 = WIDTH - 1, y1 = HEIGHT - 1;
    if (prev) {
      x0 = WIDTH; y0 = HEIGHT; x1 = -1; y1 = -1;
      for (let k = 0; k < px.length; k++) if (px[k] !== prev[k]) { const x = k % WIDTH, y = (k / WIDTH) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, region = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) region.set(px.subarray((y0 + y) * WIDTH + x0, (y0 + y) * WIDTH + x0 + w), y * w);
    bytes.push(0x21, 0xF9, 4, 0x04, 100, 0, 0, 0, 0x2C, ...le(x0), ...le(y0), ...le(w), ...le(h), 0, 2);
    const data = lzw(region, 2);
    for (let j = 0; j < data.length; j += 255) { const chunk = data.slice(j, j + 255); bytes.push(chunk.length, ...chunk); }
    bytes.push(0);
    prev = px;
  }
  bytes.push(0x3B);
  return Buffer.from(bytes);
}
