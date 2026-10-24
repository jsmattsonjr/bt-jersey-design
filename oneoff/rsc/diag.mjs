import { paint } from './paint.mjs';
import { body, bodyDir } from './frame.mjs';
const hue = (h) => { const k = (n) => (n + h / 60) % 6; return [5, 3, 1].map((n) => 255 * (1 - Math.max(0, Math.min(k(n), 4 - k(n), 1)))); };
paint((q) => {
  if (q.part === 't') {
    const b = body(q.p), d = bodyDir(q.n), az = Math.atan2(d[2], d[0]) * 180 / Math.PI;
    const c = hue(((Math.floor((az + 360) / 30) * 30) * 1.0) % 360);
    return Math.floor(b[1] / 0.05) % 2 ? c : c.map((v) => v * 0.55);
  }
  const a = Math.atan2(q.loc[2], q.loc[0]) * 180 / Math.PI, c = hue((Math.floor((a + 360) / 45) * 45) % 360);
  return Math.floor(q.loc[1] / 0.02) % 2 ? c : c.map((v) => v * 0.55);
}, process.argv[2]);
