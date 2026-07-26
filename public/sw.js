// CapitalReach service worker.
//
// Deliberately minimal. This app serves per-user authenticated HTML and
// financial data, so the default "cache everything" PWA recipe is actively
// dangerous here: a cached /dashboard response would be served to whoever
// opens the app next on that device, and cached /api responses would show one
// party stale figures for a live deal.
//
// The rules, in order of how much they matter:
//   1. Never cache anything under /api/ or /auth/, and never anything
//      cross-origin (that covers every Supabase and Stripe call).
//   2. Never cache navigations. They render signed-in HTML.
//   3. Cache only content-hashed build output and static icons, which are
//      immutable by construction -- a new build produces new filenames.
//
// The offline fallback is a static page with no user data on it.

const VERSION = "v1";
const ASSETS = `cr-assets-${VERSION}`;
const SHELL = `cr-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Rule 1: only same-origin GETs are eligible for any handling at all.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Rule 3: immutable build output -- safe to serve from cache first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Rule 2: navigations always hit the network. On failure, show the static
  // offline page rather than a browser error -- but never a cached dashboard.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
