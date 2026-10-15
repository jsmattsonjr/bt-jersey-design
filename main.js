// Page wiring: load a mockup, segment and split it, let the user fix the
// mask and landmarks, then pose, align, bake and preview.
import { parseGLB } from './src/glb.js';
import { segment, findViews } from './src/segment.js';
import { LANDMARKS } from './src/contour.js';
import { toBytes } from './src/image.js';
import {
  VIEW_NAMES, loadRig, modelViews, mockupView, align, bake, finish, templateMask, exportAtlas, fitArmAngle,
} from './src/pipeline.js';
import { createPreview } from './src/preview.js';

const $ = (id) => document.getElementById(id);
const SIZE = 1024;
const LM_COLORS = ['#f43f5e', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#d946ef'];

const S = {
  rig: null, glb: null, tpl: null, tplMask: null, preview: null,
  sources: [], name: 'jersey',
  views: [],     // [{ src, box, mask, lm: {name: [x, y]} }], in front, back order
  mocks: [], maps: [], model: null, baked: null, rgb: null, atlas: null,
  mode: 'landmarks',
};

function status(msg, warn = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('warn', warn);
}

const params = () => ({
  tol: +$('tol').value, arm: +$('arm').value, twist: +$('twist').value,
  flat: +$('flat').value, facing: +$('facing').value, brush: +$('brush').value,
});

function bindOutputs() {
  const fmt = { tol: (v) => v, brush: (v) => `${v}px`, arm: (v) => `${v}°`, twist: (v) => `${v}°`, flat: (v) => v, facing: (v) => v };
  for (const k of Object.keys(fmt)) {
    const show = () => ($(`${k}-out`).textContent = fmt[k]($(k).value));
    $(k).addEventListener('input', show);
    show();
  }
}

// ---- work queue: each stage invalidates the ones after it -------------------
const STAGES = ['segment', 'mocks', 'model', 'align', 'bake'];
let dirty = new Set(), timer = 0;
function invalidate(stage) {
  for (const s of STAGES.slice(STAGES.indexOf(stage))) dirty.add(s);
  clearTimeout(timer);
  timer = setTimeout(run, 30);
}

async function run() {
  if (!S.sources.length || !S.rig) return;
  const p = params();
  const step = async (name, msg, fn) => {
    if (!dirty.has(name)) return true;
    status(msg);
    await new Promise((r) => setTimeout(r, 0)); // let the status paint
    const t = performance.now();
    try { fn(); dirty.delete(name); } catch (e) { console.error(e); status(e.message, true); return false; }
    console.debug(`${name}: ${Math.round(performance.now() - t)} ms`);
    return true;
  };
  const t0 = performance.now();
  if (!(await step('segment', 'Finding the jersey…', segmentAll))) return;
  if (!(await step('mocks', 'Tracing outlines…', () => { S.mocks = S.views.map((v) => buildMock(v, p)); }))) return drawMockups();
  if (S.autoArm && S.mocks.length === 2) {
    // A new mockup: start from the arm angle that matches its outline.
    S.autoArm = false;
    status('Fitting the arm angle…');
    await new Promise((r) => setTimeout(r, 0));
    try { fitArm(); } catch (e) { console.warn(e); } // keep the slider's angle
  }
  if (!(await step('model', 'Posing the rider…', () => {
    S.model = modelViews(S.rig, { armDeg: p.arm, twistDeg: p.twist, width: SIZE });
    S.preview.setAPose(S.model.posed, S.glb);
  }))) return;
  if (!(await step('align', 'Aligning…', () => {
    S.maps = S.views.map((_, i) => align(S.model.views[VIEW_NAMES[i]], S.mocks[i]));
  }))) return drawMockups();
  drawMockups();
  if (!(await step('bake', 'Baking…', () => bakeAll(p)))) return;
  status(`Baked in ${Math.round(performance.now() - t0)} ms. ${seenSummary()}`);
}

// ---- segmentation ------------------------------------------------------------
function segmentAll() {
  const { tol } = params();
  const views = [];
  if (S.sources.length === 1) {
    const img = S.sources[0];
    const found = findViews(segment(img, { tol }), img.width, img.height, { max: 2 });
    if (found.length < 2) throw new Error('Found only one jersey in the image. Open the back as a second file, or raise the tolerance.');
    for (const f of found) views.push({ src: img, box: f.box, mask: f.mask, lm: {} });
  } else {
    for (const img of S.sources.slice(0, 2)) {
      const [f] = findViews(segment(img, { tol }), img.width, img.height, { max: 1 });
      if (!f) throw new Error('No jersey found in one of the images.');
      views.push({ src: img, box: f.box, mask: f.mask, lm: {} });
    }
  }
  S.views = views;
  layoutMockups();
}

function fitArm() {
  const best = fitArmAngle(S.rig, { front: S.mocks[0], back: S.mocks[1] });
  if (!best) throw new Error('Could not fit the arm angle; set it by hand.');
  $('arm').value = best.armDeg;
  $('arm').dispatchEvent(new Event('input'));
}

function buildMock(view, p) {
  const mock = mockupView(view.src, view.box, view.mask, { flatten: p.flat });
  // Re-apply hand-placed landmarks: snap each to the nearest outline point.
  for (const [name, [x, y]] of Object.entries(view.lm)) {
    let best = 0, bd = Infinity;
    mock.sil.contour.forEach(([cx, cy], i) => { const d = (cx - x) ** 2 + (cy - y) ** 2; if (d < bd) { bd = d; best = i; } });
    mock.sil.landmarks[name] = best;
  }
  return mock;
}

// ---- bake ----------------------------------------------------------------------
function bakeAll(p) {
  const layers = S.views.map((_, i) => ({ view: S.model.views[VIEW_NAMES[i]], map: S.maps[i], mock: S.mocks[i] }));
  S.baked = bake(S.rig, S.model.posed, layers, { size: SIZE, facingMin: p.facing });
  const seen = Uint8Array.from(S.baked.known);
  S.rgb = finish(S.baked, S.tplMask);
  S.baked.seen = seen;
  const a = exportAtlas(S.rgb, SIZE, S.tpl);
  S.atlas = new ImageData(a.data, a.width, a.height);
  $('atlas').getContext('2d').putImageData(S.atlas, 0, 0);
  drawSeen();
  S.preview.setJersey(S.atlas);
  $('dl512').disabled = $('dl1024').disabled = false;
}

function seenSummary() {
  const { seen, covered } = S.baked;
  let c = 0, s = 0;
  for (let i = 0; i < covered.length; i++) if (covered[i]) { c++; if (seen[i]) s++; }
  return `${Math.round((100 * s) / c)}% of the jersey seen in the mockup; the rest is filled from its neighbours.`;
}

function drawSeen() {
  const ctx = $('atlas-overlay').getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  if (!$('show-seen').checked || !S.baked) return;
  const img = ctx.createImageData(512, 512), { seen, covered } = S.baked;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const k = 2 * y * SIZE + 2 * x;
    if (covered[k] && !seen[k]) img.data.set([255, 0, 200, 150], (y * 512 + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
}

// ---- mockup canvases ---------------------------------------------------------------
const mview = []; // per view: { canvas, base: ImageData, tint: ImageData }

function layoutMockups() {
  const host = $('mockup-views');
  host.innerHTML = '';
  mview.length = 0;
  S.views.forEach((v, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'mview';
    wrap.innerHTML = `<div class="tag"><span>${VIEW_NAMES[i] === 'front' ? 'Front' : 'Back'}</span><span>${v.box.w}×${v.box.h}</span></div>`;
    const canvas = document.createElement('canvas');
    canvas.width = v.box.w; canvas.height = v.box.h;
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    const base = new ImageData(v.box.w, v.box.h);
    for (let r = 0; r < v.box.h; r++)
      base.data.set(v.src.data.subarray(((v.box.y + r) * v.src.width + v.box.x) * 4, ((v.box.y + r) * v.src.width + v.box.x + v.box.w) * 4), r * v.box.w * 4);
    mview.push({ canvas, base, tintCanvas: document.createElement('canvas') });
    refreshTint(i);
    attachPointer(canvas, i);
  });
  $('drop').hidden = true;
  host.hidden = $('mlegend').hidden = false;
}

// Darken what the mask calls backdrop. Rebuilt after every brush stroke.
function refreshTint(i) {
  const v = S.views[i], m = mview[i];
  const img = new ImageData(v.box.w, v.box.h);
  for (let k = 0; k < v.mask.length; k++) if (!v.mask[k]) img.data.set([0, 0, 0, 140], k * 4);
  m.tintCanvas.width = v.box.w; m.tintCanvas.height = v.box.h;
  m.tintCanvas.getContext('2d').putImageData(img, 0, 0);
}

function drawMockups() {
  S.views.forEach((v, i) => {
    const { canvas, base, tintCanvas } = mview[i];
    const ctx = canvas.getContext('2d');
    ctx.putImageData(base, 0, 0);
    ctx.drawImage(tintCanvas, 0, 0);
    const scale = canvas.width / Math.max(1, canvas.clientWidth);
    const mock = S.mocks[i];
    if (S.model && S.maps[i] && mock) {
      const sil = S.model.views[VIEW_NAMES[i]].sil;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      sil.contour.forEach(([x, y], k) => { const [mx, my] = S.maps[i](x, y); k ? ctx.lineTo(mx, my) : ctx.moveTo(mx, my); });
      ctx.closePath();
      ctx.stroke();
    }
    if (mock) LANDMARKS.forEach((name, k) => {
      const [x, y] = drag && drag.view === i && drag.name === name ? drag.at : mock.sil.contour[mock.sil.landmarks[name]];
      const r = 7 * scale;
      ctx.fillStyle = LM_COLORS[k];
      ctx.strokeStyle = v.lm[name] ? '#fff' : '#000';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = `bold ${10 * scale}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(k + 1), x, y + 0.5 * scale);
    });
  });
}

let drag = null;
function attachPointer(canvas, i) {
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
  };
  const paint = ([x, y]) => {
    const v = S.views[i], R = +$('brush').value, val = S.mode === 'add' ? 255 : 0;
    for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(v.box.h - 1, Math.ceil(y + R)); yy++)
      for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(v.box.w - 1, Math.ceil(x + R)); xx++)
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= R * R) v.mask[yy * v.box.w + xx] = val;
    refreshTint(i);
    drawMockups();
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = at(e);
    canvas.setPointerCapture(e.pointerId);
    if (S.mode === 'landmarks') {
      const mock = S.mocks[i];
      if (!mock) return;
      const scale = canvas.width / canvas.clientWidth;
      let best = null, bd = (14 * scale) ** 2;
      for (const name of LANDMARKS) {
        const [x, y] = mock.sil.contour[mock.sil.landmarks[name]];
        const d = (x - p[0]) ** 2 + (y - p[1]) ** 2;
        if (d < bd) { bd = d; best = name; }
      }
      if (best) drag = { view: i, name: best, at: p };
    } else {
      drag = { view: i, paint: true };
      paint(p);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.view !== i) return;
    if (drag.paint) return paint(at(e));
    drag.at = at(e);
    drawMockups();
  });
  const up = () => {
    if (!drag || drag.view !== i) return;
    if (drag.paint) invalidate('mocks');
    else { S.views[i].lm[drag.name] = drag.at; invalidate('mocks'); }
    drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

// ---- files ---------------------------------------------------------------------------
async function imageData(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

async function openFiles(files) {
  files = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 2);
  if (!files.length) return;
  status('Reading…');
  S.sources = await Promise.all(files.map(imageData));
  S.name = files[0].name.replace(/\.[^.]+$/, '');
  S.autoArm = !new URLSearchParams(location.search).get('arm');
  invalidate('segment');
}

function download(imageData, suffix) {
  const c = document.createElement('canvas');
  c.width = imageData.width; c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.name}-${suffix}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

// ---- boot -----------------------------------------------------------------------------
async function boot() {
  bindOutputs();
  const [glbBuf, tplImg] = await Promise.all([
    fetch('assets/rider_m.glb').then((r) => r.arrayBuffer()),
    fetch('assets/jersey-mask.png').then((r) => r.blob()).then(imageData),
  ]);
  S.glb = parseGLB(glbBuf);
  S.rig = loadRig(S.glb);
  S.tpl = tplImg;
  S.tplMask = templateMask(tplImg, SIZE);
  S.preview = await createPreview($('preview'), 'assets/rider_m.glb');

  $('file').addEventListener('change', (e) => openFiles(e.target.files));
  const drop = $('mockups');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
  drop.addEventListener('dragleave', () => $('drop').classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); $('drop').classList.remove('over'); openFiles(e.dataTransfer.files); });

  $('tol').addEventListener('change', () => invalidate('segment'));
  for (const id of ['arm', 'twist']) $(id).addEventListener('change', () => invalidate('model'));
  $('flat').addEventListener('change', () => invalidate('mocks'));
  $('facing').addEventListener('change', () => invalidate('bake'));
  $('swap').addEventListener('click', () => {
    if (S.views.length < 2) return;
    S.views.reverse();
    layoutMockups();
    invalidate('mocks');
  });
  $('reset-lm').addEventListener('click', () => { S.views.forEach((v) => (v.lm = {})); invalidate('mocks'); });
  $('fit-arm').addEventListener('click', async () => {
    if (!S.mocks.length) return;
    status('Fitting the arm angle…');
    await new Promise((r) => setTimeout(r, 0));
    try { fitArm(); } catch (e) { return status(e.message, true); }
    invalidate('model');
  });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    document.querySelectorAll('.seg button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));
  document.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => S.preview.look(b.dataset.look)));
  $('apose').addEventListener('click', () => {
    const on = $('apose').getAttribute('aria-pressed') !== 'true';
    $('apose').setAttribute('aria-pressed', String(on));
    S.preview.showAPose(on);
  });
  $('show-seen').addEventListener('change', drawSeen);
  $('dl512').addEventListener('click', () => S.atlas && download(S.atlas, 'jersey'));
  $('dl1024').addEventListener('click', () => {
    if (!S.rgb) return;
    download(new ImageData(toBytes(S.rgb, SIZE, SIZE, S.tplMask), SIZE, SIZE), 'jersey-1024');
  });
  window.addEventListener('resize', () => S.views.length && drawMockups());

  // ?mockup=URL loads an image at start (used by the tests).
  const q = new URLSearchParams(location.search);
  if (q.get('mockup')) {
    const urls = q.getAll('mockup');
    const files = await Promise.all(urls.map(async (u) => new File([await (await fetch(u)).blob()], u.split('/').pop(), { type: 'image/png' })));
    if (q.get('arm')) { $('arm').value = q.get('arm'); $('arm').dispatchEvent(new Event('input')); }
    await openFiles(files);
  }
  window.__jp = S; // for console poking
}

boot().catch((e) => { console.error(e); status(`Failed to start: ${e.message}`, true); });
