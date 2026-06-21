const CACHE_VERSION = 'v27';
const CACHE_NAME = `donkey-game-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  'index.html',
  'style.css?v=1.4.11',
  'style.css',
  'game.js?v=1.4.11',
  'game.js',
  'cards.png',
  'card-back.png',
  'icon-192x192.png',
  'icon-512x512.png',
  'manifest.json?v=1.4.11',
  'manifest.json',
  'shuffle.mp3',
  'draw.mp3',
  'discard.mp3',
  'meld.mp3',
  'win.mp3',
  'error.mp3',
  'click.mp3'
];

const LOCAL_FIRST_EXTENSIONS = [
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.mp3',
  '.wav',
  '.ogg'
];

function isLocalFirstAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return LOCAL_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

async function putIfCacheable(cache, request, response) {
  if (!response || !response.ok) return;
  await cache.put(request, response.clone());
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  await putIfCacheable(cache, request, response);
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
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

  if (isHtmlRequest) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => {
        if (cached) {
          event.waitUntil(fetchAndCache(request).catch(() => null));
          return cached;
        }
        return fetchAndCache(request).catch(() => caches.match('index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  if (isLocalFirstAsset(requestUrl)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => {
        if (cached) {
          event.waitUntil(fetchAndCache(request).catch(() => null));
          return cached;
        }
        return fetchAndCache(request).catch(() => caches.match(request, { ignoreSearch: true }));
      })
    );
    return;
  }

  if (isSameOrigin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => {
        return cached || fetchAndCache(request).catch(() => caches.match('index.html', { ignoreSearch: true }));
      })
    );
  } else {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(resp => {
        return resp || fetchAndCache(request);
      }).catch(() => {
        // If both cache and network fail offline, return a matching cache if possible
        return caches.match(request, { ignoreSearch: true });
      })
    );
  }
});
