// One-off: generate PNG app icons from public/favicon.svg using sharp.
// sharp is already installed under apps/server/node_modules (no new deps).
// Run from the repo root:  node apps/web/scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
// sharp is installed in the workspace (hoisted to the repo-root node_modules,
// pulled in by the server). Resolve it without adding a web dependency.
const repoRoot = join(here, '..', '..', '..');
const serverReq = createRequire(join(here, '..', '..', 'server', 'package.json'));
let sharp;
for (const resolver of [serverReq, require]) {
  try {
    sharp = resolver('sharp');
    break;
  } catch {
    /* try next */
  }
}
if (!sharp) sharp = require(join(repoRoot, 'node_modules', 'sharp'));

const svg = readFileSync(join(publicDir, 'favicon.svg'));
const BG = '#1c1915'; // ink tile, matches the favicon rounded square

// A plain (non-maskable) icon: the SVG rendered at full size.
async function plain(size, out) {
  const png = await sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain', background: BG }).png().toBuffer();
  writeFileSync(join(publicDir, out), png);
  console.log('wrote', out, size);
}

// A maskable icon: the mark inset into a ~80% safe zone on a full-bleed ink
// background, so platform masks (circles, squircles) never clip the glyph.
async function maskable(size, out) {
  const inner = Math.round(size * 0.72);
  const pad = Math.round((size - inner) / 2);
  const glyph = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: 'contain', background: BG }).png().toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: glyph, top: pad, left: pad }])
    .png()
    .toBuffer();
  writeFileSync(join(publicDir, out), png);
  console.log('wrote', out, size, '(maskable)');
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await plain(180, 'apple-touch-icon.png');
await maskable(192, 'icon-maskable-192.png');
await maskable(512, 'icon-maskable-512.png');
console.log('done');
