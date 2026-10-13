const CACHE = 'dashboard-v8-mobile-routine';
const CACHE_PREFIX = 'dashboard-';
const SCOPE_PATH = '/dashboard/';
const ASSETS = [
  '/dashboard/index.html',
  '/dashboard/routines.js?v=mobile-routine',
  '/dashboard/routines.css?v=weekly-schedules',
  '/dashboard/routine.html',
  '/dashboard/routine-mobile.js?v=mobile-routine',
  '/dashboard/routine-mobile.css?v=mobile-routine',
  '/dashboard/routine-app.js?v=mobile-routine',
  '/dashboard/routine-manifest.json',
  '/dashboard/manifest.json',
  '/dashboard/icon-192.png',
  '/dashboard/icon-512.png'
];

function navigationKey(url) {
  // The two dashboard entry URLs share a shell; the routine app has its own.
  if (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + 'index.html') {
    return SCOPE_PATH + 'index.html';
  }
  if (url.pathname === SCOPE_PATH + 'routine.html') return SCOPE_PATH + 'routine.html';
  return url.href;
}

async function cachedResponse(key) {
  try { return await (await caches.open(CACHE)).match(key); }
  catch (_) { return undefined; }
}

async function cacheResponse(key, response) {
  if (!response.ok) return;
  // A redirected login or error response must not replace an offline shell.
  if (response.url && new URL(response.url).origin !== self.location.origin) return;
  try { await (await caches.open(CACHE)).put(key, response.clone()); }
  catch (_) { /* A full device cache must not interrupt online use. */ }
}

async function networkNavigation(request, key) {
  try {
    const response = await fetch(request);
    // Even a same-origin redirect must not put another page into this route's cache.
    if (!response.url || navigationKey(new URL(response.url)) === key) {
      await cacheResponse(key, response);
    }
    return response;
  } catch (error) {
    const cached = await cachedResponse(key);
    if (cached) return cached;
    throw error;
  }
}

async function staticAsset(request) {
  const cached = await cachedResponse(request);
  if (cached) return cached;
  const response = await fetch(request);
  await cacheResponse(request, response);
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Cache files independently: one unavailable file must not abort all caching.
    await Promise.all(ASSETS.map(async asset => {
      try {
        const response = await fetch(asset, {cache: 'reload'});
        await cacheResponse(asset, response);
      } catch (_) { /* Online requests can fill this asset later. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Firebase, Google login and other sites keep their normal network handling.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkNavigation(request, navigationKey(url)));
    return;
  }
  if (ASSETS.includes(url.pathname + url.search)) {
    // Missing JS/CSS fails as an asset; it never receives an HTML page fallback.
    event.respondWith(staticAsset(request));
  }
});
