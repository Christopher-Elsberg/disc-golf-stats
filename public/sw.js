const CACHE_NAME = "disc-golf-stats-v1";

const APP_SHELL = [
  "/",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }),
  );

  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );

  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Kun GET requests
  if (request.method !== "GET") {
    return;
  }

  // Cache ALDRIG Supabase eller andre eksterne API requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache ikke Next.js API endpoints
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigation: prøv nettet først
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);

          if (cached) {
            return cached;
          }

          return caches.match("/");
        }),
    );

    return;
  }

  // Statiske filer: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, copy);
        });

        return response;
      });
    }),
  );
});
