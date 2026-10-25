// Biketerra turtle jersey (front and back Gemini views), painted from 3D in
// the stopped pose: green body, teal raglan yoke and sleeves, and the
// views' art (extract.py) laid on the torso by arc length round it from the
// centre line (across) and height along the torso axis (up), each view at
// its own scale, collar to hem down the centre line. Measured up from the
// hem, the back lettering arched: the hem is higher at centre back. The
// back view's art is moved down BACK_DOWN, and its pocket logo then back
// up, so that the gap from the turtle and bicycle down to the logo is the
// gap from the lettering down to the turtle (art.json's tight boxes, in
// image px, which map to height linearly). The turtle on a bicycle is then
// scaled TURTLE (0.9) about its box's centre, which leaves the two gaps
// equal. The collar is body green, as in
// the views.
//   node design.mjs WORKDIR OUT.png
// Sizes in cm (env): NECKF 6.5, NECKB 5 (where the raglan seam's plane
// leaves the neck, front and back, out from the centre line), BOW 3.5,
// NECK_OUT 0, NECK_TOP 0.35 (a fraction, neck to armpit), BACK_DOWN 7.9.
import { readFileSync } from 'node:fs';
import { readPNG } from '../../src/png.js';
import { paint, rig, glb, tm, N } from '../rsc/paint.mjs';
import { body, O, U, F, L } from '../rsc/frame.mjs';
import { sub, dot, norm, cross, scale, rgbaAt } from '../chrono/decal.mjs';
const [,, work, outPath] = process.argv;
const cm = (k, d) => Number(process.env[k] ?? d) / 100;
const col = JSON.parse(readFileSync(`${work}/colours.json`));

// Mesh boundaries (positions, since UV seams split vertices): hem, neck
// (open edges high up), armholes (edges shared by a sleeve and the torso).
const { position: P } = rig.skin(), T = rig.jerseyTris, UV = glb.uv;
const pt = (i) => [P[i*3], P[i*3+1], P[i*3+2]];
const key = (i) => pt(i).map((q) => q.toFixed(5)).join();
const edges = new Map();
for (let t = 0; t < T.length; t += 3) {
  const torso = Math.max(UV[T[t]*2+1], UV[T[t+1]*2+1], UV[T[t+2]*2+1]) > 0.45;
  for (let e = 0; e < 3; e++) {
    const a = T[t+e], b = T[t+(e+1)%3], ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const o = edges.get(k); if (o) { o.n++; o.torso.add(torso); } else edges.set(k, { a: pt(a), b: pt(b), n: 1, torso: new Set([torso]) });
  }
}
const seg = { hem: [], neck: [], arml: [], armr: [] };
for (const e of edges.values()) {
  const s = body(e.a)[2] > 0 ? 'l' : 'r', u = body(e.a)[1];
  if (e.n === 2 && e.torso.size === 2) seg['arm' + s].push([e.a, e.b]);
  if (e.n !== 1) continue;
  if (u > 0.42) seg.neck.push([e.a, e.b]);
  else if (e.torso.has(true) && u < 0.15) seg.hem.push([e.a, e.b]);
}
function segDist(p, segs) {
  let best = 1e9;
  for (const [a, b] of segs) {
    const ab = sub(b, a), ap = sub(p, a), t = Math.max(0, Math.min(1, dot(ab, ap) / dot(ab, ab)));
    best = Math.min(best, Math.hypot(...sub(ap, scale(ab, t))));
  }
  return best;
}
const armpit = {};
for (const s of ['l', 'r']) armpit[s] = seg['arm' + s].flat().sort((a, b) => body(a)[1] - body(b)[1])[0];

// Raglan seam (as ../rsc/design.mjs): a plane per side through the neck at
// the side, front and back, and the armpit, bowed BOW out toward the
// shoulder halfway down, as the views draw it; the shoulder side is yoke.
// The bow is measured down from the neck: on the back from the back neck,
// which is 2 cm higher than the front's. Measured from the front's, the
// bow was zero over the top 2 cm of the back, and the seam ran straight
// down from the neckline as a tab. NECK_OUT pushes the back seam further
// out just below the neck, over the top NECK_TOP of the way down.
const NECKF = cm('NECKF', 6.5), NECKB = cm('NECKB', 5), BOW = cm('BOW', 3.5);
const NECK_OUT = cm('NECK_OUT', 0), NECK_TOP = Number(process.env.NECK_TOP ?? 0.35);
const UNECKB = Math.max(...seg.neck.flat().filter((p) => body(p)[0] < 0).map((p) => body(p)[1]));
console.log('neck height, back', (UNECKB * 100).toFixed(1), 'cm');
const ragl = {};
for (const s of ['l', 'r']) {
  const sg = s === 'l' ? 1 : -1, toW = (b) => [0,1,2].map((i) => O[i] + b[0]*F[i] + b[1]*U[i] + b[2]*L[i]);
  const nf = toW([0.03, 0.505, sg * NECKF]), nb = toW([-0.015, 0.525, sg * NECKB]), a = armpit[s];
  let n = norm(cross(sub(nb, nf), sub(a, nf)));
  if (dot(n, sub(toW([0.03, 0.45, sg * 0.15]), nf)) < 0) n = scale(n, -1);
  const u1 = body(a)[1], uF = body(nf)[1], uB = UNECKB;
  ragl[s] = (p) => { const b = body(p), back = Math.max(0, Math.min(1, -b[0] / 0.05)), u0 = uF + (uB - uF) * back;
    const t = Math.max(0, Math.min(1, (u0 - b[1]) / (u0 - u1))), k = Math.min(1, t / NECK_TOP);
    return dot(n, sub(p, nf)) - BOW * 4 * t * (1 - t) - NECK_OUT * back * 27 / 4 * k * (1 - k) ** 2; };
}

// Arc length round the torso (as ../biketerra/design.mjs). Per 5 mm of
// height: the section's centre, its radius in each degree of azimuth
// (phi = 0 front, +90 the rider's left), gaps interpolated, smoothed;
// C = arc from phi = -180 (centre back). Above the armpits the section is
// open, so its centre is held at the last closed one.
const BIN = 0.005, NB = 120, R = Array.from({ length: NB }, () => new Float64Array(360)), Rn = Array.from({ length: NB }, () => new Float64Array(360));
const cen = Array.from({ length: NB }, () => [0, 0, 0]);
const bins = [];
for (let k = 0; k < N * N; k += 3) if (tm.on[k]) { const b = body([tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]]), i = Math.floor(b[1] / BIN); if (i >= 0 && i < NB) { bins.push([i, b[0], b[2]]); cen[i][0] += b[0]; cen[i][1] += b[2]; cen[i][2]++; } }
for (const c of cen) if (c[2]) { c[0] /= c[2]; c[1] /= c[2]; }
{
  const top = Math.floor(body(armpit.l)[1] / BIN) - 4, raw = cen.map((c) => c.slice());
  for (let i = 0; i < NB; i++) { const j = Math.min(i, top), w = []; for (let d = -4; d <= 4; d++) { const q = raw[Math.max(0, Math.min(top, j + d))]; if (q[2]) w.push(q); }
    cen[i][0] = w.reduce((s, q) => s + q[0], 0) / w.length; cen[i][1] = w.reduce((s, q) => s + q[1], 0) / w.length; }
}
for (const [i, f, l] of bins) { const a = Math.floor((Math.atan2(l - cen[i][1], f - cen[i][0]) * 180 / Math.PI + 180) % 360); R[i][a] += Math.hypot(f - cen[i][0], l - cen[i][1]); Rn[i][a]++; }
const C = [];
for (let i = 0; i < NB; i++) {
  const r = new Float64Array(360), known = [];
  for (let a = 0; a < 360; a++) if (Rn[i][a]) { r[a] = R[i][a] / Rn[i][a]; known.push(a); }
  if (known.length < 20) { C.push(null); continue; }
  for (let a = 0; a < 360; a++) if (!Rn[i][a]) {
    let p = known.findLast((q) => q < a) ?? known.at(-1) - 360, n = known.find((q) => q > a) ?? known[0] + 360;
    const rp = r[(p + 360) % 360], rn = r[n % 360]; r[a] = rp + (rn - rp) * (a - p) / (n - p);
  }
  const sm7 = new Float64Array(360); for (let a = 0; a < 360; a++) { let s = 0; for (let d = -3; d <= 3; d++) s += r[(a + d + 360) % 360]; sm7[a] = s / 7; }
  const c = new Float64Array(361), dphi = Math.PI / 180;
  for (let a = 0; a < 360; a++) { const r0 = sm7[a], r1 = sm7[(a + 1) % 360]; c[a + 1] = c[a] + Math.hypot((r0 + r1) / 2 * dphi, r1 - r0); }
  C.push(c);
}
for (let i = 0; i < NB; i++) if (!C[i]) C[i] = C.slice(0, i).findLast(Boolean) || C.slice(i).find(Boolean);
// -> { phi (deg), aF arc from centre front, aB arc from centre back, both + toward the rider's left }
function arc(b) {
  const i = Math.max(0, Math.min(NB - 1, Math.floor(b[1] / BIN))), c = C[i];
  const phi = Math.atan2(b[2] - cen[i][1], b[0] - cen[i][0]) * 180 / Math.PI, x = phi + 180, j = Math.min(359, Math.floor(x)), at = c[j] + (c[j + 1] - c[j]) * (x - j);
  return { phi, aF: at - c[180], aB: phi >= 0 ? c[360] - at : -at };
}

// The views, in image px, measured off the mockups down the centre line:
// the collar seam and the hem (the front's near hem, not the back seen
// below it). lft: the image direction of the rider's left.
const VIEW = {
  F: { im: readPNG(`${work}/front.png`), cx: 1200.5, collar: 305, hem: 1551, lft: 1, down: 0 },
  B: { im: readPNG(`${work}/back.png`), cx: 1200.5, collar: 208, hem: 1691, lft: -1, down: cm('BACK_DOWN', 7.9) },
};
const art = JSON.parse(readFileSync(`${work}/art.json`)), logo = readPNG(`${work}/back-logo.png`), turtle = readPNG(`${work}/back-turtle.png`);
const TURTLE = Number(process.env.TURTLE ?? 0.9), tb = art['back.turtle'], tc = [(tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2];
const LOGO_UP = (art['back.logo'][1] - art['back.turtle'][3]) - (art['back.turtle'][1] - art['back.lettering'][3]); // image px
console.log('back logo up', LOGO_UP, 'px');
{
  const mid = (segs) => segs.flat().filter((p) => Math.abs(body(p)[2]) < 0.02), fwd = (a, b) => body(b)[0] - body(a)[0];
  const nk = mid(seg.neck).sort(fwd), hm = mid(seg.hem).sort(fwd);
  VIEW.F.u = [body(hm[0])[1], body(nk[0])[1]];
  VIEW.B.u = [body(hm.at(-1))[1], body(nk.at(-1))[1]];
}
for (const [k, V] of Object.entries(VIEW)) {
  V.s = (V.hem - V.collar) / (V.u[1] - V.u[0]);
  console.log(k, 'hem to collar', ((V.u[1] - V.u[0]) * 100).toFixed(1), 'cm up the axis, px/cm', (V.s / 100).toFixed(1));
}
const premul = (o, c) => o[3] > 0 ? c.map((q, i) => q * (1 - o[3]) + o[i]) : c;
function torso(p) {
  const b = body(p), { phi, aF, aB } = arc(b);
  const V = Math.abs(phi) < 90 ? VIEW.F : VIEW.B, a = V === VIEW.F ? aF : aB;
  const x = V.cx + V.lft * a * V.s, y = V.hem - (b[1] - V.u[0] + V.down) * V.s, c = premul(rgbaAt(V.im, x, y), col.green);
  if (V !== VIEW.B) return c;
  return premul(rgbaAt(logo, x, y + LOGO_UP), premul(rgbaAt(turtle, tc[0] + (x - tc[0]) / TURTLE, tc[1] + (y - tc[1]) / TURTLE), c));
}

function colour(q) {
  const { p } = q;
  if (q.part !== 't') return col.teal;
  const s = body(p)[2] > 0 ? 'l' : 'r';
  return ragl[s](p) > 0 ? col.teal : torso(p);
}
paint(colour, outPath);
