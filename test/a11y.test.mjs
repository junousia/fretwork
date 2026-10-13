// Accessibility (axe-core) on every tab, in light and dark, desktop and phone,
// plus Chrome's own PWA installability check. Needs Playwright's Chromium.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };

const server = spawn(process.execPath, ['tools/serve.mjs', '8120'], { cwd: root, stdio: 'pipe' });
await new Promise(res => server.stdout.on('data', res));
const browser = await chromium.launch();

/** @type {[string, (p: import('playwright').Page) => Promise<void>][]} */
const states = [
  ['progressions', async p => { await p.waitForSelector('#pr-strip .vdiag'); }],
  ['progressions-position', async p => { await p.waitForSelector('#pr-posseg'); await p.click('#pr-posseg button[data-pos="3"]'); }],
  ['scales', async p => { await p.waitForSelector('#sc-posseg'); await p.click('#sc-posseg button[data-pos="3"]'); await p.click('#sc-arpseg button[data-k="4"]'); }],
  ['chords', async p => { await p.waitForSelector('#ch-voseg'); await p.click('#ch-voseg button[data-vo="2"]'); await p.click('.bseg button[data-f="minor"]'); }],
];
let checked = 0;
/** @type {('light'|'dark')[]} */
const schemes = ['light', 'dark'];
/** @type {[number, number, string][]} */
const sizes = [[1100, 900, 'desktop'], [390, 844, 'phone']];
for (const scheme of schemes) for (const [w, h, label] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage();
  for (const [name, setup] of states) {
    const tab = name.split('-')[0];
    await page.goto(`http://localhost:8120/#${tab}`, { waitUntil: 'networkidle' });
    await setup(page);
    await page.waitForTimeout(100);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    checked++;
    for (const v of result.violations) {
      assert(false, `[${scheme} ${label} ${name}] ${v.id} (${v.impact}): ${v.help} - e.g. ${v.nodes[0].target.join(' ')} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`);
    }
  }
  await ctx.close();
}

// Chrome's installability criteria (manifest, icons, service worker, https/localhost)
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:8120/', { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  assert(installabilityErrors.length === 0, `PWA is not installable: ${installabilityErrors.map(e => e.errorId).join(', ')}`);
  await ctx.close();
}

await browser.close();
server.kill();
console.log(`Accessibility checks over ${checked} page states (light/dark x desktop/phone) + installability: ${failures} problem(s)`);
if (failures) process.exit(1);
