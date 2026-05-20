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
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

// ============ TEST 1: Anchor scroll on desktop ============
console.log('\n=== Anchor scroll test (desktop 1440) ===');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  try {
    await page.waitForFunction(
      () => document.getElementById('loader')?.classList.contains('loaded'),
      { timeout: 30000 }
    );
  } catch {}
  await new Promise(r => setTimeout(r, 800));

  const startY = await page.evaluate(() => window.scrollY);
  console.log(`  start scrollY: ${startY}`);

  const anchors = ['#features', '#dissection', '#reserve', '#hero'];
  for (const anchor of anchors) {
    await page.click(`a[href="${anchor}"]:not(.mm-cta)`).catch(async () => {
      // fallback: any anchor matching
      await page.evaluate((a) => {
        const el = document.querySelector(`a[href="${a}"]`);
        if (el) el.click();
      }, anchor);
    });
    // wait for lenis duration (1.6s) + buffer
    await new Promise(r => setTimeout(r, 2000));
    const y = await page.evaluate(() => window.scrollY);
    console.log(`  click ${anchor.padEnd(12)} → scrollY: ${y}`);
  }
  await page.close();
}

// ============ TEST 2: Mobile menu open + anchor click ============
console.log('\n=== Mobile menu test (360 width) ===');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  try {
    await page.waitForFunction(
      () => document.getElementById('loader')?.classList.contains('loaded'),
      { timeout: 30000 }
    );
  } catch {}
  await new Promise(r => setTimeout(r, 800));

  // Click hamburger
  await page.click('#menu-btn');
  await new Promise(r => setTimeout(r, 500));
  const menuOpen = await page.evaluate(() =>
    !document.getElementById('mobile-menu').hidden
  );
  console.log(`  menu opened: ${menuOpen}`);

  // Click "Dissection" anchor in mobile menu
  await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('#mobile-menu a'))
      .find(x => x.getAttribute('href') === '#dissection');
    if (a) a.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  const afterY = await page.evaluate(() => window.scrollY);
  const menuClosed = await page.evaluate(() =>
    document.getElementById('mobile-menu').hidden
  );
  console.log(`  click → scrollY: ${afterY}, menu closed: ${menuClosed}`);
  await page.close();
}

await browser.close();
console.log('\ndone');
