// Sanity checks on a finished jersey atlas: size, alpha, and which texels the
// rider actually draws (nearest sampling, rider_m bind pose).
//   node check.mjs ATLAS.png [--map OUT.png]
// --map writes a 512² overlay: drawn texels in the atlas's own colour, unused
// paint dimmed, and drawn texels outside the template in magenta.
import { readFileSync } from 'node:fs';
import { parseGLB } from './src/glb.js';
import { loadRig, templateMask } from './src/pipeline.js';
import { rasterTriangle } from './src/view.js';
import { readPNG, writePNG } from './test/png.js';

const args = process.argv.slice(2);
const mapAt = args.indexOf('--map');
const mapPath = mapAt >= 0 ? args.splice(mapAt, 2)[1] : null;
const path = args[0];
if (!path) { console.error('usage: node check.mjs ATLAS.png [--map OUT.png]'); process.exit(2); }
const R = new URL('./', import.meta.url).pathname;
const img = readPNG(path);
const S = 512;
const warn = [];
if (img.width !== img.height) warn.push(`not square (${img.width}×${img.height}): the site squashes it to 512²`);
else if (img.width !== S) warn.push(`${img.width}² is resampled to 512² by the site; nearest sampling then sees the resample`);

// Resample to 512 the way the checks need it (nearest; only matters off-size).
const px = new Uint8ClampedArray(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const sx = Math.floor((x + 0.5) * img.width / S), sy = Math.floor((y + 0.5) * img.height / S);
  px.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * S + x) * 4);
}

const buf = readFileSync(R + 'assets/rider_m.glb');
const glb = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const rig = loadRig(glb);
const UV = glb.uv, T = rig.jerseyTris;
// A texel is drawn if any 4×4 subsample of a jersey triangle lands in it.
const SS = 4, N = S * SS, drawn = new Uint8Array(S * S);
for (let t = 0; t < T.length; t += 3) {
  const [a, b, c] = [T[t], T[t + 1], T[t + 2]];
  rasterTriangle(UV[a*2]*N, UV[a*2+1]*N, UV[b*2]*N, UV[b*2+1]*N, UV[c*2]*N, UV[c*2+1]*N, N, N,
    (x, y) => { drawn[(y >> 2) * S + (x >> 2)] = 1; });
}
const tpl = readPNG(R + 'assets/jersey-mask.png');
const inTpl = templateMask(tpl, S); // island = transparent or bright

let nDrawn = 0, outside = 0, outsideDark = 0, translucent = 0, palette = 0;
const at = { translucent: [], outsideDark: [] }; // first few (x,y) of each
for (let k = 0; k < S * S; k++) {
  const y = Math.floor(k / S), [r, g, b, a] = px.subarray(k * 4, k * 4 + 4);
  if (y < 32) { if (r || g || b) palette++; continue; }
  if (!drawn[k]) continue;
  nDrawn++;
  if (a < 255) { translucent++; at.translucent.push(`(${k % S},${y})`); }
  if (!inTpl[k]) { outside++; if (r + g + b < 30) { outsideDark++; at.outsideDark.push(`(${k % S},${y})`); } }
}
console.log(`${path}: ${img.width}×${img.height}`);
console.log(`drawn texels ${nDrawn}; outside the template ${outside} (${outsideDark} of them near-black)`);
if (translucent) warn.push(`${translucent} drawn texels have alpha < 255, at ${at.translucent.slice(0, 5).join(' ')}`);
if (outsideDark) warn.push(`${outsideDark} drawn texels outside the template are near-black (front neckline V); paint them the neighbouring colour: ${at.outsideDark.slice(0, 5).join(' ')}`);
if (palette) console.log(`rows 0–31: ${palette} non-black px (the site repaints the palette cells over them; harmless)`);
for (const w of warn) console.log('! ' + w);

if (mapPath) {
  const out = new Uint8ClampedArray(S * S * 4);
  for (let k = 0; k < S * S; k++) {
    const c = px.subarray(k * 4, k * 4 + 3);
    const o = drawn[k] ? (inTpl[k] ? [...c] : [255, 0, 255]) : c.map((v) => v * 0.25);
    out.set([...o, 255], k * 4);
  }
  writePNG(mapPath, { width: S, height: S, data: out });
  console.log(`wrote ${mapPath}`);
}
process.exit(warn.length ? 1 : 0);
