// Next.js instrumentation hook : appelée au démarrage côté serveur/edge.
// Sentry l'utilise pour init son SDK selon le runtime.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

import * as Sentry from '@sentry/nextjs';
export const onRequestError = Sentry.captureRequestError;
