// src/lib/audit.ts
// Logging des actions sensibles dans la table audit_logs.
// Utilise le service role — toujours côté serveur uniquement.
// Ne bloque jamais la réponse principale, mais l'écriture passe par waitUntil :
// sans ça, Vercel pouvait figer la fonction dès la réponse et la perdre
// (preuves de consentement comprises).

import { supabaseAdmin } from '@/lib/supabase-admin';
import * as Sentry from '@sentry/nextjs';
import { waitUntil } from '@/lib/wait-until';
import { sendEmail, emailOpsAlert } from '@/lib/email-templates';

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
  | 'order.payment_unmatched'
  | 'webhook.failed'
  | 'order.email_resent'
  | 'order.refunded'
  | 'subscription.payment_failed'
  | 'subscription.duplicate'
  | 'member.deleted'
  | 'member.data_exported'
  | 'member.marketing_consent_changed'
  | 'member.reclaimed'
  | 'member.activated'
  | 'member.suspended'
  | 'member.unsuspended'
  | 'member.photo_removed'
  | 'device.banned'
  | 'device.unbanned'
  | 'moderation.report_handled'
  | 'message.hidden'
  | 'member.suspension_failed'
  | 'order.fulfillment_failed'
  | 'order.printful_draft'
  | 'order.fulfilled'
  | 'push.subscribed'
  | 'message.reported'
  | 'message.report_failed'
  | 'device.auto_banned'
  | 'profile.reported'
  | 'profile.moderated'
  | 'member.photo_updated'
  | 'conversation.blocked'
  | 'conversation.unblocked';

interface AuditParams {
  action:    AuditAction;
  memberId?: string;
  ip?:       string;
  metadata?: Record<string, unknown>;
}

/**
 * Échecs qui touchent l'argent (choix de Clément) : Sentry ET un email à
 * ADMIN_ALERT_EMAIL, à chaque occurrence (Sentry ne prévient par défaut qu'au
 * premier). Rares par nature : pas de risque de déluge.
 */
export const MONEY_ALERTS: Partial<Record<AuditAction, { title: string; todo: string }>> = {
  'order.payment_unmatched': {
    title: 'Paiement reçu sans commande',
    todo:  'Retrouver la session dans Stripe (Paiements) : créer la commande à la main, ou rembourser.',
  },
  'order.email_missing': {
    title: 'Commande payée sans email : code non envoyé',
    todo:  "Retrouver l'acheteur dans Stripe et lui transmettre son code (page /commande).",
  },
  'order.email_failed': {
    title: "Code d'activation non envoyé",
    todo:  "L'acheteur peut le renvoyer depuis /register (« Code perdu ? »). La raison est dans Sentry ([sendEmail]).",
  },
  'order.fulfillment_failed': {
    title: 'T-shirt payé non transmis à Printful',
    todo:  'Nouvel essai chaque jour à 5 h UTC (fulfillment-reconcile). Vérifier Printful : variantes, facturation.',
  },
  'order.printful_draft': {
    title: 'T-shirt payé resté en brouillon chez Printful',
    todo:  'Printful → Commandes : confirmer la commande à la main. Tant qu’elle est en brouillon, rien n’est imprimé.',
  },
  'member.suspension_failed': {
    title: 'Remboursement : profil non suspendu',
    todo:  'Suspendre le profil à la main (members.suspended_at), sinon le QR remboursé reste actif.',
  },
  'webhook.failed': {
    title: 'Webhook Stripe en échec',
    todo:  "Stripe réessaie pendant 3 jours, puis abandonne. Voir l'erreur dans Sentry et l'onglet « Failed » des webhooks Stripe.",
  },
};

// RGPD : jamais de PII vers Sentry (processeur tiers, hors UE selon le plan).
// La PII reste dans audit_logs (1re partie) ; l'alerte n'en a pas besoin.
const PII_KEYS = new Set(['email', 'ip', 'senderToken', 'sender_token', 'senderContact']);

/**
 * Enregistre une action dans audit_logs.
 * Ne bloque jamais la réponse, ne throw jamais.
 */
export function audit(params: AuditParams): void {
  const money = MONEY_ALERTS[params.action];
  // Alerte Sentry sur les échecs ops (ex. order.fulfillment_failed = t-shirt
  // payé non expédié). No-op si Sentry n'est pas configuré (pas de DSN).
  if (money || params.action.endsWith('_failed')) {
    const level = params.action.includes('payment_failed') ? 'warning' : 'error';
    const safeMeta = Object.fromEntries(
      Object.entries(params.metadata ?? {}).filter(([k]) => !PII_KEYS.has(k)),
    );
    Sentry.captureMessage(`audit: ${params.action}`, {
      level,
      // Une règle d'alerte Sentry sur ce tag prévient à chaque occurrence.
      ...(money ? { tags: { alerte: 'argent' } } : {}),
      extra: { memberId: params.memberId, ...safeMeta },
    });
  }
  if (money) {
    try {
      alertAdmin(params, money);
    } catch (err) {
      console.error('[audit] alerte impossible :', err);
    }
  }

  const insert = Promise.resolve(supabaseAdmin.from('audit_logs').insert({
    action:    params.action,
    member_id: params.memberId ?? null,
    ip:        params.ip ?? null,
    metadata:  params.metadata ?? null,
  })).then((res) => {
    const error = (res as { error?: { message: string } | null } | undefined)?.error;
    if (error) console.warn('[audit] Échec insertion log:', error.message);
  // Rejet (réseau coupé, client down) avalé : sinon unhandledRejection.
  }, (err) => console.warn('[audit] Insertion rejetée:', err));
  waitUntil(insert);
}

/** Email direct à ADMIN_ALERT_EMAIL (première partie : la PII utile y reste). */
function alertAdmin(params: AuditParams, money: { title: string; todo: string }): void {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) {
    console.warn(`[audit] ADMIN_ALERT_EMAIL absent : alerte « ${money.title} » non envoyée (Sentry seulement)`);
    return;
  }
  const details: Record<string, string> = { action: params.action };
  if (params.memberId) details.memberId = params.memberId;
  for (const [k, v] of Object.entries(params.metadata ?? {})) {
    if (k !== 'ip' && v !== undefined && v !== null) details[k] = String(v);
  }
  const { subject, html } = emailOpsAlert({ title: money.title, todo: money.todo, details });
  // sendEmail ne lève jamais ; waitUntil : l'envoi va au bout.
  waitUntil(sendEmail({ to, subject, html }));
}
