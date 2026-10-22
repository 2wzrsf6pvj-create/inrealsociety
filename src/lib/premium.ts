// src/lib/premium.ts
// Transitions du premium — SERVEUR UNIQUEMENT (importe supabaseAdmin).
//
// Plusieurs chemins mènent au même état, et Stripe ne garantit pas l'ordre de ses
// événements : checkout.session.completed, customer.subscription.updated, le
// rattrapage du checkout (abonnement actif chez Stripe, webhook pas encore passé)
// et la réconciliation quotidienne. Chaque transition est donc RÉSERVÉE en base
// (UPDATE … WHERE état précédent, comme les emails du porteur en 059) : seul le
// chemin qui la fait envoie l'email correspondant, une seule fois.
//
// Une écriture en échec est LEVÉE : le webhook répond 500 et Stripe réessaie.
// Avant, l'erreur était ignorée, le webhook répondait 200 et un porteur qui avait
// payé pouvait rester en gratuit sans nouvelle tentative.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailPremium, emailPremiumCancelled, emailPremiumEnded } from '@/lib/email-templates';
import { captureServerEvent } from '@/lib/posthog-server';
import { audit } from '@/lib/audit';
import { APP_URL } from '@/lib/constants';
import { formatDayFr } from '@/lib/dates';
import type { MemberPlanUpdate } from '@/lib/subscription';

export const PREMIUM_SETTINGS_URL = `${APP_URL}/dashboard?tab=settings`;

// Les identifiants Stripe sont écrits tels quels en base : on n'y accepte que leur
// forme normale.
function assertStripeId(id: string, prefix: 'sub_' | 'cus_'): void {
  if (!new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(id)) {
    throw new Error(`[premium] identifiant Stripe inattendu : ${id}`);
  }
}

async function send(to: string | null, mail: { subject: string; html: string }, what: string): Promise<void> {
  if (!to) return;
  const ok = await sendEmail({ to, ...mail });
  if (!ok) console.error(`[premium] Échec email ${what}`);
}

/** Passe le membre en premium sur CET abonnement. true si c'est cet appel qui l'a
 *  fait, false s'il l'était déjà. L'email de bienvenue (qui confirme le contrat)
 *  part au passage gratuit → premium seulement. */
export async function activatePremium(p: {
  memberId:       string;
  customerId:     string;
  subscriptionId: string;
}): Promise<boolean> {
  assertStripeId(p.subscriptionId, 'sub_');
  assertStripeId(p.customerId, 'cus_');

  const { data: current, error: readError } = await supabaseAdmin
    .from('members')
    .select('plan, stripe_subscription_id')
    .eq('id', p.memberId)
    .maybeSingle();
  if (readError) throw new Error(`[premium] lecture du membre impossible : ${readError.message}`);
  if (!current) return false;
  if (current.plan === 'premium' && current.stripe_subscription_id === p.subscriptionId) return false;

  // Verrou optimiste : n'écrit que si le membre est toujours dans l'état lu. Deux
  // événements simultanés : un seul passe, l'autre ne trouve plus la ligne.
  // (Pas de filtre .or() ici : sur un UPDATE, PostgREST 12 le réapplique aux
  // valeurs écrites et la réservation réussie reviendrait vide.)
  let claim = supabaseAdmin
    .from('members')
    .update({
      plan:                   'premium',
      stripe_customer_id:     p.customerId,
      stripe_subscription_id: p.subscriptionId,
      plan_expires_at:        null,
    })
    .eq('id', p.memberId);
  claim = claim.eq('plan', current.plan);
  claim = current.stripe_subscription_id == null
    ? claim.is('stripe_subscription_id', null)
    : claim.eq('stripe_subscription_id', current.stripe_subscription_id);
  const { data, error } = await claim.select('name, email');
  if (error) throw new Error(`[premium] activation impossible : ${error.message}`);
  if (!data || data.length === 0) return false;

  if (current.plan === 'premium' && current.stripe_subscription_id != null) {
    // Déjà premium sur un AUTRE abonnement : deux abonnements actifs, donc un
    // double prélèvement à rembourser. Pas de nouvel email de bienvenue (sinon un
    // par renouvellement de chacun) ; signalé pour l'équipe.
    console.warn('[premium] Second abonnement actif pour', p.memberId, ':', current.stripe_subscription_id, '→', p.subscriptionId);
    audit({
      action:   'subscription.duplicate',
      memberId: p.memberId,
      metadata: { previous: current.stripe_subscription_id, current: p.subscriptionId },
    });
    return true;
  }

  const { name, email } = data[0] as { name: string; email: string | null };
  await send(email, emailPremium({
    name,
    dashboardUrl: `${APP_URL}/dashboard`,
    subscribedOn: formatDayFr(new Date()),
  }), 'de bienvenue premium');

  await captureServerEvent({
    distinctId: p.memberId,
    event:      'subscription_active',
    properties: { member_id: p.memberId, plan: 'premium' },
  });
  return true;
}

/** Résiliation programmée (abonnement actif jusqu'à endsAt) : pose la date et la
 *  confirme par email, une fois (L215-1-1). endsAt null = pas de fin programmée
 *  (ou résiliation annulée depuis le portail) : la date est effacée. */
export async function applyScheduledEnd(
  member: { id: string; name: string; email: string | null },
  endsAt: string | null,
): Promise<void> {
  if (!endsAt) {
    const { error } = await supabaseAdmin
      .from('members').update({ plan_expires_at: null })
      .eq('id', member.id).not('plan_expires_at', 'is', null);
    if (error) throw new Error(`[premium] date de fin non effacée : ${error.message}`);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('members').update({ plan_expires_at: endsAt })
    .eq('id', member.id).is('plan_expires_at', null)
    .select('id');
  if (error) throw new Error(`[premium] date de fin non posée : ${error.message}`);

  if (data && data.length > 0) {
    await send(member.email, emailPremiumCancelled({
      name:        member.name,
      endsOn:      formatDayFr(endsAt),
      settingsUrl: PREMIUM_SETTINGS_URL,
    }), 'de résiliation');
    return;
  }

  // Déjà programmée : la date a pu changer (nouvelle date posée dans Stripe). Pas
  // de second email.
  const { error: again } = await supabaseAdmin
    .from('members').update({ plan_expires_at: endsAt }).eq('id', member.id);
  if (again) throw new Error(`[premium] date de fin non mise à jour : ${again.message}`);
}

/** Fin de l'abonnement courant : premium → gratuit. true si c'est cet appel qui l'a
 *  fait (email de fin envoyé), false si le membre était déjà gratuit. */
export async function endPremium(
  memberId: string,
  update:   MemberPlanUpdate,
  p: { endedAt: Date; reason: string },
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('members').update(update)
    .eq('id', memberId).eq('plan', 'premium')
    .select('name, email');
  if (error) throw new Error(`[premium] fin impossible : ${error.message}`);

  if (!data || data.length === 0) {
    // Déjà gratuit : on aligne quand même l'abonnement et la date (idempotent).
    const { error: again } = await supabaseAdmin.from('members').update(update).eq('id', memberId);
    if (again) throw new Error(`[premium] alignement impossible : ${again.message}`);
    return false;
  }

  const { name, email } = data[0] as { name: string; email: string | null };
  await send(email, emailPremiumEnded({
    name,
    endedOn:     formatDayFr(p.endedAt),
    settingsUrl: PREMIUM_SETTINGS_URL,
  }), 'de fin du premium');

  await captureServerEvent({
    distinctId: memberId,
    event:      'subscription_cancelled',
    properties: { member_id: memberId, reason: p.reason },
  });
  return true;
}
