// src/lib/contact-verification.ts
// Vérification de l'email laissé par un passant (double opt-in). SERVEUR
// UNIQUEMENT (supabaseAdmin). Table contact_verifications (migration 057).
//
// Le porteur répond → la réponse ne part par email que si le passant a confirmé
// son adresse via le lien reçu. Sans ça, un passant pouvait faire écrire la
// plateforme à un tiers dont il avait tapé l'adresse.

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailContactVerification } from '@/lib/email-templates';
import { checkContactVerifyRateLimit } from '@/lib/ratelimit';
import { APP_URL } from '@/lib/constants';

/** Durée de validité du lien de confirmation. */
export const CONTACT_VERIFY_TTL_DAYS = 7;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Crée la vérification d'un message racine et envoie le lien de confirmation.
 * `false` si rien n'est parti (plafond par adresse atteint, envoi échoué) : le
 * message reste envoyé, seules les réponses par email sont perdues.
 */
export async function startContactVerification(params: {
  messageId:  string;
  email:      string;
  memberName: string;
}): Promise<boolean> {
  const email = params.email.trim().toLowerCase();
  if (!(await checkContactVerifyRateLimit(email))) return false;

  const token = crypto.randomBytes(32).toString('base64url');
  const { error } = await supabaseAdmin
    .from('contact_verifications')
    .insert({ message_id: params.messageId, email, token_hash: hashToken(token) });
  if (error) throw error;

  const { subject, html } = emailContactVerification({
    memberName: params.memberName,
    verifyUrl:  `${APP_URL}/api/contact/verify?token=${token}`,
    ttlDays:    CONTACT_VERIFY_TTL_DAYS,
  });
  return sendEmail({ to: email, subject, html });
}

export type ConfirmResult =
  | { status: 'ok'; messageId: string; email: string; firstConfirmation: boolean }
  | { status: 'expired' | 'invalid' };

/** Confirme l'adresse derrière un jeton. Idempotent : un second clic reste « ok ». */
export async function confirmContactToken(token: string): Promise<ConfirmResult> {
  const { data: row } = await supabaseAdmin
    .from('contact_verifications')
    .select('message_id, email, created_at, verified_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!row) return { status: 'invalid' };
  if (row.verified_at) return { status: 'ok', messageId: row.message_id, email: row.email, firstConfirmation: false };

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > CONTACT_VERIFY_TTL_DAYS * 86_400_000) return { status: 'expired' };

  const { error } = await supabaseAdmin
    .from('contact_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('message_id', row.message_id)
    .is('verified_at', null);
  if (error) throw error;
  return { status: 'ok', messageId: row.message_id, email: row.email, firstConfirmation: true };
}

/** L'adresse `email` a-t-elle été confirmée pour cette conversation ? */
export async function isContactVerified(messageId: string, email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('contact_verifications')
    .select('email, verified_at')
    .eq('message_id', messageId)
    .maybeSingle();
  return !!data?.verified_at && data.email === email.trim().toLowerCase();
}
