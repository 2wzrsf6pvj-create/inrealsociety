// Token HMAC pour les liens de désinscription (newsletter, emails de scan).
// Empêche de désabonner quelqu'un d'autre : seul le lien signé envoyé DANS
// l'email est valable.

import crypto from 'crypto';
import { APP_URL } from '@/lib/constants';

function secret(): string {
  // Réutilise un secret serveur déjà requis (l'envoi newsletter exige INTERNAL_SECRET).
  const s = process.env.INTERNAL_SECRET || process.env.CRON_SECRET;
  if (s) return s;
  // FAIL-CLOSED en prod : sans secret réel, la clé HMAC serait la constante publique
  // 'dev-unsub-secret' → TOUT token de désinscription deviendrait forgeable
  // (désinscription de masse + flip du marketing_consent). On refuse plutôt que de
  // signer avec un secret connu. En dev on tolère un fallback fixe pour tester en local.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[unsubscribe-token] INTERNAL_SECRET/CRON_SECRET manquant en production.');
  }
  return 'dev-unsub-secret';
}

export function signUnsubscribe(email: string): string {
  return crypto.createHmac('sha256', secret())
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = signUnsubscribe(email);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// ─── Emails de scan (migration 061) ──────────────────────────────────────────
// Signé sur l'identifiant du porteur, préfixé : un lien newsletter (signé sur
// un email, qui ne contient jamais « : ») ne vaut pas pour les scans, ni
// l'inverse.

const scanEmailsSubject = (memberId: string) => `scan-emails:${memberId}`;

export function verifyScanEmailsOptOut(memberId: string, token: string): boolean {
  return !!memberId && verifyUnsubscribe(scanEmailsSubject(memberId), token);
}

/** Lien qui coupe l'email « nouveau scan » de ce porteur : pied de l'email et
 *  List-Unsubscribe (un clic). null sans secret serveur en production : l'email
 *  part alors sans lien, plutôt qu'avec un lien forgeable ou pas du tout. */
export function scanEmailsOptOutUrl(memberId: string): string | null {
  try {
    const token = signUnsubscribe(scanEmailsSubject(memberId));
    return `${APP_URL}/api/scan-emails/unsubscribe?m=${encodeURIComponent(memberId)}&t=${token}`;
  } catch (err) {
    console.error('[unsubscribe-token] lien des emails de scan impossible :', err);
    return null;
  }
}
