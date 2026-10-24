// src/lib/scan-origin.ts
// Origine d'un achat (063) : le profil d'un porteur, vu après un scan, d'où le
// visiteur est allé à la boutique (« Découvrir le t-shirt » après son message,
// « C'est quoi ce t-shirt ? » en bas du profil). Gardée 30 jours sur cet
// appareil, puis envoyée avec la commande : /admin compte les achats venus d'un
// scan, et de quel porteur. Sans dépendance serveur : importé côté client.

export const SCAN_ORIGIN_DAYS = 30;
const KEY = 'scan_origin';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lien vers la boutique depuis le profil d'un porteur. */
export function shopFromProfile(memberId: string): string {
  return `/shop?from=${encodeURIComponent(memberId)}`;
}

/**
 * Porteur d'origine de l'achat : celui de l'URL (/shop?from=…), retenu pour 30
 * jours, sinon celui retenu sur l'appareil tant qu'il a moins de 30 jours.
 */
export function scanOrigin(fromParam: string | null, now = Date.now()): string | null {
  const fromUrl = fromParam && UUID_RE.test(fromParam) ? fromParam : null;
  try {
    if (fromUrl) {
      localStorage.setItem(KEY, JSON.stringify({ memberId: fromUrl, at: now }));
      return fromUrl;
    }
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { memberId?: unknown; at?: unknown } | null;
    if (typeof saved?.memberId === 'string' && UUID_RE.test(saved.memberId)
        && typeof saved.at === 'number' && now - saved.at < SCAN_ORIGIN_DAYS * 86_400_000) {
      return saved.memberId;
    }
    localStorage.removeItem(KEY);
  } catch {
    // Stockage bloqué (navigation privée) ou valeur illisible : l'URL seule compte.
  }
  return fromUrl;
}

/** Achat fait : l'origine a servi, une commande suivante ne lui revient pas. */
export function forgetScanOrigin(): void {
  try { localStorage.removeItem(KEY); } catch { /* rien à effacer */ }
}
