import { brand as palette } from "../apps/web/src/lib/brand.ts";
// Generates the PWA icon set into apps/web/public/icons without any image
// dependencies: pixels are rendered with signed-distance functions and
// encoded as PNG using node's zlib.
//
// Usage: node scripts/generate-pwa-icons.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "web",
  "public",
  "icons"
);

function rgb(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
const brand = rgb(palette.primary);
const brandDark = rgb(palette.strong);
const white = rgb(palette.white);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // no filter
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Signed distance helpers: negative inside, positive outside, in pixels.
function roundedSquare(x, y, center, half, radius) {
  const dx = Math.abs(x - center) - (half - radius);
  const dy = Math.abs(y - center) - (half - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

function annulus(x, y, center, radius, thickness) {
  return Math.abs(Math.hypot(x - center, y - center) - radius) - thickness / 2;
}

function disc(x, y, center, radius) {
  return Math.hypot(x - center, y - center) - radius;
}

function bar(x, y, centerX, top, bottom, halfWidth) {
  const dx = Math.abs(x - centerX) - halfWidth;
  const dy = Math.max(top - y, y - bottom);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - 0;
}

function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(base, color, alpha) {
  return [
    base[0] + (color[0] - base[0]) * alpha,
    base[1] + (color[1] - base[1]) * alpha,
    base[2] + (color[2] - base[2]) * alpha
  ];
}

// The mark: a vault dial. Outer ring, center dot, and a tick from the dot to
// the ring's lower edge, all white on the brand teal.
function renderIcon(size, { maskable = false, transparentOutside = true }) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  // Maskable icons must keep the glyph inside the 80% safe zone and paint
  // the full square; regular icons get a rounded-square tile.
  const glyphScale = maskable ? 0.62 : 0.78;
  const tileHalf = size / 2;
  const tileRadius = maskable ? 0 : size * 0.22;
  const ringRadius = (size * glyphScale) / 2 - size * 0.1;
  const ringThickness = size * 0.075;
  const dotRadius = size * 0.085;
  const tickHalfWidth = ringThickness / 2;
  const tickTop = center + dotRadius + size * 0.02;
  const tickBottom = center + ringRadius - ringThickness;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const tile = maskable
        ? -1
        : roundedSquare(px, py, center, tileHalf, tileRadius);
      const tileAlpha = coverage(tile);

      // Subtle vertical gradient on the tile keeps large sizes from looking flat.
      const t = py / size;
      let color = blend(brand, brandDark, t * 0.55);
      const glyph = Math.min(
        annulus(px, py, center, ringRadius, ringThickness),
        disc(px, py, center, dotRadius),
        bar(px, py, center, tickTop, tickBottom, tickHalfWidth)
      );
      color = blend(color, white, coverage(glyph));

      const offset = (y * size + x) * 4;
      const alpha = transparentOutside ? tileAlpha : 1;
      const background = transparentOutside
        ? color
        : blend(brand, color, tileAlpha);
      pixels[offset] = Math.round(background[0]);
      pixels[offset + 1] = Math.round(background[1]);
      pixels[offset + 2] = Math.round(background[2]);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(outputDir, { recursive: true });

const outputs = [
  ["icon-192.png", renderIcon(192, {})],
  ["icon-512.png", renderIcon(512, {})],
  ["icon-maskable-512.png", renderIcon(512, { maskable: true })],
  // iOS composites its own corner mask, so the apple touch icon is full-bleed.
  ["apple-touch-icon.png", renderIcon(180, { maskable: true })]
];

for (const [name, buffer] of outputs) {
  writeFileSync(join(outputDir, name), buffer);
  console.log(
    `wrote ${join("apps/web/public/icons", name)} (${buffer.length} bytes)`
  );
}

writeFileSync(
  join(outputDir, "..", "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${palette.primary}"/><path d="M25 52V25h-7v-8h7v-3c0-9 5-14 14-14h8v9h-6c-4 0-6 2-6 6v2h11v8H35v27z" transform="translate(0 5) scale(.88)" fill="${palette.white}"/><circle cx="47" cy="48" r="5" fill="${palette.white}"/></svg>\n`
);
writeFileSync(
  join(outputDir, "..", "..", "src", "styles", "brand.css"),
  `/* Generated by pnpm icons:generate from lib/brand.ts. */\n:root {\n  --brand-primary: ${palette.primary};\n  --brand-primary-strong: ${palette.strong};\n  --brand-light-background: ${palette.lightBackground};\n  --brand-dark-background: ${palette.darkBackground};\n}\n`
);
