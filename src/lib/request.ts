// src/lib/request.ts — envois depuis le navigateur sur un réseau faible (4G
// dans la rue). Un délai d'abandon, et des messages clairs en français à la
// place de ceux du navigateur (« Load failed », « Failed to fetch ») ou d'une
// page d'erreur de l'hébergeur lue comme du JSON (« Unexpected token… »).

/** Délai d'abandon d'un envoi (message, réponse, signalement…). */
export const SEND_TIMEOUT_MS = 20_000;
/** Délai d'abandon d'un envoi de photo, plus lourd sur une 4G faible. */
export const UPLOAD_TIMEOUT_MS = 60_000;

export type RequestFailure = 'offline' | 'timeout' | 'unreadable';

export const FAILURE_MESSAGES: Record<RequestFailure, string> = {
  offline:    'Pas de réseau pour le moment. Réessayez dès qu’il revient.',
  timeout:    'Le réseau ne répond pas. Réessayez dans un instant.',
  unreadable: 'Le service ne répond pas pour le moment. Réessayez dans un instant.',
};

/** Signal qui abandonne l'envoi après `ms`. Les Safari trop anciens n'ont pas
 *  AbortSignal.timeout : l'envoi part alors sans délai, comme avant. */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** Hors ligne d'après le téléphone : inutile d'essayer, on le dit tout de suite. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Nature d'un échec d'envoi, ou `null` pour une erreur levée exprès avec le
 *  message du serveur. */
export function requestFailure(err: unknown): RequestFailure | null {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'timeout';
  if (err instanceof TypeError)   return 'offline';    // fetch : connexion coupée ou impossible
  if (err instanceof SyntaxError) return 'unreadable'; // page d'erreur au lieu du JSON attendu
  return null;
}

/**
 * Message à afficher après un envoi échoué : celui du serveur s'il en a donné un
 * (déjà en français), sinon la nature de l'échec, jamais le texte technique du
 * navigateur. `kept` complète les échecs réseau (ex. « Votre message est
 * gardé. ») : le texte tapé reste dans le champ.
 */
export function requestErrorMessage(err: unknown, fallback: string, kept?: string): string {
  const failure = requestFailure(err);
  if (failure) return kept ? `${FAILURE_MESSAGES[failure]} ${kept}` : FAILURE_MESSAGES[failure];
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Message hors ligne, dit avant même d'essayer. */
export function offlineMessage(kept?: string): string {
  return kept ? `${FAILURE_MESSAGES.offline} ${kept}` : FAILURE_MESSAGES.offline;
}

/**
 * Échec réseau d'un appel d'authentification Supabase (connexion, inscription) :
 * la bibliothèque le signale par `AuthRetryableFetchError` (statut 0 sans
 * réseau, 502 à 504 si le service ne répond pas). `null` pour une vraie erreur
 * d'identifiants, à traiter comme avant.
 */
export function authFailureMessage(err: { name?: string; status?: number }): string | null {
  if (err.name !== 'AuthRetryableFetchError') return null;
  return err.status && err.status >= 500 ? FAILURE_MESSAGES.unreadable : FAILURE_MESSAGES.offline;
}
