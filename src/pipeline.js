// The projection pipeline, shared by the page and the tests:
//
//   model views  -> posed rider, front/back ortho frames, silhouettes, landmarks
//   mockup views -> cropped image, jersey mask, silhouette, landmarks
//   align        -> thin-plate spline from model-view pixels to mockup pixels
//   bake         -> every jersey texel samples the view that faces it
//   finish       -> fill what no view saw, island by island; mask to the template
import { createRig } from './rig.js';
import { makeView, rasterTriangle } from './view.js';
import { silhouette, correspondences, components, LANDMARKS } from './contour.js';
import { fitTPS, gridMap } from './tps.js';
import { toFloat, fillRegion, flattenShading, sample, downsample2, toBytes } from './image.js';

export const VIEW_NAMES = ['front', 'back'];

export function loadRig(glb) {
  return createRig(glb);
}

// Pose the rider and frame both views. Returns { posed, views: {front, back} },
// each view carrying its silhouette (contour + landmarks) as well.
export function modelViews(rig, { armDeg = 30, twistDeg = 0, width = 1024 } = {}) {
  rig.pose({ armDeg, twistDeg });
  const posed = rig.skin();
  const views = {};
  for (const name of VIEW_NAMES) {
    const v = makeView(name, posed, rig.jerseyTris, { width });
    v.sil = silhouette(v.mask, v.W, v.H);
    views[name] = v;
  }
  return { posed, views };
}

// One mockup view: crop `box` out of `image` (RGBA bytes), with the jersey
// mask for that crop. The backdrop is replaced by the jersey's own edge
// colours, so a sample that lands a pixel outside still reads as jersey.
export function mockupView(image, box, mask, { flatten = 0 } = {}) {
  const { x, y, w, h } = box;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++)
    data.set(image.data.subarray(((y + r) * image.width + x) * 4, ((y + r) * image.width + x + w) * 4), r * w * 4);
  const sil = silhouette(mask, w, h);
  let rgb = toFloat(data, w, h);
  rgb = flattenShading(rgb, sil.mask, w, h, { strength: flatten });
  fillRegion(rgb, sil.mask, new Uint8Array(w * h).fill(1), w, h);
  return { W: w, H: h, box, rgb, sil };
}

// RMS distance between two point sets after the best similarity transform
// (shift, scale, rotation) of one onto the other, relative to the set's size.
export function procrustes(a, b) {
  const n = a.length, mean = (p) => p.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n], [0, 0]);
  const ma = mean(a), mb = mean(b);
  const A = a.map((p) => [p[0] - ma[0], p[1] - ma[1]]), B = b.map((p) => [p[0] - mb[0], p[1] - mb[1]]);
  const norm = (P) => Math.sqrt(P.reduce((s, p) => s + p[0] * p[0] + p[1] * p[1], 0) / n);
  const na = norm(A), nb = norm(B);
  A.forEach((p) => { p[0] /= na; p[1] /= na; });
  B.forEach((p) => { p[0] /= nb; p[1] /= nb; });
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += A[i][0] * B[i][0] + A[i][1] * B[i][1]; sxy += A[i][0] * B[i][1] - A[i][1] * B[i][0]; }
  const th = Math.atan2(sxy, sxx), c = Math.cos(th), s = Math.sin(th);
  let e = 0;
  for (let i = 0; i < n; i++) {
    const x = c * A[i][0] - s * A[i][1], y = s * A[i][0] + c * A[i][1];
    e += (x - B[i][0]) ** 2 + (y - B[i][1]) ** 2;
  }
  return Math.sqrt(e / n);
}

// The arm angle whose model landmarks best match the mockup's, front and
// back together. mocks: { front, back } from mockupView().
export function fitArmAngle(rig, mocks, { from = 10, to = 55, step = 2.5 } = {}) {
  const pts = (sil) => LANDMARKS.map((k) => sil.contour[sil.landmarks[k]]);
  let best = null;
  for (let a = from; a <= to + 1e-9; a += step) {
    let e = 0;
    try {
      const { views } = modelViews(rig, { armDeg: a, width: 400 });
      for (const n of VIEW_NAMES) if (mocks[n]) e += procrustes(pts(views[n].sil), pts(mocks[n].sil));
    } catch { continue; }
    if (!best || e < best.e) best = { armDeg: a, e };
  }
  return best;
}

// Mapping from model-view pixels to mockup-crop pixels. Adjusted landmarks
// go in mock.sil.landmarks before calling.
export function align(modelView, mock, { perSeg = 12, lambda = 1e-3 } = {}) {
  const { src, dst } = correspondences(modelView.sil, mock.sil, perSeg);
  return gridMap(fitTPS(src, dst, lambda), modelView.W, modelView.H, 4);
}

// Template mask (RGBA bytes, any square size) resampled to size x size.
// design/templates/jersey.png cuts its islands out: white at alpha 0 over an
// opaque black backdrop. A browser canvas premultiplies that to (0,0,0,0),
// so a pixel is island if it is transparent or bright.
export function templateMask(tpl, size) {
  const m = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor(((x + 0.5) * tpl.width) / size), sy = Math.floor(((y + 0.5) * tpl.height) / size);
    const k = (sy * tpl.width + sx) * 4;
    m[y * size + x] = tpl.data[k + 3] < 128 || tpl.data[k] > 128 ? 1 : 0;
  }
  return m;
}

// Bake: every jersey texel takes the colour its front- or back-facing view
// sees there, if that view sees it unoccluded and the surface faces it by
// more than `facingMin` (the cosine). `layers` is [{ view, map, mock }].
export function bake(rig, posed, layers, { size = 1024, facingMin = 0.15, bias = 0.01 } = {}) {
  const { position: P, normal: N } = posed, UV = rig.glb.uv;
  const rgb = new Float32Array(size * size * 3), known = new Uint8Array(size * size);
  const covered = new Uint8Array(size * size);
  const T = rig.jerseyTris, col = [0, 0, 0];
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    rasterTriangle(
      UV[a * 2] * size, UV[a * 2 + 1] * size, UV[b * 2] * size, UV[b * 2 + 1] * size,
      UV[c * 2] * size, UV[c * 2 + 1] * size, size, size,
      (x, y, b0, b1, b2) => {
        const k = y * size + x;
        covered[k] = 1;
        const px = b0 * P[a * 3] + b1 * P[b * 3] + b2 * P[c * 3];
        const py = b0 * P[a * 3 + 1] + b1 * P[b * 3 + 1] + b2 * P[c * 3 + 1];
        const pz = b0 * P[a * 3 + 2] + b1 * P[b * 3 + 2] + b2 * P[c * 3 + 2];
        let nx = b0 * N[a * 3] + b1 * N[b * 3] + b2 * N[c * 3];
        let nz = b0 * N[a * 3 + 2] + b1 * N[b * 3 + 2] + b2 * N[c * 3 + 2];
        const ny = b0 * N[a * 3 + 1] + b1 * N[b * 3 + 1] + b2 * N[c * 3 + 1];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; nz /= nl;
        for (const { view, map, mock } of layers) {
          const facing = nx * view.toward[0] + nz * view.toward[2];
          if (facing <= facingMin) continue;
          const [vx, vy, d] = view.project(px, py, pz);
          const ix = Math.floor(vx), iy = Math.floor(vy);
          if (ix < 0 || iy < 0 || ix >= view.W || iy >= view.H) continue;
          if (d < view.depth[iy * view.W + ix] - bias) continue;
          const [mx, my] = map(vx, vy);
          sample(mock.rgb, mock.W, mock.H, mx, my, col);
          rgb[k * 3] = col[0]; rgb[k * 3 + 1] = col[1]; rgb[k * 3 + 2] = col[2];
          known[k] = 1;
          break; // front and back never both face a texel when facingMin >= 0
        }
      },
    );
  }
  return { size, rgb, known, covered };
}

// Fill each template island's unseen texels from what was seen on that island,
// then black out everything outside the template. Returns float rgb.
export function finish(baked, tplMask) {
  const { size, rgb, known } = baked;
  const { labels, sizes } = components(tplMask.map((v) => (v ? 255 : 0)), size, size);
  for (let id = 0; id < sizes.length; id++) {
    const region = Uint8Array.from(labels, (l) => (l === id ? 1 : 0));
    fillRegion(rgb, known, region, size, size);
  }
  for (let i = 0; i < size * size; i++) if (!tplMask[i]) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = 0;
  return rgb;
}

// The upload: halve to 512 (area average) and re-apply the 512 template.
export function exportAtlas(rgb, size, tpl512) {
  let out = rgb, s = size;
  while (s > 512) { out = downsample2(out, s, s); s >>= 1; }
  return { width: s, height: s, data: toBytes(out, s, s, templateMask(tpl512, s)) };
}
