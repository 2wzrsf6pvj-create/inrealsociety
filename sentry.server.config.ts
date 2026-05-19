// Sentry — initialisation serveur (Node.js runtime).
// Loaded via instrumentation.ts register() hook.
// No-op si NEXT_PUBLIC_SENTRY_DSN n'est pas défini.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn:                 process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:         process.env.NODE_ENV,
  tracesSampleRate:    process.env.NODE_ENV === 'production' ? 0.1 : 0,
  debug:               false,
  // Ignore les erreurs de validation Zod (déjà gérées et retournées au client)
  ignoreErrors: [
    'ZodError',
    'AbortError',
  ],
});
