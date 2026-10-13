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

  // only the visible tab is built at startup (performance), the others on first visit
  assert(await page.evaluate(() => document.querySelector('#view-progressions').children.length > 0 && document.querySelector('#view-scales').children.length === 0 && document.querySelector('#view-chords').children.length === 0), `${label}: only the visible tab is mounted at startup`);

  // service worker takes control
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), `${label}: service worker controls the page`);
  const manifestOk = await page.evaluate(async () => (await (await fetch(/** @type {HTMLLinkElement} */ (document.querySelector('link[rel=manifest]')).href)).json()).name);
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

  // arpeggios: degree chord inside a scale position (Scales), shape around a fingering (Chords)
  await page.click('#sc-arpseg button[data-k="4"]');
  const arpTone = await page.$$eval('#view-scales .board svg circle[r="12.5"][fill="#E3A21A"]:not([opacity]), #view-scales .board svg circle[r="12.5"][fill="#C23B2E"]:not([opacity])', c => c.length);
  assert(arpTone >= 3, `${label}: the V arpeggio lights chord tones inside the position (${arpTone})`);
  assert((await page.textContent('#view-scales .legend')).includes('Arpeggio'), `${label}: legend names the arpeggio`);
  assert(await page.isEnabled('#sc-arpplay'), `${label}: Play arpeggio is enabled with a position selected`);
  await page.click('#sc-arpplay');
  await page.click('#sc-arpseg button[data-k="none"]');
  await page.click('a[data-tab="chords"]');
  await page.click('#ch-voseg button[data-vo="2"]');
  const onlyFingering = await page.$$eval('#view-chords .board svg circle[r="12.5"]:not([opacity])', c => c.length);
  await page.check('#ch-arp');
  const shape = await page.$$eval('#view-chords .board svg circle[r="12.5"]:not([opacity])', c => c.length);
  assert(shape > onlyFingering, `${label}: the arpeggio shape shows more chord tones than the fingering alone (${shape} > ${onlyFingering})`);
  await page.click('#ch-arpplay');
  await page.uncheck('#ch-arp');
  await page.click('a[data-tab="scales"]');

  // progressions: chip diagrams
  await page.click('a[data-tab="progressions"]');
  await page.waitForSelector('#pr-strip .chip .vdiag');
  assert((await page.$$('#pr-strip .chip .vdiag')).length >= 3, `${label}: chord chips show fingering diagrams`);

  // sharing: the URL carries the progression, key and voicing choice
  await page.fill('#pr-prog', 'Dm7 G7 Cmaj7'); await page.waitForSelector('#pr-strip .chip:nth-child(3)');
  await page.waitForFunction(() => document.querySelectorAll('#pr-strip .chip').length === 3);
  await page.click('#pr-voseg button[data-vo="2"]');
  const shared = await page.evaluate(() => location.href);
  assert(/#progressions\?c=Dm7\+G7\+Cmaj7/.test(shared), `${label}: address bar holds a shareable link (${shared.slice(-80)})`);
  const other = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const op = await other.newPage();
  await op.goto(shared, { waitUntil: 'networkidle' });
  await op.waitForSelector('#pr-strip .chip .vdiag');
  const names = await op.$$eval('#pr-strip .chip b', b => b.map(x => x.textContent));
  assert(names.join(' ') === 'Dm7 G7 Cmaj7', `${label}: a fresh browser opening the link shows the progression (${names})`);
  const picked = await op.$eval('#pr-voseg button[aria-pressed="true"]', b => b.dataset.vo);
  assert(picked === '2', `${label}: the shared voicing choice is restored (${picked})`);
  await other.close();

  // playback: the highlighted chord advances, Stop ends it
  await page.fill('#pr-bpm', '220'); await page.dispatchEvent('#pr-bpm', 'change');
  await page.selectOption('#pr-beats', '1');
  await page.click('#pr-run');
  assert((await page.textContent('#pr-run')).includes('Stop'), `${label}: Play turns into Stop`);
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && seen.size < 3) {
    const i = await page.$$eval('#pr-strip .chip', cs => cs.findIndex(c => c.classList.contains('playing')));
    if (i >= 0) seen.add(i);
    await page.waitForTimeout(40);
  }
  assert(seen.size >= 3, `${label}: playback highlighted ${seen.size} different chords (expected 3)`);
  await page.click('#pr-run');
  await page.waitForTimeout(300);
  assert((await page.$$('#pr-strip .chip.playing')).length === 0, `${label}: Stop clears the playing highlight`);
  assert((await page.textContent('#pr-run')).includes('Play'), `${label}: Stop turns back into Play`);

  // setup: tuning, capo and left-handed change the neck and travel in share links
  await page.selectOption('#tuning-select', 'dadgad');
  assert((await page.$$('#pr-strip .chip')).length === 3, `${label}: the chord strip still renders in DADGAD`);
  await page.selectOption('#tuning-select', 'half-down');
  await page.selectOption('#capo-select', '2');
  const fretX = async n => page.evaluate(n2 => { const t = [...document.querySelectorAll('#view-progressions .board svg text')].find(x => x.textContent === n2); return +t.getAttribute('x'); }, n);
  const normal1 = await fretX('1'), normal15 = await fretX('15');
  assert(normal1 < normal15, `${label}: fret 1 is left of fret 15 for right-handed players`);
  await page.check('#lefty-toggle');
  const left1 = await fretX('1'), left15 = await fretX('15');
  assert(left1 > left15, `${label}: left-handed mirrors the neck (fret 1 right of fret 15)`);
  assert((await page.$$('#view-progressions .board svg title')).length > 0, `${label}: a capo bar is drawn`);
  assert((await page.$$('#pr-strip .chip .vdiag')).length >= 1, `${label}: chip diagrams still render with a capo and half-step-down tuning`);
  const setupUrl = await page.evaluate(() => location.href);
  assert(/t=half-down/.test(setupUrl) && /cp=2/.test(setupUrl) && /lh=1/.test(setupUrl), `${label}: share link carries tuning, capo and handedness (${setupUrl.slice(-60)})`);
  const third = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const tp = await third.newPage();
  await tp.goto(setupUrl, { waitUntil: 'networkidle' });
  assert(await tp.inputValue('#tuning-select') === 'half-down' && await tp.inputValue('#capo-select') === '2' && await tp.isChecked('#lefty-toggle'), `${label}: opening the link restores tuning, capo and handedness`);
  await third.close();
  await page.check('#lefty-toggle', { force: true }).catch(() => {});
  await page.uncheck('#lefty-toggle'); await page.selectOption('#capo-select', '0'); await page.selectOption('#tuning-select', 'standard');

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
