// Funes Vault app-shell service worker.
//
// Caching boundary (enforced by shouldCacheUrl and verified by tests):
// only same-origin app-shell resources — the shell document, hashed build
// assets, icons, and the manifest — are ever cached. The API lives on a
// different origin, so memory content, suggestion content, and API
// responses can never enter these caches. Same-origin routes outside the
// allowlist (for example /api/*) are never cached either.

const buildId =
  new URL(self.location.href).searchParams.get("v") ?? "development";
const SHELL_CACHE = `funes-shell-${buildId}`;

const APP_SHELL_PATHS = [
  "/",
  "/overview",
  "/vault",
  "/chat",
  "/inbox",
  "/settings/profile",
  "/settings/jobs",
  "/settings/data",
  "/settings/clients",
  "/settings/audit",
  "/settings/requests",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

function shouldCacheUrl(urlString, origin) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (url.origin !== origin) {
    return false;
  }

  if (url.search !== "") {
    return false;
  }

  if (APP_SHELL_PATHS.includes(url.pathname)) {
    return true;
  }

  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(APP_SHELL_PATHS.map((route) => cache.add(route)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("funes-shell-") && key !== SHELL_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && shouldCacheUrl(request.url, self.location.origin)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await matchNavigationFallback(cache, request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function matchNavigationFallback(cache, request) {
  return (await cache.match(request)) ?? (await cache.match("/"));
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  // Navigations get the network-first shell so the app can still boot
  // (and queue captures) while the vault host is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (!shouldCacheUrl(request.url, self.location.origin)) {
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});
