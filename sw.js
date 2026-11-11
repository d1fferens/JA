// Офлайн-кэш: сначала отдаём из кэша, в фоне обновляем (новая версия появится при следующем открытии).
const CACHE = 'jp-particles-v14';
const FILES = ['./', 'index.html', 'data.js', 'words.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'yuki.js', 'yuki.css', 'yuki-happy.webp', 'yuki-sad.webp', 'yuki-wow.webp', 'yuki-sleep.webp'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('translate.googleapis.com')) return;   // автоперевод не кэшируем
  // открытие через «Поделиться» приходит с ?text=… — отдаём ту же страницу из кэша (работает и без сети)
  const nav = e.request.mode === 'navigate';
  e.respondWith(
    caches.match(e.request, { ignoreSearch: nav }).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok && !(nav && new URL(e.request.url).search)) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
