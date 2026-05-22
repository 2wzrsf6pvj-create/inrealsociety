// Garde anti open-redirect — SOURCE UNIQUE.
// N'accepte qu'un chemin INTERNE. Rejette : origine externe (https://evil,
// //evil.com, /\evil.com normalisé), schémas (javascript:), et /xxx:yyy piégeux.
// Utilisée par /auth/login (?redirect=) et /auth/callback (?next=).

export function safeInternalPath(raw: string | null, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  try {
    // URL absolue ou protocol-relative → origin ≠ localhost → rejet.
    const url = new URL(raw, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
  } catch {
    return fallback;
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/^\/[^/]*:/i.test(raw)) return fallback; // ex: /x:y (schéma déguisé)
  return raw;
}
