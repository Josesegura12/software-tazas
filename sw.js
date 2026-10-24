// Guarda el editor, Mi negocio y la tienda para que funcionen sin internet.
// Archivos del sitio: primero la red (para recibir mejoras) y si no hay conexión, la copia guardada.
// Letras y librerías externas: la copia guardada y se actualiza en segundo plano.
const CACHE = 'sublima-facil-v3';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './erp/', './erp/index.html', './erp/app.js', './erp/styles.css',
  './tienda/', './tienda/index.html', './tienda/app.js', './tienda/styles.css', './tienda/catalogo.json',
];

self.addEventListener('install', e => {
  // Uno por uno: si alguno falla, los demás sí se guardan
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Sin conexión y sin copia de esa página: la página principal de su propia carpeta
function offlinePage(url) {
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  const folder = /^(erp|tienda)\//.exec(rel);
  return caches.match(folder ? `./${folder[1]}/index.html` : './index.html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const cacheable = same || /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(url.hostname);
  if (!cacheable) return;
  // Solo se guardan respuestas buenas (nunca una página de error mientras GitHub publica)
  const keep = res => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  };

  if (req.mode === 'navigate' || same) {
    e.respondWith(fetch(req).then(keep).catch(() => caches.match(req, { ignoreSearch: true })
      .then(r => r || (req.mode === 'navigate' ? offlinePage(url) : Response.error()))));
    return;
  }

  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(keep).catch(() => hit);
    return hit || net;
  }));
});
