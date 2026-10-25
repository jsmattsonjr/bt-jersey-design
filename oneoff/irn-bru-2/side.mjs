// Side text: erase the old ORIGINAL & BEST, then project each layer flat onto
// its flank, centred in height between the stripes, recoloured to the emblem
// lettering's navy. The centre and size are found in bind pose (where the
// stripe heights were measured); the projection is made in POSE (default
// stopped, the settings page's static preview), square to the torso axis
// (spine.1 to spine.3), so the text runs straight in the pose the user sees.
import { torsoMap } from './torsomap.mjs';
import { posed, POSE, at as boneAt } from '../chrono/pose.mjs';
const R = new URL('../../', import.meta.url).pathname; // jersey-projector root
const { readPNG, writePNG } = await import(R + 'src/png.js');
const [,, inPath, outPath, layerDir = '.'] = process.argv;
const NAVY = [20, 22, 41], ORANGE = [245, 125, 25];
const YC = 1.2933, HALF = 0.0059, HEM_W = 0.0118;
const SCALE = Number(process.env.SCALE || 1);
const img = readPNG(inPath), S = 512, SS = 4, N = S * SS, m = torsoMap(S, SS), ms = torsoMap(S, SS, (rig) => posed(rig, POSE));
const layers = [{ name: 'Layer11', x: 242, y: 378 }, { name: 'Layer12', x: 32, y: 379 }].map((l) => ({ ...l, im: readPNG(layerDir + '/' + l.name + '.png') }));
const sub = (a, b) => a.map((q, i) => q - b[i]), dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const atIn = (mm) => (x, y) => { const k = Math.round(y*SS)*N + Math.round(x*SS); return mm.on[k] ? { p: [0,1,2].map((i) => mm.wpos[k*3+i]), n: norm([0,1,2].map((i) => mm.nrm[k*3+i])) } : null; };
const at = atIn(m), atS = atIn(ms);
const AXIS = norm(sub(boneAt(ms.rig, 'spine.3'), boneAt(ms.rig, 'spine.1'))); // torso axis in POSE


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
  let best = null, by = 0; for (let y = 300; y < S; y += 0.25) { const s = at(cx, y); if (s && (!best || Math.abs(s.p[1] - hc) < Math.abs(best.p[1] - hc))) { best = s; by = y; } }
  // That texel in POSE: the frame is built there.
  const ps = atS(cx, by), n0 = ps.n, up = norm(sub(AXIS, n0.map((q) => q * dot(AXIS, n0))));
  const hz = norm(cross(up, n0)); // across the torso
  // Sign: keep the layer's u direction as it ran on the body.
  const du = sub(atS(l.x + l.im.width - 0.5, cy).p, atS(l.x + 0.5, cy).p), sgn = Math.sign(dot(du, hz));
  l.f = { P0: ps.p, n0, eu: hz.map((q) => q * sgn), ev: up.map((q) => -q) };
  l.k = (l.im.height / hgt) / SCALE; // layer px per metre, from the old height
  console.log(l.name, 'old height', (hgt*100).toFixed(1), 'cm width', (wid*100).toFixed(1), 'cm; hem', low.toFixed(3), 'centre h', hc.toFixed(3), 'gap', ((YC-HALF-low-HEM_W)*100).toFixed(1), 'cm; aspect px/m h', (l.im.height/hgt).toFixed(0), 'w', (l.im.width/wid).toFixed(0));
}
function alphaAt(im, x, y) {
  const fx = x - .5, fy = y - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = (X, Y) => (X < 0 || Y < 0 || X >= im.width || Y >= im.height) ? 0 : im.data[(Y*im.width+X)*4+3] / 255;
  return (a(x0,y0)*(1-tx) + a(x0+1,y0)*tx)*(1-ty) + (a(x0,y0+1)*(1-tx) + a(x0+1,y0+1)*tx)*ty;
}
// 3. Project.
const acc = new Float32Array(S*S), cnt = new Uint16Array(S*S);
for (let y = 300 * SS; y < N; y++) for (let x = 0; x < N; x++) {
  const k = y*N + x; if (!ms.on[k]) continue;
  const p = [ms.wpos[k*3], ms.wpos[k*3+1], ms.wpos[k*3+2]], n = norm([ms.nrm[k*3], ms.nrm[k*3+1], ms.nrm[k*3+2]]);
  let a = 0;
  for (const l of layers) {
    const rel = sub(p, l.f.P0); if (dot(n, l.f.n0) < 0.3 || Math.abs(dot(rel, l.f.n0)) > 0.05) continue;
    a = Math.max(a, alphaAt(l.im, l.im.width / 2 + dot(rel, l.f.eu) * l.k, l.im.height / 2 + dot(rel, l.f.ev) * l.k));
  }
  const t = (y >> 2) * S + (x >> 2); acc[t] += a; cnt[t]++;
}
for (let t = 0; t < S*S; t++) {
  if (!cnt[t]) continue; const a = acc[t] / cnt[t]; if (a <= 0) continue;
  for (let c = 0; c < 3; c++) out[t*4+c] = Math.round(out[t*4+c] * (1 - a) + NAVY[c] * a);
}
writePNG(outPath, { width: S, height: S, data: out });
