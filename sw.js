// Service worker : fonctionnement 100 % hors ligne.
// Stratégie « cache d'abord » pour l'application (aucune donnée personnelle
// n'est mise en cache ici : elles vivent dans IndexedDB).

const VERSION = 'tts-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './js/app.js',
  './js/app-reminders.js',
  './js/core/dates.js',
  './js/core/db.js',
  './js/core/format.js',
  './js/core/lock.js',
  './js/core/store.js',
  './js/domain/backup.js',
  './js/domain/costs.js',
  './js/domain/cravings.js',
  './js/domain/demo.js',
  './js/domain/goals.js',
  './js/domain/insights.js',
  './js/domain/models.js',
  './js/domain/simulator.js',
  './js/domain/sleep.js',
  './js/domain/stats.js',
  './js/domain/stock.js',
  './js/ui/charts.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/entries.js',
  './js/ui/forms.js',
  './js/ui/icons.js',
  './js/views/goals.js',
  './js/views/health.js',
  './js/views/home.js',
  './js/views/journal.js',
  './js/views/onboarding.js',
  './js/views/profile.js',
  './js/views/stats.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all[0]) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});
