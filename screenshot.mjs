import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASES = [
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData/Local/Temp/puppeteer-test') : null,
  'C:/Users/Mark Abe/AppData/Local/Temp/puppeteer-test',
].filter(Boolean);

async function loadPuppeteer() {
  for (const base of BASES) {
    const pkg = path.join(base, 'package.json');
    if (!fs.existsSync(pkg)) continue;
    try { return createRequire(pkg)('puppeteer'); } catch {}
  }
  throw new Error('puppeteer not found');
}

const url = 'http://localhost:3000/index.html';
const outDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: '360', w: 360, h: 740 },
  { name: '480', w: 480, h: 800 },
  { name: '768', w: 768, h: 1024 },
  { name: '1024', w: 1024, h: 768 },
  { name: '1440', w: 1440, h: 900 },
];

// scroll positions targeting ScrollTrigger progress (matches section enter/leave centers)
const positions = [
  { name: 'hero', stProgress: -0.5 },           // way before scroll-container = pure hero
  { name: 'intro', stProgress: 0.23 },          // section 001 center
  { name: 'display', stProgress: 0.36 },        // section 002 center
  { name: 'sensors', stProgress: 0.50 },        // section 003 center
  { name: 'power', stProgress: 0.63 },          // section 004 center
  { name: 'case', stProgress: 0.74 },           // section 005 center
  { name: 'stats', stProgress: 0.84 },          // section 006 center
  { name: 'dissection', stProgress: 0.93 },     // section 007 center
  { name: 'cta', stProgress: 0.985 },           // section 008 center
];

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

for (const vp of viewports) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
  // wait for loader to disappear (frames + GSAP boot)
  try {
    await page.waitForFunction(
      () => document.getElementById('loader')?.classList.contains('loaded'),
      { timeout: 30000 }
    );
  } catch { /* continue regardless */ }
  await new Promise(r => setTimeout(r, 600));

  for (const p of positions) {
    await page.evaluate((stProgress) => {
      if (stProgress < 0) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      const sc = document.getElementById('scroll-container');
      if (!sc) { window.scrollTo({ top: 0, behavior: 'instant' }); return; }
      const rect = sc.getBoundingClientRect();
      const scTop = rect.top + window.pageYOffset;
      const scHeight = sc.offsetHeight;
      const targetY = scTop + stProgress * (scHeight - window.innerHeight);
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }, p.stProgress);
    // wait for scroll-bound animations + GSAP timeline to settle
    await new Promise(r => setTimeout(r, 1100));
    const out = path.join(outDir, `vp-${vp.name}-${p.name}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(out);
  }

  await page.close();
}

await browser.close();
console.log('done');
