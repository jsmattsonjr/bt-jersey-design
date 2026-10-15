// Binary-mask geometry: components, hole filling, the outer contour, and the
// landmarks a jersey silhouette is aligned by. Masks are Uint8Array, 0 or 255.

// Erode a 0/1 mask by r pixels (square), via two separable passes of
// running counts.
export function erode(m, W, H, r) {
  if (r <= 0) return m;
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      run = m[y * W + x] ? run + 1 : 0;
      // tmp marks pixels whose horizontal run of 2r+1 ending r ahead is full
      if (run >= 2 * r + 1) tmp[y * W + x - r] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      run = tmp[y * W + x] ? run + 1 : 0;
      if (run >= 2 * r + 1) out[(y - r) * W + x] = 1;
    }
  }
  return out;
}

// Morphological closing of a 0/1 mask: heals notches narrower than 2r where
// a cuff or hem matched the backdrop. silhouette() applies it to the model
// and the mockup alike, since closing only one of them rounds its armpits and
// slides every contour correspondence (5.3 vs 0.67 levels in the round trip).
export function close(m, W, H, r) {
  if (r <= 0) return m;
  const inv = (a) => a.map((v) => (v ? 0 : 1));
  // erode() counts off-image as empty, so this dilation also grows a band
  // r wide along the image edge; the erosion that follows takes it away again.
  const dil = inv(erode(inv(m), W, H, r));
  return erode(dil, W, H, r).map((v, i) => v | m[i]);
}

// Label 8-connected foreground components; returns { labels, sizes, boxes }.
export function components(mask, W, H) {
  const labels = new Int32Array(W * H).fill(-1);
  const sizes = [], boxes = [];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || labels[s] >= 0) continue;
    const id = sizes.length;
    let n = 0, top = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    stack[top++] = s; labels[s] = id;
    while (top) {
      const p = stack[--top], x = p % W, y = (p - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && labels[q] < 0) { labels[q] = id; stack[top++] = q; }
      }
    }
    sizes.push(n); boxes.push({ x0, y0, x1, y1 });
  }
  return { labels, sizes, boxes };
}

// Keep one component (by label) and fill every hole in it.
export function solidComponent(labels, id, W, H) {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (labels[i] === id) out[i] = 255;
  return fillHoles(out, W, H);
}

export function fillHoles(mask, W, H) {
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (q) => { if (!mask[q] && !outside[q]) { outside[q] = 1; stack.push(q); } };
  for (let x = 0; x < W; x++) push(x), push((H - 1) * W + x);
  for (let y = 0; y < H; y++) push(y * W), push(y * W + W - 1);
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p - x) / W;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W); if (y < H - 1) push(p + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = outside[i] ? 0 : 255;
  return out;
}

// Outer boundary of the (single, solid) foreground, as pixel-centre points in
// clockwise order on screen (y down), via Moore-neighbour tracing.
export function traceContour(mask, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  let start = -1;
  for (let i = 0; i < W * H && start < 0; i++) if (mask[i]) start = i;
  if (start < 0) return [];
  // Neighbours clockwise from west.
  const DX = [-1, -1, 0, 1, 1, 1, 0, -1], DY = [0, -1, -1, -1, 0, 1, 1, 1];
  const sx = start % W, sy = (start - sx) / W;
  const pts = [[sx, sy]];
  let x = sx, y = sy, dir = 0; // came from the west (the scan found nothing there)
  for (let guard = 0; guard < 4 * W * H; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8;
      if (at(x + DX[d], y + DY[d])) {
        x += DX[d]; y += DY[d];
        dir = (d + 6) % 8; // backtrack: start the next search just past where we came from
        found = true;
        break;
      }
    }
    if (!found || (x === sx && y === sy)) break;
    pts.push([x, y]);
  }
  return pts;
}

// Resample a closed polyline to n points evenly spaced by arc length.
export function resampleClosed(pts, n) {
  const m = pts.length, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = cum[m], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k * L) / n;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % m], t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return out;
}

// Points along the open stretch of a closed polyline from index i to j
// (forward, wrapping), resampled to n points including both ends.
export function arcPoints(pts, i, j, n) {
  const m = pts.length, seg = [];
  for (let k = i; ; k = (k + 1) % m) { seg.push(pts[k]); if (k === j) break; }
  if (seg.length < 2) return Array.from({ length: n }, () => seg[0].slice());
  const cum = [0];
  for (let k = 1; k < seg.length; k++) cum.push(cum[k - 1] + Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]));
  const L = cum[cum.length - 1], out = [];
  let q = 0;
  for (let k = 0; k < n; k++) {
    const s = (k * L) / (n - 1);
    while (q < seg.length - 2 && cum[q + 1] < s) q++;
    const t = (s - cum[q]) / (cum[q + 1] - cum[q] || 1);
    out.push([seg[q][0] + t * (seg[q + 1][0] - seg[q][0]), seg[q][1] + t * (seg[q + 1][1] - seg[q][1])]);
  }
  return out;
}

function convexHullIdx(pts) {
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[a][1] - pts[b][1]);
  const cross = (o, a, b) => (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const lo = [], hi = [];
  for (const i of idx) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
  for (const i of idx.reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], i) <= 0) hi.pop(); hi.push(i); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// Landmark names in contour order (clockwise on screen, from the neck going
// to the viewer's right). L and R are as seen, not the rider's sides.
export const LANDMARKS = ['neck', 'sleeveR1', 'sleeveR2', 'armpitR', 'hemR', 'hemL', 'armpitL', 'sleeveL2', 'sleeveL1'];

// Find the landmarks on a jersey contour (uniformly resampled, clockwise).
// Returns indices into `c`, keyed by name.
export function findLandmarks(c) {
  const n = c.length;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0;

  // Hem corners: the outermost points of the bottom band.
  let hemL = -1, hemR = -1;
  for (let i = 0; i < n; i++) {
    if (c[i][1] < y1 - 0.03 * h) continue;
    if (hemL < 0 || c[i][0] < c[hemL][0]) hemL = i;
    if (hemR < 0 || c[i][0] > c[hemR][0]) hemR = i;
  }

  // Armpits: the deepest convexity defect on each side, in the middle band.
  const hull = convexHullIdx(c).sort((a, b) => a - b);
  let armL = -1, armR = -1, dL = 0, dR = 0;
  const cxHem = (c[hemL][0] + c[hemR][0]) / 2;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k], b = hull[(k + 1) % hull.length];
    const ax = c[a][0], ay = c[a][1], bx = c[b][0], by = c[b][1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const [px, py] = c[i];
      if (py < y0 + 0.2 * h || py > y0 + 0.85 * h) continue;
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (px < cxHem && d > dL) { dL = d; armL = i; }
      if (px > cxHem && d > dR) { dR = d; armR = i; }
    }
  }
  const cx = (c[armL][0] + c[armR][0] + 2 * cxHem) / 4;

  // Neck: the uppermost contour point on the centre line.
  let neck = -1;
  for (let i = 0; i < n; i++) {
    if (c[i][1] > y0 + 0.5 * h) continue;
    if (neck < 0 || Math.abs(c[i][0] - cx) < Math.abs(c[neck][0] - cx) - 0.5 ||
        (Math.abs(Math.abs(c[i][0] - cx) - Math.abs(c[neck][0] - cx)) <= 0.5 && c[i][1] < c[neck][1])) neck = i;
  }

  // Sleeve hem corners: the two sharpest convex turns between the neck and
  // each armpit. Clockwise on screen, a convex corner turns right (cross > 0).
  const win = Math.max(3, Math.round(n * 0.012));
  const turn = (i) => {
    const p = c[(i - win + n) % n], q = c[i], r = c[(i + win) % n];
    const ux = q[0] - p[0], uy = q[1] - p[1], vx = r[0] - q[0], vy = r[1] - q[1];
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  };
  // A hem corner lies outboard of its armpit (side -1 left, +1 right), which
  // keeps a collar corner out of it (the Chrono back).
  const corners = (from, to, side, pit) => {
    const span = (to - from + n) % n, cand = [];
    for (let s = win; s <= span - win; s++) {
      const i = (from + s) % n, t = turn(i);
      if (side * (c[i][0] - c[pit][0]) < 0.02 * w) continue;
      if (t > turn((i - 1 + n) % n) && t >= turn((i + 1) % n) && t > 0.3) cand.push({ i, s, t });
    }
    cand.sort((a, b) => b.t - a.t);
    const pick = [cand[0]];
    for (const k of cand.slice(1)) if (Math.abs(k.s - pick[0].s) > 2 * win) { pick.push(k); break; }
    if (pick.length < 2 || !pick[0]) throw new Error('could not find the sleeve hem corners');
    return pick.sort((a, b) => a.s - b.s).map((k) => k.i);
  };
  const [sR1, sR2] = corners(neck, armR, 1, armR);
  const [sL2, sL1] = corners(armL, neck, -1, armL);

  return { neck, sleeveR1: sR1, sleeveR2: sR2, armpitR: armR, hemR, hemL, armpitL: armL, sleeveL2: sL2, sleeveL1: sL1 };
}

// Turn a mask into its contour and landmarks: largest component, closed by
// `closeRadius`, holes filled.
export function silhouette(mask, W, H, { n = 1200, closeRadius = 4 } = {}) {
  const { labels: l0, sizes: s0 } = components(mask, W, H);
  if (!s0.length) throw new Error('empty silhouette');
  const big0 = s0.indexOf(Math.max(...s0));
  const one = Uint8Array.from(l0, (l) => (l === big0 ? 1 : 0));
  const { labels, sizes } = components(close(one, W, H, closeRadius).map((v) => (v ? 255 : 0)), W, H);
  if (!sizes.length) throw new Error('empty silhouette');
  const big = sizes.indexOf(Math.max(...sizes));
  const solid = solidComponent(labels, big, W, H);
  const contour = resampleClosed(traceContour(solid, W, H), n);
  return { mask: solid, contour, landmarks: findLandmarks(contour) };
}

// Matched point lists along two contours, split at their landmarks, with
// `perSeg` points per stretch (landmarks included once).
export function correspondences(a, b, perSeg = 12) {
  const src = [], dst = [];
  for (let k = 0; k < LANDMARKS.length; k++) {
    const from = LANDMARKS[k], to = LANDMARKS[(k + 1) % LANDMARKS.length];
    const pa = arcPoints(a.contour, a.landmarks[from], a.landmarks[to], perSeg + 1);
    const pb = arcPoints(b.contour, b.landmarks[from], b.landmarks[to], perSeg + 1);
    for (let i = 0; i < perSeg; i++) { src.push(pa[i]); dst.push(pb[i]); }
  }
  return { src, dst };
}
