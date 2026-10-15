// Screenshot pages in headless Chrome/Edge at fixed widths and report console errors.
//   npm run dev                       (in another terminal)
//   node scripts/shoot.mjs [--out .shots] [--widths 1440,768,390] home dental histology/enamel ...
// Routes are written without "#/" (Git Bash mangles a leading slash); "home" is the landing page; full URLs work too. Set BASE_URL (default http://localhost:5173/) or CHROME_PATH.
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const out = opt('--out', '.shots');
const widths = opt('--widths', '1440,390').split(',').map(Number);
const pages = args.length ? args : ['home'];
const urlFor = (r) => (r.startsWith('http') ? r : r === 'home' ? base : `${base}#/${r}`);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const HEIGHT = { 1440: 900, 1280: 800, 768: 1024, 390: 844 };

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH.');

mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const path of pages) {
  for (const w of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: HEIGHT[w] ?? 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(urlFor(path), { waitUntil: 'networkidle0', timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 3000)); // models load and camera tweens settle
    const name = `${path.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${w}.png`;
    await page.screenshot({ path: `${out}/${name}` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (errors.length || overflow) failures++;
    console.log(`${out}/${name}${overflow ? '  HORIZONTAL OVERFLOW' : ''}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
