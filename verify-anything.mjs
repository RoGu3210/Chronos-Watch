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

const outDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });

for (const vp of [{n:'desktop',w:1440,h:900},{n:'mobile',w:380,h:780}]) {
  // anything.html
  const p1 = await browser.newPage();
  await p1.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  await p1.goto('http://localhost:3000/anything.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3500)); // let video + animations settle
  await p1.screenshot({ path: path.join(outDir, `anything-${vp.n}.png`), fullPage: false });
  await p1.close();

  // product.html — étude link section
  const p2 = await browser.newPage();
  await p2.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  await p2.goto('http://localhost:3000/product.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p2.evaluate(() => {
    const el = document.querySelector('.etude-link');
    if (el) el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -60);
  });
  await new Promise(r => setTimeout(r, 600));
  await p2.screenshot({ path: path.join(outDir, `product-etude-${vp.n}.png`), fullPage: false });
  await p2.close();
}

await browser.close();
console.log('done');
