// Sleeves: navy with a yellow cuff as a ring at a fixed distance along the
// upper-arm bone, and each sleeve's roundel projected flat along the surface
// normal at its centre, square to the arm. Supersampled 4x4 per texel;
// slivers and seams handled as in irn-bru-2/build.mjs.
//   node sleeves.mjs IN.png OUT.png WORKDIR
import { readFileSync } from 'node:fs';
import { sleeveMap } from './posmap.mjs';
import { frame, over, bleed, sub, dot, norm, cross } from './decal.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'test/png.js');
const { fillRegion } = await import(R + 'src/image.js');
const { templateMask } = await import(R + 'src/pipeline.js');
const { Matrix3, Matrix4, Vector3 } = await import(R + 'vendor/three.module.js');

const [,, inPath, outPath, work] = process.argv;
const CUFF = Number(process.env.CUFF || 0.186); // bone distance where the cuff starts (old one: 0.186 m)
const NAVY = [28, 46, 67], YELLOW = [253, 205, 47];
const img = readPNG(inPath), SS = 4, S = 512, N = S * SS;
const m = sleeveMap(S, SS);
const rot = {};
for (const s of ['l', 'r']) rot[s] = new Matrix3().setFromMatrix4(new Matrix4().copy(m.rig.bones.get(`upperArm.${s}`).matrixWorld).invert());
const nrmL = new Float32Array(N * N * 3), v = new Vector3();
for (let k = 0; k < N * N; k++) if (m.side[k]) {
  v.set(m.nrm[k*3], m.nrm[k*3+1], m.nrm[k*3+2]).applyMatrix3(rot[m.side[k] === 1 ? 'l' : 'r']).normalize();
  nrmL.set([v.x, v.y, v.z], k * 3);
}
// Roundels: Layer 5 on the left sleeve (u < 0.31), Layer 4 on the right.
const all = JSON.parse(readFileSync(work + '/layers.json'));
const logos = {};
for (const [side, name] of [[1, 'Layer5'], [2, 'Layer4']]) {
  const l = { ...all.find((q) => q.file === name + '.png') }; l.im = readPNG(work + '/' + l.file);
  const at = (x, y) => { const k = Math.round(y * SS) * N + Math.round(x * SS); return m.side[k] === side ? { p: [0,1,2].map((i) => m.loc[k*3+i]), n: [0,1,2].map((i) => nrmL[k*3+i]) } : null; };
  l.f = frame(at, l, [0, -1, 0]); // up = toward the shoulder
  console.log(name, l.f.info);
  // OUTSIDE (default on): move the roundel round the arm, at the same distance
  // along the bone, to the point whose normal faces most directly outward
  // (world -z for the left arm, +z for the right), keeping its size and its
  // orientation relative to the arm.
  if (process.env.OUTSIDE !== '0') {
    const r = rot[side === 1 ? 'l' : 'r'], lat = new Vector3(0, 0, side === 1 ? -1 : 1).applyMatrix3(r);
    const lxz = norm([lat.x, 0, lat.z]), f = l.f;
    let best = null, bs = -2;
    for (let k = 0; k < N * N; k += 1) {
      if (m.side[k] !== side || Math.abs(m.loc[k*3+1] - f.P0[1]) > 0.002) continue;
      const s = dot(norm([nrmL[k*3], 0, nrmL[k*3+2]]), lxz); if (s > bs) { bs = s; best = k; }
    }
    const P0 = [0,1,2].map((i) => m.loc[best*3+i]), n0 = norm([0,1,2].map((i) => nrmL[best*3+i]));
    const tan = (d, n) => norm(sub(d, n.map((q) => q * dot(d, n))));
    const u0 = tan([0, -1, 0], f.n0), r0 = cross(u0, f.n0), u1 = tan([0, -1, 0], n0), r1 = cross(u1, n0);
    const carry = (e) => [0,1,2].map((i) => dot(e, u0) * u1[i] + dot(e, r0) * r1[i]);
    const ang = (a, b) => (Math.atan2(dot(cross(a, b), [0, 1, 0]), dot(a, b) - a[1]*b[1]) * 180 / Math.PI).toFixed(0);
    l.f = { ...f, P0, n0, eu: carry(f.eu), ev: carry(f.ev) };
    console.log(name, `moved ${ang([f.P0[0], 0, f.P0[2]], [P0[0], 0, P0[2]])} deg round the arm to atlas (${(best % N / SS).toFixed(0)}, ${(Math.floor(best / N) / SS).toFixed(0)}); normal·outward ${bs.toFixed(3)}`);
  }
  logos[side] = l;
}
const colourAt = (side, p, n) => over(p[1] > CUFF ? YELLOW : NAVY, logos[side], p, n, 0.04);

const rgb = new Float32Array(S * S * 3), cnt = new Float32Array(S * S), sub4 = new Float32Array(N * N * 3);
for (let k = 0; k < N * N; k++) {
  const side = m.side[k]; if (!side) continue;
  sub4.set(colourAt(side, [m.loc[k*3], m.loc[k*3+1], m.loc[k*3+2]], [nrmL[k*3], nrmL[k*3+1], nrmL[k*3+2]]), k * 3);
}
// Each texel averages only the subsamples of the triangle covering most of
// it (by UV-area-weighted vote): at a UV discontinuity a blend is wrong for both.
const triUV = (() => { const J = m.rig.jerseyTris, U = m.glb.uv, a = new Float32Array(J.length / 3);
  for (let t = 0; t < a.length; t++) { const [p, q, r] = [J[t*3], J[t*3+1], J[t*3+2]];
    a[t] = Math.max(1, Math.abs((U[q*2]-U[p*2])*(U[r*2+1]-U[p*2+1]) - (U[r*2]-U[p*2])*(U[q*2+1]-U[p*2+1])) / 2 * S * S); }
  return a; })();
for (let ty = 0; ty < S; ty++) for (let tx = 0; tx < S; tx++) {
  const votes = new Map();
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const k = (ty*SS+j)*N + tx*SS+i; if (m.side[k]) votes.set(m.tri[k], (votes.get(m.tri[k]) || 0) + 1 / triUV[m.tri[k]]); }
  if (!votes.size) continue;
  const best = [...votes].sort((a, b) => b[1] - a[1])[0][0], t = ty*S + tx;
  for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
    const k = (ty*SS+j)*N + tx*SS+i; if (!m.side[k] || m.tri[k] !== best) continue;
    rgb[t*3] += sub4[k*3]; rgb[t*3+1] += sub4[k*3+1]; rgb[t*3+2] += sub4[k*3+2]; cnt[t]++;
  }
}
// Slivers (UV altitude under 2.5 texels): each texel a sliver touches takes
// the sliver's own colour at the middle of the overlap.
{
  const J = m.rig.jerseyTris, U = m.glb.uv, P = m.P, Nw = m.N, G = 8;
  const invM = {}, rot3 = {};
  for (const sd of ['l', 'r']) { invM[sd] = new Matrix4().copy(m.rig.bones.get(`upperArm.${sd}`).matrixWorld).invert(); rot3[sd] = new Matrix3().setFromMatrix4(invM[sd]); }
  let nSliver = 0, nTex = 0;
  for (let t = 0; t < J.length / 3; t++) {
    const vi = [J[t*3], J[t*3+1], J[t*3+2]], uv = vi.map((i) => [U[i*2]*S, U[i*2+1]*S]);
    if (Math.max(...uv.map((q) => q[1])) > 0.45 * S) continue;
    const area2 = Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1]) - (uv[2][0]-uv[0][0])*(uv[1][1]-uv[0][1]));
    const longest = Math.max(...[0,1,2].map((i) => Math.hypot(uv[(i+1)%3][0]-uv[i][0], uv[(i+1)%3][1]-uv[i][1])));
    if (!area2 || area2 / longest >= 2.5) continue;
    nSliver++;
    const sd = (uv[0][0]+uv[1][0]+uv[2][0]) / 3 < 0.31 * S ? 'l' : 'r', side = sd === 'l' ? 1 : 2;
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
      const pl = new Vector3(...w).applyMatrix4(invM[sd]), nl = new Vector3(...nw).applyMatrix3(rot3[sd]).normalize();
      const c = colourAt(side, [pl.x, pl.y, pl.z], [nl.x, nl.y, nl.z]), k = ty*S + tx;
      rgb[k*3] = c[0]; rgb[k*3+1] = c[1]; rgb[k*3+2] = c[2]; cnt[k] = 1; nTex++;
    }
  }
  console.error(`slivers ${nSliver}, texels ${nTex}`);
}
const known = new Uint8Array(S * S);
for (let t = 0; t < S * S; t++) if (cnt[t]) { known[t] = 1; for (let c = 0; c < 3; c++) rgb[t*3+c] /= cnt[t]; }
const tm = templateMask(readPNG(R + 'assets/jersey-mask.png'), S);
const region = new Uint8Array(S * S);
for (let y = 32; y < 225; y++) for (let x = 0; x < 320; x++) region[y*S+x] = tm[y*S+x];
const dist = bleed(rgb, known, S, [0, 32, 319, 224]);
for (let t = 0; t < S * S; t++) if (dist[t] > 0) { known[t] = 1; region[t] = 1; }
fillRegion(rgb, known, region, S, S);
const out = Uint8ClampedArray.from(img.data);
for (let t = 0; t < S * S; t++) if (region[t]) { for (let c = 0; c < 3; c++) out[t*4+c] = Math.round(rgb[t*3+c]); out[t*4+3] = 255; }
writePNG(outPath, { width: S, height: S, data: out });
