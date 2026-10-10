// Generates the app icons (PNG + SVG) with no dependencies.  Run:  node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

// ---------- tiny vector rasterizer (512-unit design space) ----------
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function onPolyline(x, y, pts, w) {
  for (let i = 0; i < pts.length - 1; i++) if (distSeg(x, y, pts[i], pts[i + 1]) <= w / 2) return true;
  return false;
}

const BG1 = hex('#2c2786');
const BG2 = hex('#07071f');
const G1 = hex('#a6d6ff');
const G2 = hex('#6a5cff');
const G3 = hex('#c15cff');
const WHITE = [1, 1, 1];
const GEM = [
  [256, 74],
  [408, 222],
  [256, 440],
  [104, 222],
];
const FACET = [
  [256, 74],
  [330, 222],
  [256, 440],
  [182, 222],
];

/** Returns [r,g,b,a] for a point in design space. `scale` shrinks the artwork (maskable icons). */
function scene(x, y, { rounded, scale }) {
  let col = null;
  let a = 0;
  // Background
  if (!rounded || inRoundRect(x, y, 512, 512, 112)) {
    col = mix(BG1, BG2, y / 512);
    a = 1;
  } else return [0, 0, 0, 0];
  // Artwork coordinates (scaled around the centre).
  const ax = 256 + (x - 256) / scale;
  const ay = 256 + (y - 256) / scale;
  // Glow
  const d = Math.hypot(ax - 256, ay - 240) / 230;
  if (d < 1) col = mix(col, hex('#7b6bff'), 0.5 * (1 - d) ** 2);
  const over = (c, alpha) => (col = mix(col, c, alpha));
  if (inPoly(ax, ay, GEM)) {
    const t = (ax / 512 + ay / 512) / 2;
    over(t < 0.5 ? mix(G1, G2, t * 2) : mix(G2, G3, (t - 0.5) * 2), 1);
    if (inPoly(ax, ay, FACET)) over(WHITE, 0.16);
    if (ay < 222 && ax < 256 && inPoly(ax, ay, [[256, 74], [104, 222], [182, 222]])) over(WHITE, 0.22);
    if (onPolyline(ax, ay, [[104, 222], [408, 222]], 6)) over(WHITE, 0.5);
    if (onPolyline(ax, ay, [[256, 74], [182, 222], [256, 440]], 5) || onPolyline(ax, ay, [[256, 74], [330, 222], [256, 440]], 5)) over(WHITE, 0.4);
  }
  // Ascending chevrons
  if (onPolyline(ax, ay, [[200, 318], [256, 274], [312, 318]], 24)) over(WHITE, 1);
  if (onPolyline(ax, ay, [[222, 368], [256, 342], [290, 368]], 18)) over(WHITE, 0.75);
  return [...col, a];
}

function render(size, opts) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const x = ((i + (sx + 0.5) / ss) / size) * 512;
          const y = ((j + (sy + 0.5) / ss) / size) * 512;
          const c = scene(x, y, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      const n = ss * ss;
      const o = (j * size + i) * 4;
      const al = a / n;
      px[o] = al ? Math.round((r / a) * 255) : 0;
      px[o + 1] = al ? Math.round((g / a) * 255) : 0;
      px[o + 2] = al ? Math.round((b / a) * 255) : 0;
      px[o + 3] = Math.round(al * 255);
    }
  }
  return px;
}

// ---------- PNG encoder ----------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const jobs = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 1 }],
  ['maskable-512.png', 512, { rounded: false, scale: 1.35 }],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(OUT, name), png(size, render(size, opts)));
  console.log('wrote', name);
}

writeFileSync(
  join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2786"/><stop offset="1" stop-color="#07071f"/></linearGradient>
    <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6d6ff"/><stop offset=".5" stop-color="#6a5cff"/><stop offset="1" stop-color="#c15cff"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".47" r=".45"><stop offset="0" stop-color="#7b6bff" stop-opacity=".5"/><stop offset="1" stop-color="#7b6bff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="240" r="230" fill="url(#glow)"/>
  <path d="M256 74 L408 222 L256 440 L104 222 Z" fill="url(#gem)"/>
  <path d="M256 74 L330 222 L256 440 L182 222 Z" fill="#fff" fill-opacity=".16"/>
  <path d="M256 74 L104 222 L182 222 Z" fill="#fff" fill-opacity=".22"/>
  <path d="M104 222 H408" stroke="#fff" stroke-opacity=".5" stroke-width="6"/>
  <path d="M256 74 L182 222 L256 440 M256 74 L330 222 L256 440" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="5"/>
  <path d="M200 318 L256 274 L312 318" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M222 368 L256 342 L290 368" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
);
console.log('wrote favicon.svg');
