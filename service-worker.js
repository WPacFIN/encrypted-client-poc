// service-worker.js

const CACHE_NAME = "offline-encryption-pwa-v4"; // <-- UPDATED: Incremented cache version
// List of all the files that make up the application shell.
// Using root-relative paths is more explicit and reliable.
const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/client.js",
  "/crypto-service.js",
  "/db-service.js",
  "/session-manager.js",
  "/mock-server.js",
  "/service-worker-client.js",
  "https://cdn.jsdelivr.net/npm/idb@8/build/index.js",
];

// Install event: opens a cache and adds the application shell files to it.
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching app shell");
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log("Service Worker: Installation complete");
        return self.skipWaiting(); // Force the waiting service worker to become the active service worker.
      })
      .catch((error) => {
        // This catch is critical for debugging `addAll` failures.
        console.error("Service Worker: Caching failed:", error);
      })
  );
});

// Activate event: cleans up old caches.
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("Service Worker: Deleting old cache", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("Service Worker: Activation complete");
        return self.clients.claim(); // Become the service worker for clients that are already open.
      })
  );
});

// Fetch event: serves requests from the cache first (Cache-First strategy).
self.addEventListener("fetch", (event) => {
  // We only want to handle GET requests for caching.
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If the request is in the cache, return the cached response.
      if (cachedResponse) {
        // console.log('Service Worker: Serving from cache:', event.request.url);
        return cachedResponse;
      }

      // If the request is not in the cache, fetch it from the network.
      // This will fail when offline, which is the error you were seeing.
      // The fix is to ensure the cache is populated correctly during install.
      console.log(
        "Service Worker: Fetching from network (will fail if offline):",
        event.request.url
      );
      return fetch(event.request);
    })
  );
});
