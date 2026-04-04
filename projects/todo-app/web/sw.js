// Service worker for PWA + Web Share Target support (text + image)
'use strict';

const DB_NAME = 'share-target-db';
const STORE_NAME = 'shared-files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeFiles(files) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    store.add({ name: file.name, type: file.type, data: arrayBuffer });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept POST to share endpoint
  if (event.request.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const files = formData.getAll('images');
      const title = formData.get('title') || '';
      const text = formData.get('text') || '';
      const sharedUrl = formData.get('url') || '';

      if (files.length > 0) {
        await storeFiles(files);
      }

      const params = new URLSearchParams();
      if (title) params.set('title', title);
      if (text) params.set('text', text);
      if (sharedUrl) params.set('url', sharedUrl);
      if (files.length > 0) params.set('shared_images', '1');

      const base = url.pathname.replace(/\/share$/, '/');
      const redirectUrl = base + '?' + params.toString();
      return Response.redirect(redirectUrl, 303);
    })());
    return;
  }

  // Network-only for everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
