/**
 * Génère un code alphanumérique cryptographiquement sûr.
 * Utilise crypto.getRandomValues() au lieu de Math.random().
 * Caractères choisis pour éviter les ambiguïtés visuelles (0/O, 1/I/L).
 */
export function generateSecureCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}