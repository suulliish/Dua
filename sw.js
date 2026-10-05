/* Offline cache.
   Fonts and icons never change: cache first.
   Page, styles, scripts, data: network first (updates arrive on the next open),
   cache if the network is down or slower than 3 seconds. */
const CACHE = 'dua-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/data.js', './js/data-extra.js', './js/times.js', './js/progress.js', './js/app.js',
  './data/times-oskemen.json',
  './fonts/onest-cyrillic-ext.woff2', './fonts/onest-cyrillic.woff2',
  './fonts/onest-latin-ext.woff2', './fonts/onest-latin.woff2', './fonts/amiri-arabic.woff2',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  const fromCache = () => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'));
  const network = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  const timeout = new Promise((_, reject) => setTimeout(reject, 3000));
  return Promise.race([network, timeout]).catch(fromCache);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (/\/(fonts|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  e.respondWith(networkFirst(req));
});
