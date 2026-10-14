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

  // every page's title is its name in the navigation (nothing like "Over the changes" for "Progressions")
  for (const a of await page.$$('.tabbar a.tab')) {
    const nav = (await a.textContent()).replace(/^\S\s*/, '').trim();
    await a.click();
    await page.waitForFunction(n => document.querySelector('.view:not([hidden]) h1')?.textContent === n, nav, { timeout: 3000 }).catch(() => {});
    assert((await page.textContent('.view:not([hidden]) h1')) === nav, `${label}: the ${nav} page is titled "${nav}"`);
  }
  await page.click('a[data-tab="progressions"]');

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
  await page.click('a[data-tab="compose"]');
  await page.waitForSelector('#tb-surface .tabhit');
  const frets = () => page.$$eval('#tb-surface .fret', e => e.map(x => `${x.textContent}@${x.dataset.bar}.${x.dataset.at}.${x.dataset.s}`).join(' '));
  assert((await frets()) === '', `${label}: the tab starts empty`);
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="5"]');
  await page.keyboard.press('3'); await page.waitForTimeout(800);
  await page.keyboard.press('5'); await page.waitForTimeout(800);
  assert((await frets()) === '3@0.0.5 5@0.6.5', `${label}: typed frets land on the clicked string, one eighth apart (${await frets()})`);
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.waitForTimeout(800);
  assert((await frets()).endsWith('12@0.12.5'), `${label}: two digits typed together make fret 12`);
  await page.keyboard.press('Control+z');
  assert((await frets()) === '3@0.0.5 5@0.6.5', `${label}: undo removes the whole two-digit entry`);
  await page.keyboard.press('Control+y');
  assert((await frets()).endsWith('12@0.12.5'), `${label}: redo brings it back`);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('0'); await page.waitForTimeout(800);
  assert((await frets()).includes('0@0.12.4'), `${label}: arrows move the cursor (string up, one eighth back)`);
  await page.click('#tb-len button[data-len="3"]');                  // quarter notes from here on
  await page.click('#tb-surface .tabhit[data-bar="1"][data-at="0"][data-s="2"]');
  await page.keyboard.press('7'); await page.waitForTimeout(800); await page.keyboard.press('9'); await page.waitForTimeout(800);
  assert((await frets()).endsWith('7@1.0.2 9@1.12.2'), `${label}: quarter notes advance one beat`);
  await page.keyboard.press('Backspace');                                // empty cell: steps back one quarter, onto the 9
  await page.click('#tb-pad button[data-d="5"]'); await page.waitForTimeout(800);
  assert((await frets()).includes('5@1.12.2') && !(await frets()).includes('9@1.12.2'), `${label}: Backspace stepped back and the number pad replaced the 9 with a 5`);
  await page.fill('#tb-chord', 'Em7'); await page.press('#tb-chord', 'Tab');
  assert((await page.textContent('#tb-surface .tabchord')) === 'Em7', `${label}: the bar chord is drawn above the bar`);
  await page.fill('#tb-chord', 'Xyz'); await page.press('#tb-chord', 'Tab');
  assert((await page.getAttribute('#tb-chord', 'aria-invalid')) === 'true', `${label}: an unreadable chord name is flagged`);
  await page.fill('#tb-chord', 'Em7'); await page.press('#tb-chord', 'Tab');
  const bars0 = (await page.$$eval('#tb-surface .tabbarline', e => e.length));
  await page.click('#tb-addbar');
  assert((await page.$$eval('#tb-surface .tabbarline', e => e.length)) > bars0 && (await page.textContent('#tb-barno')) === '3', `${label}: Add bar adds a bar after the current one`);
  const before = await frets();
  await page.reload({ waitUntil: 'networkidle' }); await page.click('a[data-tab="compose"]');
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
  // techniques on the note under the cursor: hammer-on, slide, bend, vibrato
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="5"]');
  assert(await page.isEnabled('#tb-tech button[data-tech="h"]') && await page.isEnabled('#tb-tech button[data-tech="b"]'), `${label}: techniques are available on a note`);
  await page.click('#tb-tech button[data-tech="h"]');
  assert((await page.$$('#tb-surface .tablink')).length === 1 && (await page.textContent('#tb-surface .tablinkletter')) === 'h' && (await page.getAttribute('#tb-tech button[data-tech="h"]', 'aria-pressed')) === 'true', `${label}: a hammer-on is drawn as a slur marked h`);
  await page.click('#tb-tech button[data-tech="s"]');
  assert((await page.$$('#tb-surface line.tablink')).length === 1 && (await page.$$('#tb-surface .tablinkletter')).length === 0, `${label}: switching to a slide draws a slanted line`);
  await page.click('#tb-tech button[data-tech="s"]');
  assert((await page.$$('#tb-surface .tablink')).length === 0, `${label}: tapping again clears it`);
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="12"][data-s="5"]');
  assert(await page.isDisabled('#tb-tech button[data-tech="h"]'), `${label}: a hammer-on needs a following note on the same string`);
  await page.click('#tb-tech button[data-tech="b"]');
  assert((await page.textContent('#tb-tech button[data-tech="b"]')) === 'Bend 1/2' && (await page.$$('#tb-surface .tabbend')).length === 1, `${label}: Bend starts at a half step`);
  await page.click('#tb-tech button[data-tech="b"]');
  assert((await page.textContent('#tb-surface .tablinkletter')) === 'full', `${label}: tapping Bend again makes it a full bend`);
  await page.keyboard.press('v');
  assert((await page.$$('#tb-surface .tabbend')).length === 2, `${label}: the v key adds vibrato`);
  await page.click('#tb-play'); await page.waitForSelector('#tb-surface .tabplayhead', { timeout: 3000 }); await page.click('#tb-play');
  await page.click('#tb-undo'); await page.click('#tb-undo'); await page.click('#tb-undo');
  assert((await page.$$('#tb-surface .tabbend, #tb-surface .tablink')).length === 0, `${label}: undo takes the techniques back off`);
  // triplets: three eighth triplets fill one beat, with a bracket; the cursor snaps to the triplet grid
  await page.click('#tb-len button[data-len="1"]');                  // eighths
  await page.check('#tb-trip');
  await page.click('#tb-surface .tabhit[data-bar="3"][data-at="0"][data-s="1"]');
  assert((await page.$$('#tb-surface .tabhit[data-bar="3"][data-s="1"]')).length === 12, `${label}: triplet eighths put 12 click cells in a bar`);
  for (const d of ['1', '2', '3']) { await page.keyboard.press(d); await page.waitForTimeout(800); }
  assert((await frets()).includes('1@3.0.1 2@3.4.1 3@3.8.1'), `${label}: three triplet eighths sit four steps apart (${await frets()})`);
  assert((await page.$$('#tb-surface .tabtuplet')).length === 1 && (await page.textContent('#tb-surface .tabtupletnum')) === '3', `${label}: the triplet group has a bracket with a 3`);
  await page.uncheck('#tb-trip');
  assert((await page.$$('#tb-surface .tabhit[data-bar="3"][data-s="1"]')).length === 16, `${label}: straight notes go back to sixteenth cells`);
  await page.selectOption('#tb-swing', 'shuffle'); await page.click('#tb-play'); await page.waitForSelector('#tb-surface .tabplayhead', { timeout: 3000 }); await page.click('#tb-play');
  // chords can sit at any step; the chords used are gathered above the tab with a voicing
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="24"][data-s="2"]');
  await page.fill('#tb-chord', 'D7'); await page.press('#tb-chord', 'Tab');
  assert((await page.textContent('#tb-beat')) === '3', `${label}: the chord field names the beat of the cursor`);
  const chordXs = await page.$$eval('#tb-surface .tabchord', e => e.map(x => `${x.textContent}@${Math.round(+x.getAttribute('x'))}`));
  assert(chordXs.length >= 2 && chordXs.some(c => c.startsWith('D7@')), `${label}: a second chord is placed inside the bar (${chordXs})`);
  const used = await page.$$eval('#tb-chords .chip b', e => e.map(x => x.textContent));
  assert(used.includes('D7') && used.includes('Em7') && new Set(used).size === used.length, `${label}: the chords used are gathered on top once each (${used})`);
  assert((await page.$$('#tb-chords .chip .vdiag')).length === used.length, `${label}: every chord shows a voicing diagram`);
  const cap = () => page.textContent('#tb-chords .chip[data-name="D7"] span');
  const c1 = await cap(); await page.click('#tb-chords .chip[data-name="D7"]');
  assert((await cap()) !== c1, `${label}: tapping a chord steps to its next voicing (${c1} -> ${await cap()})`);
  // loading a short progression repeats it, so there is a solo's worth of bars; Generate and Play sit side by side
  await page.uncheck('#tb-autoplay');
  assert(await page.isVisible('#tb-gen-go') && await page.isVisible('#tb-play') && await page.isVisible('#tb-gen-new'), `${label}: Play, Generate and Another one are all in the top toolbar`);
  const ys = await page.$$eval('#tb-play, #tb-gen-go, #tb-gen-new', e => e.map(x => Math.round(x.getBoundingClientRect().top)));
  assert(ys.every(y => Math.abs(y - ys[0]) < 3), `${label}: and on the same row (${ys})`);
  await page.selectOption('#tb-prog', '4'); await page.selectOption('#tb-progkey', '0:major');
  await page.click('#tb-useprog');
  assert((await page.$$('#tb-surface .tabchord')).length === 9 && (await page.textContent('#tb-genmsg')).includes('9 bars'), `${label}: ii-V-I loads as nine bars with Auto repeat (${await page.textContent('#tb-genmsg')})`);
  await page.selectOption('#tb-repeat', '8'); await page.click('#tb-useprog');
  assert((await page.$$('#tb-surface .tabchord')).length === 24, `${label}: Repeat x8 gives 24 bars`);
  await page.selectOption('#tb-repeat', 'auto');
  await page.click('#tb-gen-go');
  assert((await page.$$eval('#tb-surface .fret', e => new Set(e.map(x => x.dataset.bar)).size)) >= 5, `${label}: the solo fills the repeated bars`);
  await page.check('#tb-autoplay'); await page.click('#tb-gen-new');
  await page.waitForSelector('#tb-surface .tabplayhead', { timeout: 3000 });
  assert((await page.textContent('#tb-play')).includes('Stop'), `${label}: with "Play it straight after generating" on, Generate starts playing`);
  await page.click('#tb-play'); await page.uncheck('#tb-autoplay');
  // solo generator: load a 12-bar blues, generate, same seed twice is identical, Another one differs, Undo restores
  await page.selectOption('#tb-prog', '6'); await page.selectOption('#tb-progkey', '9:major'); await page.click('#tb-useprog');
  assert((await page.$$eval('#tb-chords .chip b', e => e.map(x => x.textContent))).join() === 'A7,D7,E7', `${label}: the progression's chords are gathered (A7 D7 E7)`);
  await page.selectOption('#tb-style', 'blues'); await page.fill('#tb-seed', '4242'); await page.dispatchEvent('#tb-seed', 'change');
  const beforeGen = await frets();
  await page.click('#tb-gen-go');
  const g1 = await frets();
  assert((g1.match(/ /g) || []).length > 20, `${label}: generate fills the tab (${g1.split(' ').length} notes)`);
  await page.click('#tb-gen-go');
  assert((await frets()) === g1, `${label}: the same seed gives the same solo`);
  // evolve: the solo builds up over the song (busier and higher) when asked, and stays level when steady
  await page.selectOption('#tb-density', 'busy'); await page.selectOption('#tb-gentech', 'off');
  const perThird = async () => page.$$eval('#tb-surface .fret', e => { const t = [0, 0, 0]; e.forEach(x => { t[Math.min(2, Math.floor(+x.dataset.bar / 4))]++; }); return t; });
  await page.selectOption('#tb-evolve', 'build'); await page.click('#tb-gen-go');
  const built = await perThird();
  assert(built[2] > built[0] * 1.2, `${label}: with Build up the end is busier than the start (notes per third ${built})`);
  await page.selectOption('#tb-evolve', 'off'); await page.click('#tb-gen-go');
  const level = await perThird();
  assert(Math.abs(level[2] - level[0]) < level[0] * 0.5, `${label}: Steady does not build (${level})`);
  await page.selectOption('#tb-evolve', 'arc'); await page.selectOption('#tb-density', 'medium');
  await page.selectOption('#tb-gentech', 'lots'); await page.click('#tb-gen-go');
  assert((await page.$$('#tb-surface .tablink, #tb-surface .tabbend')).length > 3, `${label}: generating with techniques on adds hammer-ons, slides, bends or vibrato`);
  await page.selectOption('#tb-gentech', 'off'); await page.click('#tb-gen-go');
  assert((await page.$$('#tb-surface .tablink, #tb-surface .tabbend')).length === 0, `${label}: with techniques off the solo has none`);
  await page.selectOption('#tb-feel', 'shuffle'); await page.click('#tb-gen-go');
  const offs = await page.$$eval('#tb-surface .fret', e => e.map(x => +x.dataset.at % 12));
  assert(offs.filter(x => x === 8).length >= 4 && offs.every(x => x % 4 === 0), `${label}: the shuffle feel writes long-short pairs on the triplet grid`);
  await page.selectOption('#tb-feel', 'straight');
  await page.click('#tb-gen-go');
  await page.click('#tb-gen-new');
  assert((await frets()) !== g1 && (await page.inputValue('#tb-seed')) !== '4242', `${label}: Another one gives a different solo and a new seed`);
  assert((await page.textContent('#tb-genmsg')).includes('Seed'), `${label}: the seed is shown`);
  // per chord occurrence: scale and position choices for the chord under the cursor
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="2"]');
  const planText = () => page.textContent('#tb-planfold > summary');
  assert(await page.$eval('#tb-planfold', d => !d.open), `${label}: the scale and position panel starts folded so the tab stays near the top`);
  await page.click('#tb-planfold > summary');
  assert((await planText()).includes('A7 (bar 1, beat 1)'), `${label}: the plan panel names the chord occurrence under the cursor (${await planText()})`);
  assert((await page.$$('#tb-planboard svg circle')).length > 10, `${label}: the plan panel shows the scale on a fretboard`);
  await page.selectOption('#tb-planscale', 'minpent');
  await page.click('#tb-planpos button[data-pos="2"]');
  assert((await planText()).includes('position 2') && (await page.getAttribute('#tb-planpos button[data-pos="2"]', 'aria-pressed')) === 'true', `${label}: picking a position is shown (${await planText()})`);
  const dimmed = await page.$$eval('#tb-planboard svg circle[r="12.5"][opacity]', c => c.length);
  assert(dimmed > 0, `${label}: notes outside the chosen position are dimmed on the strip`);
  await page.click('#tb-surface .tabhit[data-bar="1"][data-at="0"][data-s="2"]');
  assert(!/position \d/.test(await planText()) && (await planText()).includes('bar 2'), `${label}: the same chord later in the song keeps its own (automatic) choices`);
  await page.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="2"]');
  await page.click('#tb-gen-go');
  const inPos = await page.$$eval('#tb-surface .fret[data-bar="0"]', e => e.length);
  assert(inPos > 2 && (await planText()).includes('position 2'), `${label}: generating keeps the choices (${inPos} notes in bar 1)`);
  await page.click('#tb-planpos button[data-pos="all"]');
  assert(!/position \d/.test(await planText()), `${label}: All clears the position choice`);
  await page.click('#tb-undo');
  await page.click('#tb-undo'); await page.click('#tb-undo');
  assert((await frets()) !== '' , `${label}: undo steps back through generated solos`);
  await page.click('#tb-play'); await page.waitForSelector('#tb-surface .tabplayhead', { timeout: 3000 }); await page.click('#tb-play');
  // share link: copy it, open it in a fresh browser, get the same tab, setup and generator settings; Undo brings back what was there
  await page.fill('#tb-title', 'Shared lick'); await page.press('#tb-title', 'Tab');
  await page.fill('#tb-seed', '31337'); await page.dispatchEvent('#tb-seed', 'change');
  const sharedFrets = await frets(), sharedChords = await page.$$eval('#tb-chords .chip b', e => e.map(x => x.textContent).join());
  await page.evaluate(() => { const w = /** @type {any} */ (window); w.__copied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { w.__copied = t; } } }); });
  await page.click('#tb-share');
  const sharedUrl = await page.evaluate(() => /** @type {any} */ (window).__copied);
  assert(/#compose\?.*d=/.test(sharedUrl) && sharedUrl.length < 4000, `${label}: Copy link makes a #compose link (${sharedUrl.length} characters)`);
  assert((await page.textContent('#tb-msg')) === 'Link copied', `${label}: it says the link was copied`);
  const friend = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const fp = await friend.newPage();
  await fp.goto(origin, { waitUntil: 'networkidle' }); await fp.click('a[data-tab="compose"]'); await fp.waitForSelector('#tb-surface .tabhit');
  await fp.click('#tb-surface .tabhit[data-bar="0"][data-at="0"][data-s="3"]'); await fp.keyboard.press('9'); await fp.waitForTimeout(800); // the friend has a tab of their own
  const own = await fp.$$eval('#tb-surface .fret', e => e.map(x => x.textContent).join());
  await fp.goto(origin + new URL(sharedUrl).hash, { waitUntil: 'networkidle' });
  await fp.waitForSelector('#tb-surface .tabhit');
  assert((await fp.$$eval('#tb-surface .fret', e => e.map(x => `${x.textContent}@${x.dataset.bar}.${x.dataset.at}.${x.dataset.s}`).join(' '))) === sharedFrets, `${label}: the link opens the same notes`);
  assert((await fp.$$eval('#tb-chords .chip b', e => e.map(x => x.textContent).join())) === sharedChords && (await fp.inputValue('#tb-title')) === 'Shared lick', `${label}: and the same chords and title`);
  assert((await fp.inputValue('#tb-seed')) === '31337' && (await fp.inputValue('#tb-style')) === (await page.inputValue('#tb-style')), `${label}: and the generator settings and seed`);
  assert(!(await fp.evaluate(() => location.hash)).includes('d='), `${label}: the long hash is tidied away after opening`);
  assert((await fp.textContent('#tb-genmsg')).includes('Undo brings back yours'), `${label}: it says what happened`);
  await fp.click('#tb-undo');
  assert((await fp.$$eval('#tb-surface .fret', e => e.map(x => x.textContent).join())) === own, `${label}: Undo brings back the friend's own tab`);
  await friend.close();
  // links made when the page was still called "tab" keep working
  const legacy = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const lp = await legacy.newPage();
  await lp.goto(origin + new URL(sharedUrl).hash.replace('#compose', '#tab'), { waitUntil: 'networkidle' });
  await lp.waitForSelector('#tb-surface .tabhit');
  assert((await lp.$$eval('#tb-surface .fret', e => e.map(x => `${x.textContent}@${x.dataset.bar}.${x.dataset.at}.${x.dataset.s}`).join(' '))) === sharedFrets && (await lp.getAttribute('a[data-tab="compose"]', 'aria-current')) === 'page', `${label}: an old #tab link opens the same tab on the Compose page`);
  await legacy.close();
  // a damaged link opens nothing and breaks nothing
  const bad = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const bp = await bad.newPage(); const badErrors = []; bp.on('pageerror', e => badErrors.push(e.message));
  await bp.goto(origin + '#tab?d=%%%garbage', { waitUntil: 'networkidle' });
  await bp.waitForSelector('#tb-surface .tabhit');
  assert(badErrors.length === 0 && (await bp.$$('#tb-surface .fret')).length === 0, `${label}: a damaged link opens an empty tab without errors`);
  await bad.close();
  // sound: Plucked guitar is the default and renders the notes; Simple does not; the real chain gives audible, in-tune output
  if (await page.isHidden('#optbar')) await page.click('#menu-btn');
  assert((await page.inputValue('#sound-select')) === 'plucked', `${label}: the plucked guitar is the default sound`);
  const stat = () => page.evaluate(async () => (await import(new URL('sound.js', document.baseURI).href)).soundStats.rendered);
  await page.click('a[data-tab="chords"]'); await page.waitForSelector('#ch-play');
  const r0 = await stat();
  await page.click('#ch-play'); await page.waitForTimeout(400);
  const r1 = await stat();
  assert(r1 > r0, `${label}: playing a chord with the plucked sound renders notes (${r0} -> ${r1})`);
  await page.selectOption('#sound-select', 'simple');
  await page.click('#ch-play'); await page.waitForTimeout(400);
  assert((await stat()) === r1, `${label}: the simple sound does not use the string model`);
  assert(await page.evaluate(() => localStorage.getItem('fw-sound')) === 'simple', `${label}: the choice is remembered`);
  await page.selectOption('#sound-select', 'plucked');
  const chain = await page.evaluate(async () => {
    const m = await import(new URL('sound.js', document.baseURI).href), sr = 44100, oc = new OfflineAudioContext(1, sr * 3, sr);
    const eng = m.createStringEngine(oc); eng.note(220, 0.1, 0.6, 0.16); eng.note(220, 1.2, 0.6, 0.16, { bend: 2 });
    const x = (await oc.startRendering()).getChannelData(0);
    const rms = (a, n) => { let s = 0; for (let i = a; i < a + n; i++) s += x[i] * x[i]; return Math.sqrt(s / n); };
    let peak = 0, bad = 0; for (const v of x) { peak = Math.max(peak, Math.abs(v)); if (!Number.isFinite(v)) bad++; }
    const lo = Math.floor(sr / 242), hi = Math.ceil(sr / 198); let best = -1e9, bl = lo; // pitch of the first note by autocorrelation
    for (let lag = lo; lag <= hi; lag++) { let c = 0; for (let i = 0; i < 4096; i++) c += x[Math.floor(0.2 * sr) + i] * x[Math.floor(0.2 * sr) + i + lag]; if (c > best) { best = c; bl = lag; } }
    return { peak, bad, attack: rms(Math.floor(0.15 * sr), 4410), silence: rms(Math.floor(2.8 * sr), 4410), hz: sr / bl, tailAfterDamp: rms(Math.floor(0.85 * sr), 2205) };
  });
  assert(chain.bad === 0 && chain.peak > 0.05 && chain.peak < 1 && chain.attack > 0.02, `${label}: the sound chain gives audible output that does not clip (peak ${chain.peak.toFixed(2)}, rms ${chain.attack.toFixed(3)})`);
  assert(Math.abs(1200 * Math.log2(chain.hz / 220)) < 15, `${label}: and the note comes out in tune through the chain (${chain.hz.toFixed(1)} Hz for 220)`);
  assert(chain.silence < chain.attack * 0.5, `${label}: and it dies away`);
  // timing: a note scheduled at t is heard at t (the chain's delay is cancelled), and the chain delays a signal by about the 12 ms we compensate
  const timing = await page.evaluate(async () => {
    const m = await import(new URL('sound.js', document.baseURI).href), sr = 44100;
    const onsets = [];
    for (const t of [0.2, 0.55, 0.9]) {
      const oc = new OfflineAudioContext(1, sr, sr), eng = m.createStringEngine(oc);
      eng.note(330, t, 0.3, 0.16);
      const x = (await oc.startRendering()).getChannelData(0);
      let pk = 0; for (let i = 0; i < 0.3 * sr; i++) pk = Math.max(pk, Math.abs(x[i + Math.floor(t * sr)] || 0));
      let first = -1; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.1 * pk) { first = i; break; }
      onsets.push(+(1000 * (first / sr - t)).toFixed(2));
    }
    const oc2 = new OfflineAudioContext(1, sr, sr), buf = oc2.createBuffer(1, 400, sr), d = buf.getChannelData(0); for (let i = 0; i < 400; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / sr) * (1 - i / 400);
    const src = oc2.createBufferSource(); src.buffer = buf; src.connect(m.buildChain(oc2, oc2.destination)); src.start(0.2);
    const y = (await oc2.startRendering()).getChannelData(0); let at = -1; for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > 0.02) { at = i; break; }
    return { onsets, chainMs: +(1000 * (at / sr - 0.2)).toFixed(2), comp: m.CHAIN_LATENCY * 1000 };
  });
  assert(timing.onsets.every(o => Math.abs(o) < 3), `${label}: notes are heard on time through the chain (onset error in ms: ${timing.onsets})`);
  assert(Math.abs(timing.chainMs - timing.comp) < 3, `${label}: the chain delay in this browser (${timing.chainMs} ms) matches the compensation (${timing.comp} ms)`);
  await page.click('#menu-btn'); await page.click('a[data-tab="compose"]'); await page.waitForSelector('#tb-surface .tabhit');
  // PDF export: the print sheet has the title, every chord box once, and the tab in rows that are not split
  assert(await page.isVisible('#tb-pdf'), `${label}: there is an Export PDF button`);
  await page.fill('#tb-title', 'Blues in A'); await page.press('#tb-title', 'Tab');
  const usedChords = await page.$$eval('#tb-chords .chip b', e => e.map(x => x.textContent));
  const barCount = await page.$$eval('#tb-surface .tabchord', e => e.length);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  assert(await page.isHidden('.app') && await page.isVisible('#print-sheet'), `${label}: printing hides the app and shows the sheet`);
  assert((await page.textContent('#print-sheet h1')) === 'Blues in A' && (await page.textContent('#print-sheet .print-meta')).includes('90 BPM'), `${label}: the sheet has the title and the tempo`);
  assert((await page.$$eval('#print-sheet .print-chord b', e => e.map(x => x.textContent))).join() === usedChords.join(), `${label}: the sheet shows each chord used once, with its box (${usedChords})`);
  assert((await page.$$('#print-sheet .print-chord .vdiag')).length === usedChords.length, `${label}: every chord box has a voicing diagram`);
  const rows = await page.$$eval('#print-sheet .print-row', r => r.map(x => ({ w: x.querySelector('svg').getBoundingClientRect().width, h: x.getBoundingClientRect().height, bars: x.querySelectorAll('.tabbarno').length })));
  assert(rows.length === Math.ceil(12 / 2) && rows.every(r => r.bars === 2 && r.w <= 720), `${label}: twelve bars are laid out two per row, each row narrower than a page (${rows.length} rows)`);
  assert((await page.$$eval('#print-sheet .tabbarno', e => e.map(x => x.textContent))).join() === '1,2,3,4,5,6,7,8,9,10,11,12', `${label}: bars are numbered`);
  assert((await page.$$('#print-sheet .tabhit, #print-sheet .tabcursor')).length === 0, `${label}: the sheet has no editing cells or cursor`);
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert(pdf.slice(0, 5).toString() === '%PDF-' && pages >= 2 && pages <= 3, `${label}: the PDF is a real PDF of ${pages} pages`);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  assert(await page.isVisible('.app') && (await page.$$('#print-sheet')).length === 0, `${label}: after printing the app is back and the sheet is gone`);

  // scales tab: position selector
  await page.click('a[data-tab="scales"]');
  await page.click('#sc-posseg button[data-pos="3"]');
  const bright = await page.$$eval('#view-scales .board svg circle[r="12.5"]:not([opacity])', c => c.length);
  assert(bright > 5, `${label}: a scale position lights its notes (${bright})`);

  // arpeggios: degree chord inside a scale position (Scales), shape around a voicing (Chords)
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
  assert(shape > onlyFingering, `${label}: the arpeggio shape shows more chord tones than the voicing alone (${shape} > ${onlyFingering})`);
  await page.click('#ch-arpplay');
  await page.uncheck('#ch-arp');
  await page.click('a[data-tab="scales"]');

  // progressions: chip diagrams
  await page.click('a[data-tab="progressions"]');
  await page.waitForSelector('#pr-strip .chip .vdiag');
  assert((await page.$$('#pr-strip .chip .vdiag')).length >= 3, `${label}: chord chips show voicing diagrams`);

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
  // the essential controls stay on screen while the page scrolls
  await pp.goto(origin + '#compose', { waitUntil: 'networkidle' }); await pp.waitForSelector('#tb-surface .tabhit');
  await pp.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const sticky = await pp.evaluate(() => { const r = id => document.querySelector(id).getBoundingClientRect(); const bar = r('.stickybar'); return { top: bar.top, playTop: r('#tb-play').top, playBottom: r('#tb-play').bottom, genOk: r('#tb-gen-go').right <= innerWidth, undoOk: r('#tb-redo').right <= innerWidth + 1, scrolled: scrollY }; });
  assert(sticky.scrolled > 200 && sticky.top >= 0 && sticky.top < 12 && sticky.playBottom < 120, `${label}: on a phone the controls stay pinned at the top while scrolled (bar top ${sticky.top}, scrolled ${sticky.scrolled})`);
  assert(sticky.genOk && sticky.undoOk, `${label}: and the whole row fits the phone width`);
  assert(await pp.evaluate(() => { const b = document.querySelector('#tb-play').getBoundingClientRect(), el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!el && !!el.closest('#tb-play'); }), `${label}: and Play is really clickable there (nothing covers it)`);
  await pp.click('#tb-gen-go'); await pp.waitForTimeout(300);
  assert((await pp.$$('#tb-surface .fret')).length > 0, `${label}: Generate works from the pinned bar`);
  await pp.goto(origin + '#scales', { waitUntil: 'networkidle' });
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
