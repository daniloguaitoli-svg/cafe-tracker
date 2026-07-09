// sw.js — service worker mínimo para PWA (instalável, com cache do "casco").
// Dados (/api) NUNCA são cacheados — sempre buscam da rede.
const CACHE = "cafe-tracker-v1";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // dados sempre da rede
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copia = res.clone();
            if (res.ok && url.origin === location.origin) {
              caches.open(CACHE).then((c) => c.put(e.request, copia));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
