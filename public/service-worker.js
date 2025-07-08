/**
 * @file service-worker.js
 * @description This service worker is responsible for making the application work offline.
 * It uses a "cache-first" strategy. On install, it caches all the essential
 * application files. On fetch, it tries to serve requests from the cache first.
 * If a resource isn't in the cache, it falls back to the network.
 */

const CACHE_NAME = "offline-encryption-pwa-v12-multi-user";

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/client.js",
  "/crypto-service.js",
  "/db-service.js",
  "/session-manager.js",
  "/api-client.js",
  "https://cdn.jsdelivr.net/npm/idb@8/build/index.js",
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching app shell");
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // We only cache GET requests. Other requests (like POST) should go to the network.
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // If we have a cached response, return it.
        if (cachedResponse) {
          return cachedResponse;
        }
        // If not in cache, try to fetch from the network.
        // This will fail when the app is offline.
        return fetch(event.request);
      })
    );
  }
});
