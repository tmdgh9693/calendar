const CACHE_NAME = 'aton-calendar-trip-status-fixed-column-20260721-7';
const APP_FILES = [
  './css/archive.css',
  './css/backup.css',
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
  './js/backup.js',
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
  './js/trip/trip-drafts.js',
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

async function cacheMatch(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request, { ignoreSearch: false });
}

async function putSameOrigin(request, response) {
  if (!response || !response.ok) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    await putSameOrigin(request, response);
    return response;
  } catch (_) {
    const cached = await cacheMatch(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await cacheMatch(new Request('./index.html'))) || Response.error();
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await cacheMatch(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await putSameOrigin(request, response);
    return response;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCodeOrMarkup = event.request.mode === 'navigate' ||
    /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

  event.respondWith(isCodeOrMarkup ? networkFirst(event.request) : cacheFirst(event.request));
});
