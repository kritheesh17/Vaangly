// Vaango PWA Service Worker — Hardened for Phase 6 Security & Privacy
const CACHE_NAME = 'vaango-static-v2';
const OFFLINE_URL = '/';

// Only public, static application shell assets are pre-cached
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// URLs that MUST NEVER be cached under any circumstances (privacy & security guard)
const NEVER_CACHE_PATTERNS = [
  /supabase\.co/,
  /\/rest\/v1\//,
  /\/auth\/v1\//,
  /\/storage\/v1\//,
  /\/admin\//,
  /\/shopkeeper\//,
  /id_proof/,
  /documents/,
];

function shouldNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url));
}

function isStaticAsset(url) {
  return /\.(js|css|svg|png|jpg|jpeg|webp|woff2|woff|ttf|ico|json)$/i.test(url);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Vaango', body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Vaango', { body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: data.tag || 'vaango-notification', data: { url: data.url || '/' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) return client.navigate(url).then(() => client.focus());
    }
    return clients.openWindow(url);
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // 1. PRIVACY & SECURITY GUARD: Never intercept or cache API, Auth, or Storage requests
  if (shouldNeverCache(url)) {
    return; // Pass through directly to network
  }

  // 2. NAVIGATION REQUESTS: Network-first strategy with offline fallback
  // Ensures user always gets latest app version when online, falls back to cached shell if offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(OFFLINE_URL).then((cached) => cached || Response.error());
        })
    );
    return;
  }

  // 3. STATIC ASSETS: Cache-first strategy for scripts, styles, icons
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
