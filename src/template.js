// Template mask (RGBA bytes, any square size) resampled to size x size.
// design/templates/jersey.png cuts its islands out: white at alpha 0 over an
// opaque black backdrop. A browser canvas premultiplies that to (0,0,0,0),
// so a pixel is island if it is transparent or bright.
export function templateMask(tpl, size) {
  const m = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor(((x + 0.5) * tpl.width) / size), sy = Math.floor(((y + 0.5) * tpl.height) / size);
    const k = (sy * tpl.width + sx) * 4;
    m[y * size + x] = tpl.data[k + 3] < 128 || tpl.data[k] > 128 ? 1 : 0;
  }
  return m;
}

