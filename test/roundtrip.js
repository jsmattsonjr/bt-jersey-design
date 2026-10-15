// Round trip: texture the posed rider with a known atlas, render the front
// and back as a "mockup", project that back onto the UV map, and compare
// with the atlas we started from. This exercises segmentation, landmarks,
// the warp, visibility and the bake, with no real-world alignment error.
//
//   node test/roundtrip.js [atlas.png] [outdir]
//
// VIEW_WIDTH sets the render size (default 1600; coarser renders blur thin
// lines, which reads as error). IDENTITY=1 skips segmentation and alignment
// and samples the render directly, to tell bake error from alignment error.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGLB } from '../src/glb.js';
import { rasterTriangle } from '../src/view.js';
import { segment } from '../src/segment.js';
import { loadRig, modelViews, mockupView, align, bake, finish, templateMask, exportAtlas } from '../src/pipeline.js';
import { toFloat, sample, toBytes } from '../src/image.js';
import { readPNG, writePNG } from './png.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const atlasPath = process.argv[2] || join(root, '../../../design/jerseys/uv-straightness-guide.png');
const outDir = process.argv[3] || null;
if (outDir) mkdirSync(outDir, { recursive: true });

const buf = readFileSync(join(root, 'assets/rider_m.glb'));
const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const rig = loadRig(glb);
const atlas = readPNG(atlasPath);
const tpl = readPNG(join(root, 'assets/jersey-mask.png'));
const atlasRGB = toFloat(atlas.data, atlas.width, atlas.height);

const SIZE = 1024;
const { posed, views } = modelViews(rig, { armDeg: 30, width: Number(process.env.VIEW_WIDTH || 1600) });

// Render a view of the textured rider onto a plain backdrop, padded so the
// jersey does not touch the image edge.
function render(view, pad = 40) {
  const W = view.W + 2 * pad, H = view.H + 2 * pad;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([46, 46, 50, 255], i * 4);
  const { position: P } = posed, UV = glb.uv, T = rig.jerseyTris, col = [0, 0, 0];
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]];
    const p = v.map((i) => view.project(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
    rasterTriangle(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], view.W, view.H, (x, y, b0, b1, b2) => {
      const d = b0 * p[0][2] + b1 * p[1][2] + b2 * p[2][2];
      if (d < view.depth[y * view.W + x] - 1e-5) return;
      const u = b0 * UV[v[0] * 2] + b1 * UV[v[1] * 2] + b2 * UV[v[2] * 2];
      const w = b0 * UV[v[0] * 2 + 1] + b1 * UV[v[1] * 2 + 1] + b2 * UV[v[2] * 2 + 1];
      sample(atlasRGB, atlas.width, atlas.height, u * atlas.width, w * atlas.height, col);
      const k = ((y + pad) * W + x + pad) * 4;
      data[k] = col[0]; data[k + 1] = col[1]; data[k + 2] = col[2];
    });
  }
  return { width: W, height: H, data };
}

const layers = [];
for (const name of ['front', 'back']) {
  const img = render(views[name]);
  if (outDir) writePNG(join(outDir, `mockup_${name}.png`), img);
  const fg = segment(img);
  const mock = mockupView(img, { x: 0, y: 0, w: img.width, h: img.height }, fg);
  const map = process.env.IDENTITY ? (x, y) => [x + 40, y + 40] : align(views[name], mock);
  layers.push({ view: views[name], map, mock });
}

console.time('bake');
const baked = bake(rig, posed, layers, { size: SIZE });
console.timeEnd('bake');
const tplMask = templateMask(tpl, SIZE);

// Compare seen texels with the atlas, away from the island edges (a texel
// whose 3x3 neighbourhood is not all seen sits on a silhouette or a seam).
let n = 0, sum = 0, bad = 0;
const ref = [0, 0, 0];
for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
  const k = y * SIZE + x;
  if (!baked.known[k]) continue;
  let interior = true;
  for (let dy = -1; dy <= 1 && interior; dy++) for (let dx = -1; dx <= 1; dx++) if (!baked.known[k + dy * SIZE + dx]) { interior = false; break; }
  if (!interior) continue;
  sample(atlasRGB, atlas.width, atlas.height, ((x + 0.5) * atlas.width) / SIZE, ((y + 0.5) * atlas.height) / SIZE, ref);
  const e = (Math.abs(baked.rgb[k * 3] - ref[0]) + Math.abs(baked.rgb[k * 3 + 1] - ref[1]) + Math.abs(baked.rgb[k * 3 + 2] - ref[2])) / 3;
  sum += e; n++;
  if (e > 40) bad++;
}
const covered = baked.covered.reduce((a, b) => a + b, 0);
const seen = baked.known.reduce((a, b) => a + b, 0);
console.log(`texels: covered ${covered}, seen ${seen} (${((100 * seen) / covered).toFixed(1)}%), interior compared ${n}`);
console.log(`mean abs error ${(sum / n).toFixed(2)} levels; over 40 levels: ${((100 * bad) / n).toFixed(2)}%`);

if (outDir) {
  writePNG(join(outDir, 'baked_raw.png'), { width: SIZE, height: SIZE, data: toBytes(baked.rgb, SIZE, SIZE, baked.known) });
  const rgb = finish(baked, tplMask);
  writePNG(join(outDir, 'atlas.png'), exportAtlas(rgb, SIZE, tpl));
}
const ok = sum / n < 12 && bad / n < 0.02;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
