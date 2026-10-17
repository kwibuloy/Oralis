// Check selection and the description card with real touch at phone, tablet and desktop sizes.
//   npm run dev                                   (in another terminal)
//   node scripts/touch-check.mjs general --key sternocostal-part-of-left-pectoralis-major
//   node scripts/touch-check.mjs physiology --tap ".function-list__label=Brain areas"
//   node scripts/touch-check.mjs dental --key left-lower-first-secondary-molar-tooth --widths 390,768
// --key taps that part on the model; --tap taps a list item (selector, optionally =text), opening the
// phone drawer first if the item is hidden in it. Rules checked (see the visual-check skill):
//   - a tapped part is flown to, never further out than before, and centred in the free space;
//   - up to 860px wide the card is a bottom sheet that starts as a peek; tapping the peek opens it,
//     swiping down hides it again, and the part stays centred above it each time;
//   - wider (tablet landscape, desktop) the card sits on the right and the part sits between the cards.
// Reduced motion is emulated so the camera lands at once (software WebGL is too slow for tweens).
// Screenshots go to .shots/; exits non-zero if any check fails.
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const key = opt('--key', null);
const tap = opt('--tap', null);
const widths = opt('--widths', '390,768,1024,1440').split(',').map(Number);
const route = args[0] ?? 'general';
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const HEIGHT = { 390: 844, 768: 1024, 1024: 768, 1440: 900 };
const SHEET_MAX = 860;
if (!key && !tap) throw new Error('Pass --key <structure key> or --tap "<selector>[=text]".');

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH.');
mkdirSync('.shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
const check = (w, ok, what) => { if (!ok) failures++; console.log(`${w}  ${ok ? 'ok  ' : 'FAIL'}  ${what}`); };

for (const w of widths) {
  const h = HEIGHT[w] ?? 900;
  const touch = w <= 1024;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${base}#/${route}`, { waitUntil: 'networkidle0', timeout: 90_000 });
  await page.waitForFunction(() => window.__viewer?.meshes?.length > 0, { timeout: 90_000 });
  await sleep(1500);
  const press = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const shot = (name) => page.screenshot({ path: `.shots/touch-${route.replace(/\W+/g, '-')}-${w}-${name}.png` });
  const before = await page.evaluate(() => window.__viewer.camera.position.distanceTo(window.__viewer.controls.target));

  if (key) {
    const pt = await page.evaluate((key) => {
      const v = window.__viewer;
      const m = v.meshes.find((m) => m.userData.key === key);
      if (!m) return null;
      m.geometry.computeBoundingBox();
      const c = new m.geometry.boundingBox.constructor().setFromObject(m).getCenter(new m.position.constructor()).project(v.camera);
      const r = v.canvas.getBoundingClientRect();
      return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
    }, key);
    if (!pt) throw new Error(`No mesh with key ${key} in #/${route}.`);
    await press(pt.x, pt.y);
  } else {
    const [sel, text] = tap.split('=');
    const find = () => page.evaluate((sel, text) => {
      const e = [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.includes(text));
      const b = e?.getBoundingClientRect();
      return b && b.width ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
    }, sel, text);
    let pt = await find();
    if (!pt) { // hidden in the phone drawer
      const toggle = await page.$('.layers-toggle');
      if (toggle) { const b = await toggle.boundingBox(); if (b) await press(b.x + b.width / 2, b.y + b.height / 2); await sleep(400); }
      pt = await find();
    }
    if (!pt) throw new Error(`Nothing matches ${tap}.`);
    await press(pt.x, pt.y);
  }
  await sleep(1200);

  const state = () => page.evaluate((key) => {
    const v = window.__viewer;
    const d = document.querySelector('.detail');
    const card = d?.getBoundingClientRect();
    const layers = document.querySelector('.atlas .layers');
    let part = null;
    const m = key && v.meshes.find((m) => m.userData.key === key);
    if (m) {
      const c = new m.geometry.boundingBox.constructor().setFromObject(m).getCenter(new m.position.constructor()).project(v.camera);
      part = { x: Math.round(((c.x + 1) / 2) * innerWidth), y: Math.round(((1 - c.y) / 2) * innerHeight) };
    }
    return {
      card: !!d, sheet: !!d?.classList.contains('sheet'), collapsed: !!d?.classList.contains('is-collapsed'),
      cardTop: card && Math.round(card.top), cardLeft: card && Math.round(card.left),
      layersRight: layers?.offsetParent ? Math.round(layers.getBoundingClientRect().right) : 0,
      part, dist: v.camera.position.distanceTo(v.controls.target),
    };
  }, key);

  const s1 = await state();
  await shot('tapped');
  check(w, s1.card, 'a description card appears');
  if (key) check(w, s1.dist <= before + 0.01, `camera did not zoom out (${before.toFixed(0)} → ${s1.dist.toFixed(0)})`);
  if (w <= SHEET_MAX) {
    check(w, s1.sheet && s1.collapsed, 'card starts as a peek (title strip)');
    if (s1.part) check(w, s1.part.y > 60 && s1.part.y < s1.cardTop - 20, `part is visible above the peek (y ${s1.part.y}, card top ${s1.cardTop})`);
    await press(60, s1.cardTop + 30);
    await sleep(600);
    const s2 = await state();
    await shot('open');
    check(w, !s2.collapsed, 'tapping the peek opens the card');
    if (s2.part) check(w, s2.part.y > 40 && s2.part.y < s2.cardTop - 10, `part is still visible above the open card (y ${s2.part.y}, card top ${s2.cardTop})`);
    const hd = await page.evaluate(() => { const r = document.querySelector('.detail h2').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 10 }; });
    await page.touchscreen.touchStart(hd.x, hd.y);
    for (let i = 1; i <= 10; i++) { await page.touchscreen.touchMove(hd.x, hd.y + i * 25); await sleep(16); }
    await page.touchscreen.touchEnd();
    await sleep(600);
    const s3 = await state();
    check(w, s3.collapsed, 'swiping down hides the card again');
  } else {
    check(w, !s1.sheet, 'card sits on the right (enough room)');
    if (s1.part) check(w, s1.part.x > s1.layersRight && s1.part.x < s1.cardLeft, `part sits between the cards (x ${s1.part.x}, gap ${s1.layersRight}–${s1.cardLeft})`);
  }
  check(w, !errors.length, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
