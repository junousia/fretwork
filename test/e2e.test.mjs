// Browser smoke test: serves ./site (at / and under /fretwork/ like GitHub
// Pages) and drives it with Playwright. Needs: npm i && npx playwright install chromium
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };

function serve(port, base) {
  const p = spawn(process.execPath, ['tools/serve.mjs', String(port)], { cwd: root, env: { ...process.env, BASE: base }, stdio: 'pipe' });
  return new Promise(res => p.stdout.on('data', () => res(p)));
}

async function run(browser, origin, label) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()));

  await page.goto(origin, { waitUntil: 'networkidle' });
  assert((await page.title()).startsWith('Fretwork'), `${label}: title is branded Fretwork`);
  assert((await page.textContent('.brand')) === 'Fretwork', `${label}: brand text`);

  // service worker takes control
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), `${label}: service worker controls the page`);
  const manifestOk = await page.evaluate(async () => (await (await fetch(document.querySelector('link[rel=manifest]').href)).json()).name);
  assert(manifestOk === 'Fretwork', `${label}: manifest reachable`);

  // chords tab: voicing + builder
  await page.click('a[data-tab="chords"]');
  await page.waitForSelector('#ch-voseg');
  await page.click('#ch-voseg button[data-vo="2"]');
  assert((await page.$$('#view-chords .board svg circle')).length > 0, `${label}: chords board renders`);
  await page.click('.bseg button[data-f="minor"]'); await page.click('.bseg button[data-f="7"]');
  assert((await page.textContent('.bcount')).includes('match'), `${label}: builder filters the list`);
  await page.click('#ch-bclear');

  // scales tab: position selector
  await page.click('a[data-tab="scales"]');
  await page.click('#sc-posseg button[data-pos="3"]');
  const bright = await page.$$eval('#view-scales .board svg circle[r="12.5"]:not([opacity])', c => c.length);
  assert(bright > 5, `${label}: a scale position lights its notes (${bright})`);

  // progressions: chip diagrams
  await page.click('a[data-tab="progressions"]');
  await page.waitForSelector('#pr-strip .chip .vdiag');
  assert((await page.$$('#pr-strip .chip .vdiag')).length >= 3, `${label}: chord chips show fingering diagrams`);

  // offline: everything still works from the service worker cache
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.click('a[data-tab="chords"]');
  await page.waitForSelector('#ch-voseg');
  assert((await page.$$('#ch-voseg button')).length > 2, `${label}: voicing data loads offline`);
  assert((await page.evaluate(() => document.fonts.check('16px "Familjen Grotesk"'))), `${label}: font available offline`);
  await ctx.setOffline(false);

  assert(errors.length === 0, `${label}: console/page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

const browser = await chromium.launch();
const s1 = await serve(8101, '');
const s2 = await serve(8102, '/fretwork');
try {
  await run(browser, 'http://localhost:8101/', 'root');
  await run(browser, 'http://localhost:8102/fretwork/', 'subpath');
} finally {
  s1.kill(); s2.kill(); await browser.close();
}
console.log(`E2E smoke (root + /fretwork/ subpath, offline): ${failures} failure(s)`);
if (failures) process.exit(1);
