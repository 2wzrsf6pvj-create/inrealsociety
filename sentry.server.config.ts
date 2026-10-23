// Sentry — initialisation serveur (Node.js runtime).
// Loaded via instrumentation.ts register() hook.
// No-op si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:                 process.env.NEXT_PUBLIC_SENTRY_DSN,
  // production / preview / development : un aperçu Vercel n'alerte pas comme la production.
  environment:         process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate:    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  debug:               false,
  // RGPD : pas de PII auto-attachée (IP, cookies, headers, body) aux events.
  sendDefaultPii:      false,
  // Filet : efface l'IP même si une intégration la rattache.
  beforeSend(event) {
    if (event.user) delete event.user.ip_address;
    return event;
  },
  // Ignore les erreurs de validation Zod (déjà gérées et retournées au client)
  ignoreErrors: [
    'ZodError',
    'AbortError',
  ],
});
