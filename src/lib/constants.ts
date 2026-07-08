// src/lib/constants.ts — Valeurs partagées et centralisées

/** URL de l'application (serveur et client) */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';

/** Email expéditeur pour les emails transactionnels */
export const EMAIL_FROM = 'InRealSociety <noreply@inrealsociety.com>';

/** URL de l'API Resend */
export const RESEND_API_URL = 'https://api.resend.com/emails';

// ─── Premium ─────────────────────────────────────────────────────────────────

/** Durée de la fenêtre scanner selon le plan */
export const SCAN_WINDOW_MS = {
  free:    24 * 60 * 60 * 1000,  // 24h
  premium: 48 * 60 * 60 * 1000,  // 48h
} as const;

/** Nombre max de conversations actives selon le plan */
export const MAX_CONVERSATIONS = {
  free:    3,
  premium: Infinity,
} as const;

// ─── Conversation thread ───────────────────────────────────────────────────────

/** Nombre max de messages dans un thread (message racine inclus). Garde le côté
 *  éphémère — au-delà, la suite se passe ailleurs. */
export const MAX_THREAD_MESSAGES = 5;

/** Réponses rapides qui bypassent la modération (envoi en 1 tap). */
export const QUICK_REPLIES = ["Belle audace.", "J'aime la démarche.", "👁"] as const;

/** Passe à `true` une fois les mockups produit déposés dans public/shop/
 *  (tee-{noir|blanc}-{dos|face}.webp). Tant que false : la boutique ET l'accueil
 *  affichent le placeholder, sans requête image (pas de 404). Source unique. */
export const SHOP_IMAGES_READY = false;

/** Imprimer AUSSI le monogramme )( sur la poitrine (en plus du QR au dos).
 *  ⚠️ Deux emplacements d'impression = coût Printful supérieur. Passer à `false`
 *  pour revenir au dos seul, sans toucher au code. */
export const PRINT_FRONT_LOGO = true;

/** Formes de QR proposées au client à l'achat. Seules des formes PROUVÉES
 *  décodables (test qr-decode, y compris tee noir inversé) sont exposées :
 *  net (0), arrondi (0.25, défaut), doux (0.35). Les dots pleins ne sont PAS
 *  offerts (ne scannent pas de façon fiable avec le générateur SVG). Source unique. */
export const QR_STYLES = ['sharp', 'rounded', 'soft'] as const;
export type QrStyleKey = typeof QR_STYLES[number];
export const DEFAULT_QR_STYLE: QrStyleKey = 'rounded';
/** Rayon d'arrondi des modules par style (passé à generatePremiumQRCode). */
export const QR_STYLE_CORNER: Record<QrStyleKey, number> = {
  sharp: 0, rounded: 0.25, soft: 0.35,
};
export const QR_STYLE_LABELS: Record<QrStyleKey, string> = {
  sharp: 'Net', rounded: 'Arrondi', soft: 'Doux',
};
/** Couleurs d'aperçu du swatch, fidèles au vrai QR imprimé (cf. `getInkColor`) :
 *  le print est MONOCHROME — blanc sur le tee noir, noir sur le tee blanc.
 *  ⚠️ À garder synchronisé avec `getInkColor()` dans generate-qr-svg.ts. */
export const QR_SWATCH_COLORS: Record<'dark' | 'light', { module: string; bg: string }> = {
  dark:  { module: '#FFFFFF', bg: '#0a0a0a' },
  light: { module: '#000000', bg: '#ffffff' },
};
