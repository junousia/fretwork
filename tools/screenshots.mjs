// Regenerates the README screenshots in docs/screenshots/ from the real app (headless Chromium),
// with fixed content so they only change when the app does.  Usage: npm run docs:screenshots
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots');
const PORT = 8160;
const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { cwd: root, stdio: 'pipe' });
await new Promise(res => server.stdout.on('data', res));
const browser = await chromium.launch();
try {
const origin = `http://localhost:${PORT}/`;

/** A fresh browser context (empty storage), a page on `hash`, and the viewport given. */
async function open(hash, { width, height, scale = 1 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'light', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(origin + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  return { ctx, page };
}
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, name), ...opts }); console.log('wrote', name); };

// Progressions: the autumn changes, D7 selected, one scale position, a voicing
{
  const { ctx, page } = await open('#progressions', { width: 1280, height: 900 });
  await page.waitForSelector('#pr-strip .vdiag');
  await page.click('#pr-strip .chip:nth-child(2)');
  await page.click('#pr-posseg button[data-pos="3"]');
  await page.evaluate(() => document.querySelector('.view').scrollTo?.(0, 0));
  await shot(page, 'progressions.png'); await ctx.close();
}
// Scales on a phone
{
  const { ctx, page } = await open('#scales', { width: 390, height: 844, scale: 2 });
  await page.click('#sc-posseg button[data-pos="4"]');
  await shot(page, 'scales-phone.png'); await ctx.close();
}
// Chords: a barre voicing and the chord builder
{
  const { ctx, page } = await open('#chords', { width: 1280, height: 900 });
  await page.waitForSelector('#ch-voseg');
  await page.click('#ch-voseg button[data-vo="2"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'chords.png'); await ctx.close();
}
// Identify: an open C chord marked on the neck
{
  const { ctx, page } = await open('#identify', { width: 1280, height: 900 });
  for (const [s, f] of [[0, 0], [1, 1], [2, 0], [3, 2], [4, 3]]) await page.click(`#view-identify rect.hit[data-s="${s}"][data-f="${f}"]`, { force: true });
  await shot(page, 'identify.png'); await ctx.close();
}
/** The Compose page with a generated 12-bar blues solo (fixed seed). */
async function composePage(opts) {
  const { ctx, page } = await open('#compose', opts);
  await page.waitForSelector('#tb-surface .tabhit');
  await page.evaluate(() => { for (const id of ['#tb-p-gen', '#tb-p-share']) /** @type {any} */ (document.querySelector(id)).hidden = false; /** @type {any} */ (document.querySelector('#tb-more')).open = true; });
  await page.uncheck('#tb-autoplay');
  await page.selectOption('#tb-key', '9:major'); await page.selectOption('#tb-prog', { label: '12-bar blues' }); await page.click('#tb-useprog');
  await page.selectOption('#tb-style', 'blues'); await page.selectOption('#tb-feel', 'shuffle'); await page.selectOption('#tb-evolve', 'arc');
  await page.selectOption('#tb-density', 'medium'); await page.selectOption('#tb-gentech', 'some');
  await page.fill('#tb-seed', '4242'); await page.dispatchEvent('#tb-seed', 'change');
  await page.fill('#tb-title', 'Twelve-bar blues in A'); await page.press('#tb-title', 'Tab');
  await page.click('#tb-gen-go');
  await page.evaluate(() => { for (const id of ['#tb-p-gen', '#tb-p-share']) /** @type {any} */ (document.querySelector(id)).hidden = true; /** @type {any} */ (document.querySelector('#tb-more')).open = false; });
  return { ctx, page };
}
{
  const { ctx, page } = await composePage({ width: 1280, height: 1100 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'compose.png'); await ctx.close();
}
{
  const { ctx, page } = await composePage({ width: 390, height: 844, scale: 2 });
  await page.evaluate(() => document.querySelector('#tb-chords')?.scrollIntoView());
  await shot(page, 'compose-phone.png'); await ctx.close();
}
// The PDF sheet (what the print dialog turns into the PDF), as an image of the first page
{
  const { ctx, page } = await composePage({ width: 794, height: 1123 });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => { document.body.style.margin = '0'; const s = /** @type {HTMLElement} */ (document.querySelector('#print-sheet')); s.style.padding = '48px 40px'; s.style.boxSizing = 'border-box'; });
  await shot(page, 'pdf.png', { clip: { x: 0, y: 0, width: 794, height: 1123 } }); await ctx.close();
}
} finally {
  await browser.close();
  server.kill();
}
