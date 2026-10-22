// src/lib/referral-code.ts
// Lien de parrainage /join/<code> (migration 060) : 10 caractères de l'alphabet
// des codes QR. Les liens partagés avant la 060 portent l'identifiant du profil
// (UUID) et restent acceptés pour la remise. Sans dépendance serveur : la boutique
// (client) l'importe aussi. Résolution du parrain : src/lib/referral.ts.

const REFERRAL_CODE_RE = /^[a-hjkmnp-z2-8]{10}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Code de parrainage, ou ancien lien à identifiant de profil. */
export function isReferralToken(value: unknown): value is string {
  return typeof value === 'string' && (REFERRAL_CODE_RE.test(value) || UUID_RE.test(value));
}

/** Ancien format (avant la 060) : l'identifiant du profil. */
export function isLegacyReferral(value: string): boolean {
  return UUID_RE.test(value);
}
