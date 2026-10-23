// src/lib/constants.ts — Valeurs partagées et centralisées

/** URL de l'application (serveur et client) */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';

/** Expéditeur des emails automatiques. Un sous-domaine, comme le recommande
 *  Resend (choix de Clément) : une plainte pour spam ne pèse pas sur hello@.
 *  Réglable par la variable EMAIL_FROM. Les réponses vont à CONTACT_EMAIL. */
export const EMAIL_FROM =
  process.env.EMAIL_FROM || 'In Real Society <noreply@mail.inrealsociety.com>';

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

/** Fenêtre glissante du plafond : une conversation est « active » si son message
 *  racine date de moins de N jours. Avant, le compte portait sur TOUT l'historique →
 *  après 3 messages, un porteur gratuit ne pouvait plus jamais être contacté. */
export const CONVERSATION_WINDOW_DAYS = 7;

/** Prix du premium, TTC — affichage seulement (réglages, FAQ, CGV, emails). Le
 *  montant débité vient du Stripe Price (STRIPE_PREMIUM_PRICE_ID), qui DOIT être
 *  en tax_behavior « inclusive » : sinon Stripe ajoute la TVA (3,59 €). */
export const PREMIUM_PRICE_LABEL = '2,99\u00A0€';

/** Rétractation du premium : remboursé en entier dans ce délai (choix de Clément,
 *  CGV article 8). Le premium démarre tout de suite. */
export const PREMIUM_WITHDRAWAL_DAYS = 14;

/** Ce que le premium apporte — source unique : réglages, email de bienvenue, CGV. */
export const PREMIUM_PERKS = [
  `Les passants ont ${SCAN_WINDOW_MS.premium / 3_600_000} h pour vous écrire après un scan (au lieu de ${SCAN_WINDOW_MS.free / 3_600_000} h)`,
  `Conversations illimitées (au lieu de ${MAX_CONVERSATIONS.free} sur ${CONVERSATION_WINDOW_DAYS} jours)`,
  'Le badge ✦ sur votre profil',
  'Vos scans des 7 derniers jours, jour par jour',
] as const;

/** Image d'aperçu des liens partagés (app/opengraph-image). À déclarer dans les
 *  pages qui définissent leur propre `openGraph` : elles n'en héritent pas. */
export const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: 'In Real Society' };

/** Adresse de contact (rétractation, support). */
export const CONTACT_EMAIL = 'hello@inrealsociety.com';

/** Un appareil (sender_token) signalé par ce nombre de porteurs DIFFÉRENTS est
 *  banni automatiquement de toute la plateforme (banned_devices). Plusieurs
 *  porteurs, pour qu'un signalement isolé ou abusif ne suffise pas. */
export const REPORT_BAN_THRESHOLD = 3;

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

/** POD de fabrication. `printful` par défaut (en place, testé). `gelato` = alternative
 *  EU (fabriqué en Europe). Bascule via l'env `FULFILLMENT_PROVIDER=gelato` — mais NE PAS
 *  basculer en prod tant que les productUid Gelato + le suivi/annulation ne sont pas
 *  validés (cf. src/lib/gelato.ts et [[Backlog]]). */
export const FULFILLMENT_PROVIDER: 'printful' | 'gelato' =
  process.env.FULFILLMENT_PROVIDER === 'gelato' ? 'gelato' : 'printful';

/** Imprimer AUSSI le monogramme )( sur la poitrine (en plus du QR au dos).
 *  ⚠️ Deux emplacements d'impression = coût Printful supérieur. Passer à `false`
 *  pour revenir au dos seul, sans toucher au code. */
export const PRINT_FRONT_LOGO = true;

/** Quand déclencher l'impression POD.
 *  - `true` (défaut) : dès le PAIEMENT. On réserve le short_code du QR sur la
 *    commande (orders.short_code) et on imprime tout de suite. L'acheteur reçoit
 *    TOUJOURS son t-shirt, même s'il n'active jamais son profil ; le QR mène alors
 *    à une page « profil pas encore activé ». À l'activation, le membre hérite du
 *    short_code réservé → le QR déjà imprimé pointe vers son profil.
 *  - `false` : ancien modèle — impression déclenchée seulement à l'ACTIVATION
 *    (création du profil). Un acheteur qui n'active pas ne reçoit rien.
 *  Rollback sans redéploiement : poser `FULFILL_ON_PAYMENT=false` en env. */
export const FULFILL_ON_PAYMENT: boolean = process.env.FULFILL_ON_PAYMENT !== 'false';

/** Prix du t-shirt — source UNIQUE côté app (affichage + `orders.amount` initial).
 *  ⚠️ Le montant réellement débité vient du Stripe Price (STRIPE_PRICE_ID) ; le
 *  webhook réécrit `orders.amount` avec le vrai total (`session.amount_total`,
 *  TVA + port inclus). Garder ces valeurs alignées avec le Stripe Price.
 *  ⚠️ TTC : le Price Stripe DOIT être en tax_behavior « inclusive », sinon
 *  `automatic_tax` ajoute la TVA par-dessus et l'affichage « 49€ » devient faux. */
export const TSHIRT_PRICE_EUR   = 49;
export const TSHIRT_PRICE_CENTS = 4900;

/** Frais de livraison TTC — source UNIQUE : options Stripe Checkout (api/shop/checkout,
 *  en tax_behavior « inclusive ») ET affichage (boutique, FAQ). Un prix affiché doit
 *  toujours être le prix facturé. */
export const SHIPPING_STANDARD_CENTS = 500;
export const SHIPPING_EXPRESS_CENTS  = 1200;

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
