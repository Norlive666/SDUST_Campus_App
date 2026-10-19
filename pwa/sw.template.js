const CACHE = "shst-shell-__CACHE_ID__";
const FILES = __PRECACHE__;
const ASSETS = new Set(FILES);
const PAGES = new Set(["/", "/login", "/timetable", "/grade", "/exam", "/profile"]);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Keep one prior shell for tabs that have not accepted the new version yet.
    const old = keys.filter(key => key.startsWith("shst-shell-") && key !== CACHE);
    await Promise.all(old.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never cache API responses, credentials, captcha images or external requests.
  if (url.pathname.startsWith("/api/")) return;
  const file = request.mode === "navigate" && PAGES.has(url.pathname) ? "/index.html" : url.pathname;
  if (!ASSETS.has(file)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(file)) || fetch(request);
  })());
});
