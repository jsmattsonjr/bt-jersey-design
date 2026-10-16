// Emblems: erase the old front and back roundels, then project each layer
// flat along the surface normal at its centre (vertical = world up, bind
// pose), round on the body, centred in height between the stripes, in its
// own colours. SCALE=0.9 makes it 10% smaller than the old one's size.
import { torsoMap } from './torsomap.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'test/png.js');
const [,, inPath, outPath, layerDir = '.'] = process.argv;
const ORANGE = [245, 125, 25];
const YC = 1.2933, HALF = 0.0059, HEM_W = 0.0118;
const SCALE = Number(process.env.SCALE || 1);
const img = readPNG(inPath), S = 512, SS = 4, N = S * SS, m = torsoMap(S, SS);
const layers = [{ name: 'Layer8', x: 88, y: 386 }, { name: 'Layer16', x: 339, y: 387 }].map((l) => ({ ...l, im: readPNG(layerDir + '/' + l.name + '.png') }));
const sub = (a, b) => a.map((q, i) => q - b[i]), dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const at = (x, y) => { const k = Math.round(y*SS)*N + Math.round(x*SS); return m.on[k] ? { p: [0,1,2].map((i) => m.wpos[k*3+i]), n: norm([0,1,2].map((i) => m.nrm[k*3+i])) } : null; };


const out = Uint8ClampedArray.from(img.data);
// 1. Erase: every texel the old layers touch (dilated 1 px) back to orange.
for (const l of layers) for (let y = -1; y <= l.im.height; y++) for (let x = -1; x <= l.im.width; x++) {
  let any = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x+dx, Y = y+dy; if (X >= 0 && Y >= 0 && X < l.im.width && Y < l.im.height && l.im.data[(Y*l.im.width+X)*4+3] > 0) any = true; }
  if (!any) continue;
  const t = (l.y + y) * S + l.x + x; out.set(ORANGE, t*4);
}
// 2. Frames.
for (const l of layers) {
  const cx = l.x + l.im.width / 2, cy = l.y + l.im.height / 2;
  // Old 3D extent, to keep the size: height chord along the layer's long axis, width across.
  const top = at(cx, l.y + 0.5), bot = at(cx, l.y + l.im.height - 0.5), lf = at(l.x + 0.5, cy), rt = at(l.x + l.im.width - 0.5, cy), c0 = at(cx, cy);
  const hgt = Math.hypot(...sub(top.p, bot.p)), wid = Math.hypot(...sub(lf.p, rt.p));
  // Column texels around the flank: hem = lowest covered, stripe from the top stripe.
  let low = 9; for (let y = 400; y < S; y++) { const s = at(cx, y + 0.5); if (s) low = Math.min(low, s.p[1]); }
  const hc = ((low + HEM_W) + (YC - HALF)) / 2;
  // Surface point in this column at height hc.
  let best = null; for (let y = 300; y < S; y += 0.25) { const s = at(cx, y); if (s && (!best || Math.abs(s.p[1] - hc) < Math.abs(best.p[1] - hc))) best = s; }
  const n0 = best.n, up = norm(sub([0,1,0], n0.map((q) => q * n0[1])));
  const hz = norm(cross(up, n0)); // horizontal tangent
  // Sign: keep the layer's u direction as it ran on the body.
  const du = sub(rt.p, lf.p), sgn = Math.sign(dot(du, hz));
  l.f = { P0: best.p, n0, eu: hz.map((q) => q * sgn), ev: up.map((q) => -q) };
  l.k = Math.sqrt((l.im.height / hgt) * (l.im.width / wid)) / SCALE; // layer px per metre, from the old height
  console.log(l.name, 'old height', (hgt*100).toFixed(1), 'cm width', (wid*100).toFixed(1), 'cm; hem', low.toFixed(3), 'centre h', hc.toFixed(3), 'gap', ((YC-HALF-low-HEM_W)*100).toFixed(1), 'cm; aspect px/m h', (l.im.height/hgt).toFixed(0), 'w', (l.im.width/wid).toFixed(0));
}
function rgbaAt(im, x, y) { // bilinear, premultiplied
  const fx = x - .5, fy = y - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, o = [0, 0, 0, 0];
  for (const [X, Y, w] of [[x0, y0, (1-tx)*(1-ty)], [x0+1, y0, tx*(1-ty)], [x0, y0+1, (1-tx)*ty], [x0+1, y0+1, tx*ty]]) {
    if (X < 0 || Y < 0 || X >= im.width || Y >= im.height) continue;
    const k = (Y*im.width+X)*4, a = im.data[k+3] / 255;
    o[0] += w*a*im.data[k]; o[1] += w*a*im.data[k+1]; o[2] += w*a*im.data[k+2]; o[3] += w*a;
  }
  return o;
}
function alphaAt(im, x, y) {
  const fx = x - .5, fy = y - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = (X, Y) => (X < 0 || Y < 0 || X >= im.width || Y >= im.height) ? 0 : im.data[(Y*im.width+X)*4+3] / 255;
  return (a(x0,y0)*(1-tx) + a(x0+1,y0)*tx)*(1-ty) + (a(x0,y0+1)*(1-tx) + a(x0+1,y0+1)*tx)*ty;
}
// 3. Project.
const accC = new Float32Array(S*S*3), acc = new Float32Array(S*S), cnt = new Uint16Array(S*S);
for (let y = 300 * SS; y < N; y++) for (let x = 0; x < N; x++) {
  const k = y*N + x; if (!m.on[k]) continue;
  const p = [m.wpos[k*3], m.wpos[k*3+1], m.wpos[k*3+2]], n = norm([m.nrm[k*3], m.nrm[k*3+1], m.nrm[k*3+2]]);
  let o = [0, 0, 0, 0];
  for (const l of layers) {
    const rel = sub(p, l.f.P0); if (dot(n, l.f.n0) < 0.3 || Math.abs(dot(rel, l.f.n0)) > 0.12) continue;
    const q = rgbaAt(l.im, l.im.width / 2 + dot(rel, l.f.eu) * l.k, l.im.height / 2 + dot(rel, l.f.ev) * l.k);
    if (q[3] > o[3]) o = q;
  }
  const t = (y >> 2) * S + (x >> 2); acc[t] += o[3]; accC[t*3] += o[0]; accC[t*3+1] += o[1]; accC[t*3+2] += o[2]; cnt[t]++;
}
for (let t = 0; t < S*S; t++) {
  if (!cnt[t]) continue; const a = acc[t] / cnt[t]; if (a <= 0) continue;
  for (let c = 0; c < 3; c++) out[t*4+c] = Math.round(out[t*4+c] * (1 - a) + accC[t*3+c] / cnt[t]);
}
writePNG(outPath, { width: S, height: S, data: out });
