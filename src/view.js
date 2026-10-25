// Calls fn(x, y, b0, b1, b2) for every pixel centre inside the triangle.
export function rasterTriangle(x0, y0, x1, y1, x2, y2, W, H, fn) {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (!area) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const b0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
      const b1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
      const b2 = 1 - b0 - b1;
      if (b0 >= -1e-9 && b1 >= -1e-9 && b2 >= -1e-9) fn(x, y, b0, b1, b2);
    }
  }
}
