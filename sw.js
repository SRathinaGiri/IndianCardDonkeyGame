const CACHE_VERSION = 'v10';
const CACHE_NAME = `donkey-game-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'style.css?v=1.0.8',
  'game.js?v=1.0.8',
  'cards.png',
  'card-back.png',
  'icon-192x192.png',
  'icon-512x512.png',
  'manifest.json?v=1.0.8',
  'shuffle.mp3',
  'draw.mp3',
  'discard.mp3',
  'meld.mp3',
  'win.mp3',
  'error.mp3',
  'click.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('donkey-game-cache-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isHtmlRequest = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  // Use network-first for same-origin assets so UI and logic updates are not stuck behind stale caches.
  if (isHtmlRequest || isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
  } else {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(resp => {
        return resp || fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        });
      }).catch(() => {
        // If both cache and network fail offline, return a matching cache if possible
        return caches.match(request, { ignoreSearch: true });
      })
    );
  }
});
