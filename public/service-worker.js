// Fixed PWA service worker for Inti
const CACHE_NAME = "inti-v1";
const urlsToCache = [
  "/",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener("activate", (event) => {
  // Claim clients immediately
  clients.claim();
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  // Skip chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (like Replit server)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Use network-first strategy for same-origin GET requests only
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response for caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseClone);
          })
          .catch((error) => {
            // Silently handle cache errors
            console.warn('Failed to cache response:', error);
          });
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});