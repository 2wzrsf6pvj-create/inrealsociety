// Token HMAC pour les liens de désinscription newsletter. Empêche de désabonner
// un email arbitraire : seul le lien signé envoyé DANS l'email est valable.
// Le futur envoi de newsletter génère le lien via signUnsubscribe(email).

import crypto from 'crypto';

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
