/* Offline-first service worker, path-independent (root or GitHub Pages sub-folder).
 * - Precaches the app shell on install (URLs resolved against the SW's own scope).
 * - Navigation requests: network first, fall back to the cached shell.
 * - Same-origin assets inside the scope: cache first, then network (and cache the result).
 * - Google Fonts: stale-while-revalidate.
 * - Google APIs / OAuth: never touched (always network).
 */
const VERSION = 'v3';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const BASE = self.registration.scope; // e.g. https://user.github.io/daily-tasks/
const u = (p) => new URL(p, BASE).href;
const INDEX = u('index.html');
const APP_SHELL = [u('./'), INDEX, u('manifest.webmanifest'), u('icon.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && request.url.startsWith(BASE)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(INDEX, copy));
          return res;
        })
        .catch(() => caches.match(INDEX))
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => { cache.put(request, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (request.url.startsWith(BASE)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)); }
            return res;
          })
      )
    );
  }
});
