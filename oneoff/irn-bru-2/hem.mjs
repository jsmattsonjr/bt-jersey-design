// Hem stripe: white within W of the hem edge (3D distance to the mesh's
// bottom boundary, bind pose), orange from there up to a repaint window;
// the torso art (minus the old hem stripe layers) composited back on top.
import { readFileSync } from 'node:fs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { parseGLB } = await import(R + 'src/glb.js');
const { loadRig, templateMask } = await import(R + 'src/pipeline.js');
const { rasterTriangle } = await import(R + 'src/view.js');
const { readPNG, writePNG } = await import(R + 'test/png.js');
const [,, inPath, outPath, artPath] = process.argv;
const W = Number(process.env.W || 0.0118), WIN = 0.03;
const ORANGE = [245, 125, 25], WHITE = [255, 255, 255];
const img = readPNG(inPath), art = readPNG(artPath);
const buf = readFileSync(R + 'assets/rider_m.glb');
const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const rig = loadRig(glb); rig.reset();
const { position: P } = rig.skin();
const UV = glb.uv, T = rig.jerseyTris, S = 512, SS = 4, N = S * SS;
// Bottom boundary: edges of torso triangles used once (by position, since
// UV seams split vertices), both ends low in the atlas.
const key = (i) => [0,1,2].map((c) => P[i*3+c].toFixed(5)).join();
const edges = new Map();
for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = T[t+e], b = T[t+(e+1)%3];
  if (UV[a*2+1] < 0.9 || UV[b*2+1] < 0.9) continue;
  const ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
  const o = edges.get(k); edges.set(k, o ? { ...o, n: o.n + 1 } : { a, b, n: 1 });
}
// Also count uses by all jersey triangles, not just low ones.
for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = T[t+e], b = T[t+(e+1)%3]; if (UV[a*2+1] >= 0.9 && UV[b*2+1] >= 0.9) continue;
  const ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (edges.has(k)) edges.get(k).n++;
}
const segs = [...edges.values()].filter((e) => e.n === 1).map(({ a, b }) => [[P[a*3], P[a*3+1], P[a*3+2]], [P[b*3], P[b*3+1], P[b*3+2]]])
  .filter(([p, q]) => Math.abs(p[1] - q[1]) < 0.02); // hem runs round the body, not up the side seams
console.error('hem segments', segs.length);
function hemDist(p) {
  let best = 1e9;
  for (const [a, b] of segs) {
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], ap = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
    const t = Math.max(0, Math.min(1, (ab[0]*ap[0]+ab[1]*ap[1]+ab[2]*ap[2]) / (ab[0]**2+ab[1]**2+ab[2]**2)));
    best = Math.min(best, Math.hypot(ap[0]-t*ab[0], ap[1]-t*ab[1], ap[2]-t*ab[2]));
  }
  return best;
}
const rgb = new Float32Array(S*S*3), cnt = new Uint16Array(S*S);
for (let t = 0; t < T.length; t += 3) {
  const a = T[t], b = T[t+1], c = T[t+2];
  if (Math.max(UV[a*2+1], UV[b*2+1], UV[c*2+1]) < 0.85) continue;
  rasterTriangle(UV[a*2]*N, UV[a*2+1]*N, UV[b*2]*N, UV[b*2+1]*N, UV[c*2]*N, UV[c*2+1]*N, N, N, (x, y, b0, b1, b2) => {
    const p = [0,1,2].map((i) => b0*P[a*3+i] + b1*P[b*3+i] + b2*P[c*3+i]);
    const d = hemDist(p); if (d > WIN) return;
    const col = d < W ? WHITE : ORANGE, k = (y >> 2) * S + (x >> 2);
    rgb[k*3] += col[0]; rgb[k*3+1] += col[1]; rgb[k*3+2] += col[2]; cnt[k]++;
  });
}
// Bleed into uncovered template texels below/beside: nearest repainted texel in the column, then row.
const tm = templateMask(readPNG(R + 'assets/jersey-mask.png'), S);
for (let y = 470; y < S; y++) for (let x = 0; x < S; x++) {
  const t = y*S + x; if (cnt[t] || !tm[t]) continue;
  for (let d = 1; d < 10; d++) {
    const src = [(y - d)*S + x, y*S + x - d, y*S + x + d].find((q) => q >= 0 && q < S*S && cnt[q] >= SS*SS);
    if (src === undefined) continue;
    for (let c = 0; c < 3; c++) rgb[t*3+c] = rgb[src*3+c] / cnt[src];
    cnt[t] = 1; break;
  }
}
const out = Uint8ClampedArray.from(img.data);
for (let t = 0; t < S*S; t++) {
  if (!cnt[t]) continue;
  const n = cnt[t];
  for (let c = 0; c < 3; c++) { const a = art.data[t*4+3] / 255; out[t*4+c] = Math.round((rgb[t*3+c] / n) * (1 - a) + art.data[t*4+c] * a); }
}
writePNG(outPath, { width: S, height: S, data: out });
