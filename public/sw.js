// Service worker: makes repeat visits instant and lets the app work offline.
// Cache keys are filled in at build time (see vite.config.ts).
const STATIC_CACHE = 'facedraw-static-__STATIC_KEY__'; // MediaPipe wasm + models
const APP_CACHE = 'facedraw-app-__APP_KEY__'; // hashed JS/CSS + index.html

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (/\/(mediapipe|models)\//.test(path)) event.respondWith(cacheFirst(req, STATIC_CACHE));
  else if (/\/assets\//.test(path) || /\.(png|svg|webmanifest)$/.test(path)) event.respondWith(cacheFirst(req, APP_CACHE));
  else if (req.mode === 'navigate') event.respondWith(networkFirst(req, APP_CACHE));
});
