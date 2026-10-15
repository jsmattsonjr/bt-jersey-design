// Thin-plate spline: the smooth 2D warp that carries a set of source points
// onto their targets with the least bending. Here it maps model-view pixels
// to mockup pixels, fitted to matched points along the two silhouettes.

// Gaussian elimination with partial pivoting; A is overwritten.
export function solve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const k = A[r][c] / A[c][c];
      if (!k) continue;
      for (let j = c; j < n; j++) A[r][j] -= k * A[c][j];
      b[r] -= k * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let j = r + 1; j < n; j++) s -= A[r][j] * x[j];
    x[r] = s / A[r][r];
  }
  return x;
}

// TPS radial basis, r^2 log r^2.
const U = (r2) => (r2 > 1e-12 ? r2 * Math.log(r2) : 0);

// src, dst: arrays of [x, y]. lambda > 0 relaxes the fit (in units of the
// normalised coordinates), which tolerates a ragged contour.
export function fitTPS(src, dst, lambda = 0) {
  const n = src.length;
  // Normalise to roughly unit scale for conditioning.
  let mx = 0, my = 0;
  for (const [x, y] of src) { mx += x; my += y; }
  mx /= n; my /= n;
  let s = 0;
  for (const [x, y] of src) s = Math.max(s, Math.abs(x - mx), Math.abs(y - my));
  s = s || 1;
  const P = src.map(([x, y]) => [(x - mx) / s, (y - my) / s]);

  const m = n + 3;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
      A[i][j] = U(dx * dx + dy * dy);
    }
    A[i][i] += lambda;
    A[i][n] = A[n][i] = 1;
    A[i][n + 1] = A[n + 1][i] = P[i][0];
    A[i][n + 2] = A[n + 2][i] = P[i][1];
  }
  const coef = [0, 1].map((c) => {
    const b = new Float64Array(m);
    for (let i = 0; i < n; i++) b[i] = dst[i][c];
    return solve(A.map((r) => Float64Array.from(r)), b);
  });
  const wx = coef[0], wy = coef[1];
  const px = Float64Array.from(P, (p) => p[0]), py = Float64Array.from(P, (p) => p[1]);

  return function map(x, y) {
    const u = (x - mx) / s, v = (y - my) / s;
    let ox = wx[n] + wx[n + 1] * u + wx[n + 2] * v;
    let oy = wy[n] + wy[n + 1] * u + wy[n + 2] * v;
    for (let i = 0; i < n; i++) {
      const dx = u - px[i], dy = v - py[i], k = U(dx * dx + dy * dy);
      ox += wx[i] * k; oy += wy[i] * k;
    }
    return [ox, oy];
  };
}

// Tabulate a mapping on a grid every `step` pixels over W x H and return a
// bilinear lookup, which is far cheaper than the spline per texel.
export function gridMap(map, W, H, step = 4) {
  const gw = Math.ceil(W / step) + 2, gh = Math.ceil(H / step) + 2;
  const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const [x, y] = map(i * step, j * step);
    gx[j * gw + i] = x; gy[j * gw + i] = y;
  }
  return (x, y) => {
    const fx = Math.min(Math.max(x / step, 0), gw - 1.001), fy = Math.min(Math.max(y / step, 0), gh - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const k = j * gw + i;
    const lerp = (g) => (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - ty) + (g[k + gw] * (1 - tx) + g[k + gw + 1] * tx) * ty;
    return [lerp(gx), lerp(gy)];
  };
}
