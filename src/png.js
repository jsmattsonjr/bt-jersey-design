// Node-only PNG I/O for the scripts: 8- or 16-bit greyscale, RGB and RGBA, no
// interlace. 16-bit samples keep their high byte.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

export function readPNG(path) {
  const buf = readFileSync(path);
  let p = 8, W, H, type, depth, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tag = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (tag === 'IHDR') {
      W = data.readUInt32BE(0); H = data.readUInt32BE(4);
      depth = data[8];
      if ((depth !== 8 && depth !== 16) || data[12] !== 0) throw new Error(`${path}: only 8/16-bit non-interlaced`);
      type = data[9];
    } else if (tag === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`${path}: colour type ${type} unsupported`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ch * (depth / 8), stride = W * bpp, full = new Uint8Array(stride * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, out = full;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y ? out[row - stride + x] : 0;
      const c = x >= bpp && y ? out[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = v & 255;
    }
  }
  const out = depth === 8 ? full : full.filter((_, i) => i % 2 === 0);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const s = i * ch;
    if (ch === 1 || ch === 2) data.fill(out[s], i * 4, i * 4 + 3);
    else { data[i * 4] = out[s]; data[i * 4 + 1] = out[s + 1]; data[i * 4 + 2] = out[s + 2]; }
    data[i * 4 + 3] = ch === 4 ? out[s + 3] : ch === 2 ? out[s + 1] : 255;
  }
  return { width: W, height: H, data };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(tag, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(tag, 4, 'latin1');
  data.copy(b, 8);
  let c = -1;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  b.writeInt32BE(~c, 8 + data.length);
  return b;
}

export function writePNG(path, { width, height, data }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(width, 0); hdr.writeUInt32BE(height, 4);
  hdr[8] = 8; hdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', hdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// Greyscale mask (one byte per pixel) to an RGBA image.
export function maskImage(mask, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i++) data.fill(mask[i], i * 4, i * 4 + 3), (data[i * 4 + 3] = 255);
  return { width, height, data };
}
