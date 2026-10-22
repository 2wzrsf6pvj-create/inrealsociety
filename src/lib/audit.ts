// src/lib/audit.ts
// Logging des actions sensibles dans la table audit_logs.
// Utilise le service role — toujours côté serveur uniquement.
// Fire-and-forget : ne bloque jamais la réponse principale.

import { supabaseAdmin } from '@/lib/supabase-admin';
import * as Sentry from '@sentry/nextjs';

export type AuditAction =
  | 'message.sent'
  | 'message.moderated'
  | 'message.read'
  | 'message.starred'
  | 'reply.sent'
  | 'scan.recorded'
  | 'scan.rate_limited'
  | 'message.rate_limited'
  | 'dashboard.accessed'
  | 'qrcode.generated'
  | 'order.completed'
  | 'order.email_failed'
  | 'order.email_missing'
  | 'order.email_resent'
  | 'order.refunded'
  | 'subscription.payment_failed'
  | 'member.deleted'
  | 'member.data_exported'
  | 'member.marketing_consent_changed'
  | 'member.reclaimed'
  | 'member.activated'
  | 'member.suspended'
  | 'member.suspension_failed'
  | 'order.fulfillment_failed'
  | 'order.fulfilled'
  | 'push.subscribed'
  | 'message.reported'
  | 'conversation.blocked'
  | 'conversation.unblocked';

interface AuditParams {
  action:    AuditAction;
  memberId?: string;
  ip?:       string;
  metadata?: Record<string, unknown>;
}

/**
 * Enregistre une action dans audit_logs.
 * Toujours appelé en fire-and-forget — ne throw jamais.
 */
export function audit(params: AuditParams): void {
  // Alerte Sentry sur les échecs ops critiques (ex. order.fulfillment_failed =
  // t-shirt payé non expédié, jusqu'ici invisible hors lecture de la table audit).
  // No-op si Sentry n'est pas configuré (pas de DSN).
  if (params.action.endsWith('_failed')) {
    const level = params.action.includes('payment_failed') ? 'warning' : 'error';
    // RGPD : on N'ENVOIE PAS de PII à Sentry (processeur tiers, hors UE selon le
    // plan). L'IP est déjà exclue, mais params.metadata peut porter email / ip /
    // sender_token (ex. order.email_failed) → on filtre ces clés avant le spread.
    // La PII reste dans audit_logs (1re partie) ; l'alerte ops n'en a pas besoin.
    const PII_KEYS = new Set(['email', 'ip', 'senderToken', 'sender_token', 'senderContact']);
    const safeMeta = Object.fromEntries(
      Object.entries(params.metadata ?? {}).filter(([k]) => !PII_KEYS.has(k)),
    );
    Sentry.captureMessage(`audit: ${params.action}`, {
      level,
      extra: { memberId: params.memberId, ...safeMeta },
    });
  }

  supabaseAdmin.from('audit_logs').insert({
    action:    params.action,
    member_id: params.memberId ?? null,
    ip:        params.ip ?? null,
    metadata:  params.metadata ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[audit] Échec insertion log:', error.message);
  // .catch : sans ça, un rejet (réseau coupé, client down) = unhandledRejection
  // process-wide. audit() est fire-and-forget, jamais await → on avale le rejet.
  }, (err) => console.warn('[audit] Insertion rejetée:', err));
}