// Level the torso chest stripe: blue above, white band, orange below, by
// bind-pose height (the torso is upright in the bind pose), within a window
// around the old stripe; art layers from the PSD composited back on top.
import { torsoMap } from './torsomap.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'src/png.js');
const [,, inPath, outPath, artPath, textPath] = process.argv;
const ORANGE = [245, 125, 25], BLUE = [10, 85, 195], WHITE = [255, 255, 255];
const img = readPNG(inPath), art = readPNG(artPath), text = textPath ? readPNG(textPath) : null;
const S = 512, SS = 4, N = S * SS, m = torsoMap(S, SS);
const H = (x, y) => { const k = Math.round(y*SS)*N + Math.round(x*SS); return m.on[k] ? m.wpos[k*3+1] : NaN; };
// Old stripe: rows 359..366 (coordinates). Its mean height and half-width.
let sc = 0, sw = 0, n = 0;
for (let x = 0; x < S; x += 1) { const a = H(x + .5, 359), b = H(x + .5, 366), c = H(x + .5, 362.5); if ([a, b, c].some(isNaN)) continue; sc += c; sw += (a - b) / 2; n++; }
const YC = Number(process.env.YC || sc / n), HALF = sw / n, WIN = 0.025;
console.log('stripe centre', YC.toFixed(4), 'half', HALF.toFixed(4));
// Text above the stripe keeps a constant 3D distance from it: a texel at
// height h shows the text layer's row 359 - (h - stripe top) / s, where s is
// the mean height per UV row over the text's rows (299..359).
let ss = 0, ns = 0;
for (let x = 0; x < S; x++) { const a = H(x + .5, 299.5), b = H(x + .5, 359); if (isNaN(a) || isNaN(b)) continue; ss += (a - b) / 59.5; ns++; }
const PER_ROW = ss / ns, TOP = YC + HALF;
console.log('m per row', PER_ROW.toFixed(5));
function textSample(x, y) { // bilinear premultiplied RGBA of the text layer
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, o = [0, 0, 0, 0];
  for (const [xx, yy, w] of [[x0, y0, (1-tx)*(1-ty)], [x0+1, y0, tx*(1-ty)], [x0, y0+1, (1-tx)*ty], [x0+1, y0+1, tx*ty]]) {
    if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
    const k = (yy*S + xx)*4, a = text.data[k+3] / 255;
    o[0] += w*a*text.data[k]; o[1] += w*a*text.data[k+1]; o[2] += w*a*text.data[k+2]; o[3] += w*a;
  }
  return o;
}
const rgb = new Float32Array(S*S*3), cnt = new Uint16Array(S*S), inWin = new Uint8Array(S*S);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const k = y*N + x; if (!m.on[k]) continue;
  const h = m.wpos[k*3+1]; if (h < YC - WIN || (!text && h > YC + WIN)) continue;
  let c = h > YC + HALF ? BLUE : h < YC - HALF ? ORANGE : WHITE;
  if (text && h > TOP) {
    const o = textSample((x + 0.5) / SS, 359 - (h - TOP) / PER_ROW);
    if (o[3] > 0) c = c.map((q, i) => q * (1 - o[3]) + o[i]);
  }
  const t = (y >> 2) * S + (x >> 2);
  rgb[t*3] += c[0]; rgb[t*3+1] += c[1]; rgb[t*3+2] += c[2]; cnt[t]++;
}
const out = Uint8ClampedArray.from(img.data);
// Edge texels no triangle covers (the template's bleed) copy the nearest
// covered texel in the same row, if the row's covered texels were repainted.
const { templateMask } = await import(R + 'src/template.js');
const tm = templateMask(readPNG(R + 'assets/jersey-mask.png'), S);
for (let y = 224; y < 420; y++) for (let x = 0; x < S; x++) {
  const t = y*S + x; if (cnt[t] || !tm[t]) continue;
  for (let d = 1; d < 12; d++) {
    const u = [x - d, x + d].find((q) => q >= 0 && q < S && cnt[y*S + q] && tm[y*S + q]);
    if (u === undefined) continue;
    const s2 = y*S + u; for (let c = 0; c < 3; c++) rgb[t*3+c] = rgb[s2*3+c] / cnt[s2];
    cnt[t] = 1; break;
  }
}
for (let t = 0; t < S*S; t++) {
  if (!cnt[t]) continue;
  for (let c = 0; c < 3; c++) {
    const a = art.data[t*4+3] / 255;
    out[t*4+c] = Math.round((rgb[t*3+c] / cnt[t]) * (1 - a) + art.data[t*4+c] * a);
  }
}
writePNG(outPath, { width: S, height: S, data: out });
