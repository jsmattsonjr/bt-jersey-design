// Chasing the Sun 2026 (a Gemini mockup: front view, back view, side flats,
// shoulder flats), painted from 3D in the stopped pose.
// - Torso front and back: the views, mapped by arc length round the torso
//   from the centre line (across) and 3D distance from the hem (up), at the
//   views' own scale (collar to hem). The views' raglan seams and side-panel
//   edges, measured in the image, decide where the views stop.
// - Side panels, between those edges: the side flat's background stretched
//   to fit, with its text and logo on top at their own proportions, in
//   panel coordinates. Rider's left is AUTUMNAL EQUINOX, right WINTER
//   SOLSTICE, as on the back view; each reads upright from its own side
//   when the rider is bent over (the left one turned from the flat).
// - Yoke and sleeves: on the rider's left, navy with whole leaves from the
//   shoulder flats scattered over it (Poisson disc, random turn and size);
//   on the right, the snowy nebula from a second mockup with its stars and
//   snowflakes scattered the same way. The flats' "2026" is left out. Cuffs orange (left) and blue (right), an orange
//   collar band.
//   node design.mjs WORKDIR OUT.png
import { readFileSync } from 'node:fs';
import { readPNG } from '../../src/png.js';
import { paint, rig, glb, tm, sm, SS, N } from '../rsc/paint.mjs';
import { body, bodyDir, O, U, F, L } from '../rsc/frame.mjs';
import { sub, dot, norm, cross, scale, rgbaAt } from '../chrono/decal.mjs';
const [,, work, outPath] = process.argv;
const env = (k, d) => Number(process.env[k] ?? d);
const cm = (k, d) => env(k, d) / 100;
const COLLAR = cm('COLLAR', 1.5), CUFF = cm('CUFF', 2.8);
const col = JSON.parse(readFileSync(`${work}/colours.json`));
const sheet = readPNG(`${work}/sheet.png`);

// Mesh boundaries (positions, since UV seams split vertices): hem, cuffs,
// neck (open edges high up, on the torso or the raglan sleeve islands).
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
const armpit = {};
for (const s of ['l', 'r']) armpit[s] = seg['arm' + s].flat().sort((a, b) => body(a)[1] - body(b)[1])[0];

// Arc length round the torso. Per 5 mm of height: the section's centre, its
// radius in each degree of azimuth (phi = 0 front, +90 the rider's left),
// gaps interpolated, smoothed; C = arc from phi = -180 (centre back).
const BIN = 0.005, NB = 120, R = Array.from({ length: NB }, () => new Float64Array(360)), Rn = Array.from({ length: NB }, () => new Float64Array(360));
const cen = Array.from({ length: NB }, () => [0, 0, 0]);
const bins = [];
for (let k = 0; k < N * N; k += 3) if (tm.on[k]) { const b = body([tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]]), i = Math.floor(b[1] / BIN); if (i >= 0 && i < NB) { bins.push([i, b[0], b[2]]); cen[i][0] += b[0]; cen[i][1] += b[2]; cen[i][2]++; } }
for (const c of cen) if (c[2]) { c[0] /= c[2]; c[1] /= c[2]; }
{ // Above the armpits the section is open (front and back only), so its
  // centroid wanders and shears the art; hold the last closed section's
  // centre there, and smooth the centres over +-2 cm.
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
  for (let a = 0; a < 360; a++) if (!Rn[i][a]) { // circular linear interpolation
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

// The views, in image px. Seams and panel edges are half-widths from the
// centre line at image rows. Seams are the inner edge of the black seam line
// (the narrower side), less 6 px, so the art never samples the line or the
// mockup's yoke beyond it; panel edges are left and right averaged.
const lerp = (tab, y) => { if (y <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) { const [y0, v0] = tab[i-1], [y1, v1] = tab[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); } return tab.at(-1)[1]; };
const VIEW = {
  F: { cx: 737, collar: 318, hem: (x) => 1160 + 35 * ((x - 737) / 265) ** 2, armY: 555,
    seam: [[270, 103], [290, 131], [310, 176], [330, 208], [350, 232], [370, 253], [390, 268], [410, 280], [430, 289], [450, 295], [470, 300], [490, 303], [510, 306], [530, 307], [550, 306], [555, 304]], edge: [[555, 316], [650, 289], [700, 280], [800, 268], [900, 262], [1180, 263]] },
  B: { cx: 1748, collar: 225, hem: (x) => 1285 - 75 * ((x - 1748) / 280) ** 2, armY: 555,
    seam: [[235, 95], [255, 126], [275, 159], [295, 190], [315, 217], [335, 240], [355, 259], [375, 274], [395, 286], [415, 295], [435, 302], [455, 307], [475, 310], [495, 312], [515, 312], [535, 312], [555, 308]], edge: [[555, 318], [650, 290], [700, 281], [800, 268], [900, 258], [1100, 254], [1200, 252]] },
};
const hemDist = (p) => segDist(p, seg.hem);
{ // px per m: collar to hem down the centre line
  const nk = seg.neck.flat().filter((p) => Math.abs(body(p)[2]) < 0.02);
  const front = nk.sort((a, b) => body(b)[0] - body(a)[0])[0], back = nk.sort((a, b) => body(a)[0] - body(b)[0])[0];
  VIEW.F.s = (VIEW.F.hem(VIEW.F.cx) - VIEW.F.collar) / hemDist(front);
  VIEW.B.s = (VIEW.B.hem(VIEW.B.cx) - VIEW.B.collar) / hemDist(back);
  console.log('px/cm front', (VIEW.F.s / 100).toFixed(1), 'back', (VIEW.B.s / 100).toFixed(1));
}
// The views' hems curve (the back drops 3.3 cm at the centre). Follow that
// curve only within HEM_BLEND of the hem, so the art meets the hem but rows
// above it (the lower-back lettering) stay level instead of arching.
const HEM_BLEND = cm('HEM_BLEND', 5);
const ARM_YOKE = cm('ARM_YOKE', 3);
const toView = (v, a, hd) => { const V = VIEW[v], x = V.cx + (v === 'F' ? a : -a) * V.s, w = Math.max(0, 1 - hd / HEM_BLEND);
  return [x, V.hem(V.cx) + (V.hem(x) - V.hem(V.cx)) * w - hd * V.s]; };

// What a torso point is: 'art' (with view px), 'panel' (with panel coords) or 'yoke'.
function classify(p) {
  const b = body(p), { phi, aF, aB } = arc(b), hd = hemDist(p);
  const v = Math.abs(phi) < 90 ? 'F' : 'B', V = VIEW[v], [x, y] = toView(v, v === 'F' ? aF : aB, hd), half = Math.abs(x - V.cx);
  // The mockup's raglan seams meet its armpits 14 cm out, which on the model
  // is the arm crease; keep ARM_YOKE of shoulder pattern round each armhole
  // so the views' art stops short of the arm.
  const nearArm = () => segDist(p, seg['arm' + (b[2] > 0 ? 'l' : 'r')]) < ARM_YOKE;
  if (y < V.armY) return half > lerp(V.seam, y) || nearArm() ? { kind: 'yoke', b } : { kind: 'art', x, y, b };
  if (half <= lerp(V.edge, y)) return nearArm() ? { kind: 'yoke', b } : { kind: 'art', x, y, b };
  // Side panel: between the front view's edge and the back view's, in arc.
  const yF = toView('F', aF, hd)[1], yB = toView('B', aB, hd)[1];
  const eF = lerp(VIEW.F.edge, yF) / VIEW.F.s, eB = lerp(VIEW.B.edge, yB) / VIEW.B.s, H = Math.abs(aF) + Math.abs(aB);
  // The mockup draws its armpits higher up the torso than the model's, so
  // the views' edges reach above the model's armpit; a panel stops there.
  if (hd > hdArm) return { kind: 'yoke', b };
  return { kind: 'panel', side: b[2] > 0 ? 'l' : 'r', hd, c: Math.abs(aF) - (eF + H - eB) / 2, w: H - eB - eF, b };
}

// Side panels.
const hdArm = (hemDist(armpit.l) + hemDist(armpit.r)) / 2;
const PANEL = {};
for (const [s, name] of [['l', 'autumn'], ['r', 'winter']]) PANEL[s] = { bg: readPNG(`${work}/${name}-bg.png`), text: readPNG(`${work}/${name}-text.png`), logo: readPNG(`${work}/${name}-logo.png`), sgn: s === 'l' ? 1 : -1, read: s === 'l' ? -1 : 1 };
const TEXT_L = cm('TEXT_L', 15), TEXT_V = cm('TEXT_V', 14), LOGO_W = cm('LOGO_W', 4.5), LOGO_V = cm('LOGO_V', 3.2);
const premul = (o, c) => o[3] > 0 ? c.map((q, i) => q * (1 - o[3]) + o[i]) : c;
// The right panel's ground is the snowy shoulder pattern, continued from the
// shoulder (SNOW_PANEL=0 for the flat's own gradient).
const SNOW_PANEL = process.env.SNOW_PANEL !== '0';
function panelColour({ side, hd, c, w }, p, n) {
  const P = PANEL[side], bg = P.bg, fx = bg.width / 2 + Math.max(-0.5, Math.min(0.5, c / w)) * (bg.width - 12), fy = bg.height * (1 - Math.min(1, hd / hdArm));
  let o = rgbaAt(bg, fx, Math.max(0.5, Math.min(bg.height - 0.5, fy)));
  let k = P.text.width / TEXT_L, out = side === 'r' && SNOW_PANEL ? shoulder('r', p, n) : o.slice(0, 3).map((q) => q / o[3]);
  // Text reads up the right flank and down the left, tops toward the back,
  // so it is upright from either side when the rider is bent over.
  out = premul(rgbaAt(P.text, P.text.width / 2 + P.read * (hd - TEXT_V) * k, P.text.height / 2 - c * k), out);
  k = P.logo.width / LOGO_W;
  return premul(rgbaAt(P.logo, P.logo.width / 2 + P.sgn * c * k, P.logo.height / 2 - (hd - LOGO_V) * k), out);
}

// Shoulder patterns, each a ground with sprites scattered by Poisson disc
// (seeded) over that side's yoke and sleeve and projected flat at their
// points. Rider's left: navy and the autumn leaves. Rider's right: the
// second mockup's snowy nebula (tiled, mirrored, triplanar) with its stars
// and snowflakes at their drawn sizes.
let seed = env('SEED', 2026);
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cand = { l: [], r: [] };
for (let k = 0; k < N * N; k += 37) {
  if (sm.side[k]) cand[sm.side[k] === 1 ? 'l' : 'r'].push([[sm.wpos[k*3], sm.wpos[k*3+1], sm.wpos[k*3+2]], norm([sm.nrm[k*3], sm.nrm[k*3+1], sm.nrm[k*3+2]])]);
  else if (tm.on[k]) { const p = [tm.wpos[k*3], tm.wpos[k*3+1], tm.wpos[k*3+2]], c = classify(p); if (c.kind === 'yoke' || (SNOW_PANEL && c.kind === 'panel' && c.side === 'r')) cand[c.b[2] > 0 ? 'l' : 'r'].push([p, norm([tm.nrm[k*3], tm.nrm[k*3+1], tm.nrm[k*3+2]])]); }
}
const CELL = 0.03, cellKey = (p, d = [0, 0, 0]) => p.map((q, i) => Math.floor(q / CELL) + d[i]).join();
// -> grid of sprites; size(im) is a sprite's longest side in m.
function scatter(pts, ims, gap, size) {
  const grid = new Map(), list = [], c = pts.slice();
  grid.near = (p) => { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) out.push(...(grid.get(cellKey(p, [i, j, k])) || [])); return out; };
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  for (const [p, n] of c) {
    if (grid.near(p).some((l) => Math.hypot(...sub(l.P0, p)) < gap)) continue;
    const im = ims[Math.floor(rnd() * ims.length)], sz = size(im) * (0.8 + 0.4 * rnd()), th = rnd() * 2 * Math.PI;
    const t1 = norm(sub(U, scale(n, dot(U, n)))), t2 = cross(n, t1);
    const eu = t1.map((q, i) => q * Math.cos(th) + t2[i] * Math.sin(th)), ev0 = cross(eu, n), ev = rnd() < 0.5 ? ev0 : scale(ev0, -1);
    const l = { P0: p, n0: n, eu, ev, im, k: Math.max(im.width, im.height) / sz, i: list.length };
    list.push(l); const key = cellKey(p); grid.set(key, [...(grid.get(key) || []), l]);
  }
  grid.count = list.length;
  return grid;
}
const sheetOf = (file) => JSON.parse(readFileSync(`${work}/${file}`)).map((q) => ({ ...q, im: readPNG(`${work}/${q.file}`) }));
const SNOW_PX = env('SNOW_PX', 22) * 100; // px/m the snowy flat is drawn at (the views' scale)
const snow = sheetOf('snow.json');
const leaves = scatter(cand.l, sheetOf('leaves.json').map((q) => q.im), cm('LEAF_GAP', 2.9), () => cm('LEAF', 3.2));
const stars = scatter(cand.r, snow.filter((q) => !q.big).map((q) => q.im), cm('STAR_GAP', 1.1), (im) => Math.max(im.width, im.height) / SNOW_PX);
const flakes = scatter(cand.r, snow.filter((q) => q.big).map((q) => q.im), cm('FLAKE_GAP', 4.5), (im) => cm('FLAKE', 3.5) * Math.max(im.width, im.height) / 68);
console.log('leaves', leaves.count, 'stars', stars.count, 'flakes', flakes.count);
const nebula = readPNG(`${work}/snow-bg.png`);
const mirror = (t, n) => { const r = ((t % (2 * n)) + 2 * n) % (2 * n); return r < n ? r : 2 * n - r; };
function nebulaAt(p, n) {
  const b = body(p).map((q) => q * SNOW_PX), d = bodyDir(n).map((q) => q ** 4), sum = d[0] + d[1] + d[2], c = [0, 0, 0];
  for (const [w, x, y] of [[d[0], b[2], -b[1]], [d[1], b[0], b[2]], [d[2], b[0], -b[1]]]) {
    const o = rgbaAt(nebula, mirror(x, nebula.width - 1) + 0.5, mirror(y, nebula.height - 1) + 0.5);
    for (let i = 0; i < 3; i++) c[i] += w / sum * o[i] / o[3];
  }
  return c;
}
function stamp(grid, p, n, c, depth) {
  for (const l of grid.near(p).sort((a, b) => a.i - b.i)) {
    const rel = sub(p, l.P0); if (dot(n, l.n0) < 0.3 || Math.abs(dot(rel, l.n0)) > depth) continue;
    c = premul(rgbaAt(l.im, l.im.width / 2 + dot(rel, l.eu) * l.k, l.im.height / 2 + dot(rel, l.ev) * l.k), c);
  }
  return c;
}
const shoulder = (side, p, n) => side === 'l' ? stamp(leaves, p, n, col.navy, 0.015) : stamp(flakes, p, n, stamp(stars, p, n, nebulaAt(p, n), 0.01), 0.015);

function colour(q) {
  const { p, n } = q;
  if (segDist(p, seg.neck) < COLLAR) return col.collar;
  if (q.part !== 't') {
    if (segDist(p, seg['cuff' + q.part]) < CUFF) return q.part === 'l' ? col.cuffl : col.cuffr;
    return shoulder(q.part, p, n);
  }
  const k = classify(p);
  if (k.kind === 'yoke') return shoulder(k.b[2] > 0 ? 'l' : 'r', p, n);
  if (k.kind === 'panel') return panelColour(k, p, n);
  const o = rgbaAt(sheet, k.x, k.y);
  return o.slice(0, 3).map((v) => v / o[3]);
}
paint(colour, outPath);
