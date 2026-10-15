// Float image helpers. An image here is { W, H, rgb: Float32Array(W*H*3) }
// with values 0..255; weights and masks are one value per pixel.

// Push-pull fill: every pixel with weight < 1 is blended toward a smooth
// extrapolation of the weighted pixels around it, coarse to fine. Pixels with
// weight 1 are unchanged. rgb is straight colour; returns a new rgb array.
export function pushPull(rgb, weight, W, H) {
  if (W <= 1 && H <= 1) return Float32Array.from(rgb.subarray(0, 3));
  // Next level: weighted average of each 2x2 block, with a confidence that
  // saturates at 1.
  const W2 = Math.ceil(W / 2), H2 = Math.ceil(H / 2);
  const crgb = new Float32Array(W2 * H2 * 3), cw = new Float32Array(W2 * H2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, j = (y >> 1) * W2 + (x >> 1), w = weight[i];
    if (!w) continue;
    cw[j] += w;
    crgb[j * 3] += w * rgb[i * 3]; crgb[j * 3 + 1] += w * rgb[i * 3 + 1]; crgb[j * 3 + 2] += w * rgb[i * 3 + 2];
  }
  for (let j = 0; j < W2 * H2; j++) {
    const w = cw[j];
    if (w > 0) { crgb[j * 3] /= w; crgb[j * 3 + 1] /= w; crgb[j * 3 + 2] /= w; }
    cw[j] = Math.min(1, w);
  }
  const coarse = pushPull(crgb, cw, W2, H2);
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Bilinear upsample of the coarse level, sampled at this pixel's centre.
    const fx = Math.min(Math.max((x + 0.5) / 2 - 0.5, 0), W2 - 1), fy = Math.min(Math.max((y + 0.5) / 2 - 0.5, 0), H2 - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W2 - 1), y1 = Math.min(y0 + 1, H2 - 1);
    const tx = fx - x0, ty = fy - y0;
    const i = y * W + x, w = Math.min(1, weight[i]);
    for (let c = 0; c < 3; c++) {
      const up = (coarse[(y0 * W2 + x0) * 3 + c] * (1 - tx) + coarse[(y0 * W2 + x1) * 3 + c] * tx) * (1 - ty) +
        (coarse[(y1 * W2 + x0) * 3 + c] * (1 - tx) + coarse[(y1 * W2 + x1) * 3 + c] * tx) * ty;
      out[i * 3 + c] = w * rgb[i * 3 + c] + (1 - w) * up;
    }
  }
  return out;
}

// Fill the pixels of `region` that are not `known` from the known pixels of
// the same region only. rgb is straight (not premultiplied).
export function fillRegion(rgb, known, region, W, H) {
  const w = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) if (known[i] && region[i]) w[i] = 1;
  const filled = pushPull(rgb, w, W, H);
  for (let i = 0; i < W * H; i++) if (region[i] && !known[i]) {
    rgb[i * 3] = filled[i * 3]; rgb[i * 3 + 1] = filled[i * 3 + 1]; rgb[i * 3 + 2] = filled[i * 3 + 2];
  }
  return rgb;
}

// Box blur of one channel, restricted to `mask` (normalised convolution),
// repeated `passes` times (three passes approximate a Gaussian).
export function blurMasked(values, mask, W, H, r, passes = 3) {
  let v = Float32Array.from(values, (x, i) => (mask[i] ? x : 0));
  let w = Float32Array.from(mask, (m) => (m ? 1 : 0));
  const box = (a) => {
    const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = -r; x < W; x++) {
        if (x + r < W) s += a[y * W + x + r];
        if (x - r - 1 >= 0) s -= a[y * W + x - r - 1];
        if (x >= 0) t[y * W + x] = s;
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y < H; y++) {
        if (y + r < H) s += t[(y + r) * W + x];
        if (y - r - 1 >= 0) s -= t[(y - r - 1) * W + x];
        if (y >= 0) o[y * W + x] = s;
      }
    }
    return o;
  };
  for (let p = 0; p < passes; p++) { v = box(v); w = box(w); }
  return v.map((x, i) => (w[i] > 1e-6 ? x / w[i] : 0));
}

// Flatten baked-in lighting: scale each pixel so its blurred luminance moves
// toward the mask's mean luminance, by `strength` (0..1). Chroma is kept.
export function flattenShading(rgb, mask, W, H, { strength = 0.3, radius = 0 } = {}) {
  if (strength <= 0) return rgb;
  const r = radius || Math.max(4, Math.round(Math.max(W, H) / 24));
  const lum = new Float32Array(W * H);
  let sum = 0, n = 0;
  for (let i = 0; i < W * H; i++) {
    lum[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
    if (mask[i]) { sum += lum[i]; n++; }
  }
  const mean = n ? sum / n : 128;
  const low = blurMasked(lum, mask, W, H, r);
  const out = Float32Array.from(rgb);
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    const g = Math.pow((mean + 1) / (low[i] + 1), strength);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.min(255, rgb[i * 3 + c] * g);
  }
  return out;
}

// RGBA bytes <-> float rgb.
export function toFloat(data, W, H) {
  const rgb = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2]; }
  return rgb;
}
export function toBytes(rgb, W, H, mask = null) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const on = !mask || mask[i];
    data[i * 4] = on ? rgb[i * 3] : 0; data[i * 4 + 1] = on ? rgb[i * 3 + 1] : 0; data[i * 4 + 2] = on ? rgb[i * 3 + 2] : 0;
    data[i * 4 + 3] = 255;
  }
  return data;
}

// Halve an image by averaging 2x2 blocks (W and H even).
export function downsample2(rgb, W, H) {
  const W2 = W >> 1, H2 = H >> 1, out = new Float32Array(W2 * H2 * 3);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) for (let c = 0; c < 3; c++) {
    const a = (k, l) => rgb[((2 * y + l) * W + 2 * x + k) * 3 + c];
    out[(y * W2 + x) * 3 + c] = (a(0, 0) + a(1, 0) + a(0, 1) + a(1, 1)) / 4;
  }
  return out;
}

// Bilinear sample of rgb at (x, y) in pixel units (pixel centres at +0.5).
export function sample(rgb, W, H, x, y, out) {
  const fx = Math.min(Math.max(x - 0.5, 0), W - 1), fy = Math.min(Math.max(y - 0.5, 0), H - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0, ty = fy - y0;
  for (let c = 0; c < 3; c++)
    out[c] = (rgb[(y0 * W + x0) * 3 + c] * (1 - tx) + rgb[(y0 * W + x1) * 3 + c] * tx) * (1 - ty) +
      (rgb[(y1 * W + x0) * 3 + c] * (1 - tx) + rgb[(y1 * W + x1) * 3 + c] * tx) * ty;
  return out;
}
