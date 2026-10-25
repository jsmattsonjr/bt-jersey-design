// Paint the whole atlas from a 3D colour function, in the pose from
// ../chrono/pose.mjs (default stopped). Supersampled 4x4 per texel; sleeve
// texels average only the triangle covering most of them, sliver triangles
// are coloured from their own 3D position, and islands bleed 4 px at seams
// (as in ../chrono/sleeves.mjs and torso.mjs).
//   colour({ part, p, n, loc, nl, x, y }) -> [r, g, b]
// part is 'l' or 'r' (sleeve islands, u < 0.31 is the left) or 't' (torso);
// p, n are posed world position and unit normal; loc, nl the same in the
// sleeve's upperArm bone frame; x, y atlas px.
import { readFileSync } from 'node:fs';
import { sleeveMap } from '../chrono/posmap.mjs';
import { torsoMap } from '../chrono/torsomap.mjs';
import { bleed, norm } from '../chrono/decal.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'src/png.js');
const { fillRegion } = await import(R + 'src/image.js');
const { templateMask } = await import(R + 'src/template.js');
const { Matrix3, Matrix4, Vector3 } = await import(R + 'vendor/three.module.js');

export const S = 512, SS = 4, N = S * SS;
export const sm = sleeveMap(S, SS), tm = torsoMap(S, SS);
export const rig = sm.rig, glb = sm.glb;
const invM = {}, rot = {};
for (const s of ['l', 'r']) { invM[s] = new Matrix4().copy(rig.bones.get(`upperArm.${s}`).matrixWorld).invert(); rot[s] = new Matrix3().setFromMatrix4(invM[s]); }
const v3 = new Vector3();
// The position maps split sleeve from torso at v 0.45, which files the front
// panel's two collar corners (triangles 841, 842, right of the sleeve
// islands) as the right sleeve; paint those as torso.
const sleevePt = (s, w, nw, x, y) => {
  if (x >= 320) return { part: 't', p: w, n: norm(nw), x, y };
  v3.set(...w).applyMatrix4(invM[s]); const loc = [v3.x, v3.y, v3.z];
  v3.set(...nw).applyMatrix3(rot[s]).normalize(); const nl = [v3.x, v3.y, v3.z];
  return { part: s, p: w, n: norm(nw), loc, nl, x, y };
};

export function paint(colour, outPath) {
  const rgb = new Float32Array(S * S * 3), cnt = new Float32Array(S * S);
  // Sleeves: vote for the triangle covering most of each texel (UV-area weighted).
  const J = rig.jerseyTris, U = glb.uv, P = sm.P, Nw = sm.N;
  const triUV = new Float32Array(J.length / 3);
  for (let t = 0; t < triUV.length; t++) { const [p, q, r] = [J[t*3], J[t*3+1], J[t*3+2]];
    triUV[t] = Math.max(1, Math.abs((U[q*2]-U[p*2])*(U[r*2+1]-U[p*2+1]) - (U[r*2]-U[p*2])*(U[q*2+1]-U[p*2+1])) / 2 * S * S); }
  const g3 = (a, k) => [a[k*3], a[k*3+1], a[k*3+2]];
  for (let ty = 0; ty < S; ty++) for (let tx = 0; tx < S; tx++) {
    const votes = new Map();
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const k = (ty*SS+j)*N + tx*SS+i; if (sm.side[k]) votes.set(sm.tri[k], (votes.get(sm.tri[k]) || 0) + 1 / triUV[sm.tri[k]]); }
    if (!votes.size) continue;
    const best = [...votes].sort((a, b) => b[1] - a[1])[0][0], t = ty*S + tx;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = (ty*SS+j)*N + tx*SS+i; if (!sm.side[k] || sm.tri[k] !== best) continue;
      const c = colour(sleevePt(sm.side[k] === 1 ? 'l' : 'r', g3(sm.wpos, k), g3(sm.nrm, k), (tx*SS+i+.5)/SS, (ty*SS+j+.5)/SS));
      rgb[t*3] += c[0]; rgb[t*3+1] += c[1]; rgb[t*3+2] += c[2]; cnt[t]++;
    }
  }
  // Slivers (UV altitude under 2.5 texels): each texel a sliver touches takes
  // the sliver's own colour at the middle of the overlap.
  const G = 8;
  for (let t = 0; t < J.length / 3; t++) {
    const vi = [J[t*3], J[t*3+1], J[t*3+2]], uv = vi.map((i) => [U[i*2]*S, U[i*2+1]*S]);
    if (Math.max(...uv.map((q) => q[1])) > 0.45 * S) continue;
    const area2 = Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1]) - (uv[2][0]-uv[0][0])*(uv[1][1]-uv[0][1]));
    const longest = Math.max(...[0,1,2].map((i) => Math.hypot(uv[(i+1)%3][0]-uv[i][0], uv[(i+1)%3][1]-uv[i][1])));
    if (!area2 || area2 / longest >= 2.5) continue;
    const sd = (uv[0][0]+uv[1][0]+uv[2][0]) / 3 < 0.31 * S ? 'l' : 'r';
    const x0 = Math.floor(Math.min(...uv.map((q) => q[0]))), x1 = Math.floor(Math.max(...uv.map((q) => q[0])));
    const y0 = Math.floor(Math.min(...uv.map((q) => q[1]))), y1 = Math.floor(Math.max(...uv.map((q) => q[1])));
    const bary = (x, y) => { const d = (uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0]) + (uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1]);
      const b0 = ((uv[1][1]-uv[2][1])*(x-uv[2][0]) + (uv[2][0]-uv[1][0])*(y-uv[2][1])) / d;
      const b1 = ((uv[2][1]-uv[0][1])*(x-uv[2][0]) + (uv[0][0]-uv[2][0])*(y-uv[2][1])) / d; return [b0, b1, 1 - b0 - b1]; };
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      let sx = 0, sy = 0, n = 0;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = tx + (i + .5) / G, y = ty + (j + .5) / G, b = bary(x, y); if (b.every((q) => q >= -1e-6)) { sx += x; sy += y; n++; } }
      if (!n) continue;
      const b = bary(sx / n, sy / n);
      const w = [0,1,2].map((c) => b[0]*P[vi[0]*3+c] + b[1]*P[vi[1]*3+c] + b[2]*P[vi[2]*3+c]);
      const nw = [0,1,2].map((c) => b[0]*Nw[vi[0]*3+c] + b[1]*Nw[vi[1]*3+c] + b[2]*Nw[vi[2]*3+c]);
      const c = colour(sleevePt(sd, w, nw, sx / n, sy / n)), k = ty*S + tx;
      rgb[k*3] = c[0]; rgb[k*3+1] = c[1]; rgb[k*3+2] = c[2]; cnt[k] = 1;
    }
  }
  // Torso.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y*N + x; if (!tm.on[k]) continue;
    const c = colour({ part: 't', p: g3(tm.wpos, k), n: norm(g3(tm.nrm, k)), x: (x+.5)/SS, y: (y+.5)/SS });
    const t = (y >> 2) * S + (x >> 2);
    rgb[t*3] += c[0]; rgb[t*3+1] += c[1]; rgb[t*3+2] += c[2]; cnt[t]++;
  }
  const known = new Uint8Array(S * S);
  for (let t = 0; t < S * S; t++) if (cnt[t]) { known[t] = 1; for (let c = 0; c < 3; c++) rgb[t*3+c] /= cnt[t]; }
  const tmask = templateMask(readPNG(R + 'assets/jersey-mask.png'), S);
  const region = new Uint8Array(S * S);
  for (let t = 32 * S; t < S * S; t++) region[t] = tmask[t];
  const dist = new Int8Array(S * S).fill(-1);
  for (const box of [[0, 32, 319, 224], [0, 225, S - 1, S - 1]]) {
    const d = bleed(rgb, known, S, box);
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (d[y*S+x] > 0) dist[y*S+x] = d[y*S+x];
  }
  for (let t = 0; t < S * S; t++) if (dist[t] > 0) { known[t] = 1; region[t] = 1; }
  fillRegion(rgb, known, region, S, S);
  const out = new Uint8ClampedArray(S * S * 4);
  for (let t = 0; t < S * S; t++) {
    const on = region[t] || known[t];
    for (let c = 0; c < 3; c++) out[t*4+c] = on ? Math.round(rgb[t*3+c]) : 0;
    out[t*4+3] = 255;
  }
  writePNG(outPath, { width: S, height: S, data: out });
}
