const clamp = value => Math.max(0, Math.min(1, value));

function hexToHsv(hex, previousHue = 0) {
  const [red, green, blue] = hex.slice(1).match(/../g).map(part => Number.parseInt(part, 16) / 255);
  const value = Math.max(red, green, blue);
  const delta = value - Math.min(red, green, blue);
  if (!delta) return { hue: previousHue, saturation: 0, value };
  const sector = value === red ? (green - blue) / delta
    : value === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return { hue: (sector * 60 + 360) % 360, saturation: delta / value, value };
}

function hsvToHex({ hue, saturation, value }) {
  const chroma = value * saturation;
  const sector = hue % 360 / 60;
  const second = chroma * (1 - Math.abs(sector % 2 - 1));
  const channels = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second],
    [0, second, chroma], [second, 0, chroma], [chroma, 0, second]][Math.floor(sector)];
  return '#' + channels.map(channel => Math.round((channel + value - chroma) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function colorPicker(value) {
  const hex = /^#[\da-f]{6}$/i.test(value) ? value.toUpperCase() : '#FF00BB';
  return `<div class="ag-color-picker" data-color-picker>
    <label for="ag-primary-color">Cor primária</label>
    <div class="ag-color-fields">
      <button type="button" class="secondary ag-color-trigger" data-color-toggle aria-label="Seletor de cor primária" aria-expanded="false" aria-controls="ag-color-panel">
        <span class="ag-color-swatch" aria-hidden="true"></span><span class="ag-color-chevron" aria-hidden="true"></span>
      </button>
      <input id="ag-primary-color" name="primary" value="${hex}" pattern="#[0-9A-Fa-f]{6}" maxlength="7" required
        title="Código HEX de seis dígitos, como #FF00BB" aria-label="Cor primária em HEX" autocomplete="off" spellcheck="false">
    </div>
    <div class="ag-color-panel" id="ag-color-panel" hidden>
      <div class="ag-color-plane" data-color-plane tabindex="0" role="group" aria-label="Saturação e brilho. Use as setas para ajustar.">
        <span class="ag-color-knob" aria-hidden="true"></span>
      </div>
      <div class="ag-color-controls">
        <button type="button" class="icon-btn ag-color-dropper" data-color-dropper title="Conta-gotas" aria-label="Selecionar cor da tela" hidden>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 7 3 3M5 19l4-1 10-10a2.1 2.1 0 0 0-3-3L6 15l-1 4Z"/></svg>
        </button>
        <label for="ag-color-hue"><span class="sr-only">Matiz</span><input id="ag-color-hue" type="range" min="0" max="360"></label>
      </div>
    </div>
  </div>`;
}

export function mountColorPicker(root) {
  const field = root.querySelector('[name=primary]');
  const trigger = root.querySelector('[data-color-toggle]');
  const panel = root.querySelector('#ag-color-panel');
  const plane = root.querySelector('[data-color-plane]');
  const slider = root.querySelector('#ag-color-hue');
  const dropper = root.querySelector('[data-color-dropper]');
  let color = hexToHsv(field.value);
  let syncing = false;

  function emit(type) {
    syncing = true;
    try {
      field.dispatchEvent(new Event(type, { bubbles: true }));
    } finally {
      syncing = false;
    }
  }
  function paint() {
    root.style.setProperty('--picker-color', hsvToHex(color));
    root.style.setProperty('--picker-hue', hsvToHex({ hue: color.hue, saturation: 1, value: 1 }));
    plane.style.setProperty('--picker-x', `${color.saturation * 100}%`);
    plane.style.setProperty('--picker-y', `${(1 - color.value) * 100}%`);
    slider.value = Math.round(color.hue);
  }
  function updateField(commit = false) {
    field.value = hsvToHex(color);
    paint();
    emit('input');
    if (commit) emit('change');
  }
  function selectPoint(event) {
    const rect = plane.getBoundingClientRect();
    color.saturation = clamp((event.clientX - rect.left) / rect.width);
    color.value = 1 - clamp((event.clientY - rect.top) / rect.height);
    updateField();
  }
  function readHex() {
    if (syncing) return;
    const digits = field.value.replace(/^#/, '');
    if (!/^[\da-f]{6}$/i.test(digits)) return;
    field.value = '#' + digits.toUpperCase();
    color = hexToHsv(field.value, color.hue);
    paint();
  }
  function onOutsidePointerDown(event) {
    if (!root.isConnected) {
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
      return;
    }
    if (panel.hidden || root.contains(event.target)) return;
    setOpen(false);
  }
  function setOpen(open) {
    if (!open && !panel.hidden) {
      readHex();
      updateField(true);
    }
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) document.addEventListener('pointerdown', onOutsidePointerDown, true);
    else document.removeEventListener('pointerdown', onOutsidePointerDown, true);
  }

  trigger.addEventListener('click', () => setOpen(panel.hidden));
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.stopPropagation();
    setOpen(false);
    trigger.focus();
  });
  plane.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    plane.setPointerCapture(event.pointerId);
    selectPoint(event);
  });
  plane.addEventListener('pointermove', event => {
    if (plane.hasPointerCapture(event.pointerId)) selectPoint(event);
  });
  plane.addEventListener('pointerup', event => {
    if (plane.hasPointerCapture(event.pointerId)) emit('change');
  });
  plane.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    color.saturation = clamp(color.saturation + direction[0] * step);
    color.value = clamp(color.value + direction[1] * step);
    updateField(true);
  });
  slider.addEventListener('input', () => {
    color.hue = Number(slider.value);
    updateField();
  });
  slider.addEventListener('change', () => emit('change'));
  field.addEventListener('input', readHex);
  field.addEventListener('blur', () => {
    readHex();
    updateField(true);
  });
  if (typeof window.EyeDropper === 'function') {
    dropper.hidden = false;
    dropper.addEventListener('click', async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        field.value = sRGBHex;
        readHex();
        updateField(true);
      } catch { /* Closing the eyedropper preserves the current color. */ }
    });
  }
  paint();
}
