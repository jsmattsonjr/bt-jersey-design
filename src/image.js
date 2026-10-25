// Float image fill. rgb is Float32Array(W*H*3) with values 0..255; weights
// and masks are one value per pixel.

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
