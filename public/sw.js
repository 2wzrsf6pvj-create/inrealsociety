// public/sw.js — InRealSociety Service Worker
//
// Trois responsabilités :
//   1. Web Push : reçoit les notifications push et les affiche
//   2. Click handler : ouvre la conversation au clic sur notif
//   3. Cache léger : précache les pages publiques pour rendre le site
//      installable comme PWA et offrir un fallback offline minimal.
//      Les routes /api/ et /_next/ ne sont JAMAIS cachées (toujours fresh).

// v2 : icônes PNG et manifestes de page — purge le manifeste gardé en cache.
const CACHE_NAME = 'irs-v2';
const PRECACHE_URLS = ['/', '/shop', '/manifeste', '/cgv', '/confidentialite', '/icon.svg', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Supprime les anciens caches versionnés
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
      self.clients.claim(),
    ])
  );
});

// Fetch handler — network-first pour HTML, cache-first pour assets statiques.
// Toujours bypass pour /api/ et /_next/ (données dynamiques + chunks Next).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;
  // Manifestes : toujours le réseau, sinon l'installation garde de vieilles
  // icônes ou une ancienne adresse de départ.
  if (url.pathname === '/manifest.json' || url.pathname.endsWith('.webmanifest')) return;
  // Jamais en cache : pages authentifiées / contenu de conversation (données
  // perso au repos dans Cache Storage + risque offline cross-URL). Réseau direct.
  if (/^\/(dashboard|conversation)(\/|$)/.test(url.pathname)) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Assets statiques : cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'In Real Society', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'In Real Society', {
      body:    data.body || 'Nouvelle activité.',
      // PNG : le SVG n'est pas lu partout. Le badge (barre de notifications
      // Android) n'est gardé qu'en silhouette : logo blanc sur fond transparent.
      icon:    '/icon-192.png',
      badge:   '/notification-badge.png',
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
