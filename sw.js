const CACHE = 'dashboard-v4-four-items';
const ASSETS = [
  '/dashboard/',
  '/dashboard/index.html',
  '/dashboard/manifest.json',
  '/dashboard/icon-192.png',
  '/dashboard/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('/dashboard/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/dashboard/index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/dashboard/index.html')))
  );
});
