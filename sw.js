// Service worker de la Dra. Betty: permite instalarla y abrirla aunque falle el internet.
// Primero intenta la red (para tener siempre la última versión) y si no hay, usa la copia guardada.
// Los datos de Supabase nunca se guardan acá.
const CACHE = 'drabetty-v3';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/calculos.js', 'js/lector.js', 'js/config.js', 'js/perezoso.js', 'js/graficas.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'img/fondo-1.jpg', 'img/fondo-2.jpg', 'img/fondo-3.jpg', 'img/fondo-4.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
