const CACHE_NAME = 'dept-calendar-v1';
const APP_FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css', './css/calendar.css', './css/meeting.css', './css/trip.css', './css/archive.css', './css/responsive.css',
  './js/utils.js', './js/app-install.js', './js/app.js', './js/auth.js', './js/firebase.js', './js/firebase-config.js', './js/calendar.js', './js/meeting.js', './js/trip.js', './js/archive.js', './js/settings.js', './js/hwpx.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
