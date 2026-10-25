// Torso: navy with a yellow hem stripe within W of the hem edge (3D distance
// to the mesh's bottom boundary), then every torso art layer projected flat
// along the surface normal at its old centre, square to the torso's axis
// (spine.1 to spine.3; TORSO_UP=world for world up), at its old 3D size,
// composited in PSD order. All in the pose from pose.mjs (default stopped).
// Supersampled 4x4 per texel.
//   node torso.mjs IN.png OUT.png WORKDIR
import { readFileSync } from 'node:fs';
import { torsoMap } from './torsomap.mjs';
import { frame, over, bleed, norm, sub } from './decal.mjs';
import { posed, at as boneAt } from './pose.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { parseGLB } = await import(R + 'src/glb.js');
const { loadRig } = await import(R + 'src/rig.js');
const { templateMask } = await import(R + 'src/template.js');
const { fillRegion } = await import(R + 'src/image.js');
const { readPNG, writePNG } = await import(R + 'src/png.js');

const [,, inPath, outPath, work] = process.argv;
const NAVY = [28, 46, 67], YELLOW = [253, 205, 47];
const SPLIT = 295; // atlas x between the back island (wraps the flanks) and the front
const img = readPNG(inPath), S = 512, SS = 4, N = S * SS, m = torsoMap(S, SS);

// Hem boundary: torso edges used by exactly one triangle (keyed by position,
// since UV seams split vertices), low in the atlas and running round the body.
const buf = readFileSync(R + 'assets/rider_m.glb');
const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const rig = loadRig(glb); posed(rig);
const { position: P } = rig.skin();
const UV = glb.uv, T = rig.jerseyTris;
const key = (i) => [0,1,2].map((c) => P[i*3+c].toFixed(5)).join();
const edges = new Map();
for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = T[t+e], b = T[t+(e+1)%3], ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
  const o = edges.get(k); edges.set(k, o ? { ...o, n: o.n + 1 } : { a, b, n: 1, low: UV[a*2+1] >= 0.9 && UV[b*2+1] >= 0.9 });
}
const segs = [...edges.values()].filter((e) => e.n === 1 && e.low).map(({ a, b }) => [[P[a*3], P[a*3+1], P[a*3+2]], [P[b*3], P[b*3+1], P[b*3+2]]])
  .filter(([p, q]) => Math.abs(p[1] - q[1]) < 0.02);
function hemDist(p) {
  let best = 1e9;
  for (const [a, b] of segs) {
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], ap = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
    const t = Math.max(0, Math.min(1, (ab[0]*ap[0]+ab[1]*ap[1]+ab[2]*ap[2]) / (ab[0]**2+ab[1]**2+ab[2]**2)));
    best = Math.min(best, Math.hypot(ap[0]-t*ab[0], ap[1]-t*ab[1], ap[2]-t*ab[2]));
  }
  return best;
}
// Old hem stripe width: where yellow.png's yellow ends, in 3D distance from the hem.
const yel = readPNG(work + '/yellow.png'), HEMV = Math.floor(0.85 * N);
let W = Number(process.env.W || 0);
if (!W) {
  const dy = [], dn = [];
  for (let y = HEMV; y < N; y += SS) for (let x = 0; x < N; x += SS) {
    const k = y*N + x; if (!m.on[k]) continue;
    const d = hemDist([m.wpos[k*3], m.wpos[k*3+1], m.wpos[k*3+2]]); if (d > 0.04) continue;
    (yel.data[((y >> 2)*S + (x >> 2))*4+3] > 128 ? dy : dn).push(d);
  }
  dy.sort((a, b) => a - b); dn.sort((a, b) => a - b);
  W = (dy[Math.floor(0.95 * dy.length)] + dn[Math.floor(0.05 * dn.length)]) / 2;
  console.log('hem: yellow 95%', dy[Math.floor(0.95 * dy.length)].toFixed(4), 'navy 5%', dn[Math.floor(0.05 * dn.length)].toFixed(4));
}
console.log('hem stripe W', (W * 100).toFixed(2), 'cm');

// Art "up": the torso's axis in this pose, so the art sits square to the body.
const UP = process.env.TORSO_UP === 'world' ? [0, 1, 0] : norm(sub(boneAt(rig, 'spine.3'), boneAt(rig, 'spine.1')));
console.log('art up', UP.map((q) => q.toFixed(3)).join(','));
// Art layers on the torso, in PSD order, each confined to its own island.
const layers = JSON.parse(readFileSync(work + '/layers.json')).filter((l) => l.y > 225).map((l) => ({ ...l, im: readPNG(work + '/' + l.file), back: l.x + l.w / 2 < SPLIT }));
for (const l of layers) {
  const at = (x, y) => { if ((x < SPLIT) !== l.back) return null; const k = Math.round(y*SS)*N + Math.round(x*SS); return m.on[k] ? { p: [0,1,2].map((i) => m.wpos[k*3+i]), n: norm([0,1,2].map((i) => m.nrm[k*3+i])) } : null; };
  l.f = frame(at, l, UP);
  console.log(l.name, l.back ? 'back ' : 'front', l.f.info);
}

const rgb = new Float32Array(S*S*3), cnt = new Uint16Array(S*S);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const k = y*N + x; if (!m.on[k]) continue;
  const p = [m.wpos[k*3], m.wpos[k*3+1], m.wpos[k*3+2]], n = norm([m.nrm[k*3], m.nrm[k*3+1], m.nrm[k*3+2]]);
  let c = y >= HEMV && hemDist(p) < W ? YELLOW : NAVY;
  const back = x < SPLIT * SS;
  for (const l of layers) if (l.back === back) c = over(c, l, p, n);
  const t = (y >> 2) * S + (x >> 2);
  rgb[t*3] += c[0]; rgb[t*3+1] += c[1]; rgb[t*3+2] += c[2]; cnt[t]++;
}
const known = new Uint8Array(S*S);
for (let t = 0; t < S*S; t++) if (cnt[t]) { known[t] = 1; for (let c = 0; c < 3; c++) rgb[t*3+c] /= cnt[t]; }
const tm = templateMask(readPNG(R + 'assets/jersey-mask.png'), S);
const region = new Uint8Array(S*S);
for (let y = 225; y < S; y++) for (let x = 0; x < S; x++) region[y*S+x] = tm[y*S+x];
const dist = bleed(rgb, known, S, [0, 225, S - 1, S - 1]);
for (let t = 0; t < S*S; t++) if (dist[t] > 0) { known[t] = 1; region[t] = 1; }
fillRegion(rgb, known, region, S, S);
const out = Uint8ClampedArray.from(img.data);
for (let t = 0; t < S*S; t++) if (region[t] || known[t]) { for (let c = 0; c < 3; c++) out[t*4+c] = Math.round(rgb[t*3+c]); out[t*4+3] = 255; }
writePNG(outPath, { width: S, height: S, data: out });
