const CACHE_NAME = 'ys-calendar-stable-fetchfix';
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/logo.png',
  './img/profile.png',
  './css/style.css',
  './css/components.css',
  './css/calendar.css',
  './css/meeting.css',
  './css/trip.css',
  './css/monthly-schedule.css',
  './css/archive.css',
  './css/responsive.css',
  './vendor/jszip.min.js',
  './js/embedded-sections.js',
  './js/include-sections.js',
  './sections/personal.html',
  './sections/dept.html',
  './sections/monthly-schedule.html',
  './sections/meeting.html',
  './sections/trip.html',
  './sections/archive.html',
  './sections/settings.html',
  './js/utils.js',
  './js/app-install.js',
  './js/app.js',
  './js/auth.js',
  './js/firebase.js',
  './js/firebase-config.js',
  './js/calendar.js',
  './js/monthly-schedule.js',
  './js/meeting/meeting-core.js',
  './js/meeting/meeting-ui.js',
  './js/trip/trip-core.js',
  './js/trip/trip-search.js',
  './js/trip/trip-photos.js',
  './js/trip/trip-report.js',
  './js/hwpx/template-manager.js',
  './js/hwpx/common.js',
  './js/hwpx/meeting-hwpx.js',
  './js/hwpx/trip-hwpx.js',
  './js/hwpx/download.js',
  './js/archive.js',
  './js/settings.js',
  './js/bundled-hwpx-templates.js',
  './templates/meeting_weekly_template.hwpx',
  './templates/meeting_monthly_template.hwpx',
  './templates/trip_template.hwpx'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_FILES.map(file => cache.add(file)));
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

function isAppShellRequest(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin && (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.includes('/sections/')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate' || isAppShellRequest(event.request.url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
