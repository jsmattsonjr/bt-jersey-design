// RSC Lüneburg (MAKO TEAM JERSEY 02057 PBS, V1 mockup), painted from 3D in
// the stopped pose: white body; plum raglan yoke and sleeves; a magenta side
// panel from the hem up the flank and along the underside of the sleeve,
// with a white slash at the armhole seam; pink cuffs; purple pocket band with
// a pink top line on the back; the art from extract.py projected flat.
//   node design.mjs WORKDIR OUT.png
// Sizes in cm (env): PANEL 8.5, SLASH 1.2 (torso side of the armhole), CUFF 3, POCKET 2.9..14.5, PINK 0.6.
import { readPNG } from '../../src/png.js';
import { paint, rig, glb, tm, SS, N } from './paint.mjs';
import { body, bodyDir, O, U, F, L } from './frame.mjs';
import { sub, dot, norm, cross, scale, rgbaAt } from '../chrono/decal.mjs';
const [,, work, outPath] = process.argv;
const cm = (k, d) => Number(process.env[k] || d) / 100;
const PANEL = cm('PANEL', 8.5), SLASH = cm('SLASH', 1.2), CUFF = cm('CUFF', 3);
const POCKET = [cm('POCKET0', 2.9), cm('POCKET1', 14.5)], PINKW = cm('PINK', 0.6);
const WHITE = [255, 255, 255], PLUM = [75, 21, 65], MAGENTA = [152, 23, 136], PINK = [239, 50, 108], PURPLE = [94, 37, 144];

// Mesh boundaries, keyed by position since UV seams split vertices: the hem
// and cuffs (edges of one triangle), and the armhole (edges shared by a
// sleeve and a torso triangle).
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
const seg = { hem: [], cuffl: [], cuffr: [], arml: [], armr: [] };
for (const e of edges.values()) {
  const s = body(e.a)[2] > 0 ? 'l' : 'r';
  if (e.n === 2 && e.torso.size === 2) seg['arm' + s].push([e.a, e.b]);
  else if (e.n === 1 && !e.torso.has(true) && body(e.a)[1] < 0.42) seg['cuff' + s].push([e.a, e.b]);
  else if (e.n === 1 && body(e.a)[1] < 0.15) seg.hem.push([e.a, e.b]);
}
function segDist(p, segs) {
  let best = 1e9;
  for (const [a, b] of segs) {
    const ab = sub(b, a), ap = sub(p, a), t = Math.max(0, Math.min(1, dot(ab, ap) / dot(ab, ab)));
    best = Math.min(best, Math.hypot(...sub(ap, scale(ab, t))));
  }
  return best;
}

// Armpit: the lowest armhole point on each side. Side line: the torso's most
// lateral point in each 1 cm of height below it.
const armpit = {};
for (const s of ['l', 'r']) armpit[s] = seg['arm' + s].flat().sort((a, b) => body(a)[1] - body(b)[1])[0];
// Side line: in each 5 mm of height below the armpit, the mean position of
// the torso points facing most nearly straight out to the side; smoothed
// over +-2 cm and interpolated.
const acc = { l: [], r: [] };
for (let k = 0; k < N * N; k++) {
  if (!tm.on[k]) continue;
  const p = [tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]], b = body(p), s = b[2] > 0 ? 'l' : 'r', i = Math.floor(b[1] * 200);
  if (b[1] > body(armpit[s])[1] || i < 0) continue;
  const d = bodyDir(norm([tm.nrm[k*3], tm.nrm[k*3+1], tm.nrm[k*3+2]])), lat = Math.abs(d[2]) / Math.hypot(d[0], d[2]);
  if (lat < 0.995) continue;
  const a = acc[s][i] || (acc[s][i] = [0, 0, 0, 0]); for (let c = 0; c < 3; c++) a[c] += p[c]; a[3]++;
}
const side = { l: [], r: [] };
for (const s of ['l', 'r']) {
  const top = Math.floor(body(armpit[s])[1] * 200), raw = [];
  for (let i = 0; i <= top; i++) raw[i] = acc[s][i] && acc[s][i][3] ? acc[s][i].slice(0, 3).map((q) => q / acc[s][i][3]) : null;
  raw[top] = armpit[s];
  for (let i = 0; i <= top; i++) { let w = 0; const m = [0, 0, 0];
    for (let j = Math.max(0, i - 4); j <= Math.min(top, i + 4); j++) if (raw[j]) { for (let c = 0; c < 3; c++) m[c] += raw[j][c]; w++; }
    side[s][i] = w ? m.map((q) => q / w) : null; }
  let last; for (let i = 0; i <= top; i++) side[s][i] = last = side[s][i] || last; for (let i = top; i >= 0; i--) side[s][i] = last = side[s][i] || last;
}
const sidePt = (s, u) => { const a = side[s], x = Math.max(0, Math.min(a.length - 1.001, u * 200)), i = Math.floor(x), t = x - i;
  return a[i].map((q, c) => q * (1 - t) + a[i + 1][c] * t); };
for (const s of ['l', 'r']) console.log('armpit', s, body(armpit[s]).map((q) => (q * 100).toFixed(1)).join(' '));

// Sleeve underside: the armpit's angle round the upper-arm bone.
const Mi = {}, under = {};
for (const s of ['l', 'r']) { const e = rig.bones.get(`upperArm.${s}`).matrixWorld.clone().invert().elements;
  Mi[s] = (p) => [0,1,2].map((i) => e[i]*p[0] + e[4+i]*p[1] + e[8+i]*p[2] + e[12+i]);
  const a = Mi[s](armpit[s]); under[s] = Math.atan2(a[2], a[0]); }

// Raglan seam: a plane per side through the neck at the side, the back of
// the neck at the side, and the armpit; the shoulder side of it is yoke.
const NECKF = Number(process.env.NECKF || 6.5) / 100, NECKB = Number(process.env.NECKB || 5) / 100;
const ragl = {};
for (const s of ['l', 'r']) {
  const sg = s === 'l' ? 1 : -1, toW = (b) => [0,1,2].map((i) => O[i] + b[0]*F[i] + b[1]*U[i] + b[2]*L[i]);
  const nf = toW([0.03, 0.505, sg * NECKF]), nb = toW([-0.015, 0.525, sg * NECKB]), a = armpit[s];
  let n = norm(cross(sub(nb, nf), sub(a, nf)));
  if (dot(n, sub(toW([0.03, 0.45, sg * 0.15]), nf)) < 0) n = scale(n, -1);
  const u0 = body(nf)[1], u1 = body(a)[1], BOW = cm('BOW', 1.5);
  ragl[s] = (p) => { const t = Math.max(0, Math.min(1, (u0 - body(p)[1]) / (u0 - u1))); return dot(n, sub(p, nf)) - BOW * 4 * t * (1 - t); };
}

// Art, projected flat: P0 the surface point, eu the image x direction, ev =
// eu x n0 the image's down, width in cm. Only where the surface faces the
// decal and lies within 4 cm of its plane.
const near = (want, score) => { let best, bs = Infinity;
  for (let k = 0; k < N * N; k += 2) { if (!tm.on[k]) continue; const p = [tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]];
    if (!want(p)) continue; const sc = score(p, norm([tm.nrm[k*3], tm.nrm[k*3+1], tm.nrm[k*3+2]])); if (sc < bs) { bs = sc; best = [p, norm([tm.nrm[k*3], tm.nrm[k*3+1], tm.nrm[k*3+2]])]; } }
  return best; };
const at = (f, u, l) => near((p) => Math.sign(body(p)[0] - 0.03) === Math.sign(f), (p) => { const b = body(p); return (b[1] - u) ** 2 + (b[2] - l) ** 2; });
const tan = (d, n) => norm(sub(d, scale(n, dot(d, n))));
const decals = [];
function decal(file, [p0, n0], x, wcm) {
  const im = readPNG(`${work}/${file}.png`), eu = tan(x, n0), ev = cross(eu, n0);
  decals.push({ file, im, P0: p0, n0, eu, ev, k: im.width / (wcm / 100) });
  console.log(file, 'at', body(p0).map((q) => (q * 100).toFixed(1)).join(' '), 'cm', wcm, 'x', (wcm * im.height / im.width).toFixed(1));
}
const mL = scale(L, -1);
decal('mako', at(1, cm('MAKO_U', 38), -cm('MAKO_L', 6.5)), L, Number(process.env.MAKO_W || 4));
decal('club', at(1, cm('CLUB_U', 34.5), cm('CLUB_L', 6.6)), L, Number(process.env.CLUB_W || 9.5));
decal('makob', at(-1, cm('MAKOB_U', 49.5), 0), mL, Number(process.env.MAKO_W || 4));
decal('circles', at(-1, cm('CIRC_U', 34.8), -cm('CIRC_L', 5.1)), mL, Number(process.env.CIRC_W || 6.5));
// RSC on each flank, reading along the torso with its top toward the back
// (upright when the rider is bent over), centred on the side line.
const RSC_W = Number(process.env.RSC_W || 9);
for (const s of ['l', 'r']) {
  const p = sidePt(s, cm('FLANK_U', 21)), sp = near((q) => Math.hypot(...sub(q, p)) < 0.01, (q) => Math.hypot(...sub(q, p)));
  decal('rsc', sp, s === 'l' ? scale(U, -1) : U, RSC_W);
}
// RSC on each shoulder, reading from the rider's right to left, top toward
// the back: on the crest (the most upward-facing point) at SHOULDER_L out.
const SHL = cm('SHOULDER_L', 15);
const shoulderAt = (s) => { let best, bs = -2; const sg = s === 'l' ? 1 : -1;
  for (const m of [tm]) for (let k = 0; k < N * N; k += 2) { if (!m.on[k]) continue; const p = [m.wpos[k*3], m.wpos[k*3+1], m.wpos[k*3+2]], b = body(p);
    if (Math.abs(b[2] - sg * SHL) > 0.003) continue; const n = norm([m.nrm[k*3], m.nrm[k*3+1], m.nrm[k*3+2]]), sc = bodyDir(n)[1]; if (sc > bs) { bs = sc; best = [p, n]; } }
  return best; };
const shoulders = [];
import { sm } from './paint.mjs';
function shoulderFromSleeve(s) { // the crest may lie on the sleeve island
  let best = shoulderAt(s), bs = best ? bodyDir(best[1])[1] : -2; const sg = s === 'l' ? 1 : -1;
  for (let k = 0; k < N * N; k += 2) { if (sm.side[k] !== (s === 'l' ? 1 : 2)) continue; const p = [sm.wpos[k*3], sm.wpos[k*3+1], sm.wpos[k*3+2]], b = body(p);
    if (Math.abs(b[2] - sg * SHL) > 0.003) continue; const n = norm([sm.nrm[k*3], sm.nrm[k*3+1], sm.nrm[k*3+2]]), sc = bodyDir(n)[1]; if (sc > bs) { bs = sc; best = [p, n]; } }
  return best; }
for (const s of ['l', 'r']) decal('rsc', shoulderFromSleeve(s), L, Number(process.env.RSC_SH_W || RSC_W));

function colour(q) {
  const { p, n } = q, b = body(p), s = q.part === 't' ? (b[2] > 0 ? 'l' : 'r') : q.part;
  let c = WHITE, inPanel;
  if (q.part === 't') {
    const sp = sidePt(s, b[1]);
    inPanel = Math.hypot(...sub(p, sp)) < PANEL / 2 && b[1] <= body(armpit[s])[1] + 0.03;
    if (ragl[s](p) > 0) c = PLUM;
    else if (!inPanel && body(p)[0] < body(sp)[0]) {
      const h = segDist(p, seg.hem);
      if (h > POCKET[0] && h < POCKET[1]) c = PURPLE; else if (h >= POCKET[1] && h < POCKET[1] + PINKW) c = PINK;
    }
  } else {
    c = PLUM;
    const a = Math.atan2(q.loc[2], q.loc[0]), r = Math.hypot(q.loc[2], q.loc[0]);
    let d = Math.abs(a - under[s]); d = Math.min(d, 2 * Math.PI - d);
    inPanel = d * r < PANEL / 2;
  }
  if (inPanel) c = q.part === 't' && segDist(p, seg['arm' + s]) < SLASH ? WHITE : MAGENTA; // slash on the torso side of the armhole
  if (q.part !== 't' && segDist(p, seg['cuff' + s]) < CUFF) c = PINK;
  for (const d of decals) {
    const rel = sub(p, d.P0);
    if (dot(n, d.n0) < 0.2 || Math.abs(dot(rel, d.n0)) > 0.04) continue;
    const o = rgbaAt(d.im, d.im.width / 2 + dot(rel, d.eu) * d.k, d.im.height / 2 + dot(rel, d.ev) * d.k);
    if (o[3] > 0) c = c.map((v, i) => v * (1 - o[3]) + o[i]);
  }
  return c;
}
paint(colour, outPath);
