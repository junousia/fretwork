// Static checks on the shipped site: PWA manifest + service worker are
// consistent with the files, nothing leaves the origin (offline + privacy),
// and every path is relative so it works under a subpath (GitHub Pages).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '../site');
let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };
const read = f => fs.readFileSync(path.join(site, f), 'utf8');
const walk = d => fs.readdirSync(path.join(site, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk('.');

// every JS file parses
for (const f of files.filter(f => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(site, f)], { stdio: 'pipe' }); }
  catch (e) { assert(false, `${f} has a syntax error: ${e.stderr}`); }
}

// manifest
const mf = JSON.parse(read('manifest.webmanifest'));
assert(mf.name === 'Fretwork' && mf.short_name, 'manifest needs name Fretwork and a short_name');
assert(mf.display === 'standalone' && mf.start_url === './' && mf.scope === './', 'manifest must be standalone with relative start_url/scope');
for (const i of mf.icons) assert(files.includes(path.normalize(i.src)), `manifest icon missing: ${i.src}`);
assert(mf.icons.some(i => i.sizes === '192x192') && mf.icons.some(i => i.sizes === '512x512') && mf.icons.some(i => i.purpose === 'maskable'), 'manifest needs 192, 512 and a maskable icon');
for (const s of mf.shortcuts || []) assert(s.url.startsWith('./'), `shortcut url must be relative: ${s.url}`);

// service worker precache list vs real files
const sw = read('sw.js');
const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL'))).matchAll(/'([^']+)'/g)].map(m => m[1]).filter(x => x !== 'fretwork-shell-v1');
for (const f of shell) assert(f === './' || files.includes(path.normalize(f)), `sw.js precaches a file that does not exist: ${f}`);
const optional = new Set(['sw.js', 'icons/icon-maskable.svg', 'icons/icon-apple.svg', 'icons/icon-maskable-512.png', 'fonts/OFL.txt', 'data/voicings.LICENSE.txt']);
for (const f of files) if (!shell.includes(f) && !optional.has(f)) assert(false, `${f} ships but is not in sw.js SHELL (offline would miss it)`);

// index.html: manifest/icon links resolve, no external or absolute URLs
const html = read('index.html');
assert(/<link rel="manifest" href="manifest.webmanifest">/.test(html), 'index.html must link the manifest');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const u = m[1];
  assert(!/^(https?:)?\/\//.test(u) && !u.startsWith('/'), `index.html uses a non-relative URL: ${u}`);
  if (!u.startsWith('#')) assert(files.includes(path.normalize(u)), `index.html references a missing file: ${u}`);
}
for (const f of files.filter(f => /\.(js|css|html)$/.test(f))) {
  const t = read(f);
  const ext = [...t.matchAll(/https?:\/\/[^\s"'`)<]+/g)].map(m => m[0]).filter(u => !/w3\.org|github\.com|fonts\/OFL/.test(u));
  assert(!ext.length, `${f} references external URLs (breaks offline/privacy): ${ext.slice(0, 3).join(' ')}`);
  assert(!/(fetch|import|src=|href=)\s*\(?\s*['"]\//.test(t), `${f} uses a root-absolute path (breaks GitHub Pages subpath)`);
}
// nginx must serve the manifest with the right type and compress the JSON
const ng = fs.readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
assert(/application\/manifest\+json\s+webmanifest/.test(ng), 'nginx.conf must map .webmanifest to application/manifest+json');
assert(/gzip_types[^;]*application\/json/.test(ng), 'nginx.conf must gzip application/json (voicings.json)');

// fonts are self-hosted
assert(!/fonts\.(googleapis|gstatic)/.test(html + read('styles.css')), 'fonts must be self-hosted');

console.log(`Site checks over ${files.length} shipped files: ${failures} problem(s)`);
if (failures) process.exit(1);
