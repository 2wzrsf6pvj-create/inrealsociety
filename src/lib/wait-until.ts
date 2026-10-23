// src/lib/wait-until.ts
// Garde la fonction Vercel en vie jusqu'à la fin d'une tâche lancée sans être
// attendue (écriture d'audit, alerte). Sans ça, Vercel peut figer la fonction
// dès la réponse envoyée, et la tâche se perd.
//
// Même mécanisme que `waitUntil` de @vercel/functions, et que Sentry pour vider
// ses envois : le contexte que le runtime Vercel dépose sur globalThis. Pas de
// dépendance : le paquet officiel en tire 18 (OIDC, execa…) pour ces lignes.
// Hors Vercel (local, tests) : sans effet, la tâche suit son cours.

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

type VercelContext = { waitUntil?: (promise: Promise<unknown>) => void };
type ContextStore = { get?: () => VercelContext | undefined };

export function waitUntil(promise: Promise<unknown>): void {
  const store = (globalThis as unknown as Record<symbol, ContextStore | undefined>)[REQUEST_CONTEXT];
  store?.get?.()?.waitUntil?.(promise);
}
