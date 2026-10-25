// Biketerra x TBB (front and back product views on white), painted from 3D
// in the stopped pose.
// - Torso: the views, mapped by arc length round the torso from the centre
//   line (across) and 3D distance from the hem (up). Up is piecewise: the
//   hem to the purple band's top edge spans BAND, and the band to the centre
//   collar the rest, so the band's edge is one height all round. Across is
//   at the upper part's scale. The views do not reach round the flanks; a
//   flank point beyond a view's outline takes the mirror image in that row,
//   from the view its normal faces.
// - Sleeves: unrolled round the upper-arm bone (distance from the cuff, and
//   arc from the outside of the arm toward the front or the back) and laid
//   on each view's flat sleeve, whose top edge is the outside of the arm.
// - Right sleeve lettering (logo and "biketerra"), redrawn as a ring at a
//   fixed distance from the cuff, reading round the arm from back to front
//   over its outside, tops toward the shoulder. The views' own is painted
//   out (extract.py).
// - Front TBB patch, redrawn flat on the chest (extract.py paints out the
//   view's own).
// - Collar: a plain orange band.
//   node design.mjs WORKDIR OUT.png
import { readFileSync } from 'node:fs';
import { readPNG } from '../../test/png.js';
import { paint, rig, glb, tm, sm, N } from '../rsc/paint.mjs';
import { body } from '../rsc/frame.mjs';
import { sub, dot, norm, cross, scale, rgbaAt } from '../chrono/decal.mjs';
const [,, work, outPath] = process.argv;
const env = (k, d) => Number(process.env[k] ?? d);
const cm = (k, d) => env(k, d) / 100;
const COLLAR = cm('COLLAR', 1);
const col = JSON.parse(readFileSync(`${work}/colours.json`));

// Mesh boundaries (positions, since UV seams split vertices): hem, cuffs,
// neck (open edges high up), armholes (edges shared by a sleeve and the torso).
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
const seg = { hem: [], neck: [], cuffl: [], cuffr: [], arml: [], armr: [] };
for (const e of edges.values()) {
  const s = body(e.a)[2] > 0 ? 'l' : 'r', u = body(e.a)[1];
  if (e.n === 2 && e.torso.size === 2) seg['arm' + s].push([e.a, e.b]);
  if (e.n !== 1) continue;
  if (u > 0.42) seg.neck.push([e.a, e.b]);
  else if (!e.torso.has(true)) seg['cuff' + s].push([e.a, e.b]);
  else if (u < 0.15) seg.hem.push([e.a, e.b]);
}
function segDist(p, segs) {
  let best = 1e9;
  for (const [a, b] of segs) {
    const ab = sub(b, a), ap = sub(p, a), t = Math.max(0, Math.min(1, dot(ab, ap) / dot(ab, ab)));
    best = Math.min(best, Math.hypot(...sub(ap, scale(ab, t))));
  }
  return best;
}
const hemDist = (p) => segDist(p, seg.hem);
const armpit = {};
for (const s of ['l', 'r']) armpit[s] = seg['arm' + s].flat().sort((a, b) => body(a)[1] - body(b)[1])[0];

// Arc length round the torso (as ../chasing-the-sun/design.mjs). Per 5 mm
// of height: the section's centre, its radius in each degree of azimuth
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

// The views, in image px. cx is the centre line, band the purple band's top
// edge (the back's is the pocket top); the collar and hem are read from the
// alpha down the centre line and in each column.
const VIEW = {
  F: { im: readPNG(`${work}/front.png`), cx: 711.5, band: 846.5, lft: 1 },
  B: { im: readPNG(`${work}/back.png`), cx: 736.5, band: 919, lft: -1 },
};
for (const V of Object.values(VIEW)) {
  const { im } = V, on = (x, y) => (x = Math.round(x), y = Math.round(y), x >= 0) && y >= 0 && x < im.width && y < im.height && im.data[(y * im.width + x) * 4 + 3] > 127;
  V.on = on;
  let y = V.band; while (on(Math.round(V.cx), y - 1)) y--; V.collar = y;
  V.hemY = new Float64Array(im.width);
  for (let x = 0; x < im.width; x++) { let y = V.band; if (!on(x, y)) continue; while (on(x, y + 1)) y++; V.hemY[x] = y + 1; }
  V.hem = (x) => V.hemY[Math.max(0, Math.min(im.width - 1, Math.round(x)))] || V.hemY[Math.round(V.cx)];
}
// Each view at one scale, collar to hem down the centre line against the
// model's, so its art keeps its proportions. The model's back is 9 cm
// longer than its front, as the mockup's is, so the band's edge comes out
// higher at the back (as the mockup draws it) and slopes across the flanks.
{
  const nk = seg.neck.flat().filter((p) => Math.abs(body(p)[2]) < 0.02);
  VIEW.F.hdCollar = hemDist(nk.sort((a, b) => body(b)[0] - body(a)[0])[0]);
  VIEW.B.hdCollar = hemDist(nk.sort((a, b) => body(a)[0] - body(b)[0])[0]);
}
for (const [k, V] of Object.entries(VIEW)) {
  V.s = (V.hem(V.cx) - V.collar) / V.hdCollar;
  V.bandH = (V.hem(V.cx) - V.band) / V.s;
  console.log(k, 'collar y', V.collar, 'hem y', V.hem(V.cx), 'hem to collar', (V.hdCollar * 100).toFixed(1), 'cm, px/cm', (V.s / 100).toFixed(1), 'band', (V.bandH * 100).toFixed(1), 'cm');
}
// The views' hems curve (the front's rises 3.5 cm at the centre: it is seen
// from above). Follow the curve only within HEM_BLEND of the hem, so rows
// above it stay level.
const HEM_BLEND = cm('HEM_BLEND', 5);
const toView = (V, a, hd) => { const x = V.cx + V.lft * a * V.s, w = Math.max(0, 1 - hd / HEM_BLEND);
  return [x, V.hem(V.cx) + (V.hem(x) - V.hem(V.cx)) * w - hd * V.s]; };
// The outline's columns in a row (cached).
const rows = new Map();
function outline(V, y) {
  const yi = Math.round(y), k = V.lft + ':' + yi;
  if (!rows.has(k)) { let l = Math.round(V.cx), r = l; if (V.on(l, yi)) { while (V.on(l - 1, yi)) l--; while (V.on(r + 1, yi)) r++; } else r = l - 1; rows.set(k, [l, r]); }
  return rows.get(k);
}
const inside = (V, [x, y]) => { const [l, r] = outline(V, y); return x >= l && x <= r; };
const px = (V, x, y) => { const o = rgbaAt(V.im, x, y); return o[3] > 0.01 ? o.slice(0, 3).map((q) => q / o[3]) : col.orange; };

// Sample a view at (x, y). Beyond the outline, mirror across it in the row.
function sample(V, x, y) {
  if (!inside(V, [x, y])) {
    const [l, r] = outline(V, y);
    if (x < l) x = 2 * l - x; else if (x > r) x = 2 * r - x;
    x = Math.max(l, Math.min(r, x));
  }
  return px(V, x, y);
}

// The flanks, where neither view reaches: plain camo above the band's edge
// and topo below, from logo-free patches of the back view (mirror-tiled, at
// its scale), with the edge running straight from the front view's height
// to the back's.
const PATCH = { camo: [850, 360, 1000, 700], topo: [480, 1100, 1000, 1270] };
const mirror = (t, n) => { const r = ((t % (2 * n)) + 2 * n) % (2 * n); return r < n ? r : 2 * n - r; };
const patch = ([x0, y0, x1, y1], u, v) => px(VIEW.B, x0 + mirror(u * VIEW.B.s, x1 - x0 - 1) + 0.5, y0 + mirror(v * VIEW.B.s, y1 - y0 - 1) + 0.5);
function flank(aF, aB, hd) {
  const [lF, rF] = outline(VIEW.F, toView(VIEW.F, aF, hd)[1]), [lB, rB] = outline(VIEW.B, toView(VIEW.B, aB, hd)[1]);
  const eF = (aF > 0 ? rF - VIEW.F.cx : VIEW.F.cx - lF) / VIEW.F.s, eB = (aB > 0 ? VIEW.B.cx - lB : rB - VIEW.B.cx) / VIEW.B.s;
  const H = Math.abs(aF) + Math.abs(aB), t = Math.max(0, Math.min(1, (Math.abs(aF) - eF) / Math.max(1e-6, H - eB - eF)));
  const edge = VIEW.F.bandH + (VIEW.B.bandH - VIEW.F.bandH) * t;
  return hd < edge ? patch(PATCH.topo, Math.abs(aF), -hd) : patch(PATCH.camo, Math.abs(aF), -hd);
}
function torso(p) {
  const b = body(p), { phi, aF, aB } = arc(b), hd = hemDist(p);
  const f = toView(VIEW.F, aF, hd), k = toView(VIEW.B, aB, hd);
  const order = Math.abs(phi) < 90 ? [[VIEW.F, f], [VIEW.B, k]] : [[VIEW.B, k], [VIEW.F, f]];
  // Near the neck the view's neck hole can lie under a point (the model's
  // neckline is not the mockup's); step it down onto the jersey.
  const [V0, q0] = order[0];
  if (q0[1] < V0.band && !V0.on(...q0)) for (let d = 1; d < 80; d++) if (V0.on(q0[0], q0[1] + d)) return px(V0, q0[0], q0[1] + d);
  for (const [V, q] of order) if (V.on(...q)) return px(V, ...q);
  return flank(aF, aB, hd);
}

// Sleeves. In each view a flat sleeve is a corner at the cuff's top (the
// outside of the arm), the top edge's direction toward the neck (a), and
// toward the underarm (p). Measured off the views' outlines.
// The underside runs from the cuff's bottom corner (d) to the armpit (m);
// a point unrolled past it is reflected back, so the sleeve never takes the
// torso's art below the armpit.
const SLEEVE = {
  F: { r: [[145, 398], [600, 238], [165, 580], [382, 592]], l: [[1280, 398], [822, 238], [1260, 580], [1042, 592]] },
  B: { l: [[178, 418], [590, 280], [195, 585], [400, 597]], r: [[1291, 418], [880, 280], [1274, 585], [1066, 597]] },
};
for (const v of ['F', 'B']) for (const s of ['l', 'r']) {
  const [c, n, d, m] = SLEEVE[v][s], a = norm([n[0] - c[0], n[1] - c[1], 0]), cd = [d[0] - c[0], d[1] - c[1], 0];
  const e = norm([m[0] - d[0], m[1] - d[1], 0]), out = norm(sub(cd, scale(a, dot(cd, a))));
  let nn = [-e[1], e[0], 0]; if (dot(nn, out) < 0) nn = scale(nn, -1); // the underside's outward normal
  SLEEVE[v][s] = { c, a, p: out, d, nn };
}
// The bone frame: y along the bone; the cuff at the cuff edge's mean y; the
// outside of the arm is the rider's lateral direction, in the bone frame.
const cuffY = {}, outL = {};
for (const s of ['l', 'r']) {
  let sum = 0, n = 0;
  for (let k = 0; k < N * N; k += 7) if (sm.side[k] === (s === 'l' ? 1 : 2) && segDist([sm.wpos[k*3], sm.wpos[k*3+1], sm.wpos[k*3+2]], seg['cuff' + s]) < 0.003) { sum += sm.loc[k*3+1]; n++; }
  cuffY[s] = sum / n;
}
{ // lateral (world -z is the rider's left) into each bone frame
  const { Matrix3, Matrix4, Vector3 } = await import('../../vendor/three.module.js');
  for (const s of ['l', 'r']) {
    const m = new Matrix3().setFromMatrix4(new Matrix4().copy(rig.bones.get(`upperArm.${s}`).matrixWorld).invert());
    const v = new Vector3(0, 0, s === 'l' ? -1 : 1).applyMatrix3(m);
    outL[s] = norm([v.x, 0, v.z]);
    const f = new Vector3(1, 0, 0).applyMatrix3(m); outL[s].fwd = norm([f.x, 0, f.z]);
  }
}
// -> u (m from the cuff toward the shoulder), v (m round the arm from its
// outside, + toward the front)
function unroll(s, loc) {
  const o = outL[s], q = [loc[0], 0, loc[2]], r = Math.hypot(q[0], q[2]);
  const side = cross(o, [0, 1, 0]), sg = Math.sign(dot(side, o.fwd)) || 1;
  const ang = Math.atan2(dot(q, side) * sg, dot(q, o));
  return { u: cuffY[s] - loc[1], v: r * ang };
}
function sleeve(s, loc) {
  const { u, v } = unroll(s, loc), view = v >= 0 ? 'F' : 'B', V = VIEW[view], L = SLEEVE[view][s];
  let x = L.c[0] + (u * L.a[0] + Math.abs(v) * L.p[0]) * V.s, y = L.c[1] + (u * L.a[1] + Math.abs(v) * L.p[1]) * V.s;
  const past = (x - L.d[0]) * L.nn[0] + (y - L.d[1]) * L.nn[1];
  if (past > 0) { x -= 2 * past * L.nn[0]; y -= 2 * past * L.nn[1]; }
  return sample(V, x, y);
}

// The lettering ring on the right sleeve: art centred SLEEVE_U from the
// cuff on the outside of the arm, SLEEVE_L long.
const art = readPNG(`${work}/sleeve.png`);
const SLEEVE_U = cm('SLEEVE_U', 3.9), SLEEVE_L = cm('SLEEVE_L', 13.5);
const premul = (o, c) => o[3] > 0 ? c.map((q, i) => q * (1 - o[3]) + o[i]) : c;
function lettering(loc, c) {
  const { u, v } = unroll('r', loc), k = art.width / SLEEVE_L;
  const x = art.width / 2 + v * k, y = art.height / 2 + (SLEEVE_U - u) * k;
  if (x < 0 || y < 0 || x >= art.width || y >= art.height) return c;
  return premul(rgbaAt(art, x, y), c);
}

// The front TBB patch, flat on the chest: centred where the view's mapping
// puts the view's patch centre, top edge level, the view's width. Wrapped
// with the view it came out turned about 10 degrees.
const tbb = JSON.parse(readFileSync(`${work}/tbb.json`)), tbbIm = readPNG(`${work}/tbb.png`);
const TBB = (() => {
  let best = 1e9, P0, n0;
  for (let k = 0; k < N * N; k += 5) if (tm.on[k]) {
    const p = [tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]], A = arc(body(p));
    if (Math.abs(A.phi) > 90) continue;
    const [x, y] = toView(VIEW.F, A.aF, hemDist(p)), d = Math.hypot(x - tbb.x, y - tbb.y);
    if (d < best) { best = d; P0 = p; n0 = norm([tm.nrm[k*3], tm.nrm[k*3+1], tm.nrm[k*3+2]]); }
  }
  // Top edge level in the world: the stopped pose's torso axis leans a
  // little sideways, and squaring to it turned the patch 2.2 degrees CCW.
  const eu = norm(cross([0, 1, 0], n0)), ev = cross(eu, n0); // art right, down
  return { P0, n0, eu, ev, k: VIEW.F.s }; // the patch image is at the view's scale
})();
function patchTBB(p, n, c) {
  const rel = sub(p, TBB.P0); if (dot(n, TBB.n0) < 0.2 || Math.abs(dot(rel, TBB.n0)) > 0.04) return c;
  const x = tbbIm.width / 2 + dot(rel, TBB.eu) * TBB.k, y = tbbIm.height / 2 + dot(rel, TBB.ev) * TBB.k;
  if (x < 0 || y < 0 || x >= tbbIm.width || y >= tbbIm.height) return c;
  return premul(rgbaAt(tbbIm, x, y), c);
}

function colour(q) {
  const { p } = q;
  if (segDist(p, seg.neck) < COLLAR) return col.orange;
  // One front-panel triangle at the collar (842) has its UVs above the
  // position maps' sleeve/torso split (v 0.45), so it comes as the right
  // sleeve's; the sleeve islands end at x 320.
  if (q.part === 't' || q.x >= 320) return patchTBB(p, q.n, torso(p));
  const c = sleeve(q.part, q.loc);
  return q.part === 'r' ? lettering(q.loc, c) : c;
}
paint(colour, outPath);
