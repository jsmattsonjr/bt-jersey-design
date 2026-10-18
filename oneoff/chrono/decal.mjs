// Shared bits for projecting a PSD art layer flat onto the body.
export const sub = (a, b) => a.map((q, i) => q - b[i]), dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const scale = (a, s) => a.map((q) => q * s);
const tangent = (d, n) => norm(sub(d, scale(n, dot(d, n))));

// Frame for a layer at atlas box (x, y, w, h). at(x, y) -> {p, n} or null is
// the position map; upRef is the 3D reference "up" (world up on the torso,
// toward the shoulder on a sleeve). The image's down axis (ev) is whichever
// of +-up, +-right lies nearest the atlas +y direction there, and its x axis
// (eu) keeps the atlas handedness, so the art keeps the orientation it had on
// the body but is square to the reference. px/m keeps the old 3D size,
// measured as chords across the box (long axis, or geometric mean if square).
export function frame(at, { x, y, w, h }, upRef) {
  const cx = x + w / 2, cy = y + h / 2;
  const near = (px, py) => { for (let r = 0; r < 20; r += 0.5) for (const [dx, dy] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]]) { const s = at(px + dx, py + dy); if (s) return s; } throw new Error(`no surface near ${px},${py}`); };
  const c = near(cx, cy), n0 = c.n;
  const ax = sub(near(cx + 2, cy).p, near(cx - 2, cy).p), ay = sub(near(cx, cy + 2).p, near(cx, cy - 2).p);
  const up = tangent(upRef, n0), rt = cross(up, n0);
  const ev = [up, scale(up, -1), rt, scale(rt, -1)].sort((a, b) => dot(b, ay) - dot(a, ay))[0];
  let eu = cross(n0, ev); if (dot(eu, ax) < 0) eu = scale(eu, -1);
  const chord = (a, b) => Math.hypot(...sub(near(...a).p, near(...b).p));
  const hgt = chord([cx, y + 0.5], [cx, y + h - 0.5]), wid = chord([x + 0.5, cy], [x + w - 0.5, cy]);
  const k = Math.max(w, h) > 1.5 * Math.min(w, h) ? (w > h ? w / wid : h / hgt) : Math.sqrt((w / wid) * (h / hgt));
  const deg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), b)))) * 180 / Math.PI).toFixed(0);
  return { P0: c.p, n0, eu, ev, k, info: `${(w / k * 100).toFixed(1)}x${(h / k * 100).toFixed(1)} cm (old chords ${(wid*100).toFixed(1)}x${(hgt*100).toFixed(1)}); atlas axes off frame by ${deg(ax, eu)}/${deg(ay, ev)} deg` };
}

// Premultiplied bilinear RGBA of im at image coords (x, y), 0..1 alpha.
export function rgbaAt(im, x, y) {
  const fx = x - .5, fy = y - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, o = [0, 0, 0, 0];
  for (const [X, Y, w] of [[x0, y0, (1-tx)*(1-ty)], [x0+1, y0, tx*(1-ty)], [x0, y0+1, (1-tx)*ty], [x0+1, y0+1, tx*ty]]) {
    if (X < 0 || Y < 0 || X >= im.width || Y >= im.height) continue;
    const k = (Y*im.width+X)*4, a = w * im.data[k+3] / 255;
    o[0] += a*im.data[k]; o[1] += a*im.data[k+1]; o[2] += a*im.data[k+2]; o[3] += a;
  }
  return o;
}

// Composite layer l (with l.f from frame) over colour c at point p, normal n.
export function over(c, l, p, n, depth = 0.08) {
  const f = l.f, rel = sub(p, f.P0);
  if (dot(n, f.n0) < 0.2 || Math.abs(dot(rel, f.n0)) > depth) return c;
  const o = rgbaAt(l.im, l.im.width / 2 + dot(rel, f.eu) * f.k, l.im.height / 2 + dot(rel, f.ev) * f.k);
  return o[3] > 0 ? c.map((q, i) => q * (1 - o[3]) + o[i]) : c;
}

// Bleed: texels within R px of a known texel copy the nearest one (stale paint
// at seams shows under nearest sampling), limited to rows y0..y1, x0..x1.
export function bleed(rgb, known, S, [x0, y0, x1, y1], R = 4) {
  let front = []; const dist = new Int8Array(S * S).fill(-1);
  for (let t = 0; t < S * S; t++) if (known[t]) { dist[t] = 0; front.push(t); }
  for (let d = 1; d <= R; d++) {
    const next = [];
    for (const t of front) {
      const x = t % S, y = (t / S) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < x0 || Y < y0 || X > x1 || Y > y1) continue;
        const u = Y * S + X; if (dist[u] >= 0) continue;
        dist[u] = d; for (let c = 0; c < 3; c++) rgb[u*3+c] = rgb[t*3+c]; next.push(u);
      }
    }
    front = next;
  }
  return dist;
}
