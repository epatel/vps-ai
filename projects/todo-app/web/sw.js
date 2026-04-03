// Service worker for PWA + Web Share Target support
'use strict';

const CACHE_NAME = 'todo-app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests to the network
  event.respondWith(fetch(event.request));
});
