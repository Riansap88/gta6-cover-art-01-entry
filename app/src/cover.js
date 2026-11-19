// Vice Cover Studio: draws the multi-panel cover art onto a canvas.
// Layouts: hero (one big panel over two small ones), strip (three columns),
// grid (two by two). Each panel holds its own photo, zoom and pan. A colour
// grade (gradient + vignette + deterministic grain) and bold poster lettering
// finish the cover. System fonts only, no external assets.

/** The three panel layouts and their labels, in panel order. */
export const LAYOUTS = {
  hero: ['Top / Hero', 'Bottom left', 'Bottom right'],
  strip: ['Left', 'Middle', 'Right'],
  grid: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
};

/** The colour grades: gradient stops, scrim tint and vignette strength. */
export const GRADES = {
  sunset: {
    stops: [[0, 'rgba(255, 94, 138, 0.34)'], [0.55, 'rgba(255, 122, 61, 0.18)'], [1, 'rgba(255, 80, 160, 0.30)']],
    scrim: 'rgba(43, 10, 54, 0.72)',
    vignette: 0.42,
  },
  neon: {
    stops: [[0, 'rgba(25, 194, 216, 0.32)'], [0.5, 'rgba(123, 92, 255, 0.20)'], [1, 'rgba(255, 46, 178, 0.34)']],
    scrim: 'rgba(6, 8, 44, 0.74)',
    vignette: 0.46,
  },
  gold: {
    stops: [[0, 'rgba(255, 210, 61, 0.30)'], [0.55, 'rgba(255, 150, 40, 0.16)'], [1, 'rgba(214, 116, 32, 0.30)']],
    scrim: 'rgba(46, 26, 4, 0.70)',
    vignette: 0.38,
  },
};

/** Panel rectangles for a layout, in canvas pixels, with a gutter between them. */
export function panelRects(layout, w, h) {
  const g = Math.max(4, Math.round(w * 0.009));
  if (layout === 'strip') {
    const pw = (w - 4 * g) / 3;
    return [0, 1, 2].map((i) => ({ x: g + i * (pw + g), y: g, w: pw, h: h - 2 * g }));
  }
  if (layout === 'grid') {
    const pw = (w - 3 * g) / 2;
    const ph = (h - 3 * g) / 2;
    return [
      { x: g, y: g, w: pw, h: ph },
      { x: g * 2 + pw, y: g, w: pw, h: ph },
      { x: g, y: g * 2 + ph, w: pw, h: ph },
      { x: g * 2 + pw, y: g * 2 + ph, w: pw, h: ph },
    ];
  }
  const topH = h * 0.6;
  const bw = (w - 3 * g) / 2;
  return [
    { x: g, y: g, w: w - 2 * g, h: topH - 1.5 * g },
    { x: g, y: topH + 0.5 * g, w: bw, h: h - topH - 1.5 * g },
    { x: g * 2 + bw, y: topH + 0.5 * g, w: bw, h: h - topH - 1.5 * g },
  ];
}

/** A tiny deterministic random generator (mulberry32) so the grain never changes. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainPattern = null;
/** A small tiled noise pattern, built once from a fixed seed. */
function grainCanvas() {
  if (grainPattern) return grainPattern;
  const size = 140;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = seededRandom(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainPattern = c;
  return c;
}

/** A five-pointed star path, centred at (cx, cy) with outer radius r. */
function starPath(ctx, cx, cy, r) {
  const inner = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Draws one photo into a panel rect, honouring zoom, pan and fit. */
function drawPanelPhoto(ctx, rect, panel) {
  const img = panel.image;
  if (!img) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const zoom = panel.zoom || 1;
  const base = panel.fit === 'contain'
    ? Math.min(rect.w / iw, rect.h / ih)
    : Math.max(rect.w / iw, rect.h / ih);
  const sw = iw * base * zoom;
  const sh = ih * base * zoom;
  const ox = (sw - rect.w) / 2;
  const oy = (sh - rect.h) / 2;
  const dx = rect.x + (rect.w - sw) / 2 - (panel.panX || 0) * ox;
  const dy = rect.y + (rect.h - sh) / 2 - (panel.panY || 0) * oy;
  ctx.drawImage(img, dx, dy, sw, sh);
  return true;
}

/** Fills an empty panel with a placeholder gradient and a star. */
function drawEmptyPanel(ctx, rect, label) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  grad.addColorStop(0, '#3a1a55');
  grad.addColorStop(1, '#1c0b33');
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16);
  ctx.restore();
  const s = Math.min(rect.w, rect.h) * 0.12;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  starPath(ctx, rect.x + rect.w / 2, rect.y + rect.h / 2 - s * 0.4, s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `700 ${Math.max(13, Math.round(rect.w * 0.035))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2 + s * 1.1);
  ctx.font = `400 ${Math.max(11, Math.round(rect.w * 0.028))}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(label.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h / 2 + s * 1.1 + Math.max(15, Math.round(rect.w * 0.04)));
}

/** The diagonal ribbon in the top corner, with stars and a short word. */
function drawRibbon(ctx, w, h) {
  const rw = w * 0.34;
  const rh = h * 0.052;
  ctx.save();
  ctx.translate(w * 0.02, h * 0.045);
  ctx.rotate(-0.06);
  const grad = ctx.createLinearGradient(0, 0, rw, 0);
  grad.addColorStop(0, '#ff5e8a');
  grad.addColorStop(1, '#ff9a3d');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = rh * 0.35;
  ctx.shadowOffsetY = rh * 0.12;
  ctx.fillRect(0, 0, rw, rh);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  const fs = rh * 0.52;
  ctx.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VICE COVER', rw / 2, rh / 2 + fs * 0.04);
  ctx.restore();
  const sr = Math.max(8, w * 0.011);
  ctx.fillStyle = '#ffd23d';
  starPath(ctx, w * 0.9, h * 0.05, sr);
  ctx.fill();
  starPath(ctx, w * 0.86, h * 0.1, sr * 0.6);
  ctx.fill();
}

/** The title and tagline, bold capitals with outline, shadow and a scrim. */
function drawLettering(ctx, w, h, title, tagline, grade) {
  const bandH = h * 0.2;
  const scrim = ctx.createLinearGradient(0, h - bandH, 0, h);
  scrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrim.addColorStop(1, grade.scrim);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h - bandH, w, bandH);

  const text = (title || '').trim().toUpperCase();
  if (text) {
    let size = h * 0.115;
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    while (ctx.measureText(text).width > w * 0.94 && size > 14) {
      size -= 2;
      ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeStyle = '#1a0b2e';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.05;
    const ty = h - h * 0.055;
    ctx.strokeText(text, w / 2, ty);
    const fill = ctx.createLinearGradient(0, ty - size, 0, ty);
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(1, '#ffd9ec');
    ctx.fillStyle = fill;
    ctx.fillText(text, w / 2, ty);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const tag = (tagline || '').trim();
  if (tag) {
    const ts = Math.max(13, Math.round(h * 0.026));
    ctx.font = `700 ${ts}px system-ui, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(ts * 0.18)}px`;
    ctx.fillStyle = '#ffe08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(tag.toUpperCase(), w / 2, h - h * 0.018);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
}

/**
 * Draws the whole cover onto `canvas` (its own pixel size).
 * state: { layout, panels, title, tagline, grade, selectedIndex, showSelection }
 * panels: one entry per panel of the layout: { image, zoom, panX, panY, fit }.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grade = GRADES[state.grade] || GRADES.sunset;
  const layout = LAYOUTS[state.layout] ? state.layout : 'hero';
  const rects = panelRects(layout, w, h);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1c0b33';
  ctx.fillRect(0, 0, w, h);

  rects.forEach((rect, i) => {
    const panel = state.panels[i] || { image: null, zoom: 1, panX: 0, panY: 0, fit: 'cover' };
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (!drawPanelPhoto(ctx, rect, panel)) drawEmptyPanel(ctx, rect, LAYOUTS[layout][i]);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(2, w * 0.002);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    if (state.showSelection && state.selectedIndex === i) {
      ctx.strokeStyle = '#ffd23d';
      ctx.lineWidth = Math.max(4, w * 0.005);
      ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
    }
  });

  // Grade: a diagonal colour wash, a vignette and a whisper of grain.
  const wash = ctx.createLinearGradient(0, 0, w, h);
  for (const [stop, colour] of grade.stops) wash.addColorStop(stop, colour);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, `rgba(10, 2, 20, ${grade.vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = ctx.createPattern(grainCanvas(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  drawRibbon(ctx, w, h);
  drawLettering(ctx, w, h, state.title, state.tagline, grade);

  // A thin poster frame.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = Math.max(3, w * 0.003);
  ctx.strokeRect(w * 0.012, h * 0.012, w * 0.976, h * 0.976);
}
