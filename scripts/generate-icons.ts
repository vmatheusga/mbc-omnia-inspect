/**
 * Gera os ícones PNG da extensão (sem dependências): quadrado escuro
 * arredondado com uma mira azul — o "modo inspecionar".
 *   pnpm tsx scripts/generate-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const out = path.resolve(import.meta.dirname, "../public/icon");
fs.mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size: number): Buffer {
  const S = 4; // supersampling
  const rows: Buffer[] = [];
  const bg = [17, 24, 28];
  const blue = [13, 153, 255];
  const white = [251, 252, 253];
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          // quadrado arredondado
          const dx = Math.max(r - px, 0, px - (size - r));
          const dy = Math.max(r - py, 0, py - (size - r));
          if (dx * dx + dy * dy > r * r) continue;
          let color = bg;
          const cx = px - size / 2;
          const cy = py - size / 2;
          const d = Math.hypot(cx, cy);
          const ring = size * 0.26;
          const stroke = Math.max(size * 0.075, 1.2);
          if (Math.abs(d - ring) < stroke / 2) color = white;
          const inArm = (a: number, b: number) =>
            Math.abs(a) < stroke / 2 && Math.abs(b) > size * 0.12 && Math.abs(b) < size * 0.38;
          if (inArm(cx, cy) || inArm(cy, cx)) color = white;
          if (d < size * 0.075) color = blue;
          acc = [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2], acc[3] + 255];
        }
      }
      const n = S * S;
      const a = acc[3] / n;
      const o = 1 + x * 4;
      row[o] = a ? Math.round(acc[0] / (acc[3] / 255)) : 0;
      row[o + 1] = a ? Math.round(acc[1] / (acc[3] / 255)) : 0;
      row[o + 2] = a ? Math.round(acc[2] / (acc[3] / 255)) : 0;
      row[o + 3] = Math.round(a);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 96, 128]) {
  fs.writeFileSync(path.join(out, `${size}.png`), png(size));
}
console.log(`✓ ícones em ${path.relative(process.cwd(), out)}`);
