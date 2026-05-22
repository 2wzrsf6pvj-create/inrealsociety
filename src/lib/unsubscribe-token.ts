// Token HMAC pour les liens de désinscription newsletter. Empêche de désabonner
// un email arbitraire : seul le lien signé envoyé DANS l'email est valable.
// Le futur envoi de newsletter génère le lien via signUnsubscribe(email).

import crypto from 'crypto';

function secret(): string {
  // Réutilise un secret serveur déjà requis. En dev sans secret, fallback fixe
  // (la désinscription n'est de toute façon pas un vecteur d'abus critique).
  return process.env.INTERNAL_SECRET || process.env.CRON_SECRET || 'dev-unsub-secret';
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
