// Repaint the sleeve islands from 3D: cuff/stripe/blue bands as rings at a
// fixed distance along the upper-arm bone, and the logo projected flat along
// the surface normal at its centre. Supersampled 4x per texel.
import { sleeveMap } from './posmap.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'test/png.js');
const { fillRegion } = await import(R + 'src/image.js');
const { templateMask } = await import(R + 'src/pipeline.js');
const { Matrix3, Matrix4, Vector3 } = await import(R + 'vendor/three.module.js');

const [,, inPath, outPath, logoPath] = process.argv;
const STRIPE = Number(process.env.STRIPE || 0.153), HALF = Number(process.env.HALF || 0.004);
const LOGO_CM = Number(process.env.LOGO_CM || 8.1);
const ORANGE = [245, 125, 25], BLUE = [10, 85, 195], WHITE = [255, 255, 255];

const img = readPNG(inPath), logo = readPNG(logoPath);
const SS = 4, S = 512, N = S * SS;
const m = sleeveMap(S, SS);
// local normals
const nrmL = new Float32Array(N * N * 3);
const rot = {};
for (const s of ['l', 'r']) rot[s] = new Matrix3().setFromMatrix4(new Matrix4().copy(m.rig.bones.get(`upperArm.${s}`).matrixWorld).invert());
const v = new Vector3();
for (let k = 0; k < N * N; k++) if (m.side[k]) {
  v.set(m.nrm[k*3], m.nrm[k*3+1], m.nrm[k*3+2]).applyMatrix3(rot[m.side[k] === 1 ? 'l' : 'r']).normalize();
  nrmL.set([v.x, v.y, v.z], k * 3);
}
const L = (x, y) => { const k = Math.round(y * SS) * N + Math.round(x * SS); if (!m.side[k]) throw new Error(`no surface at ${x},${y}`); return [0,1,2].map(i => m.loc[k*3+i]); };
const sub = (a, b) => a.map((q, i) => q - b[i]), dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map(q => q / l); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

// Logo frames: centres from the PSD layers 17/18 (bbox centres), axes from
// the UV directions there, so orientation and handedness match the old art.
const frames = {};
for (const [side, cx, cy] of [[1, 98, 147], [2, 221, 147]]) {
  // Up = toward the shoulder (bone -y) in the tangent plane; right = up x n,
  // so the logo reads unmirrored from outside the arm.
  const P0 = L(cx, cy), k0 = Math.round(cy*SS)*N + Math.round(cx*SS);
  const n0 = norm([nrmL[k0*3], nrmL[k0*3+1], nrmL[k0*3+2]]);
  const ax = [0, -1, 0], up = norm(sub(ax, n0.map(q => q * dot(ax, n0))));
  frames[side] = { P0, eu: cross(up, n0), ev: up.map(q => -q), n0 };
  // Logo x along up, y along +/-right: the left one is the base rotated 90 deg
  // clockwise (seen from outside); the right one mirrored and turned the other way.
  const R = cross(up, n0);
  frames[side].eu = up;
  frames[side].ev = side === 1 ? R : R.map(q => -q);
}
const pxPerM = logo.width / (LOGO_CM / 100);
const DIL = Number(process.env.DIL || 0); // fatten lines: max alpha over a ring of this radius (logo px)
function logoAlpha(lx, ly) { let m = logoAlpha1(lx, ly); if (DIL) for (let i = 0; i < 8; i++) m = Math.max(m, logoAlpha1(lx + DIL * Math.cos(i * Math.PI / 4), ly + DIL * Math.sin(i * Math.PI / 4))); return m; }
function logoAlpha1(lx, ly) { // bilinear alpha of the white logo
  const fx = lx - 0.5, fy = ly - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = (x, y) => (x < 0 || y < 0 || x >= logo.width || y >= logo.height) ? 0 : logo.data[(y * logo.width + x) * 4 + 3] / 255;
  return (a(x0, y0) * (1 - tx) + a(x0 + 1, y0) * tx) * (1 - ty) + (a(x0, y0 + 1) * (1 - tx) + a(x0 + 1, y0 + 1) * tx) * ty;
}

const BOOST = Number(process.env.BOOST || 1);
// Colour of the sleeve at bone-local point p with normal n: band by distance
// along the arm, then the logo projected flat along its centre normal.
function colourAt(side, p, n) {
  const a = p[1];
  let c = a > STRIPE + HALF ? ORANGE : a < STRIPE - HALF ? BLUE : WHITE;
  const f = frames[side], rel = sub(p, f.P0);
  if (dot(n, f.n0) > 0.2 && Math.abs(dot(rel, f.n0)) < 0.04) {
    const al = logoAlpha(logo.width / 2 + dot(rel, f.eu) * pxPerM, logo.height / 2 + dot(rel, f.ev) * pxPerM);
    if (al > 0) { const b = Math.min(1, al * BOOST); c = c.map((q, i) => q * (1 - b) + 255 * b); }
  }
  return c;
}
const rgb = new Float32Array(S * S * 3), cnt = new Float32Array(S * S), sub4 = new Float32Array(N * N * 3);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const k = y * N + x, side = m.side[k];
  if (!side) continue;
  const c = colourAt(side, [m.loc[k*3], m.loc[k*3+1], m.loc[k*3+2]], [nrmL[k*3], nrmL[k*3+1], nrmL[k*3+2]]);
  sub4[k*3] = c[0]; sub4[k*3+1] = c[1]; sub4[k*3+2] = c[2];
}
// UV area (texels) of each jersey triangle: a sliver stretches every texel
// it reads, so shared texels go to the smallest triangle touching them.
const triUV = (() => { const J = m.rig.jerseyTris, U = m.glb.uv, a = new Float32Array(J.length / 3);
  for (let t = 0; t < a.length; t++) { const [p, q, r] = [J[t*3], J[t*3+1], J[t*3+2]];
    a[t] = Math.max(1, Math.abs((U[q*2]-U[p*2])*(U[r*2+1]-U[p*2+1]) - (U[r*2]-U[p*2])*(U[q*2+1]-U[p*2+1])) / 2 * S * S); }
  return a; })();
// Each texel averages only the subsamples of the triangle covering most of
// it: at a UV discontinuity, a blend of both sides is wrong for both.
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
// Slivers (UV altitude under 2.5 texels) magnify every texel they touch, and
// nearest sampling reads a texel if any part of it lies inside. Each texel a
// sliver touches takes the sliver's own colour at the middle of the overlap.
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
// Region: the template's sleeve islands (top band), filled where no triangle reached.
const tpl = readPNG(R + 'assets/jersey-mask.png'), tm = templateMask(tpl, S);
const region = new Uint8Array(S * S);
for (let y = 32; y < 225; y++) for (let x = 0; x < 320; x++) region[y*S+x] = tm[y*S+x];
// Bleed: texels within 4 px of the surface copy the nearest covered texel
// (template or not; stale paint there leaks in at seams under nearest
// sampling). Only then fill the rest of the template islands smoothly.
{
  let front = []; const dist = new Int8Array(S * S).fill(-1);
  for (let t = 0; t < S * S; t++) if (known[t]) { dist[t] = 0; front.push(t); }
  for (let d = 1; d <= 4; d++) {
    const next = [];
    for (const t of front) {
      const x = t % S, y = (t / S) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 32 || X >= 320 || Y > 224) continue;
        const u = Y * S + X; if (dist[u] >= 0) continue;
        dist[u] = d; for (let c = 0; c < 3; c++) rgb[u*3+c] = rgb[t*3+c]; next.push(u);
      }
    }
    front = next;
  }
  for (let t = 0; t < S * S; t++) if (dist[t] > 0) { known[t] = 1; region[t] = 1; }
}
fillRegion(rgb, known, region, S, S);
const out = Uint8ClampedArray.from(img.data);
for (let t = 0; t < S * S; t++) if (region[t]) { for (let c = 0; c < 3; c++) out[t*4+c] = Math.round(rgb[t*3+c]); out[t*4+3] = 255; }
writePNG(outPath, { width: S, height: S, data: out });
console.log('frames', JSON.stringify(frames, (k, q) => typeof q === 'number' ? +q.toFixed(4) : q));
