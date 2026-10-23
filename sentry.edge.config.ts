// Sentry — initialisation Edge runtime (middleware Next.js).
// Loaded via instrumentation.ts register() hook.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:                 process.env.NEXT_PUBLIC_SENTRY_DSN,
  // production / preview / development : un aperçu Vercel n'alerte pas comme la production.
  environment:         process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate:    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  debug:               false,
  // RGPD : pas de PII auto-attachée (IP, cookies, headers) aux events.
  sendDefaultPii:      false,
  beforeSend(event) {
    if (event.user) delete event.user.ip_address;
    return event;
  },
});
