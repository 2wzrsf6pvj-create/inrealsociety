// src/lib/report-error.ts
// Erreur rattrapée (la route répond 500, la tâche passe à la suite) : notée dans
// les logs Vercel, gardés une heure (Hobby) à un jour (Pro), ET envoyée à
// Sentry, qui la garde et alerte. Sentry ne voit seul que les erreurs que
// personne ne rattrape.

import * as Sentry from '@sentry/nextjs';

type Context = Record<string, string | number | boolean | null | undefined>;

/**
 * `scope` : la route ou la tâche (ex. 'api/scan'), en tag Sentry.
 * `context` : des identifiants seulement, jamais d'email, d'IP ni de contenu
 * (Sentry est un tiers).
 */
export function reportError(scope: string, err: unknown, context?: Context): void {
  console.error(`[${scope}]`, err);
  Sentry.captureException(err instanceof Error ? err : new Error(describe(err)), {
    tags:  { scope },
    extra: context,
  });
}

/** Erreur qui n'est pas une Error (ex. PostgREST : { code, message, details }).
 *  Jamais `details` : il peut citer des valeurs, un email par exemple. */
function describe(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const { code, message } = err as { code?: unknown; message?: unknown };
    return [code, message].filter(Boolean).join(' ');
  }
  return String(err);
}
