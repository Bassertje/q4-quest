// Generates the add-on icon/logo and the web app icons in the light style:
// light background with subtle scanlines, a red pixel-art game controller and
// "Q4" / "Q4 QUEST" in a 5×7 pixel font, with a soft red glow.
// Usage: node tools/make-icons.mjs   (writes icon.png, logo.png, web/public/*.png)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0xf0, 0xf0, 0xed];
const SCAN = [0xe6, 0xe6, 0xe2];
const RED = [0xe3, 0x06, 0x13];

// Controller, 16×10 cells: '#' red body, 'o' cut-outs (d-pad cross left, four buttons in a diamond right).
const PAD = [
  '...##########...',
  '..############..',
  '.####o#####o###.',
  '.###ooo###o#o##.',
  '.####o#oo##o###.',
  '.##############.',
  '.##############.',
  '.#####....#####.',
  '.####......####.',
  '..##........##..',
];

const FONT = {
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function textGrid(text) {
  const rows = Array.from({ length: 7 }, () => '');
  [...text].forEach((ch, i) => {
    for (let y = 0; y < 7; y++) rows[y] += (i ? '.' : '') + FONT[ch][y];
  });
  return rows;
}

/** Draw icon parts into a mask: 1 = red, 0 = background. */
function makeMask(w, h, parts) {
  const mask = new Float32Array(w * h);
  for (const { grid, unit, x, y } of parts) {
    grid.forEach((row, gy) =>
      [...row].forEach((c, gx) => {
        if (c !== '#') return;
        for (let dy = 0; dy < unit; dy++)
          for (let dx = 0; dx < unit; dx++) {
            const px = Math.round(x + gx * unit + dx);
            const py = Math.round(y + gy * unit + dy);
            if (px >= 0 && py >= 0 && px < w && py < h) mask[py * w + px] = 1;
          }
      }),
    );
  }
  return mask;
}

/** Separable box blur, applied 3 times (close to a Gaussian). */
function blur(src, w, h, r) {
  let a = Float32Array.from(src);
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))];
        tmp[y * w + x] = s / (2 * r + 1);
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        a[y * w + x] = s / (2 * r + 1);
      }
  }
  return a;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function render(file, w, h, parts, { glowRadius, scanEvery }) {
  const mask = makeMask(w, h, parts);
  const glow = blur(mask, w, h, glowRadius);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    const bg = y % scanEvery === 0 ? SCAN : BG;
    for (let x = 0; x < w; x++) {
      const m = mask[y * w + x];
      const g = Math.min(1, glow[y * w + x] * 0.55); // soft red glow around the pixels
      const px = m ? RED : bg.map((c, i) => Math.round(c * (1 - g) + RED[i] * g));
      raw.set(px, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  writeFileSync(
    file,
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  );
}

/** Square icon: controller on top, "Q4" below, centred. */
function squareIcon(file, size) {
  // Whole-pixel units keep the pixel art crisp.
  const padUnit = Math.round(size / 26);
  const textUnit = Math.round(size / 34);
  const q4 = textGrid('Q4');
  const padW = 16 * padUnit;
  const textW = q4[0].length * textUnit;
  const padH = 10 * padUnit;
  const textH = 7 * textUnit;
  const gap = size * 0.08;
  const top = Math.round((size - padH - gap - textH) / 2);
  render(
    file,
    size,
    size,
    [
      { grid: PAD, unit: padUnit, x: Math.round((size - padW) / 2), y: top },
      { grid: q4, unit: textUnit, x: Math.round((size - textW) / 2), y: Math.round(top + padH + gap) },
    ],
    { glowRadius: Math.max(1, Math.round(size / 40)), scanEvery: Math.max(2, Math.round(size / 40)) },
  );
}

squareIcon('icon.png', 128);
squareIcon('web/public/apple-touch-icon.png', 180);

// Logo 250×100: controller left, "Q4 QUEST" right.
const title = textGrid('Q4 QUEST');
render(
  'logo.png',
  250,
  100,
  [
    { grid: PAD, unit: 4, x: 14, y: 30 },
    { grid: title, unit: 3, x: 96, y: 40 },
  ],
  { glowRadius: 3, scanEvery: 3 },
);

// Favicon 32×32: just the controller (text would be unreadable).
render('web/public/favicon.png', 32, 32, [{ grid: PAD, unit: 2, x: 0, y: 6 }], { glowRadius: 1, scanEvery: 2 });
console.log('icons written');
