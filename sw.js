// Service worker : fonctionnement 100 % hors ligne.
// Stratégie « réseau d'abord, cache en secours » pour l'application (aucune donnée personnelle
// n'est mise en cache ici : elles vivent dans IndexedDB).

const VERSION = 'tts-v4.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/fonts/manrope.woff2',
  './assets/fonts/fraunces.woff2',
  './js/ui/art.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './js/app.js',
  './js/app-reminders.js',
  './js/core/ai.js',
  './js/core/dates.js',
  './js/core/db.js',
  './js/core/format.js',
  './js/core/healthfile.js',
  './js/core/lock.js',
  './js/core/store.js',
  './js/domain/autoqty.js',
  './js/domain/backup.js',
  './js/domain/methods.js',
  './js/domain/migrations.js',
  './js/domain/sessions.js',
  './js/domain/before.js',
  './js/domain/costs.js',
  './js/domain/cravings.js',
  './js/domain/analysis.js',
  './js/domain/demo.js',
  './js/domain/finance.js',
  './js/domain/goals.js',
  './js/domain/health.js',
  './js/domain/insights.js',
  './js/domain/models.js',
  './js/domain/projects.js',
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
  './js/ui/record.js',
  './js/views/applehealth.js',
  './js/views/analysis.js',
  './js/views/averages.js',
  './js/views/before.js',
  './js/views/goals.js',
  './js/views/health.js',
  './js/views/home.js',
  './js/views/journal.js',
  './js/views/onboarding.js',
  './js/views/packs.js',
  './js/views/progress.js',
  './js/views/projects.js',
  './js/views/profile.js',
  './js/views/stats.js',
  './js/views/setup.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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

// Réseau d'abord (toujours la dernière version quand on est en ligne),
// cache en secours (hors ligne). Évite de rester bloqué sur une ancienne version.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
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
