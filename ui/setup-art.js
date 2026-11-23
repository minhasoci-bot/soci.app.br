// Original flat illustrations for the setup template gallery: a soft blob, a person and a scene for the segment.
// Colors come from CSS variables (--art-*) so the cards follow light and dark themes. Each template varies
// (mirrored scene, accent color, details) from a hash of its id, so neighbouring cards do not look identical.

const hash = text => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const accents = ['var(--art-acc-1)', 'var(--art-acc-2)', 'var(--art-acc-3)', 'var(--art-acc-4)'];

const ink = 'stroke="var(--art-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const line = (d, extra = '') => `<path d="${d}" fill="none" ${ink} ${extra}/>`;
const shape = (d, fill = 'var(--art-paper)') => `<path d="${d}" fill="${fill}" ${ink}/>`;
const rect = (x, y, w, h, r = 3, fill = 'var(--art-paper)') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${ink}/>`;
const circle = (cx, cy, r, fill = 'var(--art-paper)') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${ink}/>`;
const dot = (cx, cy, r = 2.2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--art-ink)"/>`;

function person(x, acc, pose) {
  const arm = pose ? line(`M${x + 9} 82 q12 -6 18 -16`) : line(`M${x + 9} 82 q10 10 16 18`);
  return `<g>
    ${line(`M${x - 4} 112 L${x - 6} 138 M${x + 4} 112 L${x + 6} 138`)}
    ${shape(`M${x - 10} 80 q0 -10 10 -10 q10 0 10 10 L${x + 12} 114 L${x - 12} 114 Z`, acc)}
    ${line(`M${x - 9} 82 q-8 12 -6 22`)}${arm}
    ${circle(x, 60, 8, 'var(--art-skin)')}
    ${shape(`M${x - 9} 58 q2 -12 12 -10 q8 2 6 10 q-6 -4 -10 -2 q-4 2 -8 2 Z`, 'var(--art-ink)')}
  </g>`;
}

const scenes = {
  auto: acc => `${shape('M118 112 l8 -18 q4 -8 14 -8 h40 q10 0 16 8 l12 18 h6 q6 0 6 6 v8 h-108 v-8 q0 -6 6 -6 Z', acc)}
    ${shape('M134 96 l6 -10 h22 v10 Z M168 96 v-10 h12 q4 0 8 6 l3 4 Z')}${circle(138, 128, 9)}${circle(196, 128, 9)}${dot(138, 128, 3)}${dot(196, 128, 3)}
    ${shape('M210 52 l12 22 h-24 Z', 'var(--art-paper)')}${line('M210 60 v6')}${dot(210, 70, 1.4)}`,
  beauty: acc => `${shape('M150 40 q-24 0 -24 30 q0 30 24 30 q24 0 24 -30 q0 -30 -24 -30 Z', 'var(--art-paper)')}${line('M150 100 v24 M134 124 h32')}
    ${shape('M135 52 q8 -6 18 -4', 'none')}${circle(196, 104, 6)}${circle(206, 112, 6)}${line('M199 100 l18 -26 M209 108 l14 -30')}
    ${rect(186, 60, 12, 26, 3, acc)}${rect(189, 52, 6, 8, 1)}`,
  coaching: acc => `${rect(120, 38, 96, 64, 4)}${line('M168 102 v24 M152 126 h32')}
    ${line('M130 90 l18 -16 l14 10 l26 -26', `stroke="${acc}"`)}${shape('M182 58 h8 v8', 'none')}${dot(130, 90)}${dot(148, 74)}${dot(162, 84)}
    ${rect(196, 108, 20, 16, 2, acc)}`,
  creative: acc => `${rect(126, 62, 52, 38, 5)}${rect(140, 54, 18, 8, 2)}${circle(152, 81, 12, acc)}${circle(152, 81, 6)}
    ${shape('M190 92 q-8 -26 14 -30 q22 -2 22 18 q0 10 -10 10 q-8 0 -6 8 q2 8 -8 8 q-10 0 -12 -14 Z', 'var(--art-paper)')}${dot(202, 70, 3)}${dot(214, 74, 3)}${dot(204, 82, 3)}
    ${line('M120 118 l40 -6 l40 8')}`,
  finance: acc => `${rect(124, 82, 12, 40, 2, acc)}${rect(142, 66, 12, 56, 2)}${rect(160, 50, 12, 72, 2, acc)}
    ${shape('M186 118 a14 5 0 1 0 28 0 v-8 a14 5 0 1 0 -28 0 Z')}${shape('M186 110 a14 5 0 1 0 28 0 v-8 a14 5 0 1 0 -28 0 Z')}${shape('M186 102 a14 5 0 1 0 28 0 v-8 a14 5 0 1 0 -28 0 Z', acc)}
    ${circle(200, 58, 13)}${line('M204 52 q-8 -4 -10 2 q0 4 6 6 q6 2 4 6 q-4 4 -10 0 M200 48 v4 M200 66 v4')}`,
  health: acc => `${shape('M168 96 q-30 -18 -30 -34 q0 -12 12 -12 q10 0 18 10 q8 -10 18 -10 q12 0 12 12 q0 16 -30 34 Z', acc)}
    ${line('M128 74 h14 l6 -10 l8 22 l6 -12 h44', 'stroke="var(--art-paper)"')}
    ${rect(124, 114, 10, 20, 3, acc)}${rect(204, 114, 10, 20, 3, acc)}${line('M134 124 h70')}`,
  home: acc => `${shape('M126 84 l42 -34 l42 34 v44 h-84 Z')}${shape('M120 88 l48 -40 l48 40', 'none')}
    ${rect(156, 100, 20, 28, 2, acc)}${rect(134, 94, 14, 14, 2)}${rect(188, 94, 14, 14, 2)}
    ${line('M206 40 l12 12 M200 46 l6 -6 q6 -6 12 0 q6 6 0 12 l-6 6')}`,
  insurance: acc => `${shape('M166 36 l30 10 v24 q0 30 -30 44 q-30 -14 -30 -44 v-24 Z', acc)}${line('M152 74 l10 10 l20 -20', 'stroke="var(--art-paper)" stroke-width="4"')}
    ${shape('M196 108 q16 -24 32 0 Z', 'var(--art-paper)')}${line('M212 108 v22 q0 6 -6 4')}`,
  legal: acc => `${line('M168 40 v80 M140 122 h56 M134 56 h68')}${dot(168, 40, 4)}
    ${shape('M134 56 l-12 30 h24 Z', 'none')}${shape('M122 86 q12 10 24 0 Z', acc)}
    ${shape('M202 56 l-12 30 h24 Z', 'none')}${shape('M190 86 q12 10 24 0 Z', acc)}
    ${rect(150, 120, 36, 10, 2, acc)}`,
  agency: acc => `${rect(118, 40, 100, 70, 5)}${line('M118 52 h100')}${dot(126, 46, 1.6)}${dot(132, 46, 1.6)}${dot(138, 46, 1.6)}
    ${rect(128, 62, 36, 38, 2, acc)}${line('M172 66 h36 M172 76 h28 M172 86 h34 M172 96 h22')}
    ${shape('M188 118 l20 -10 v26 l-20 -10 Z', acc)}${rect(180, 116, 8, 12, 2)}`,
  medical: acc => `${rect(124, 44, 54, 76, 4)}${rect(140, 38, 22, 12, 3, acc)}
    ${shape('M146 66 h10 v-10 h10 v10 h10 v10 h-10 v10 h-10 v-10 h-10 Z', acc)}${line('M134 100 h34 M134 110 h24')}
    ${line('M196 50 v30 q0 22 14 22 q12 0 12 -14 v-8')}${circle(222, 76, 6, acc)}${line('M190 50 h12')}`,
  other: acc => `${shape('M124 66 h92 l-8 -22 h-76 Z', acc)}${rect(128, 66, 84, 62, 2)}
    ${rect(140, 84, 24, 44, 2, acc)}${rect(176, 82, 26, 22, 2)}${line('M124 66 q11 10 23 0 q11 10 23 0 q11 10 23 0 q11 10 23 0')}`,
  realestate: acc => `${rect(124, 46, 44, 82, 3)}${[58, 74, 90, 106].map(y => `${rect(132, y, 10, 9, 1, acc)}${rect(150, y, 10, 9, 1, acc)}`).join('')}
    ${shape('M176 80 l22 -18 l22 18 v48 h-44 Z', acc)}${rect(192, 104, 12, 24, 2)}
    ${circle(212, 50, 7)}${line('M206 56 l-16 16 M194 68 l4 4 M198 64 l4 4')}`,
  food: acc => `${line('M120 112 h96')}${shape('M128 112 q0 -36 40 -36 q40 0 40 36 Z', acc)}${dot(168, 72, 4)}
    ${rect(188, 48, 22, 24, 4)}${line('M210 54 q8 0 8 6 q0 6 -8 6 M194 40 q-4 -4 0 -8 M202 40 q-4 -4 0 -8')}
    ${line('M132 126 h72')}`,
  travel: acc => `${rect(128, 70, 46, 56, 6, acc)}${shape('M142 70 v-8 q0 -4 4 -4 h10 q4 0 4 4 v8', 'none')}${line('M128 90 h46 M128 106 h46')}${circle(138, 130, 3)}${circle(164, 130, 3)}
    ${shape('M186 54 l34 -10 q6 -2 6 4 q0 4 -4 6 l-14 6 l-6 18 l-6 2 l2 -16 l-12 4 l-4 6 l-4 0 l2 -10 Z')}
    ${line('M184 100 q16 -8 34 0', 'stroke-dasharray="3 5"')}`
};

export function setupArt(segment, seed = segment, label = '') {
  const h = hash(seed);
  const acc = accents[h % accents.length];
  const flip = (h >> 3) & 1;
  const scene = (scenes[segment] || scenes.other)(acc);
  const decor = [0, 1, 2].map(i => dot(28 + i * 7 + ((h >> (4 + i)) & 3), 24 + ((h >> 6) & 7), 1.8)).join('');
  return `<svg viewBox="0 0 240 150" role="img" aria-label="${label.replace(/[<>&"]/g, '')}" class="ag-art" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 120 q-18 -40 14 -68 q30 -26 78 -18 q30 -24 70 -6 q38 20 28 62 q-6 40 -60 42 q-30 18 -70 6 q-50 4 -60 -18 Z" fill="var(--art-bg)"/>
    ${line('M14 30 h30 v-8', 'stroke-width="1.6"')}${decor}${line('M214 24 h12 M220 18 v12', 'stroke-width="1.6"')}
    <g transform="${flip ? 'translate(240 0) scale(-1 1)' : ''}">${person(84 + ((h >> 8) & 7), acc, (h >> 11) & 1)}${scene}</g>
    ${line('M20 138 h200', 'stroke-width="1.4" opacity=".5"')}
  </svg>`;
}
