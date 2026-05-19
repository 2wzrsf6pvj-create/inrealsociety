// Sentry — initialisation browser.
// Auto-loaded par @sentry/nextjs en App Router.
// No-op si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:                 process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:         process.env.NODE_ENV,
  tracesSampleRate:    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  replaysSessionSampleRate: 0,        // session replay désactivé (vie privée + coût)
  replaysOnErrorSampleRate: 0,
  debug:               false,
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
    'Failed to fetch',
  ],
});
