'use strict';
// Bump VERSION when you change index.html, app.js, style.css or icons.
// questions.json is always fetched network-first, so question edits need no bump.
const VERSION = 'v1';
const CACHE = 'ccna-drill-' + VERSION;
const SHELL = [
  './', 'index.html', 'app.js', 'style.css', 'questions.json',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ccna-drill-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, timeoutMs) {
  return caches.open(CACHE).then((cache) => {
    const net = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
    return Promise.race([net, timer]).catch(() =>
      cache.match(req, { ignoreSearch: true }).then((hit) => hit || net)
    );
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) return hit;
      return net.then((res) => res || cache.match('index.html'));
    })
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/questions.json')) {
    e.respondWith(networkFirst(req, 3000));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});
