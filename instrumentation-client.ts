// Sentry — initialisation browser. Convention Next.js officielle (App Router).
// Anciennement sentry.client.config.ts — renommé pour la compat Turbopack.
// No-op si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:                       process.env.NEXT_PUBLIC_SENTRY_DSN,
  // production / preview / development : un aperçu Vercel n'alerte pas comme la production.
  environment:               process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  // Pas de suivi de performance dans le navigateur (retiré du bundle, cf.
  // next.config) : les erreurs seulement.
  replaysSessionSampleRate:  0,        // session replay désactivé (vie privée + coût)
  replaysOnErrorSampleRate:  0,
  debug:                     false,
  // RGPD : pas de PII auto-attachée ; l'IP n'est pas stockée côté ingestion.
  sendDefaultPii:            false,
  beforeSend(event) {
    if (event.user) delete event.user.ip_address;
    return event;
  },
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    'Failed to fetch',
  ],
});
