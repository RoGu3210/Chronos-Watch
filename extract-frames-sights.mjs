/**
 * extract-frames-sights.mjs
 *
 * Step 5 of the Sights workflow.
 * Takes a transition video and extracts a WebP image sequence into frames/sights/
 * that the Sights.html page plays back as you scroll.
 *
 *   node extract-frames-sights.mjs <path-to-video> [fps] [width] [quality]
 *
 * Examples:
 *   node extract-frames-sights.mjs sagrada-transition.mp4
 *   node extract-frames-sights.mjs sagrada-transition.mp4 30 1600 80
 *
 * Defaults: fps=30, width=1600 (preserves aspect ratio), quality=80 (WebP 0-100).
 *
 * Output:
 *   frames/sights/0001.webp .. NNNN.webp   — the image sequence
 *   frames/sights/manifest.json            — { count, ext, fps, width, quality }
 *
 * Why WebP: 25-35% smaller than JPG at equal visual quality, supported in all
 * modern browsers, optional alpha + lossless modes — see SCROLL-ANIMATION-BEST-PRACTICES.md
 *
 * Why a manifest: the page reads frame count once from manifest.json so it can
 * batch-preload all frames upfront (browsers limit ~6 concurrent requests per
 * domain, so batches of 15-20 are the sweet spot) instead of probing one by one.
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, 'frames', 'sights');

// ---------- args ----------
const [videoArg, fpsArg, widthArg, qualityArg] = process.argv.slice(2);
if (!videoArg) {
  console.error('\nUsage:  node extract-frames-sights.mjs <video> [fps=30] [width=1600] [quality=80]\n');
  process.exit(1);
}
const videoPath = resolve(videoArg);
if (!existsSync(videoPath)) {
  console.error('Video not found:', videoPath);
  process.exit(1);
}
const fps     = parseInt(fpsArg     || '30', 10);
const width   = parseInt(widthArg   || '1600', 10);
const quality = parseInt(qualityArg || '80', 10);

// ---------- check ffmpeg ----------
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch (e) {
  console.error('\nffmpeg is not on PATH. Install it from https://ffmpeg.org and retry.\n');
  process.exit(1);
}

// ---------- prepare output dir + wipe old frames ----------
if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });
let wiped = 0;
for (const name of readdirSync(FRAMES_DIR)) {
  if (/^\d{4}\.(jpg|png|webp)$/i.test(name)) {
    unlinkSync(join(FRAMES_DIR, name));
    wiped++;
  }
}
if (wiped) console.log(`Cleared ${wiped} previous frame(s).`);

// ---------- run ffmpeg (WebP output via libwebp) ----------
const pattern = join(FRAMES_DIR, '%04d.webp');
const vf = `fps=${fps},scale=${width}:-2`;
const args = [
  '-y',
  '-hide_banner',
  '-loglevel', 'warning',
  '-i', videoPath,
  '-vf', vf,
  '-c:v', 'libwebp',
  '-quality', String(quality),
  '-compression_level', '5',
  '-preset', 'picture',
  pattern
];

console.log(`\nExtracting from: ${basename(videoPath)}`);
console.log(`fps=${fps}  width=${width}  quality=${quality}  →  ${pattern}\n`);

const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('\nffmpeg exited with code', r.status);
  process.exit(r.status || 1);
}

// ---------- report + write manifest ----------
const frames = readdirSync(FRAMES_DIR)
  .filter(n => /^\d{4}\.webp$/.test(n))
  .sort();
const sizes = frames.map(n => statSync(join(FRAMES_DIR, n)).size);
const total = sizes.reduce((a, b) => a + b, 0);
const avg   = frames.length ? total / frames.length : 0;

const manifest = {
  count: frames.length,
  ext: 'webp',
  fps,
  width,
  quality,
  pad: 4,
  generated: new Date().toISOString(),
};
writeFileSync(join(FRAMES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('');
console.log(`✓ Wrote ${frames.length} frame(s).`);
console.log(`  total:   ${(total/1024/1024).toFixed(1)} MB`);
console.log(`  average: ${(avg/1024).toFixed(0)} KB / frame`);
console.log(`  range:   ${frames[0]} (${(sizes[0]/1024).toFixed(0)} KB) → ${frames[frames.length-1]} (${(sizes[sizes.length-1]/1024).toFixed(0)} KB)`);
console.log(`  manifest: frames/sights/manifest.json`);
console.log('\nReload Sights.html — the page will read the manifest, batch-preload all frames behind a loading screen, then play them on scroll.\n');
