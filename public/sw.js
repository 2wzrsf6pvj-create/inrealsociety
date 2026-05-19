// public/sw.js — InRealSociety Service Worker

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'InRealSociety', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'InRealSociety', {
      body:    data.body || 'Nouvelle activité.',
      icon:    '/icon.svg',
      tag:     data.tag  || 'irs',
      data:    { url: data.url || '/' },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const c = clients.find(c => c.url.includes(self.location.origin));
      if (c) { c.focus(); c.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});