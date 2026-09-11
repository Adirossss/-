const CACHE = 'apay-tracker-v23';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  // the manual "update available" banner turned out unreliable in practice
  // (updates kept silently not applying) — new versions now activate
  // immediately instead of waiting for the page to ask.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  // caches.match() (global) searches EVERY cache this origin has ever created,
  // old ones included, and can return a stale hit from a previous version even
  // after a new cache exists — this was the real bug keeping updates from ever
  // showing up. Scoping the lookup to this SW's own named cache fixes it.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => cached || fetch(e.request))
    )
  );
});
