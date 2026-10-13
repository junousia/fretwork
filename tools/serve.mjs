// Tiny static server for local development: node tools/serve.mjs [port]
// Serves ./site with no caching so edits show up on reload.
// BASE=/fretwork serves under a subpath, like GitHub Pages.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../site');
const port = +process.argv[2] || 8000;
const base = (process.env.BASE || '').replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

http.createServer((req, res) => {
  let url = new URL(req.url, 'http://x').pathname;
  if (base) { if (url !== base && !url.startsWith(base + '/')) { res.writeHead(404).end('not found'); return; } url = url.slice(base.length) || '/'; }
  let p = path.normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith(path.sep) || p === '.') p = path.join(p, 'index.html');
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Fretwork on http://localhost:${port}`));
