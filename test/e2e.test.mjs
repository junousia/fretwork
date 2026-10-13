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

  // identify tab: click an open C chord onto the board, read the match, open it in Chords
  await page.click('a[data-tab="identify"]');
  await page.waitForSelector('#view-identify rect.hit');
  assert((await page.textContent('#id-result')).includes('No notes marked'), `${label}: identify starts empty`);
  for (const [str, fret] of [[1, 1], [3, 2], [4, 3]]) await page.click(`#view-identify rect.hit[data-s="${str}"][data-f="${fret}"]`, { force: true });
  await page.click('#view-identify rect.hit[data-s="0"][data-f="0"]', { force: true });
  await page.click('#view-identify rect.hit[data-s="2"][data-f="0"]', { force: true });
  const first = await page.textContent('#id-matches .match .nm');
  assert(first === 'C', `${label}: clicked notes identify as C (got ${first})`);
  assert((await page.$$('#view-identify .board svg circle[r="12.5"]:not([opacity])')).length === 5, `${label}: the five marked notes are drawn`);
  await page.selectOption('#view-identify select[data-s="5"]', '0');
  assert((await page.textContent('#id-matches .match .nm')) === 'C/E', `${label}: adding the open low E makes it C/E`);
  await page.click('#id-play');
  await page.click('#id-clear');
  assert((await page.textContent('#id-result')).includes('No notes marked'), `${label}: Clear empties the board`);
  await page.selectOption('#view-identify select[data-s="0"]', '0'); await page.selectOption('#view-identify select[data-s="1"]', '0');
  await page.selectOption('#view-identify select[data-s="2"]', '0'); await page.selectOption('#view-identify select[data-s="3"]', '2'); await page.selectOption('#view-identify select[data-s="4"]', '2'); await page.selectOption('#view-identify select[data-s="5"]', '0');
  assert((await page.textContent('#id-matches .match .nm')) === 'Em', `${label}: per-string selects work (Em)`);
  await page.click('#id-matches .match a.open');
  await page.waitForSelector('#view-chords:not([hidden])');
  assert((await page.textContent('#view-chords .chordhead h2')).startsWith('E '), `${label}: Open in Chords selects the chord`);
  assert((await page.getAttribute('#ch-roots .chip[aria-pressed="true"]', 'data-r')) === '4', `${label}: Chords root is E`);

  // tab editor: click a cell, type frets, change lengths, undo, persist, play
  await page.click('a[data-tab="tab"]');
  await page.waitForSelector('#tb-surface .tabhit');
  const frets = () => page.$$eval('#tb-surface .fret', e => e.map(x => `${x.textContent}@${x.dataset.bar}.${x.dataset.at}.${x.dataset.s}`).join(' '));
  assert((await frets()) === '', `${label}: the tab starts empty`);
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="5"]');
  await page.keyboard.press('3'); await page.waitForTimeout(800);
  await page.keyboard.press('5'); await page.waitForTimeout(800);
  assert((await frets()) === '3@0.0.5 5@0.2.5', `${label}: typed frets land on the clicked string, one eighth apart (${await frets()})`);
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.waitForTimeout(800);
  assert((await frets()).endsWith('12@0.4.5'), `${label}: two digits typed together make fret 12`);
  await page.keyboard.press('Control+z');
  assert((await frets()) === '3@0.0.5 5@0.2.5', `${label}: undo removes the whole two-digit entry`);
  await page.keyboard.press('Control+y');
  assert((await frets()).endsWith('12@0.4.5'), `${label}: redo brings it back`);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('0'); await page.waitForTimeout(800);
  assert((await frets()).includes('0@0.4.4'), `${label}: arrows move the cursor (string up, one eighth back)`);
  await page.click('#tb-len button[data-len="3"]');                  // quarter notes from here on
  await page.click('#tb-surface .tabhit[data-bar="1"][data-at="0"][data-s="2"]');
  await page.keyboard.press('7'); await page.waitForTimeout(800); await page.keyboard.press('9'); await page.waitForTimeout(800);
  assert((await frets()).endsWith('7@1.0.2 9@1.4.2'), `${label}: quarter notes advance four steps`);
  await page.keyboard.press('Backspace');                                // empty cell: steps back one quarter, onto the 9
  await page.click('#tb-pad button[data-d="5"]'); await page.waitForTimeout(800);
  assert((await frets()).includes('5@1.4.2') && !(await frets()).includes('9@1.4.2'), `${label}: Backspace stepped back and the number pad replaced the 9 with a 5`);
  await page.fill('#tb-chord', 'Em7'); await page.press('#tb-chord', 'Tab');
  assert((await page.textContent('#tb-surface .tabchord')) === 'Em7', `${label}: the bar chord is drawn above the bar`);
  await page.fill('#tb-chord', 'Xyz'); await page.press('#tb-chord', 'Tab');
  assert((await page.getAttribute('#tb-chord', 'aria-invalid')) === 'true', `${label}: an unreadable chord name is flagged`);
  await page.fill('#tb-chord', 'Em7'); await page.press('#tb-chord', 'Tab');
  const bars0 = (await page.$$eval('#tb-surface .tabbar', e => e.length));
  await page.click('#tb-addbar');
  assert((await page.$$eval('#tb-surface .tabbar', e => e.length)) > bars0 && (await page.textContent('#tb-barno')) === '3', `${label}: Add bar adds a bar after the current one`);
  const before = await frets();
  await page.reload({ waitUntil: 'networkidle' }); await page.click('a[data-tab="tab"]');
  assert((await frets()) === before, `${label}: the tab is still there after a reload`);
  await page.click('#tb-play');
  await page.waitForSelector('#tb-surface .tabplayhead', { timeout: 3000 });
  assert((await page.textContent('#tb-play')).includes('Stop'), `${label}: Play turns into Stop and a playhead runs`);
  await page.click('#tb-play');
  assert((await page.textContent('#tb-play')).includes('Play'), `${label}: Stop turns back into Play`);
  await page.click('button[data-inst="ukulele"]');
  assert((await page.$$eval('#tb-surface svg:first-child .tabline', e => e.length)) % 4 === 0 && (await page.$$eval('#tb-surface .tabname', e => [...new Set(e.map(x => x.textContent))].join(''))) === 'AECG' && (await frets()) === '', `${label}: the ukulele has its own four-string tab`);
  await page.click('button[data-inst="guitar"]');
  assert((await frets()) === before, `${label}: switching back restores the guitar tab`);

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
  assert(await page.isHidden('#optbar'), `${label}: the setup menu starts collapsed`);
  await page.click('#menu-btn');
  assert(await page.isVisible('#tuning-select') && (await page.getAttribute('#menu-btn', 'aria-expanded')) === 'true', `${label}: the menu button opens the setup`);
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
  // a tablet-sized window keeps the tab bar at the bottom (the side rail is for wide desktops)
  const tab = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const tbp = await tab.newPage();
  await tbp.goto(origin, { waitUntil: 'networkidle' });
  const bar = await tbp.$eval('.tabbar', el => { const r = el.getBoundingClientRect(); return { top: r.top, w: r.width, vw: innerWidth, vh: innerHeight }; });
  assert(bar.w === bar.vw && bar.top > bar.vh / 2, `${label}: on a tablet the tab bar is a full-width bottom bar`);
  await tab.close();
  // phone: choosing a scale position scrolls the neck so that position is on screen
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await ph.newPage();
  await pp.goto(origin + '#scales', { waitUntil: 'networkidle' });
  for (const n of [1, 4, 7]) {
    await pp.click(`#sc-posseg button[data-pos="${n}"]`);
    const vis = await pp.evaluate(() => {
      const box = document.querySelector('#view-scales .board').getBoundingClientRect();
      const dots = [...document.querySelectorAll('#view-scales .board svg circle[r="12.5"]:not([opacity])')].map(c => c.getBoundingClientRect());
      return { n: dots.length, inView: dots.filter(d => d.left >= box.left - 1 && d.right <= box.right + 1).length };
    });
    assert(vis.n > 5 && vis.inView >= vis.n * 0.6, `${label}: phone, position ${n} is scrolled into view (${vis.inView}/${vis.n} notes visible)`);
  }
  // phone: the root and scale pickers are selects; the long chord-builder starts folded
  assert(await pp.isVisible('#sc-rootsel') && await pp.isHidden('#sc-roots'), `${label}: phone uses a root drop-down`);
  await pp.goto(origin + '#chords', { waitUntil: 'networkidle' });
  assert(await pp.$eval('#ch-builder', d => !d.open), `${label}: phone starts with the chord builder folded`);
  await ph.close();
  // the Load menu holds both the examples and the common progressions
  await page.click('a[data-tab="progressions"]');
  await page.selectOption('#pr-libprog', 'e1');
  assert((await page.inputValue('#pr-prog')) === 'Dm7 G7 Cmaj7', `${label}: choosing an example loads it`);
  assert(await page.isHidden('#pr-libkey'), `${label}: the key picker is only for common progressions`);
  await page.selectOption('#pr-libprog', 'p0');
  assert(await page.isVisible('#pr-libkey'), `${label}: common progressions get a key picker`);
  await page.fill('#pr-prog', 'Dm7 G7 Cmaj7'); await page.waitForFunction(() => document.querySelectorAll('#pr-strip .chip').length === 3);
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
