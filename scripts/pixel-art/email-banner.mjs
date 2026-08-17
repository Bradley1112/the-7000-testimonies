// Rasterises Scene 4 into the static header banner for the daily email.
//
//   node scripts/pixel-art/email-banner.mjs
//
// Email clients cannot run the scroll sequence — no JS, and no reliable CSS
// animation (Outlook especially). So the email gets one static frame, and the
// brief picks Scene 4 as the most emblematic of the newsletter's name.
//
// PNG rather than SVG on purpose: Outlook's Word-based renderer does not
// support SVG at all, and several webmail clients strip it. PNG is the only
// format that renders everywhere.

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_DIR = join(ROOT, 'public', 'email');

// 600px is the standard safe width for HTML email bodies. We render at 2x for
// retina and let the <img> tag scale it down via width="600".
const BANNER_W = 1200;
const BANNER_H = 480; // 2.5:1 — a banner crop, not the full 16:9 scene

const GREEN = '#454B1B';

const svg = readFileSync(join(ROOT, 'public', 'scenes', 'scene-4-whisper.svg'));

mkdirSync(OUT_DIR, { recursive: true });

// Nearest-neighbour is essential — any smoothing kernel turns pixel art to mush.
const scene = await sharp(svg)
  .resize(BANNER_W, Math.round(BANNER_W * 108 / 192), { kernel: 'nearest' })
  .toBuffer();

// Crop to the banner band, biased to the lower two-thirds where the crowd of
// the 7,000 and Elijah sit. A centred crop cuts the crowd in half.
const sceneH = Math.round(BANNER_W * 108 / 192);
const top = Math.max(0, Math.round(sceneH * 0.09));

await sharp(scene)
  .extract({ left: 0, top, width: BANNER_W, height: Math.min(BANNER_H, sceneH - top) })
  // Green rule along the bottom ties the scene back to the site palette, the
  // same framing device the web sequence uses.
  .composite([{
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_W}" height="${BANNER_H}">
         <rect x="0" y="${BANNER_H - 12}" width="${BANNER_W}" height="12" fill="${GREEN}"/>
       </svg>`
    ),
    top: 0, left: 0,
  }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(OUT_DIR, 'banner-scene4.png'));

const { size } = await sharp(join(OUT_DIR, 'banner-scene4.png')).metadata()
  .then(async () => ({ size: (await import('node:fs')).statSync(join(OUT_DIR, 'banner-scene4.png')).size }));

console.log(`  public/email/banner-scene4.png  ${BANNER_W}x${BANNER_H}  ${(size / 1024).toFixed(1)} KB`);
if (size > 200 * 1024) {
  console.warn('  WARNING: banner is over 200KB. Gmail clips messages above ~102KB of HTML,');
  console.warn('  and large images hurt deliverability. Consider reducing the palette.');
}
