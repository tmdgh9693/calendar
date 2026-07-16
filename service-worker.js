const CACHE_NAME = 'aton-calendar-photo-vault-upload-20260716';
const APP_FILES = [
  './css/archive.css',
  './css/calendar.css',
  './css/components.css',
  './css/meeting.css',
  './css/monthly-schedule.css',
  './css/photo-vault.css',
  './css/responsive.css',
  './css/style.css',
  './css/trip.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/logo.png',
  './img/profile.png',
  './index.html',
  './js/app-install.js',
  './js/app.js',
  './js/archive.js',
  './js/auth.js',
  './js/bundled-hwpx-templates.js',
  './js/calendar.js',
  './js/embedded-sections.js',
  './js/firebase-config.js',
  './js/firebase-loader.js',
  './js/firebase.js',
  './js/hwpx/common.js',
  './js/hwpx/download.js',
  './js/hwpx/meeting-hwpx.js',
  './js/hwpx/template-manager.js',
  './js/hwpx/trip-hwpx.js',
  './js/include-sections.js',
  './js/meeting/meeting-core.js',
  './js/meeting/meeting-ui.js',
  './js/monthly-schedule.js',
  './js/offline-mode.js',
  './js/photo-vault.js',
  './js/settings.js',
  './js/trip/trip-core.js',
  './js/trip/trip-photos.js',
  './js/trip/trip-report.js',
  './js/trip/trip-search.js',
  './js/utils.js',
  './manifest.webmanifest',
  './sections/archive.html',
  './sections/dept.html',
  './sections/meeting.html',
  './sections/monthly-schedule.html',
  './sections/personal.html',
  './sections/photo-vault.html',
  './sections/settings.html',
  './sections/trip.html',
  './templates/meeting_monthly_template.hwpx',
  './templates/meeting_weekly_template.hwpx',
  './templates/trip_template.hwpx',
  './vendor/jszip.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
    await cache.add('./');
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (request.mode === 'navigate') return cache.match('./index.html');
  return null;
}

async function cacheFirst(request) {
  const cached = await cachedResponse(request);
  if (cached) {
    if (navigator.onLine) {
      fetch(request).then(async response => {
        if (response && response.ok && new URL(request.url).origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
      }).catch(() => {});
    }
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return request.mode === 'navigate'
      ? (await cachedResponse(new Request('./index.html')) || Response.error())
      : Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(cacheFirst(event.request));
});
