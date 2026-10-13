// Fretwork service worker: makes the app installable and usable offline.
//
// Strategy: network-first, always revalidating with the server
// (cache: 'no-cache'), falling back to the cache only when offline. Online,
// users therefore always get the newest deploy - no stale-cache surprises and
// no filename hashing needed - while the whole app still works with no
// connection. Everything is relative so it also works under a subpath
// (GitHub Pages: /fretwork/).
const CACHE = 'fretwork-shell-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'theory.js', 'instrument.js', 'voicings.js', 'share.js', 'transport.js', 'player.js',
  'view-progressions.js', 'view-scales.js', 'view-chords.js',
  'data/voicings.json',
  'fonts/familjen-grotesk-latin-wght-normal.woff2', 'fonts/familjen-grotesk-latin-ext-wght-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
