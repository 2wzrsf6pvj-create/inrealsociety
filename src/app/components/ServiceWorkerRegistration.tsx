'use client';

// Enregistre /sw.js au boot du browser. Indispensable pour :
//   * activer l'installabilité PWA (Chrome/Edge nécessitent un SW + fetch handler)
//   * intercepter les push notifications même hors page conversation
//
// No-op en dev (les SW en dev peuvent cacher du HMR cassé) et si l'API n'est
// pas dispo (vieux browsers, contextes non-sécurisés).

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('[sw] registration failed:', err);
      });
    };

    // Attendre le 'load' évite de concurrencer le rendu initial
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
