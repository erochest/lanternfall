// Rasterises the Lanternfall icon to PNG without any dependencies.
// Usage: node scripts/gen-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const roundRect = (x, y, rx, ry, w, h, r) => {
  const qx = Math.abs(x - rx) - w / 2 + r;
  const qy = Math.abs(y - ry) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const flame = (x, y, cx, cy, s) => {
  // teardrop: circle bottom + pointed top
  const dy = (y - cy) / s;
  const dx = (x - cx) / s;
  const w = dy < 0 ? Math.max(0, 1 + dy / 1.6) * 0.62 : Math.sqrt(Math.max(0, 1 - dy * dy)) * 0.62;
  return Math.abs(dx) <= w && dy > -1.6 && dy < 1;
};

function sample(u, v, rounded) {
  // u, v in 0..512 space
  let c = mix(hex('#163049'), hex('#050a14'), Math.min(1, Math.hypot(u - 256, v - 230) / 360));
  let a = 1;
  if (rounded && roundRect(u, v, 256, 256, 512, 512, 112) > 0) a = 0;
  const g = Math.max(0, 1 - Math.hypot(u - 256, v - 288) / 210);
  c = mix(c, hex('#ffb347'), g * g * 0.55);
  c = mix(c, hex('#ffe7a8'), Math.pow(g, 4) * 0.8);
  const ring = Math.abs(Math.hypot(u - 256, v - 150) - 50);
  if (ring < 8 && v < 152) c = hex('#c9a46a');
  if (roundRect(u, v, 256, 181, 140, 22, 8) < 0 || roundRect(u, v, 256, 373, 140, 22, 8) < 0) c = hex('#5a3d1c');
  const body = roundRect(u, v, 256, 277, 120, 170, 26);
  if (body < 0) c = body > -12 ? hex('#c9a46a') : hex('#2a1c0c');
  if (flame(u, v, 256, 290, 40)) c = hex('#ffd27a');
  if (flame(u, v, 256, 296, 20)) c = hex('#fff6dc');
  return [...c, a * 255];
}

function render(size, rounded) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const s = sample(((x + (sx + 0.5) / ss) / size) * 512, ((y + (sy + 0.5) / ss) / size) * 512, rounded);
          for (let i = 0; i < 4; i++) acc[i] += s[i];
        }
      }
      const o = (y * size + x) * 4;
      for (let i = 0; i < 4; i++) px[o + i] = Math.round(acc[i] / (ss * ss));
    }
  }
  return png(size, px);
}

writeFileSync('public/icons/icon-192.png', render(192, false));
writeFileSync('public/icons/icon-512.png', render(512, false));
writeFileSync('public/icons/apple-touch-icon.png', render(180, false));
console.log('icons written');
