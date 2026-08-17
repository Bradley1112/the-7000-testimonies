// Generates the four pixel-art scenes as SVG, plus a PNG banner for the email.
//
//   node scripts/pixel-art/generate.mjs
//
// Why generate rather than commit binaries: the art stays reviewable and
// editable in git, and a palette tweak is a one-line change rather than a
// round trip through an image editor.
//
// Output is deterministic — the noise uses a seeded PRNG — so re-running this
// without editing anything produces byte-identical files and no git churn.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELIJAH_ARMS_RAISED, ELIJAH_RUNNING, ELIJAH_HUDDLED, ELIJAH_CLOAKED,
  PROPHET_FALLING, ALTAR, BROOM_TREE, FAITHFUL_SILHOUETTE,
} from './sprites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'public', 'scenes');

// 16:9 at a true 8-bit resolution. Big enough for a readable figure, small
// enough that the pixels stay honestly chunky when scaled to full viewport.
const W = 192;
const H = 108;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). Seeded per scene so stars and sand grain
// land in the same place on every run.
// ---------------------------------------------------------------------------
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.px = new Array(w * h).fill(null); // null = transparent
  }
  set(x, y, colour) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !colour) return;
    this.px[y * this.w + x] = colour;
  }
  rect(x, y, w, h, colour) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, colour);
  }
  /** Horizontal band, used for skies and ground. */
  band(y, h, colour) { this.rect(0, y, this.w, h, colour); }

  /**
   * Blit a sprite. `palette` maps sprite characters to hex colours; a character
   * missing from the palette is skipped, which lets one sprite serve several
   * scenes by simply omitting layers.
   */
  sprite(art, x, y, palette, { flip = false } = {}) {
    art.forEach((row, j) => {
      const chars = flip ? [...row].reverse() : [...row];
      chars.forEach((ch, i) => {
        if (ch === '.') return;
        this.set(x + i, y + j, palette[ch]);
      });
    });
  }

  /** Scatter n points in a box. Used for stars and blowing sand. */
  scatter(n, x0, y0, x1, y1, colours, rand) {
    for (let k = 0; k < n; k++) {
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      this.set(x, y, colours[Math.floor(rand() * colours.length)]);
    }
  }

  /**
   * Run-length encode each row into <rect> elements. A naive one-rect-per-pixel
   * SVG of this canvas is ~20k nodes; merging horizontal runs cuts it by an
   * order of magnitude and keeps the browser from choking on four of them.
   */
  toSVG({ background = null, extra = '' } = {}) {
    const parts = [];
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.px[y * this.w + x];
        if (!c) { x++; continue; }
        let run = 1;
        while (x + run < this.w && this.px[y * this.w + x + run] === c) run++;
        parts.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`);
        x += run;
      }
    }
    const bg = background ? `<rect width="${this.w}" height="${this.h}" fill="${background}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" `
      + `width="${this.w * 6}" height="${this.h * 6}" shape-rendering="crispEdges" `
      + `role="img" aria-label="Pixel art scene from 1 Kings 18-19">`
      + bg + parts.join('') + extra + `</svg>`;
  }
}

// ---------------------------------------------------------------------------
// Shared palette anchors. The scenes use narrative earth tones, but every scene
// is framed in the site green so the sequence stays tied to the brand.
// ---------------------------------------------------------------------------
const GREEN = '#454B1B';

// ===========================================================================
// SCENE 1 — The Fire on Carmel (1 Kings 18)
// ===========================================================================
function scene1() {
  const c = new Canvas(W, H);
  const rand = rng(1801);

  // Storm-dark sky, banded lighter toward the horizon.
  const sky = ['#1a1526', '#241a2e', '#2e2036', '#3a273c', '#4a3042'];
  sky.forEach((col, i) => c.band(i * 9, 9, col));
  c.band(45, 12, '#5a3a44');

  // Distant Carmel ridgeline.
  for (let x = 0; x < W; x++) {
    const ridge = 57 + Math.round(4 * Math.sin(x / 13) + 2 * Math.sin(x / 5));
    c.rect(x, ridge, 1, H - ridge, '#2b2333');
  }
  // Ground.
  c.band(70, H - 70, '#3d3040');
  c.band(74, H - 74, '#4a3a3e');

  // The fire beam: a wide column of pixel fire from the top of the screen down
  // onto the altar. Layered hot-to-cool outward so it reads as flame, not a bar.
  const beamX = 118;
  const layers = [
    { off: -9, w: 3, col: '#7a2d12' }, { off: -6, w: 3, col: '#c4471a' },
    { off: -3, w: 3, col: '#f08a22' }, { off: 0, w: 4, col: '#ffc94a' },
    { off: 4, w: 3, col: '#f08a22' }, { off: 7, w: 3, col: '#c4471a' },
    { off: 10, w: 3, col: '#7a2d12' },
  ];
  for (const L of layers) {
    for (let y = 0; y < 74; y++) {
      // Waver the edges so the column has flame movement rather than straight sides.
      const j = Math.round(1.6 * Math.sin(y / 4 + L.off));
      c.rect(beamX + L.off + j, y, L.w, 1, L.col);
    }
  }
  // White-hot core.
  for (let y = 0; y < 74; y++) {
    const j = Math.round(1.2 * Math.sin(y / 5));
    c.rect(beamX + 1 + j, y, 2, 1, '#fff4d0');
  }
  // Sparks thrown off the column.
  c.scatter(90, beamX - 26, 8, beamX + 34, 72, ['#ffc94a', '#f08a22', '#fff4d0'], rand);

  // Altar, soaked, under the strike. Lit warm on the side facing the fire.
  c.sprite(ALTAR, beamX - 12, 60, {
    T: '#8a6a3a', S: '#6f6d78', M: '#4a4954', W: '#3f6b8a',
  });

  // Elijah alone on the left, arms raised.
  c.sprite(ELIJAH_ARMS_RAISED, 26, 50, {
    H: '#2a1f18', F: '#c98f6a', S: '#8a6a4a', A: '#d8c9a8', R: '#7a6a4a', L: '#5a4a38', B: '#332821',
  });

  // Prophets of Baal scattering backward on the right.
  c.sprite(PROPHET_FALLING, 150, 60, { P: '#5e2a3a', A: '#c98f6a', L: '#43202c' });
  c.sprite(PROPHET_FALLING, 166, 68, { P: '#4a2230', A: '#b07a5a', L: '#361a24' }, { flip: true });
  c.sprite(PROPHET_FALLING, 141, 76, { P: '#6a3040', A: '#c98f6a', L: '#4a2430' });

  // Firelight thrown onto the ground.
  c.scatter(40, beamX - 34, 74, beamX + 40, H, ['#6a4a3a', '#8a5a3a'], rand);

  return c.toSVG({ background: '#1a1526' });
}

// ===========================================================================
// SCENE 2 — The Run into the Desert (1 Kings 19)
// ===========================================================================
function scene2() {
  const c = new Canvas(W, H);
  const rand = rng(1902);

  // Bleached, scorching sky.
  const sky = ['#e8b878', '#eec288', '#f2cc98', '#f6d6a8', '#f8dfb8'];
  sky.forEach((col, i) => c.band(i * 8, 8, col));
  c.band(40, 12, '#fae7c8');

  // Hard pixel sun with a stepped corona.
  const sx = 150, sy = 22;
  c.rect(sx - 9, sy - 9, 18, 18, '#ffe9a0');
  c.rect(sx - 7, sy - 11, 14, 22, '#ffe9a0');
  c.rect(sx - 11, sy - 7, 22, 14, '#ffe9a0');
  c.rect(sx - 6, sy - 6, 12, 12, '#fff6d8');
  c.rect(sx - 4, sy - 8, 8, 16, '#fff6d8');
  c.rect(sx - 8, sy - 4, 16, 8, '#fff6d8');

  // Rolling dunes, three depths, palest at the back.
  const dunes = [
    { base: 56, amp: 3, col: '#d8b184' }, { base: 64, amp: 4, col: '#c9a074' },
    { base: 74, amp: 5, col: '#b98e63' },
  ];
  for (const d of dunes) {
    for (let x = 0; x < W; x++) {
      const y = d.base + Math.round(d.amp * Math.sin(x / 21 + d.base));
      c.rect(x, y, 1, H - y, d.col);
    }
  }
  c.band(88, H - 88, '#a87f56');

  // The broom tree in the distance, where he collapses.
  c.sprite(BROOM_TREE, 158, 52, { G: '#6f7a4a', T: '#6a4f34' });

  // Elijah running, side-scroller style, low and left.
  c.sprite(ELIJAH_RUNNING, 36, 60, {
    H: '#2a1f18', F: '#b87a52', S: '#7a5a3a', A: '#c9b894', R: '#6d5c40', L: '#4e402e', B: '#2e241c',
  });

  // Blowing sand and heat grain.
  c.scatter(120, 0, 58, W, H, ['#c9a074', '#d8b184', '#e0bd90'], rand);
  // Heat shimmer above the dunes.
  c.scatter(50, 0, 46, W, 60, ['#fae7c8', '#f8dfb8'], rand);

  return c.toSVG({ background: '#e8b878' });
}

// ===========================================================================
// SCENE 3 — The Cave and the Elements (1 Kings 19)
// ===========================================================================
function scene3() {
  const c = new Canvas(W, H);
  const rand = rng(1903);

  // Cross-section of the mountain. Thin rock ceiling so the three forces get
  // vertical room — an earlier version wasted the top quarter on solid black.
  c.rect(0, 0, W, H, '#2f2a22');
  c.band(0, 12, '#1c1915');
  for (let x = 0; x < W; x++) {
    const stal = 12 + Math.round(3 * Math.abs(Math.sin(x / 9)) + 2 * Math.abs(Math.sin(x / 3)));
    c.rect(x, 12, 1, stal - 12, '#1c1915');
  }

  // Mountain body on the left, holding the cave.
  c.rect(0, 14, 60, H - 14, '#403830');
  c.rect(0, 18, 56, H - 18, '#4a4136');

  // --- Cave hollow. Interior is deliberately lighter than the surrounding rock
  // so the figure inside stays readable; a true-black cave swallowed him. ------
  c.rect(6, 32, 48, 56, '#221d17');
  c.rect(10, 28, 40, 62, '#221d17');
  // Warm ambient bounce on the cave floor, from the fire outside.
  c.rect(8, 78, 44, 10, '#2b231a');
  // Rough rock lip on the open side.
  for (let y = 28; y < 90; y++) {
    const j = Math.round(2.5 * Math.sin(y / 4));
    c.rect(50 + j, y, 5, 1, '#403830');
  }

  // Elijah huddled inside, looking out. Lit warmer than the cave so he reads.
  c.sprite(ELIJAH_HUDDLED, 18, 66, {
    H: '#3a2a1e', F: '#c08a5e', S: '#8a6440', R: '#7d6848', L: '#63523a', B: '#3e3224',
  });
  // Rim light down his outward-facing side, thrown by the fire to the right.
  for (let y = 68; y < 80; y++) c.set(31, y, '#a8825a');

  const GROUND = 86;
  c.rect(58, GROUND, W - 58, H - GROUND, '#3a332a');
  c.rect(58, GROUND + 4, W - 58, H - GROUND - 4, '#2e281f');

  // === 1. WIND — tearing rocks apart. Zone x 60-104 =========================
  // Swept arcs rather than flat dashes, so it reads as motion across the frame.
  for (let k = 0; k < 34; k++) {
    const y0 = 18 + rand() * 62;
    const x0 = 60 + rand() * 34;
    const len = 8 + rand() * 16;
    const arc = (rand() - 0.5) * 0.5;
    for (let i = 0; i < len; i++) {
      c.set(x0 + i, y0 + Math.round(arc * i), i < len * 0.6 ? '#b9c6d2' : '#7f8b98');
    }
  }
  // Rocks torn loose, each with a short motion trail behind it.
  for (let k = 0; k < 11; k++) {
    const x = 62 + rand() * 34, y = 20 + rand() * 60, s = 2 + Math.floor(rand() * 3);
    c.rect(x, y, s, s, '#6f6559');
    c.rect(x - 5, y + 1, 4, 1, '#55606b');
  }

  // === 2. EARTHQUAKE — the ground shattering. Zone x 104-146 ================
  // Slabs heaved up on both sides of a widening chasm.
  c.rect(104, GROUND - 5, 16, 6, '#4e463a');
  c.rect(106, GROUND - 8, 12, 4, '#584f42');
  c.rect(132, GROUND - 7, 15, 8, '#4e463a');
  c.rect(134, GROUND - 11, 11, 5, '#584f42');
  // The chasm itself: a narrow jagged split, wandering rather than widening.
  // Letting the walls diverge every row turned it into a black pyramid; the
  // width is now bounded and only the centreline drifts.
  let cxc = 124;
  for (let y = GROUND - 3; y < H; y++) {
    cxc += (rand() - 0.5) * 1.6;
    const halfW = 2 + (y - (GROUND - 3)) * 0.14; // opens to ~5px, no more
    c.rect(cxc - halfW, y, halfW * 2, 1, '#0b0906');
    c.set(cxc - halfW - 1, y, '#6f6559');
    c.set(cxc + halfW, y, '#6f6559');
  }
  // Cracks radiating from the chasm mouth.
  for (let k = 0; k < 5; k++) {
    let cx = 118 + rand() * 12;
    const dir = rand() > 0.5 ? 1 : -1;
    for (let i = 0; i < 10 + rand() * 8; i++) {
      cx += dir * (0.4 + rand());
      c.set(cx, GROUND - 4 - i * 0.5, '#1a1610');
    }
  }
  // Dust kicked up by the shock.
  c.scatter(45, 104, GROUND - 22, 148, GROUND, ['#6f6559', '#4e463a', '#857a6b'], rand);

  // === 3. FIRE — a raging wall. Zone x 148-192 =============================
  for (let x = 146; x < W; x++) {
    const top = 22 + Math.round(8 * Math.sin(x / 6) + 5 * Math.sin(x / 3) + 3 * Math.sin(x / 11));
    for (let y = top; y < H; y++) {
      const d = (y - top) / (H - top);
      const col = d < 0.16 ? '#ffe27a' : d < 0.36 ? '#ffb02e' : d < 0.6 ? '#ef6f18' : d < 0.82 ? '#c33f14' : '#7d2610';
      c.set(x, y, col);
    }
  }
  // Embers lifting off the fire wall.
  c.scatter(80, 138, 10, W, 56, ['#ffe27a', '#ffb02e', '#fff2c4'], rand);
  // Firelight spilling left across the ground toward the cave.
  c.scatter(50, 58, GROUND, 150, H, ['#4a3a26', '#5e4629'], rand);

  return c.toSVG({ background: '#2f2a22' });
}

// ===========================================================================
// SCENE 4 — The Whisper and the 7,000 (1 Kings 19)
// ===========================================================================
function scene4() {
  const c = new Canvas(W, H);
  const rand = rng(1904);

  // Deep, quiet night — the opposite of scene 3's violence.
  const sky = ['#0d1424', '#111a2e', '#152038', '#192642', '#1e2d4c', '#243456'];
  sky.forEach((col, i) => c.band(i * 7, 7, col));
  c.band(42, 14, '#2a3b5e');
  c.band(56, 10, '#31446a');

  // Stars.
  c.scatter(150, 0, 0, W, 52, ['#ffffff', '#d6e4ff', '#9fb6dd'], rand);
  c.scatter(30, 0, 0, W, 26, ['#ffffff'], rand);

  // The gentle whisper: a soft glow low on the horizon, drawn as widening
  // translucent bands rather than a hard shape.
  const gx = 96, gy = 66;
  for (let r = 30; r > 0; r -= 3) {
    const shade = ['#31446a', '#3a5079', '#445d89', '#4f6a99', '#5a77a8'][Math.min(4, Math.floor((30 - r) / 7))];
    for (let x = gx - r; x <= gx + r; x++) {
      const dy = Math.round(Math.sqrt(Math.max(0, r * r - (x - gx) * (x - gx))) * 0.42);
      for (let y = gy - dy; y <= gy + dy; y++) c.set(x, y, shade);
    }
  }

  // --- The 7,000: rows of faint silhouettes receding into the glow -----------
  // Drawn back-to-front, dimmest and smallest at the back, so the crowd reads
  // as depth rather than as a repeated stamp.
  const rows = [
    { y: 60, step: 9, tint: '#3d5178' }, { y: 66, step: 10, tint: '#374a70' },
    { y: 73, step: 11, tint: '#324364' },
  ];
  for (const row of rows) {
    for (let x = -4; x < W + 4; x += row.step) {
      const jitter = Math.round((rand() - 0.5) * 3);
      c.sprite(FAITHFUL_SILHOUETTE, x + jitter, row.y, { F: row.tint });
    }
  }

  // The cave mouth Elijah stands in, framing him on the left.
  c.rect(0, 26, 44, H - 26, '#0a0f1a');
  for (let y = 26; y < H; y++) {
    const j = Math.round(3 * Math.sin(y / 7));
    c.rect(40 + j, y, 5, 1, '#0a0f1a');
  }

  // Elijah at the entrance, face covered by his cloak. Pitched a step lighter
  // than the cave mouth behind him, or he disappears into it entirely.
  c.sprite(ELIJAH_CLOAKED, 46, 60, {
    C: '#2b3750', D: '#1e2740', L: '#222c41', B: '#1a2233',
  });
  // Rim light down the cloak's outward edge, thrown by the glow.
  for (let y = 61; y < 82; y++) {
    const w = y < 64 ? 1 : 2;
    c.rect(59, y, w, 1, '#6d88b4');
  }
  c.rect(48, 61, 11, 1, '#4a5f85'); // top of the hood catching the light

  // Ground.
  c.band(84, H - 84, '#141d2e');
  c.band(90, H - 90, '#101828');

  return c.toSVG({ background: '#0d1424' });
}

// ===========================================================================
// Emit
// ===========================================================================
mkdirSync(OUT_DIR, { recursive: true });
const scenes = { 'scene-1-fire': scene1(), 'scene-2-desert': scene2(), 'scene-3-cave': scene3(), 'scene-4-whisper': scene4() };
for (const [name, svg] of Object.entries(scenes)) {
  const p = join(OUT_DIR, `${name}.svg`);
  writeFileSync(p, svg);
  console.log(`  ${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
console.log(`\nWrote ${Object.keys(scenes).length} scenes to public/scenes/`);
console.log(`Run 'node scripts/pixel-art/email-banner.mjs' to rasterise the email header.`);
