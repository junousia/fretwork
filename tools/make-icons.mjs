// Renders site/icons/*.svg to the PNG sizes the manifest and iOS need.
// Needs Playwright (not a project dependency): npx playwright install chromium
// then: NODE_PATH=<dir with playwright> node tools/make-icons.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../site/icons');
const jobs = [
  ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-apple.svg', 'apple-touch-icon.png', 180],
];
const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = fs.readFileSync(path.join(dir, src), 'utf8');
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('icons written to', dir);
