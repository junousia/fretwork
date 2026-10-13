// Builds the real Docker image (nginx) and checks what it actually serves: the
// right Content-Type for EVERY shipped file (a broken mime table once made the
// browser download index.html), no-store caching, and gzip for text assets.
// Skipped (with a notice) when Docker is not available locally; CI always has it.
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const assert = (c, m) => { if (!c) { console.log(`FAIL: ${m}`); failures++; } };

if (spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  if (process.env.CI) { console.log('FAIL: docker is required in CI'); process.exit(1); }
  console.log('Nginx checks: skipped (docker not available)');
  process.exit(0);
}

const walk = d => fs.readdirSync(path.join(root, 'site', d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk('.');

const TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const COMPRESSED = new Set(['.html', '.js', '.css', '.json', '.svg']);

const name = `fretwork-nginx-test-${process.pid}`, port = 8130 + (process.pid % 50);
execFileSync('docker', ['build', '-q', '-t', name, '.'], { cwd: root, stdio: 'pipe' });
execFileSync('docker', ['run', '-d', '--rm', '--name', name, '-p', `${port}:8000`, name], { stdio: 'pipe' });
try {
  await new Promise(r => setTimeout(r, 800));
  const get = async (p, gzip = false) => fetch(`http://localhost:${port}/${p}`, { headers: gzip ? { 'accept-encoding': 'gzip' } : {} });
  for (const f of ['', ...files]) {
    const res = await get(f.split(path.sep).join('/'), true);
    const ext = f === '' ? '.html' : path.extname(f);
    assert(res.status === 200, `/${f} -> HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0];
    assert(type === TYPES[ext], `/${f} is served as "${type}", expected "${TYPES[ext]}"`);
    assert(/no-store/.test(res.headers.get('cache-control') || ''), `/${f} is not served with Cache-Control: no-store`);
    if (COMPRESSED.has(ext) && fs.statSync(path.join(root, 'site', f || 'index.html')).size > 1024)
      assert(res.headers.get('content-encoding') === 'gzip', `/${f} is not gzip-compressed`);
  }
  assert((await get('no-such-file')).status === 404, 'unknown paths return 404');
} finally {
  spawnSync('docker', ['stop', name], { stdio: 'ignore' });
  spawnSync('docker', ['rmi', '-f', name], { stdio: 'ignore' });
}
console.log(`Nginx checks over ${files.length + 1} served paths: ${failures} problem(s)`);
if (failures) process.exit(1);
