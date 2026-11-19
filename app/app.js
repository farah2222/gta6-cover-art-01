'use strict';
/* VICE COVER STUDIO — turns your photos into GTA 6-style multi-panel cover art.
   All rendering is one canvas pipeline: photo panels -> colour grade -> lettering
   -> badge -> grain / vignette. Exports are exact-size PNGs, drawn at full res. */

const $ = (s) => document.querySelector(s);
const canvas = $('#poster');
const ctx = canvas.getContext('2d');

/* ------------------------------------------------------------------ data */

const ASPECTS = {
  square:   { w: 1080, h: 1080, label: '1080 × 1080 · square post' },
  portrait: { w: 1080, h: 1350, label: '1080 × 1350 · portrait post' },
  wide:     { w: 1920, h: 1080, label: '1920 × 1080 · wide / story' },
};

/* Layouts: panels in normalised coords, plus where the title block lives. */
const LAYOUTS = {
  grid4: {
    name: 'Four-panel grid', count: 4,
    panels: () => {
      const g = 0.012;
      return [
        { x: 0, y: 0, w: 0.5 - g / 2, h: 0.5 - g / 2, rot: 0 },
        { x: 0.5 + g / 2, y: 0, w: 0.5 - g / 2, h: 0.5 - g / 2, rot: 0 },
        { x: 0, y: 0.5 + g / 2, w: 0.5 - g / 2, h: 0.5 - g / 2, rot: 0 },
        { x: 0.5 + g / 2, y: 0.5 + g / 2, w: 0.5 - g / 2, h: 0.5 - g / 2, rot: 0 },
      ];
    },
    title: { x: 0.03, y: 0.72, w: 0.94, h: 0.24, align: 'center' },
  },
  hero3: {
    name: 'Hero + three', count: 4,
    panels: () => {
      const g = 0.012, rw = 0.37, rh = (1 - 2 * g) / 3;
      return [
        { x: 0, y: 0, w: 0.62, h: 1, rot: 0 },
        { x: 0.63, y: 0, w: rw, h: rh, rot: 0 },
        { x: 0.63, y: rh + g, w: rw, h: rh, rot: 0 },
        { x: 0.63, y: 2 * (rh + g), w: rw, h: rh, rot: 0 },
      ];
    },
    title: { x: 0.03, y: 0.74, w: 0.56, h: 0.22, align: 'left' },
  },
  full: {
    name: 'Full-bleed', count: 1,
    panels: () => [{ x: 0, y: 0, w: 1, h: 1, rot: 0 }],
    title: { x: 0.04, y: 0.70, w: 0.92, h: 0.26, align: 'center' },
  },
  grid9: {
    name: 'Nine-panel grid', count: 9,
    panels: () => {
      const g = 0.01, s = (1 - 2 * g) / 3, out = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
        out.push({ x: c * (s + g), y: r * (s + g), w: s, h: s, rot: 0 });
      return out;
    },
    title: { x: 0.03, y: 0.76, w: 0.94, h: 0.20, align: 'center' },
  },
  collage: {
    name: 'Tilted snapshots', count: 4, bg: 'gradient', border: true,
    panels: () => [
      { x: 0.04, y: 0.04, w: 0.50, h: 0.40, rot: -4 },
      { x: 0.52, y: 0.02, w: 0.44, h: 0.38, rot: 3 },
      { x: 0.06, y: 0.47, w: 0.44, h: 0.36, rot: 2.5 },
      { x: 0.50, y: 0.44, w: 0.46, h: 0.38, rot: -3 },
    ],
    title: { x: 0.05, y: 0.83, w: 0.90, h: 0.14, align: 'center' },
  },
  story: {
    name: 'Story layout', count: 3, bg: 'gradient',
    panels: () => [
      { x: 0, y: 0, w: 1, h: 0.52, rot: 0 },
      { x: 0, y: 0.53, w: 0.49, h: 0.24, rot: 0 },
      { x: 0.51, y: 0.53, w: 0.49, h: 0.24, rot: 0 },
    ],
    title: { x: 0.04, y: 0.79, w: 0.92, h: 0.18, align: 'center' },
  },
};

/* Gradient-map style grades: photo filter + overlay gradient + tint. */
const GRADES = {
  sunset: {
    name: 'Sunset', swatch: 'linear-gradient(135deg,#ff7a18,#ff2e63 55%,#7b2ff7)',
    filter: 'saturate(1.4) contrast(1.12) brightness(1.03)',
    stops: [[0, '#ff7a18'], [0.55, '#ff2e63'], [1, '#7b2ff7']],
    tint: '#ff5a3c', tintAlpha: 0.10,
  },
  neon: {
    name: 'Neon pink / teal', swatch: 'linear-gradient(135deg,#00f5d4,#ff2e88 55%,#7b2ff7)',
    filter: 'saturate(1.55) contrast(1.15) brightness(1.02)',
    stops: [[0, '#00f5d4'], [0.5, '#ff2e88'], [1, '#7b2ff7']],
    tint: '#ff2e88', tintAlpha: 0.10,
  },
  golden: {
    name: 'Golden hour', swatch: 'linear-gradient(135deg,#ffe9a8,#ff8c42 55%,#a63d40)',
    filter: 'saturate(1.35) contrast(1.08) brightness(1.06)',
    stops: [[0, '#ffd166'], [0.55, '#ff8c42'], [1, '#a63d40']],
    tint: '#ffb347', tintAlpha: 0.12,
  },
  midnight: {
    name: 'Midnight purple', swatch: 'linear-gradient(135deg,#0f0c29,#302b63 55%,#e94560)',
    filter: 'saturate(1.25) contrast(1.12) brightness(0.94)',
    stops: [[0, '#1b1b4d'], [0.55, '#5b2a86'], [1, '#e94560']],
    tint: '#3b2a8f', tintAlpha: 0.16,
  },
  vintage: {
    name: 'Vintage', swatch: 'linear-gradient(135deg,#f4e3c1,#d9a05b 55%,#8b5e3c)',
    filter: 'saturate(0.8) contrast(0.96) brightness(1.05) sepia(0.35)',
    stops: [[0, '#f4e3c1'], [0.55, '#d9a05b'], [1, '#8b5e3c']],
    tint: '#c98f4e', tintAlpha: 0.14,
  },
  pastel: {
    name: 'Miami pastel', swatch: 'linear-gradient(135deg,#ff9a9e,#fecfef 55%,#a18cd1)',
    filter: 'saturate(1.15) contrast(1.02) brightness(1.08)',
    stops: [[0, '#ff9a9e'], [0.55, '#fecfef'], [1, '#a18cd1']],
    tint: '#ffb3c7', tintAlpha: 0.10,
  },
};

const state = {
  photos: [],            // {id, name, src, img, w, h}
  layout: 'grid4',
  grade: 'sunset',
  aspect: 'square',
  title: 'VICE CITY',
  subtitle: 'Neon nights · your story',
  badge: 'EST. 2026',
  titleFont: 'Anton',
  titleColor: '#ffffff',
  outline: true,
  halftone: true,
  grain: true,
  vignette: true,
  selected: 0,
  panels: Array.from({ length: 9 }, () => ({ photoId: null, zoom: 1, ox: 0, oy: 0 })),
};

let history = [], future = [];
let photoSeq = 0;

/* ------------------------------------------------------------------ grain */

const noiseCanvas = document.createElement('canvas');
noiseCanvas.width = noiseCanvas.height = 160;
{
  const nctx = noiseCanvas.getContext('2d');
  const img = nctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.floor(Math.random() * 90);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ render */

function layoutRects(W, H) {
  const L = LAYOUTS[state.layout];
  return L.panels().map((p) => ({
    x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H, rot: p.rot || 0,
  }));
}

function drawPhotoCover(c, img, px, py, pw, ph, panel) {
  const zoom = panel.zoom || 1;
  const s = Math.max(pw / img.width, ph / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  const dx = px + (pw - dw) / 2 + (panel.ox || 0) / 100 * pw * 0.45;
  const dy = py + (ph - dh) / 2 + (panel.oy || 0) / 100 * ph * 0.45;
  c.drawImage(img, dx, dy, dw, dh);
}

function applyGrade(c, px, py, pw, ph) {
  const g = GRADES[state.grade];
  const grad = c.createLinearGradient(px, py, px + pw * 0.25, py + ph);
  for (const [stop, col] of g.stops) grad.addColorStop(stop, col);
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.55;
  c.fillStyle = grad;
  c.fillRect(px, py, pw, ph);
  c.globalCompositeOperation = 'soft-light';
  c.globalAlpha = 0.5;
  c.fillRect(px, py, pw, ph);
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = g.tintAlpha;
  c.fillStyle = g.tint;
  c.fillRect(px, py, pw, ph);
  c.restore();
}

function drawPanel(c, rect, panel, W, H) {
  const photo = state.photos.find((p) => p.id === panel.photoId);
  c.save();
  if (rect.rot) {
    c.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    c.rotate((rect.rot * Math.PI) / 180);
    c.translate(-rect.w / 2, -rect.h / 2);
  } else {
    c.translate(rect.x, rect.y);
  }
  const L = LAYOUTS[state.layout];
  const bw = L.border ? Math.max(6, W * 0.008) : 0;
  if (bw) { c.fillStyle = '#fdf6ec'; c.fillRect(-bw, -bw, rect.w + 2 * bw, rect.h + 2 * bw); }
  c.beginPath();
  c.rect(0, 0, rect.w, rect.h);
  c.clip();
  if (photo && photo.img) {
    c.filter = GRADES[state.grade].filter;
    drawPhotoCover(c, photo.img, 0, 0, rect.w, rect.h, panel);
    c.filter = 'none';
    applyGrade(c, 0, 0, rect.w, rect.h);
  } else {
    const g2 = c.createLinearGradient(0, 0, rect.w, rect.h);
    g2.addColorStop(0, '#2a1547');
    g2.addColorStop(1, '#12081f');
    c.fillStyle = g2;
    c.fillRect(0, 0, rect.w, rect.h);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = `600 ${Math.max(14, rect.w * 0.045)}px Oswald, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('＋ ADD A PHOTO', rect.w / 2, rect.h / 2);
  }
  // subtle inner edge so panels read as separate frames
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = Math.max(1, W * 0.0015);
  c.strokeRect(0, 0, rect.w, rect.h);
  c.restore();
}

function fitFont(c, text, fontFamily, maxSize, maxWidth, weight) {
  let size = maxSize;
  const face = (s) => `${weight ? weight + ' ' : ''}${s}px ${fontFamily}`;
  c.font = face(size);
  while (size > 12 && c.measureText(text).width > maxWidth) {
    size -= 2;
    c.font = face(size);
  }
  return size;
}

function drawHalftone(c, x, y, w, h, W) {
  const step = Math.max(10, W * 0.013);
  c.save();
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x; xx < x + w; xx += step) {
      const fade = 1 - (yy - y) / h; // denser at the bottom
      const r = step * 0.22 * (0.4 + 0.6 * fade);
      c.fillStyle = `rgba(255,255,255,${0.05 + 0.10 * fade})`;
      c.beginPath();
      c.arc(xx + step / 2, yy + step / 2, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

function drawTitleBlock(c, W, H) {
  const L = LAYOUTS[state.layout];
  const z = L.title;
  const zx = z.x * W, zy = z.y * H, zw = z.w * W, zh = z.h * H;

  if (state.halftone) {
    const bg = c.createLinearGradient(0, zy - zh * 0.25, 0, zy + zh);
    bg.addColorStop(0, 'rgba(8,3,18,0)');
    bg.addColorStop(0.35, 'rgba(8,3,18,0.62)');
    bg.addColorStop(1, 'rgba(8,3,18,0.78)');
    c.fillStyle = bg;
    c.fillRect(0, zy - zh * 0.25, W, zh * 1.25);
    drawHalftone(c, 0, zy, W, zh, W);
  }

  const title = (state.title || 'UNTITLED').toUpperCase();
  const maxTitle = Math.min(zh * 0.62, W * 0.16);
  const weight = state.titleFont === 'Oswald' ? '600 ' : '';
  const size = fitFont(c, title, `'${state.titleFont}', sans-serif`, maxTitle, zw, weight);
  const titleY = zy + zh * 0.46;

  c.save();
  c.textAlign = z.align;
  c.textBaseline = 'middle';
  const tx = z.align === 'left' ? zx : z.align === 'right' ? zx + zw : zx + zw / 2;
  if ('letterSpacing' in c) c.letterSpacing = `${Math.max(1, size * 0.02)}px`;
  c.font = `${weight}${size}px '${state.titleFont}', sans-serif`;
  c.shadowColor = 'rgba(255,46,136,0.65)';
  c.shadowBlur = size * 0.18;
  c.shadowOffsetY = size * 0.04;
  if (state.outline) {
    c.lineWidth = Math.max(2, size * 0.09);
    c.strokeStyle = 'rgba(16,4,32,0.92)';
    c.lineJoin = 'round';
    c.strokeText(title, tx, titleY);
  }
  const grad = c.createLinearGradient(0, titleY - size / 2, 0, titleY + size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, state.titleColor === '#ffffff' ? '#ffd166' : state.titleColor);
  c.fillStyle = state.titleColor === '#ffffff' ? grad : state.titleColor;
  c.fillText(title, tx, titleY);
  c.restore();

  if (state.subtitle) {
    const subSize = Math.min(zh * 0.16, W * 0.032);
    c.save();
    c.textAlign = z.align;
    c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = `${Math.max(1, subSize * 0.14)}px`;
    c.font = `500 ${subSize}px Oswald, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = subSize * 0.4;
    c.fillText(state.subtitle.toUpperCase(), tx, zy + zh * 0.82);
    c.restore();
  }
}

function drawBadge(c, W, H) {
  if (!state.badge) return;
  const text = state.badge.toUpperCase();
  const fs = Math.max(16, W * 0.022);
  c.save();
  c.font = `600 ${fs}px Oswald, sans-serif`;
  const tw = c.measureText(text).width;
  const bw = tw + fs * 2.2, bh = fs * 2.1;
  c.translate(W - bw * 0.62, bh * 0.9);
  c.rotate((-7 * Math.PI) / 180);
  const g = c.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  g.addColorStop(0, '#ff7a18');
  g.addColorStop(1, '#ff2e88');
  c.fillStyle = g;
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = W * 0.01;
  c.shadowOffsetY = W * 0.004;
  c.beginPath();
  c.moveTo(-bw / 2, -bh / 2);
  c.lineTo(bw / 2, -bh / 2);
  c.lineTo(bw / 2 - fs * 0.5, bh / 2);
  c.lineTo(-bw / 2 + fs * 0.5, bh / 2);
  c.closePath();
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if ('letterSpacing' in c) c.letterSpacing = `${fs * 0.12}px`;
  c.fillText('★ ' + text + ' ★', 0, 1);
  c.restore();
}

function renderPoster(c, W, H) {
  const L = LAYOUTS[state.layout];
  c.clearRect(0, 0, W, H);
  if (L.bg === 'gradient') {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1a0b2e');
    g.addColorStop(0.5, '#3d1157');
    g.addColorStop(1, '#12081f');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = '#0d0714';
    c.fillRect(0, 0, W, H);
  }
  const rects = layoutRects(W, H);
  rects.forEach((r, i) => drawPanel(c, r, state.panels[i], W, H));
  drawTitleBlock(c, W, H);
  drawBadge(c, W, H);
  if (state.vignette) {
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,0,12,0.5)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }
  if (state.grain) {
    c.save();
    c.globalAlpha = 0.08;
    c.globalCompositeOperation = 'overlay';
    const pat = c.createPattern(noiseCanvas, 'repeat');
    c.fillStyle = pat;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
  // selected-panel outline on the live preview only (never in cover mode,
  // and never on exported PNGs, which render through a different context)
  if (c === ctx && !document.body.classList.contains('cover-mode') && rects[state.selected]) {
    const r = rects[state.selected];
    c.save();
    c.strokeStyle = '#00f5d4';
    c.lineWidth = 3;
    c.setLineDash([10, 6]);
    c.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    c.restore();
  }
}

function renderPreview() {
  const a = ASPECTS[state.aspect];
  const scale = state.aspect === 'wide' ? 1280 / a.w : 900 / a.w;
  canvas.width = Math.round(a.w * scale);
  canvas.height = Math.round(a.h * scale);
  renderPoster(ctx, canvas.width, canvas.height);
  $('#sizeLabel').textContent = a.label;
  document.body.dataset.ready = '1';
}

/* ------------------------------------------------------------------ photos */

function addPhotoFile(file) {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const photo = { id: ++photoSeq, name: file.name || 'photo', src, img, w: img.width, h: img.height };
      state.photos.push(photo);
      assignPhotoToEmptyPanels(photo.id);
      refreshPhotoStrip();
      renderPreview();
      resolve(photo);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function loadSample(url, name) {
  return fetch(url)
    .then((r) => r.blob())
    .then((b) => addPhotoFile(new File([b], name, { type: b.type || 'image/jpeg' })))
    .catch(() => null);
}

function assignPhotoToEmptyPanels(photoId) {
  const n = LAYOUTS[state.layout].count;
  let placed = false;
  for (let i = 0; i < n; i++) {
    if (!state.panels[i].photoId) { state.panels[i].photoId = photoId; placed = true; }
  }
  if (!placed) state.panels[state.selected].photoId = photoId;
}

function refreshPhotoStrip() {
  const strip = $('#photoStrip');
  strip.innerHTML = '';
  state.photos.forEach((p) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'photo-thumb' + (state.panels[state.selected].photoId === p.id ? ' active' : '');
    img.src = p.src;
    img.alt = p.name;
    img.title = p.name + ' — click to put in selected panel';
    img.addEventListener('click', () => {
      commit();
      state.panels[state.selected].photoId = p.id;
      refreshPhotoStrip();
      renderPreview();
    });
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.title = 'Remove photo';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      commit();
      state.photos = state.photos.filter((x) => x.id !== p.id);
      state.panels.forEach((pn) => { if (pn.photoId === p.id) pn.photoId = null; });
      refreshPhotoStrip();
      renderPreview();
    });
    wrap.append(img, rm);
    strip.appendChild(wrap);
  });
  const sel = $('#panelPhoto');
  sel.innerHTML = '<option value="">— empty panel —</option>';
  state.photos.forEach((p) => {
    const o = document.createElement('option');
    o.value = String(p.id);
    o.textContent = p.name;
    sel.appendChild(o);
  });
  sel.value = state.panels[state.selected].photoId ? String(state.panels[state.selected].photoId) : '';
}

/* ------------------------------------------------------------------ history */

function snapshot() {
  return JSON.stringify({
    layout: state.layout, grade: state.grade, aspect: state.aspect,
    title: state.title, subtitle: state.subtitle, badge: state.badge,
    titleFont: state.titleFont, titleColor: state.titleColor,
    outline: state.outline, halftone: state.halftone, grain: state.grain,
    vignette: state.vignette, selected: state.selected,
    panels: state.panels,
  });
}

function restore(snap) {
  const d = JSON.parse(snap);
  Object.assign(state, d);
  state.panels = d.panels;
  syncControls();
  renderPreview();
  refreshPhotoStrip();
}

function commit() {
  history.push(snapshot());
  if (history.length > 60) history.shift();
  future = [];
}

/* For live inputs (sliders, text fields) the snapshot must be taken when the
   edit STARTS — by the time 'change' fires the state is already new. */
let pendingSnap = null;
function beginEdit() { if (pendingSnap === null) pendingSnap = snapshot(); }
function endEdit() {
  if (pendingSnap === null) return;
  history.push(pendingSnap);
  if (history.length > 60) history.shift();
  future = [];
  pendingSnap = null;
}

function undo() {
  if (!history.length) return;
  future.push(snapshot());
  restore(history.pop());
}

function redo() {
  if (!future.length) return;
  history.push(snapshot());
  restore(future.pop());
}

/* ------------------------------------------------------------------ export */

function exportPNG(aspectKey) {
  const a = ASPECTS[aspectKey];
  const off = document.createElement('canvas');
  off.width = a.w;
  off.height = a.h;
  renderPoster(off.getContext('2d'), a.w, a.h);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vice-cover-${a.w}x${a.h}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve({ aspect: aspectKey, w: a.w, h: a.h, bytes: blob.size });
    }, 'image/png');
  });
}

async function exportAll() {
  const status = $('#exportStatus');
  status.textContent = 'Exporting 3 PNGs…';
  const results = [];
  for (const key of ['square', 'portrait', 'wide']) {
    results.push(await exportPNG(key));
    await new Promise((r) => setTimeout(r, 250));
  }
  status.textContent = `Exported ${results.map((r) => `${r.w}×${r.h}`).join(', ')} — check your downloads.`;
  return results;
}

/* ------------------------------------------------------------------ controls */

function buildPickers() {
  const lb = $('#layoutBtns');
  Object.entries(LAYOUTS).forEach(([key, L]) => {
    const b = document.createElement('button');
    b.className = 'pick-btn' + (key === state.layout ? ' active' : '');
    b.dataset.layout = key;
    b.innerHTML = `<span class="thumb" style="background:${key === 'collage' || key === 'story' ? 'linear-gradient(135deg,#3d1157,#ff2e88)' : 'linear-gradient(135deg,#ff7a18,#ff2e63 55%,#7b2ff7)'}"></span><span>${L.name}</span>`;
    b.addEventListener('click', () => {
      commit();
      state.layout = key;
      state.selected = 0;
      document.querySelectorAll('#layoutBtns .pick-btn').forEach((x) => x.classList.toggle('active', x.dataset.layout === key));
      syncPanelControls();
      refreshPhotoStrip();
      renderPreview();
    });
    lb.appendChild(b);
  });

  const gb = $('#gradeBtns');
  Object.entries(GRADES).forEach(([key, g]) => {
    const b = document.createElement('button');
    b.className = 'pick-btn' + (key === state.grade ? ' active' : '');
    b.dataset.grade = key;
    b.innerHTML = `<span class="thumb" style="background:${g.swatch}"></span><span>${g.name}</span>`;
    b.addEventListener('click', () => {
      commit();
      state.grade = key;
      document.querySelectorAll('#gradeBtns .pick-btn').forEach((x) => x.classList.toggle('active', x.dataset.grade === key));
      renderPreview();
    });
    gb.appendChild(b);
  });
}

function syncPanelControls() {
  const p = state.panels[state.selected];
  $('#zoomRange').value = p.zoom;
  $('#oxRange').value = p.ox;
  $('#oyRange').value = p.oy;
  $('#zoomVal').textContent = p.zoom.toFixed(2) + '×';
  $('#oxVal').textContent = p.ox;
  $('#oyVal').textContent = p.oy;
  const sel = $('#panelPhoto');
  sel.value = p.photoId ? String(p.photoId) : '';
}

function syncControls() {
  $('#titleInput').value = state.title;
  $('#subtitleInput').value = state.subtitle;
  $('#badgeInput').value = state.badge;
  $('#fontSelect').value = state.titleFont;
  $('#titleColor').value = state.titleColor;
  $('#outlineCheck').checked = state.outline;
  $('#halftoneCheck').checked = state.halftone;
  $('#grainCheck').checked = state.grain;
  $('#vignetteCheck').checked = state.vignette;
  document.querySelectorAll('#layoutBtns .pick-btn').forEach((x) => x.classList.toggle('active', x.dataset.layout === state.layout));
  document.querySelectorAll('#gradeBtns .pick-btn').forEach((x) => x.classList.toggle('active', x.dataset.grade === state.grade));
  document.querySelectorAll('.size-tab').forEach((x) => x.classList.toggle('active', x.dataset.ar === state.aspect));
  $('#canvasWrap').className = 'canvas-wrap' + (state.aspect === 'square' ? '' : ' ar-' + state.aspect);
  syncPanelControls();
}

function bindControls() {
  $('#fileInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    commit();
    for (const f of files) await addPhotoFile(f);
    e.target.value = '';
  });

  document.querySelectorAll('.sample-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      commit();
      await loadSample(b.dataset.sample, b.dataset.sample.split('/').pop());
    });
  });
  $('#demoBtn').addEventListener('click', async () => {
    commit();
    await loadSample('samples/boulevard.jpg', 'boulevard.jpg');
    await loadSample('samples/pier.jpg', 'pier.jpg');
  });

  $('#fillAllBtn').addEventListener('click', () => {
    const id = state.panels[state.selected].photoId || (state.photos[0] && state.photos[0].id);
    if (!id) return;
    commit();
    const n = LAYOUTS[state.layout].count;
    for (let i = 0; i < n; i++) state.panels[i].photoId = id;
    renderPreview();
  });

  $('#shuffleBtn').addEventListener('click', () => {
    if (!state.photos.length) return;
    commit();
    const n = LAYOUTS[state.layout].count;
    for (let i = 0; i < n; i++)
      state.panels[i].photoId = state.photos[Math.floor(Math.random() * state.photos.length)].id;
    refreshPhotoStrip();
    renderPreview();
  });

  document.querySelectorAll('.size-tab').forEach((b) => {
    b.addEventListener('click', () => {
      state.aspect = b.dataset.ar;
      document.querySelectorAll('.size-tab').forEach((x) => x.classList.toggle('active', x === b));
      $('#canvasWrap').className = 'canvas-wrap' + (state.aspect === 'square' ? '' : ' ar-' + state.aspect);
      renderPreview();
    });
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const rects = layoutRects(canvas.width, canvas.height);
    // topmost panel wins — check in reverse draw order
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      const cx = px - (r.x + r.w / 2), cy = py - (r.y + r.h / 2);
      const rot = (-(r.rot || 0) * Math.PI) / 180;
      const lx = cx * Math.cos(rot) - cy * Math.sin(rot) + r.w / 2;
      const ly = cx * Math.sin(rot) + cy * Math.cos(rot) + r.h / 2;
      if (lx >= 0 && lx <= r.w && ly >= 0 && ly <= r.h) {
        state.selected = i;
        syncPanelControls();
        refreshPhotoStrip();
        renderPreview();
        return;
      }
    }
  });

  const wrap = $('#canvasWrap');
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); });
  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    commit();
    for (const f of files) await addPhotoFile(f);
  });

  $('#panelPhoto').addEventListener('change', (e) => {
    commit();
    state.panels[state.selected].photoId = e.target.value ? Number(e.target.value) : null;
    refreshPhotoStrip();
    renderPreview();
  });

  const slider = (id, key, fmt) => {
    $(id).addEventListener('pointerdown', beginEdit);
    $(id).addEventListener('focus', beginEdit);
    $(id).addEventListener('input', (e) => {
      state.panels[state.selected][key] = Number(e.target.value);
      $(fmt).textContent = key === 'zoom' ? Number(e.target.value).toFixed(2) + '×' : e.target.value;
      renderPreview();
    });
    $(id).addEventListener('change', endEdit);
  };
  slider('#zoomRange', 'zoom', '#zoomVal');
  slider('#oxRange', 'ox', '#oxVal');
  slider('#oyRange', 'oy', '#oyVal');

  $('#resetPanelBtn').addEventListener('click', () => {
    commit();
    state.panels[state.selected] = { photoId: state.panels[state.selected].photoId, zoom: 1, ox: 0, oy: 0 };
    syncPanelControls();
    renderPreview();
  });

  const textCommit = (id, key) => {
    $(id).addEventListener('focus', beginEdit);
    $(id).addEventListener('input', (e) => { state[key] = e.target.value; renderPreview(); });
    $(id).addEventListener('change', endEdit);
  };
  textCommit('#titleInput', 'title');
  textCommit('#subtitleInput', 'subtitle');
  textCommit('#badgeInput', 'badge');

  $('#fontSelect').addEventListener('change', (e) => { commit(); state.titleFont = e.target.value; renderPreview(); });
  $('#titleColor').addEventListener('focus', beginEdit);
  $('#titleColor').addEventListener('input', (e) => { state.titleColor = e.target.value; renderPreview(); });
  $('#titleColor').addEventListener('change', endEdit);

  const check = (id, key) => {
    $(id).addEventListener('change', (e) => { commit(); state[key] = e.target.checked; renderPreview(); });
  };
  check('#outlineCheck', 'outline');
  check('#halftoneCheck', 'halftone');
  check('#grainCheck', 'grain');
  check('#vignetteCheck', 'vignette');

  document.querySelectorAll('[data-export]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await exportPNG(b.dataset.export);
      $('#exportStatus').textContent = `Exported ${r.w}×${r.h} PNG (${Math.round(r.bytes / 1024)} KB) — check your downloads.`;
    });
  });
  $('#exportAllBtn').addEventListener('click', exportAll);

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  });
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  buildPickers();
  bindControls();
  syncControls();
  try {
    await Promise.all([
      document.fonts.load("16px Anton"),
      document.fonts.load("16px 'Bebas Neue'"),
      document.fonts.load("16px Pacifico"),
      document.fonts.load("600 16px Oswald"),
    ]);
    await document.fonts.ready;
  } catch (_) { /* system fallback fonts still render */ }
  const params = new URLSearchParams(location.search);
  if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
  if (params.get('grade') && GRADES[params.get('grade')]) state.grade = params.get('grade');
  if (params.get('ar') && ASPECTS[params.get('ar')]) state.aspect = params.get('ar');
  if (params.get('cover')) document.body.classList.add('cover-mode');
  if (params.get('demo')) {
    await loadSample('samples/boulevard.jpg', 'boulevard.jpg');
    await loadSample('samples/pier.jpg', 'pier.jpg');
  }
  syncControls();
  renderPreview();
}

window.__vice = { state, renderPreview, exportPNG, exportAll, LAYOUTS, GRADES, ASPECTS };
boot();
