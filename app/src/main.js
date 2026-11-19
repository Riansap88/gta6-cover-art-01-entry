// Vice Cover Studio wiring: photos, layout, crop, grade, words and export.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, LAYOUTS, panelRects } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const sizeLabel = document.getElementById('sizeLabel');
const selectedPanelEl = document.getElementById('selectedPanel');
const titleInput = document.getElementById('title');
const taglineInput = document.getElementById('tagline');
const zoomInput = document.getElementById('zoom');
const zoomValue = document.getElementById('zoomValue');
const panXInput = document.getElementById('panX');
const panYInput = document.getElementById('panY');

/** One panel's crop state; image is an HTMLImageElement or null. */
function freshPanel(image) {
  return { image: image || null, zoom: 1, panX: 0, panY: 0, fit: 'cover' };
}

const state = {
  layout: 'hero',
  grade: 'sunset',
  title: 'VICE NIGHTS',
  tagline: 'One city. One night. No brakes.',
  selectedIndex: 0,
  panels: [freshPanel(null), freshPanel(null), freshPanel(null), freshPanel(null)],
  exportSize: [1080, 1080],
};

/** The three photo slots, each an image or null. */
const slots = { A: null, B: null, C: null };

function panelCount() {
  return LAYOUTS[state.layout].length;
}

function selectedPanel() {
  return state.panels[state.selectedIndex];
}

function redraw() {
  drawCover(canvas, {
    layout: state.layout,
    panels: state.panels.slice(0, panelCount()),
    title: state.title,
    tagline: state.tagline,
    grade: state.grade,
    selectedIndex: state.selectedIndex,
    showSelection: !document.body.classList.contains('shot-cover'),
  });
}

function setStatus(text) {
  statusEl.textContent = text;
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image'));
    img.src = url;
  });
}

/** Loads a file the user picked, resolving to an image. */
function loadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      loadImage(reader.result).then(resolve, reject);
    };
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

function syncCropControls() {
  const p = selectedPanel();
  zoomInput.value = String(p.zoom);
  zoomValue.textContent = `${p.zoom.toFixed(2)}x`;
  panXInput.value = String(p.panX);
  panYInput.value = String(p.panY);
  document.getElementById('fitCover').classList.toggle('active', p.fit === 'cover');
  document.getElementById('fitContain').classList.toggle('active', p.fit === 'contain');
  selectedPanelEl.textContent = LAYOUTS[state.layout][state.selectedIndex];
}

function selectPanel(index) {
  state.selectedIndex = Math.max(0, Math.min(panelCount() - 1, index));
  syncCropControls();
  redraw();
}

/** Puts an image into a panel, resetting its crop. */
function assignToPanel(index, image) {
  state.panels[index] = freshPanel(image);
}

/**
 * Nudges a panel's crop toward the top of a tall photo in a wide panel,
 * so faces stay in frame instead of being cropped away at the centre.
 */
function smartFrame(index) {
  const p = state.panels[index];
  if (!p.image) return;
  const rect = panelRects(state.layout, canvas.width, canvas.height)[index];
  if (!rect) return;
  if (p.image.naturalHeight / p.image.naturalWidth > rect.h / rect.w) {
    p.panY = -0.55;
  }
}

/** Puts an image into every panel of the current layout. */
function fillAll(image) {
  for (let i = 0; i < panelCount(); i++) assignToPanel(i, image);
}

function setLayout(layout) {
  if (!LAYOUTS[layout]) return;
  state.layout = layout;
  state.selectedIndex = Math.min(state.selectedIndex, panelCount() - 1);
  for (const btn of document.querySelectorAll('#layoutRow button')) {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  }
  syncCropControls();
  redraw();
}

function setGrade(grade) {
  state.grade = grade;
  for (const btn of document.querySelectorAll('#gradeRow button')) {
    btn.classList.toggle('active', btn.dataset.grade === grade);
  }
  redraw();
}

function setExportSize(w, h) {
  state.exportSize = [w, h];
  canvas.width = w;
  canvas.height = h;
  sizeLabel.textContent = `${w} x ${h}`;
  redraw();
}

/**
 * Renders the cover at w by h and downloads it as a PNG.
 * Resolves to { width, height, bytes } once the file is written.
 */
export function exportPng(w, h) {
  return new Promise((resolve) => {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    drawCover(off, {
      layout: state.layout,
      panels: state.panels.slice(0, panelCount()),
      title: state.title,
      tagline: state.tagline,
      grade: state.grade,
      selectedIndex: state.selectedIndex,
      showSelection: false,
    });
    off.toBlob((blob) => {
      const name = `vice-cover-${w}x${h}.png`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus(`Saved ${name} (${Math.round(blob.size / 1024)} KB).`);
      resolve({ width: w, height: h, bytes: blob.size });
    }, 'image/png');
  });
}

// Exposed for automated checks: render any export size and report its real size.
window.__vice = { exportPng, state };

// --- layout and grade buttons ------------------------------------------------
for (const btn of document.querySelectorAll('#layoutRow button')) {
  btn.addEventListener('click', () => setLayout(btn.dataset.layout));
}
for (const btn of document.querySelectorAll('#gradeRow button')) {
  btn.addEventListener('click', () => setGrade(btn.dataset.grade));
}

// --- photo slots -------------------------------------------------------------
const slotInputs = { A: 'photoA', B: 'photoB', C: 'photoC' };
for (const [slot, id] of Object.entries(slotInputs)) {
  document.getElementById(id).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const img = await loadFile(file);
      slots[slot] = img;
      assignToPanel(state.selectedIndex, img);
      smartFrame(state.selectedIndex);
      syncCropControls();
      redraw();
      setStatus(`Photo ${slot} loaded into the ${LAYOUTS[state.layout][state.selectedIndex]} panel.`);
    } catch {
      setStatus('That file could not be read as a photo. Try another one.');
    }
  });
}
document.getElementById('fillA').addEventListener('click', () => {
  if (!slots.A) return setStatus('Load Photo A first.');
  fillAll(slots.A);
  redraw();
  setStatus('Every panel now shows Photo A.');
});
document.getElementById('fillB').addEventListener('click', () => {
  if (!slots.B) return setStatus('Load Photo B first.');
  fillAll(slots.B);
  redraw();
  setStatus('Every panel now shows Photo B.');
});
document.getElementById('fillC').addEventListener('click', () => {
  if (!slots.C) return setStatus('Load Photo C first.');
  fillAll(slots.C);
  redraw();
  setStatus('Every panel now shows Photo C.');
});

// --- crop controls -----------------------------------------------------------
zoomInput.addEventListener('input', () => {
  selectedPanel().zoom = Number(zoomInput.value);
  zoomValue.textContent = `${selectedPanel().zoom.toFixed(2)}x`;
  redraw();
});
panXInput.addEventListener('input', () => {
  selectedPanel().panX = Number(panXInput.value);
  redraw();
});
panYInput.addEventListener('input', () => {
  selectedPanel().panY = Number(panYInput.value);
  redraw();
});
document.getElementById('fitCover').addEventListener('click', () => {
  selectedPanel().fit = 'cover';
  syncCropControls();
  redraw();
});
document.getElementById('fitContain').addEventListener('click', () => {
  selectedPanel().fit = 'contain';
  syncCropControls();
  redraw();
});
document.getElementById('resetCrop').addEventListener('click', () => {
  const p = selectedPanel();
  p.zoom = 1;
  p.panX = 0;
  p.panY = 0;
  syncCropControls();
  redraw();
});

// --- words -------------------------------------------------------------------
titleInput.addEventListener('input', () => {
  state.title = titleInput.value;
  redraw();
});
taglineInput.addEventListener('input', () => {
  state.tagline = taglineInput.value;
  redraw();
});

// --- export ------------------------------------------------------------------
for (const btn of document.querySelectorAll('[data-export]')) {
  btn.addEventListener('click', () => {
    const [w, h] = btn.dataset.export.split('x').map(Number);
    setExportSize(w, h);
    exportPng(w, h);
  });
}

// --- click a panel on the canvas to select it --------------------------------
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  const hit = rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (hit >= 0) selectPanel(hit);
});

// --- screenshot scenes -------------------------------------------------------
const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, async (scene) => {
    document.body.classList.toggle('shot-cover', scene.coverOnly);
    state.layout = scene.layout;
    state.grade = scene.grade;
    state.title = scene.title;
    state.tagline = scene.tagline;
    titleInput.value = scene.title;
    taglineInput.value = scene.tagline;
    const loaded = {};
    for (const name of new Set(scene.photos)) {
      loaded[name] = await loadImage(`samples/${name}.jpg`);
    }
    scene.photos.forEach((name, i) => {
      state.panels[i] = freshPanel(loaded[name]);
    });
    if (scene.size) {
      canvas.width = scene.size[0];
      canvas.height = scene.size[1];
    } else if (scene.coverOnly) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    sizeLabel.textContent = `${canvas.width} x ${canvas.height}`;
    setLayout(scene.layout);
    setGrade(scene.grade);
    for (let i = 0; i < panelCount(); i++) smartFrame(i);
    redraw();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__shotReady = true;
    }));
  });
} else {
  // The editor opens with the two sample photos already in place.
  loadImage('samples/boulevard.jpg').then((img) => {
    slots.A = img;
    assignToPanel(0, img);
    assignToPanel(2, img);
    smartFrame(0);
    smartFrame(2);
    redraw();
  });
  loadImage('samples/pier.jpg').then((img) => {
    slots.B = img;
    assignToPanel(1, img);
    smartFrame(1);
    redraw();
  });
  syncCropControls();
  redraw();
}
