// public/sw.js — InRealSociety Service Worker
//
// Trois responsabilités :
//   1. Web Push : reçoit les notifications push et les affiche
//   2. Click handler : ouvre la conversation au clic sur notif
//   3. Cache léger : précache les pages publiques pour rendre le site
//      installable comme PWA et offrir un fallback offline minimal.
//      Les routes /api/ et /_next/ ne sont JAMAIS cachées (toujours fresh).

// v2 : icônes PNG, manifestes de page, et purge des pages personnelles que la v1
// a pu garder (« Mon espace » d'un porteur connecté, rangé sous « / »).
const CACHE_NAME = 'irs-v2';
// Seules pages gardées pour le hors-connexion : publiques et sans rien de
// personnel. Toute autre page (« Mon espace », conversations, administration,
// profil en édition…) passe par le réseau seul, jamais par Cache Storage.
const PUBLIC_PAGES = ['/', '/shop', '/manifeste', '/cgv', '/confidentialite'];
const PRECACHE_URLS = [...PUBLIC_PAGES, '/icon.svg', '/favicon.svg'];

// Hors connexion, sur une page non gardée : l'app installée s'ouvre sur « Mon
// espace » ou une conversation, d'où une page d'attente plutôt que l'erreur du
// navigateur. Générée ici, elle ne contient rien de personnel.
const offlinePage = () => new Response(
  '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>In Real Society</title>'
  + '<style>html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,sans-serif}'
  + 'body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;text-align:center}'
  + 'p{margin:0;font-size:14px;color:rgba(255,255,255,.6)}'
  + 'button{min-height:44px;padding:0 28px;border:0;background:#fff;color:#000;font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase}</style>'
  + '</head><body><div style="font-size:52px;font-weight:300">)(</div>'
  + '<p>Pas de connexion pour le moment.</p>'
  + '<button onclick="location.reload()">Réessayer</button></body></html>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Sans cookies : pour un porteur connecté, « / » redirige vers « Mon
      // espace », dont la page (prénom, messages reçus) finissait en cache.
      cache.addAll(PRECACHE_URLS.map(u => new Request(u, { credentials: 'omit' }))).catch(() => {}))
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

// Fetch handler — network-first pour les pages publiques, cache-first pour les
// fichiers statiques, réseau seul pour tout le reste. Toujours bypass pour /api/
// et /_next/ (données dynamiques + chunks Next).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;
  // Manifestes : toujours le réseau, sinon l'installation garde de vieilles
  // icônes ou une ancienne adresse de départ.
  if (url.pathname === '/manifest.json' || url.pathname.endsWith('.webmanifest')) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML && !PUBLIC_PAGES.includes(url.pathname)) {
    // Réseau seul (données personnelles : jamais au repos dans Cache Storage).
    if (req.mode === 'navigate') event.respondWith(fetch(req).catch(offlinePage));
    return;
  }

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Ni redirection (« / » → « Mon espace » pour un porteur connecté), ni
          // erreur : seulement la page publique elle-même.
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || offlinePage()))
    );
    return;
  }

  // Fichiers statiques (images, polices, styles, scripts) : cache-first. Le reste, dont
  // les données des navigations internes de Next (?_rsc=…), qui portent les
  // pages personnelles, passe par le réseau seul.
  if (!['image', 'font', 'style', 'script'].includes(req.destination)) return;
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
