// QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
// Returns a square matrix of booleans; qrSvg draws it. No dependencies, runs on the server and in the browser.

// [data codewords per block for group 1 count, group 1 size, group 2 count, group 2 size], EC codewords per block — level M.
const BLOCKS = [null, [1, 16, 0, 0, 10], [1, 28, 0, 0, 16], [1, 44, 0, 0, 26], [2, 32, 0, 0, 18], [2, 43, 0, 0, 24], [4, 27, 0, 0, 16], [4, 31, 0, 0, 18], [2, 38, 2, 39, 22], [3, 36, 2, 37, 22], [4, 43, 1, 44, 26]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) with the QR primitive polynomial 0x11d.
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    poly = next;
  }
  return poly;
}
function remainder(data, degree) {
  const gen = generator(degree), out = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = out[i];
    if (factor) for (let j = 0; j < gen.length; j++) out[i + j] ^= mul(gen[j], factor);
  }
  return out.slice(data.length);
}

const utf8 = text => [...new TextEncoder().encode(String(text))];
const dataCapacity = v => { const [a, b, c, d] = BLOCKS[v]; return a * b + c * d; };

function codewords(bytes, version) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach(byte => push(byte, 8));
  const capacity = dataCapacity(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; data.length < dataCapacity(version); pad++) data.push(pad % 2 ? 0x11 : 0xec);
  // Split into blocks, add Reed-Solomon codewords, interleave.
  const [g1, s1, g2, s2, ec] = BLOCKS[version], blocks = [];
  let at = 0;
  for (let i = 0; i < g1 + g2; i++) { const size = i < g1 ? s1 : s2; blocks.push(data.slice(at, at + size)); at += size; }
  const ecc = blocks.map(block => remainder(block, ec));
  const out = [];
  for (let i = 0; i < Math.max(s1, s2); i++) blocks.forEach(block => { if (i < block.length) out.push(block[i]); });
  for (let i = 0; i < ec; i++) ecc.forEach(block => out.push(block[i]));
  return out;
}

function bch(value, poly, shift) {
  let rem = value << shift;
  const top = Math.floor(Math.log2(poly));
  while (rem && Math.floor(Math.log2(rem)) >= top) rem ^= poly << (Math.floor(Math.log2(rem)) - top);
  return (value << shift) | rem;
}

const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0, (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];

function penalty(m) {
  const n = m.length; let score = 0;
  const lines = [...m, ...m[0].map((_, c) => m.map(row => row[c]))];
  for (const line of lines) {
    for (let i = 0; i < n;) { let j = i; while (j < n && line[j] === line[i]) j++; if (j - i >= 5) score += j - i - 2; i = j; }
    const text = line.map(v => v ? 1 : 0).join('');
    for (const pattern of ['10111010000', '00001011101']) for (let i = text.indexOf(pattern); i !== -1; i = text.indexOf(pattern, i + 1)) score += 40;
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3; }
  const dark = m.flat().filter(Boolean).length;
  score += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  return score;
}

export function qrMatrix(text) {
  const bytes = utf8(text);
  let version = 1;
  while (version <= 10 && Math.ceil((4 + (version < 10 ? 8 : 16) + bytes.length * 8) / 8) > dataCapacity(version)) version++;
  if (version > 10) throw Object.assign(new Error('O conteúdo é longo demais para o QR Code (até 213 caracteres simples).'), { status: 400 });
  const n = version * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = v; fixed[r][c] = true; } };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6; set(r0 + r, c0 + c, inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const centers = ALIGN[version];
  for (const r of centers) for (const c of centers) {
    if ((r < 9 && c < 9) || (r < 9 && c > n - 10) || (r > n - 10 && c < 9)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // Reserve format and version areas, and the dark module.
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, false); if (!fixed[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  set(n - 8, 8, true);
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, n - 11 + j, false); set(n - 11 + j, i, false); }
  // Data, in two-column zigzag from the bottom right, skipping the vertical timing column.
  const bits = codewords(bytes, version).flatMap(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (byte >>> i) & 1));
  let k = 0;
  for (let col = n - 1, up = true; col > 0; col -= 2, up = !up) {
    if (col === 6) col--;
    for (let step = 0; step < n; step++) {
      const r = up ? n - 1 - step : step;
      for (const c of [col, col - 1]) if (!fixed[r][c]) { m[r][c] = k < bits.length ? bits[k] === 1 : false; k++; }
    }
  }
  // Try the eight masks, keep the one with the lowest penalty.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const t = m.map(row => [...row]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fixed[r][c] && MASKS[mask](r, c)) t[r][c] = !t[r][c];
    const format = bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412; // level M = 00
    const bit = i => ((format >>> i) & 1) === 1;
    // First copy around the top-left finder: bits 0–5 down column 8, then (7,8), (8,8), (8,7), bits 9–14 along row 8.
    for (let i = 0; i <= 5; i++) t[i][8] = bit(i);
    t[7][8] = bit(6); t[8][8] = bit(7); t[8][7] = bit(8);
    for (let i = 9; i < 15; i++) t[8][14 - i] = bit(i);
    // Second copy, split between the top-right and bottom-left finders.
    for (let i = 0; i < 8; i++) t[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) t[n - 15 + i][8] = bit(i);
    t[n - 8][8] = true;
    if (version >= 7) {
      const info = bch(version, 0x1f25, 12);
      for (let i = 0; i < 18; i++) { const v = ((info >>> i) & 1) === 1, a = Math.floor(i / 3), b = n - 11 + (i % 3); t[a][b] = v; t[b][a] = v; }
    }
    const score = penalty(t);
    if (!best || score < best.score) best = { score, t };
  }
  return best.t;
}

export function qrSvg(text, { fg = '#000000', bg = '#ffffff', margin = 4, size = 256, label = 'QR Code' } = {}) {
  const m = qrMatrix(text), n = m.length + margin * 2;
  let path = '';
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) path += `M${c + margin} ${r + margin}h1v1h-1z`; }));
  const safe = value => /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${String(label).replace(/[<>&"]/g, '')}"><rect width="${n}" height="${n}" fill="${safe(bg)}"/><path d="${path}" fill="${safe(fg)}"/></svg>`;
}
