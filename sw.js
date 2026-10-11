// App-shell cache so the app opens offline. Bump VERSION when shipping changes.
const VERSION = 'v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'hardcover.js', 'store.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => skipWaiting()));
});

addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => clients.claim()));
});

// Same-origin: network first, fall back to cache. API calls (other origins) go straight to the network.
addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request)));
});
