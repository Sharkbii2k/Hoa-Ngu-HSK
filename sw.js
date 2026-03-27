const CACHE = 'hoanguhsk-firebase-v3';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './firebase-config.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/bg.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isData = request.url.includes('/data/');
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      try {
        const fresh = await fetch(request);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        if (cached) return cached;
        if (isData) return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
        return (await cache.match('./index.html')) || Response.error();
      }
    })()
  );
});
