// Service Worker: corre en segundo plano, incluso con la pestaña cerrada.
const CACHE = 'pwa-push-demo-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Instalación: precarga de archivos básicos (shell de la app)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Activación: limpia cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: red primero para la API, caché como respaldo para lo demás
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.url.includes('/api/')) return;
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// PUSH: el servicio push despierta al SW cuando llega un mensaje
self.addEventListener('push', (event) => {
  let data = { title: 'Notificación', body: 'Tienes un mensaje nuevo', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: data.url },
      actions: [{ action: 'open', title: 'Abrir' }],
    })
  );
});

// CLICK: abre o enfoca la app al tocar la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
