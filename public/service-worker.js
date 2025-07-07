// public/service-worker.js (Updated for Debugging)

const CACHE_NAME = "offline-encryption-pwa-v7-debug"; // Incremented cache version
const COOKIE_ENDPOINT = "/__read-cookie";
const WRAPPED_DEK_COOKIE_NAME = "wrapped-dek";

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/client.js",
  "/crypto-service.js",
  "/db-service.js",
  "/session-manager.js",
  "/api-client.js",
  "/service-worker-client.js",
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
      .then(() => {
        console.log("Service Worker: Installation complete");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Service Worker: Caching failed:", error);
      })
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
              console.log("Service Worker: Deleting old cache", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("Service Worker: Activation complete");
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Check if it's the special cookie-reading endpoint
  if (url.pathname === COOKIE_ENDPOINT) {
    event.respondWith(
      (async () => {
        // --- START NEW LOGGING ---
        console.log("[SW] Intercepted /__read-cookie request.");
        const headersObject = {};
        for (const [key, value] of event.request.headers.entries()) {
          headersObject[key] = value;
        }
        console.log(
          "[SW] Request Headers Received:",
          JSON.stringify(headersObject, null, 2)
        );
        // --- END NEW LOGGING ---

        const clientId = event.resultingClientId || event.clientId;
        if (!clientId) {
          return new Response(
            "Client not found. Page may not be controlled by service worker yet.",
            { status: 404 }
          );
        }
        const client = await self.clients.get(clientId);

        if (!client) {
          return new Response("Client not found.", { status: 404 });
        }

        const cookieHeader = event.request.headers.get("cookie") || "";
        const cookies = cookieHeader.split(";").map((c) => c.trim());
        const dekCookie = cookies.find((c) =>
          c.startsWith(`${WRAPPED_DEK_COOKIE_NAME}=`)
        );
        const wrappedDekValue = dekCookie ? dekCookie.split("=")[1] : null;

        client.postMessage({ type: "COOKIE_VALUE", payload: wrappedDekValue });

        return new Response(null, { status: 204 });
      })()
    );
    return;
  }

  // For other GET requests, use the cache-first strategy.
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).catch((err) => {
          console.error(`Fetch failed for: ${event.request.url}`, err);
          throw err;
        });
      })
    );
  }
});
