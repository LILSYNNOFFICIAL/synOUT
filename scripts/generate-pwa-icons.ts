import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // filter None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      rawScanlines,
      rowStart + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp01(((px - x1) * dx + (py - y1) * dy) / lenSq);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToRoundedBox(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  radius: number
): number {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - radius;
}

function renderSynoutIcon(size: number, maskable: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  // Maskable keeps all brand geometry inside central 70% circle (15% safe zone margin on every side)
  const scale = maskable ? 0.68 : 0.84;
  const aa = 1.4 / size;

  const pixels: Array<[number, number, number, [number, number, number]]> = [
    [0.16, -0.14, 0.042, [34, 167, 255]],
    [0.25, -0.05, 0.048, [185, 241, 255]],
    [0.31, -0.21, 0.040, [70, 214, 255]],
    [0.33, 0.07, 0.042, [46, 198, 255]],
    [0.41, -0.11, 0.046, [224, 250, 255]],
    [0.40, 0.19, 0.040, [18, 199, 255]],
    [0.48, 0.03, 0.044, [16, 185, 129]],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Normalized [-0.5, 0.5]
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;

      // Base slate-950 background with subtle radial emerald/cobalt glow
      const radial = Math.hypot(nx, ny);
      let r = lerp(10, 2, radial * 1.5);
      let g = lerp(24, 6, radial * 1.5);
      let b = lerp(52, 23, radial * 1.5);
      let a = 255;

      if (!maskable) {
        // Rounded app squircle silhouette with crisp subtle border
        const cardDist = distToRoundedBox(nx, ny, 0, 0, 0.47, 0.47, 0.11);
        if (cardDist > aa) {
          rgba[(y * size + x) * 4 + 3] = 0;
          continue;
        }
        const cardAlpha = clamp01(0.5 - cardDist / (aa * 2));
        a = Math.round(cardAlpha * 255);
        // Subtle inner rim highlight
        const rim = Math.exp(-Math.pow(Math.abs(cardDist + 0.008) / 0.008, 2));
        r = lerp(r, 30, rim * 0.45);
        g = lerp(g, 190, rim * 0.35);
        b = lerp(b, 255, rim * 0.45);
      }

      // Transform into icon emblem space
      const lx = nx / scale;
      const ly = ny / scale;

      const strokeRadius = 0.095;
      // Upper S-Ribbon arm
      const dTop = Math.min(
        distToSegment(lx, ly, -0.28, -0.06, 0.02, -0.30),
        distToSegment(lx, ly, 0.02, -0.30, 0.24, -0.24)
      ) - strokeRadius;
      // Lower S-Ribbon arm
      const dBot = Math.min(
        distToSegment(lx, ly, -0.26, 0.24, -0.02, 0.30),
        distToSegment(lx, ly, -0.02, 0.30, 0.26, 0.06)
      ) - strokeRadius;
      // Center specular diagonal ribbon
      const dMid = distToSegment(lx, ly, -0.28, -0.06, 0.26, 0.06) - strokeRadius * 1.04;

      const blendLayer = (dist: number, cr: number, cg: number, cb: number) => {
        const cov = clamp01(0.5 - (dist * scale) / (aa * 2));
        if (cov > 0) {
          r = lerp(r, cr, cov);
          g = lerp(g, cg, cov);
          b = lerp(b, cb, cov);
        }
      };

      const gradT = clamp01((lx + 0.35) / 0.7);
      // Upper arm: cobalt -> cyan
      blendLayer(dTop, lerp(11, 20, gradT), lerp(99, 228, gradT), 255);
      // Lower arm: icy cyan -> cobalt
      blendLayer(dBot, lerp(14, 11, gradT), lerp(200, 94, gradT), 255);
      // Center fold: electric blue -> luminous white-cyan sheen
      const sheen = Math.exp(-Math.pow((gradT - 0.58) / 0.28, 2));
      blendLayer(
        dMid,
        lerp(18, 238, sheen),
        lerp(132, 250, sheen),
        255
      );

      // 7 dissolving privacy data pixels
      for (const [px, py, pHalf, [pr, pg, pb]] of pixels) {
        const pDist = distToRoundedBox(lx, ly, px, py, pHalf, pHalf, pHalf * 0.28);
        blendLayer(pDist, pr, pg, pb);
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(clamp01(r / 255) * 255);
      rgba[idx + 1] = Math.round(clamp01(g / 255) * 255);
      rgba[idx + 2] = Math.round(clamp01(b / 255) * 255);
      rgba[idx + 3] = a;
    }
  }

  return encodeRgbaPng(size, size, rgba);
}

const staticDir = path.resolve(process.cwd(), 'static');
fs.mkdirSync(staticDir, { recursive: true });

const targets: Array<{ file: string; size: number; maskable: boolean }> = [
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
];

for (const t of targets) {
  const outPath = path.join(staticDir, t.file);
  const png = renderSynoutIcon(t.size, t.maskable);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
