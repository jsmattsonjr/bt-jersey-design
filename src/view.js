// Orthographic front and back views of the posed jersey: the frame a mockup
// is aligned to, its silhouette, and a depth buffer for visibility.
//
// Front camera sits on +x looking back at the rider, so screen-right is -z
// (the rider's left, as on a mockup). Back camera sits on -x, screen-right +z.
export const VIEWS = {
  front: { right: [0, 0, -1], toward: [1, 0, 0] },
  back: { right: [0, 0, 1], toward: [-1, 0, 0] },
};

// Calls fn(x, y, b0, b1, b2) for every pixel centre inside the triangle.
export function rasterTriangle(x0, y0, x1, y1, x2, y2, W, H, fn) {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (!area) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const b0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
      const b1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
      const b2 = 1 - b0 - b1;
      if (b0 >= -1e-9 && b1 >= -1e-9 && b2 >= -1e-9) fn(x, y, b0, b1, b2);
    }
  }
}

// Frame the jersey triangles of `posed` for one view, `width` pixels across.
export function makeView(name, posed, tris, { width = 1024, margin = 0.04 } = {}) {
  const { right, toward } = VIEWS[name];
  const P = posed.position;
  const sx = (i) => P[i * 3] * right[0] + P[i * 3 + 1] * 0 + P[i * 3 + 2] * right[2];
  const dz = (i) => P[i * 3] * toward[0] + P[i * 3 + 2] * toward[2];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of tris) {
    const x = sx(i), y = P[i * 3 + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = margin * Math.max(x1 - x0, y1 - y0);
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const scale = width / (x1 - x0); // pixels per metre
  const W = width, H = Math.round((y1 - y0) * scale);

  // World point -> [px, py, depth]; depth grows toward the camera.
  const project = (x, y, z) => [
    (x * right[0] + z * right[2] - x0) * scale,
    (y1 - y) * scale,
    x * toward[0] + z * toward[2],
  ];

  const depth = new Float32Array(W * H).fill(-Infinity);
  const mask = new Uint8Array(W * H);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const da = dz(a), db = dz(b), dc = dz(c);
    const pa = [(sx(a) - x0) * scale, (y1 - P[a * 3 + 1]) * scale];
    const pb = [(sx(b) - x0) * scale, (y1 - P[b * 3 + 1]) * scale];
    const pc = [(sx(c) - x0) * scale, (y1 - P[c * 3 + 1]) * scale];
    rasterTriangle(pa[0], pa[1], pb[0], pb[1], pc[0], pc[1], W, H, (x, y, b0, b1, b2) => {
      const d = b0 * da + b1 * db + b2 * dc;
      const k = y * W + x;
      mask[k] = 255;
      if (d > depth[k]) depth[k] = d;
    });
  }
  return { name, W, H, scale, toward, project, depth, mask };
}
