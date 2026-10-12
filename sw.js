// Service worker: makes Lockstep load instantly and work offline.
// Bump VERSION whenever you change files so phones pick up the update.
const VERSION = 'lockstep-v1.0.1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/maskable-512.png',
  './js/main.js',
  './js/core/config.js',
  './js/core/dates.js',
  './js/core/media.js',
  './js/core/session.js',
  './js/core/state.js',
  './js/core/store.js',
  './js/core/util.js',
  './js/data/care.js',
  './js/data/exercises.js',
  './js/data/lessons.js',
  './js/engine/alarms.js',
  './js/engine/progress.js',
  './js/engine/quests.js',
  './js/engine/ranked.js',
  './js/engine/review.js',
  './js/engine/schedule.js',
  './js/engine/suggest.js',
  './js/services/actions.js',
  './js/services/alarmRunner.js',
  './js/services/audio.js',
  './js/services/backup.js',
  './js/services/platform.js',
  './js/ui/charts.js',
  './js/ui/dom.js',
  './js/ui/emblem.js',
  './js/ui/icons.js',
  './js/ui/overlay.js',
  './js/ui/common.js',
  './js/verify/motion.js',
  './js/verify/recorder.js',
  './js/screens/alarms.js',
  './js/screens/body.js',
  './js/screens/challenge.js',
  './js/screens/focus.js',
  './js/screens/grind.js',
  './js/screens/home.js',
  './js/screens/ladder.js',
  './js/screens/lock.js',
  './js/screens/me.js',
  './js/screens/onboarding.js',
  './js/screens/quests.js',
  './js/screens/reports.js',
  './js/screens/review.js',
  './js/screens/routine.js',
  './js/screens/settings.js',
  './js/screens/workout.js',
  './js/screens/business.js',
  './js/screens/school.js',
  './js/screens/trading.js',
  './js/screens/references.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      // Cache each file individually so one missing file can't break installation.
      await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Stale-while-revalidate for same-origin GET requests.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })()
  );
});

// Tapping a notification opens/focuses the app on the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          c.postMessage({ type: 'navigate', url });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
