const V = 'transcritor-v1';
const SHELL = ['./', 'index.html', 'app.js', 'worker.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/transformers.web.min.js', 'lib/ort-wasm-simd-threaded.mjs', 'lib/ort-wasm-simd-threaded.wasm'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k.startsWith('transcritor-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // modelos (huggingface) têm cache próprio
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
