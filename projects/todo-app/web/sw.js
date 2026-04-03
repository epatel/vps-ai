// Service worker for PWA + Web Share Target support
'use strict';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-only: pass through all requests, don't fail on errors
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
