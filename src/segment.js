// Separate jersey from background in a mockup image, and split a side-by-side
// image into its front and back views.
//
// A transparent PNG is taken at its word (alpha). Otherwise the background is
// modelled as smooth (product mockups sit on a plain backdrop with a vignette
// and a glow): the local mean of the background found so far, over a box of
// radius `radius`, recomputed as the flood fill from the border grows. A pixel
// joins the background when every channel is within `tol` of that mean and it
// is connected to the border. A global quadratic could not follow the glow
// between the two jerseys of the Chrono mockup, and mockup cuffs can sit
// within 8 levels of a dark backdrop, so the tolerance is a user setting.
import { components, solidComponent, erode } from './contour.js';

// image: { width, height, data: RGBA bytes }.
export function hasAlpha(img) {
  const { width: W, height: H, data } = img;
  for (let x = 0; x < W; x++) if (data[x * 4 + 3] < 250 || data[((H - 1) * W + x) * 4 + 3] < 250) return true;
  for (let y = 0; y < H; y++) if (data[y * W * 4 + 3] < 250 || data[(y * W + W - 1) * 4 + 3] < 250) return true;
  return false;
}

// Box means of the colours of the pixels in `take`, from integral images:
// returns a function giving [r, g, b] at pixel i, or null with none nearby.
function localMean(img, take, R) {
  const { width: W, height: H, data } = img;
  const S = W + 1, sums = [0, 1, 2, 3].map(() => new Float64Array(S * (H + 1)));
  for (let y = 0; y < H; y++) {
    const row = [0, 0, 0, 0];
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (take[i]) { row[0]++; row[1] += data[i * 4]; row[2] += data[i * 4 + 1]; row[3] += data[i * 4 + 2]; }
      for (let c = 0; c < 4; c++) sums[c][(y + 1) * S + x + 1] = sums[c][y * S + x + 1] + row[c];
    }
  }
  const out = [0, 0, 0];
  return (i) => {
    const x = i % W, y = (i - x) / W;
    const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    const box = (c) => sums[c][y1 * S + x1] - sums[c][y0 * S + x1] - sums[c][y1 * S + x0] + sums[c][y0 * S + x0];
    const n = box(0);
    if (n < 4) return null;
    out[0] = box(1) / n; out[1] = box(2) / n; out[2] = box(3) / n;
    return out;
  };
}

// Foreground mask (255 = jersey) for the whole image.
export function segment(img, { tol = 8, radius = 32, guard = 4 } = {}) {
  const { width: W, height: H, data } = img;
  const N = W * H;
  if (hasAlpha(img)) {
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) m[i] = data[i * 4 + 3] > 128 ? 255 : 0;
    return m;
  }
  // Seed with the border, then grow in passes: each pass can reach about
  // `radius` past the background known at its start, where the mean is defined.
  const bg = new Uint8Array(N);
  let frontier = [];
  for (let x = 0; x < W; x++) frontier.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) frontier.push(y * W, y * W + W - 1);
  for (const i of frontier) bg[i] = 1;
  for (let pass = 0; pass < 400 && frontier.length; pass++) {
    // The mean comes from background at least `guard` pixels clear of the
    // unknown, so a soft fringe accepted at a dark edge cannot drag the
    // model after it and let the next pass creep into the jersey.
    const core = localMean(img, erode(bg, W, H, guard), radius), all = localMean(img, bg, radius);
    const near = (i) => {
      const m = core(i) || all(i);
      return m && Math.abs(data[i * 4] - m[0]) <= tol && Math.abs(data[i * 4 + 1] - m[1]) <= tol &&
        Math.abs(data[i * 4 + 2] - m[2]) <= tol;
    };
    const stack = frontier, next = [];
    const visit = (q) => {
      if (bg[q]) return;
      if (near(q)) { bg[q] = 1; stack.push(q); next.push(q); }
    };
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      if (x > 0) visit(p - 1); if (x < W - 1) visit(p + 1);
      if (y > 0) visit(p - W); if (y < H - 1) visit(p + W);
    }
    // Pixels left at the edge of this pass's reach carry the next one.
    frontier = next.filter((p) => {
      const x = p % W;
      return (x > 0 && !bg[p - 1]) || (x < W - 1 && !bg[p + 1]) || (p >= W && !bg[p - W]) || (p < N - W && !bg[p + W]);
    });
  }
  const fg = new Uint8Array(N);
  for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 255;
  return fg;
}

// The jersey views in a foreground mask: the largest components, left to
// right, as solid masks cropped to their bounding box plus `pad` pixels.
// Pieces under 2% of the largest (labels, shadows, specks) are dropped.
export function findViews(fg, W, H, { max = 2, pad = 8 } = {}) {
  const { labels, sizes, boxes } = components(fg, W, H);
  const biggest = Math.max(0, ...sizes);
  const ids = sizes.map((s, i) => i).filter((i) => sizes[i] >= 0.02 * biggest)
    .sort((a, b) => sizes[b] - sizes[a]).slice(0, max)
    .sort((a, b) => boxes[a].x0 - boxes[b].x0);
  return ids.map((id) => {
    const b = boxes[id];
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
    const x1 = Math.min(W - 1, b.x1 + pad), y1 = Math.min(H - 1, b.y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const full = solidComponent(labels, id, W, H);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) mask.set(full.subarray((y + y0) * W + x0, (y + y0) * W + x0 + w), y * w);
    return { box: { x: x0, y: y0, w, h }, mask };
  });
}
