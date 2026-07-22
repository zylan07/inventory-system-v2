const CACHE_NAME = 'inventra-cache-v1';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192x192.svg',
  '/icon-512x512.svg',
  '/favicon.ico',
];

// API Endpoints to explicitly SKIP caching
const API_ROUTES = [
  '/auth/',
  '/stock',
  '/transactions',
  '/notifications',
  '/api/' // Covering any explicit next api routes just in case
];

// Ensure we don't cache API requests
function isApiRequest(url) {
  return API_ROUTES.some(route => url.includes(route));
}

// Install Event - Precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page and static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event - Network First with Cache Fallback for Navigation, Stale-While-Revalidate for Statics
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Disable caching in development / local environments to prevent stale Turbopack chunks
  if (
    url.hostname === 'localhost' || 
    url.hostname === '127.0.0.1' || 
    url.hostname.startsWith('192.168.') || 
    url.hostname.startsWith('10.') || 
    url.hostname.startsWith('172.') ||
    url.port === '3000' ||
    url.port === '5000'
  ) {
    return; // Pass through to network natively
  }

  // Skip API requests and non-GET requests entirely
  if (request.method !== 'GET' || isApiRequest(url.pathname)) {
    return; // Pass through to network natively
  }

  // Handle navigate requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Handle other resources (CSS, JS, Images) - Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request).then((response) => {
        // Update cache with new response
        let responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (response.status === 200 && response.type === 'basic') {
            cache.put(request, responseClone);
          }
        });
        return response;
      }).catch(function() {
        console.error('[ServiceWorker] Fetch failed; returning offline page instead.', request.url);
      });

      return cachedResponse || networkFetch;
    })
  );
});

// Listen for message from client to force update (skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
