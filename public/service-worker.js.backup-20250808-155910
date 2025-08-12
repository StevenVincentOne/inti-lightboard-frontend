// Basic PWA service worker for Inti
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
  // Fix: Do not cache requests for chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Use network-first strategy for dynamic content
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache valid responses (e.g., not opaque responses for cross-origin resources)
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response for caching
        const responseClone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseClone);
          });
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});
