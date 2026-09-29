// Vaangly PWA Service Worker — Versioned Cache & Reliable Background Updates
const VAANGLY_CACHE_VERSION = 'vaangly-cache-v1.0.0';
const CACHE_NAME = VAANGLY_CACHE_VERSION;
const OFFLINE_URL = '/';

// Core static application shell assets
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// URLs that MUST NEVER be cached under any circumstances (privacy, security, & live data guard)
const NEVER_CACHE_PATTERNS = [
  /supabase\.co/,
  /\/rest\/v1\//,
  /\/auth\/v1\//,
  /\/storage\/v1\//,
  /\/functions\/v1\//,
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

// 1. Install Event: Cache critical shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Auto-skip waiting so standalone mobile PWAs seamlessly update without requiring manual user intervention
  self.skipWaiting();
});

// 2. Message Event: Support controlled skipWaiting from UI "Update Now" action
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Vaangly SW] Received SKIP_WAITING, taking over clients...');
    self.skipWaiting();
  }
});

// 3. Activate Event: Clean up all obsolete caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Vaangly SW] Purging obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[Vaangly SW] Active and controlling clients on:', CACHE_NAME);
      return self.clients.claim();
    })
  );
});

// 4. Push Event: Handle Web Push notifications for mobile & desktop
self.addEventListener('push', (event) => {
  let data = {
    title: 'Vaangly',
    body: 'You have a new update.',
    url: '/',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'Vaangly',
        body: event.data.text() || 'You have a new update.',
        url: '/',
      };
    }
  }

  const title = data.title || 'Vaangly';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'vaangly-notification',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification Click Event: Navigate user to targeted page (Order/Appointment/Queue)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  const fullTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open on the target URL, focus it
      for (const client of clientList) {
        if (client.url === fullTargetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If any Vaangly window is open, navigate and focus it
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client && 'focus' in client) {
          return client.navigate(fullTargetUrl).then(() => client.focus());
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(fullTargetUrl);
      }
    })
  );
});

// 6. Fetch Event: Network-first for HTML navigation, cache-first for hashed static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Never cache API, Supabase, Auth, Storage, or Admin documents
  if (shouldNeverCache(url)) {
    return;
  }

  // Navigation requests: Network-first with cache fallback
  // Ensures fresh deployments are loaded immediately while online, and works offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(OFFLINE_URL).then((cached) => cached || Response.error());
        })
    );
    return;
  }

  // Static Assets: Cache-first with network fallback
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
