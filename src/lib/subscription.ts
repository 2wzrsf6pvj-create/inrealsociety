// Calcule la mise à jour `members` à partir du statut d'un abonnement Stripe.
// Fonction PURE (aucune I/O) → testable unitairement.
//
// ⚠️ Ne lit PAS subscription.current_period_end : ce champ a disparu de l'objet
// Subscription (API Stripe 2025-03+, déplacé sur les items). Y accéder donnait
// `undefined` → `new Date(NaN).toISOString()` → throw → le downgrade n'avait
// jamais lieu (membre premium à vie après annulation). Stripe émet l'événement
// `customer.subscription.deleted` à la fin de période, donc passer `free` à ce
// moment est le bon timing.
//
// plan_expires_at : date de fin d'une résiliation PROGRAMMÉE (l'abonnement est
// encore actif jusque-là), sinon null. Affichée dans les réglages et reprise par
// l'email de confirmation de résiliation (Code de la consommation, L215-1-1).
// Premium OFFERT depuis /admin (test terrain, choix de Clément) : premium sans
// abonnement Stripe ; plan_expires_at est alors la fin du cadeau, appliquée par
// premium-reconcile.

export interface MemberPlanUpdate {
  plan: 'premium' | 'free';
  stripe_subscription_id: string | null;
  plan_expires_at: string | null;
}

// Champs lus sur l'abonnement Stripe (sous-ensemble de Stripe.Subscription).
export interface SubscriptionLike {
  status: string;
  id: string;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: { data?: { current_period_end?: number | null }[] } | null;
}

// Statut Stripe ⇒ accès premium maintenu ?
// `past_due` = le paiement de renouvellement a échoué et Stripe est en train de
// le relancer (dunning). On GARDE le premium pendant ce délai de grâce : sinon
// on coupe un client payant à la première relance — ce que l'email de relance
// promet justement d'éviter. On garde aussi l'abo en base pour que le cron de
// réconciliation puisse continuer à le surveiller et le rétablir/couper.
// `unpaid`, `canceled`, `incomplete*`, `paused` ⇒ plus d'accès.
export function isActiveSubscriptionStatus(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

// Fin programmée d'un abonnement encore actif (ISO), ou null. `cancel_at` est
// posé par Stripe dès qu'une résiliation est programmée ; à défaut, la fin de la
// période en cours, lue sur les items (là où elle vit depuis l'API 2025-03).
export function scheduledEnd(sub: SubscriptionLike): string | null {
  if (!isActiveSubscriptionStatus(sub.status)) return null;
  let ts = sub.cancel_at ?? null;
  if (ts == null && sub.cancel_at_period_end) {
    const ends = (sub.items?.data ?? [])
      .map((i) => i.current_period_end)
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    ts = ends.length ? Math.max(...ends) : null;
  }
  return ts != null && Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null;
}

export function subscriptionMemberUpdate(sub: SubscriptionLike): MemberPlanUpdate {
  const isActive = isActiveSubscriptionStatus(sub.status);
  return {
    plan:                   isActive ? 'premium' : 'free',
    stripe_subscription_id: isActive ? sub.id : null,
    plan_expires_at:        scheduledEnd(sub),
  };
}

/** Durée du premium offert depuis /admin : celle du test terrain. */
export const PREMIUM_GIFT_DAYS = 28;

type PlanFields = { plan: string | null; stripe_subscription_id: string | null; plan_expires_at?: string | null };

/** Premium offert : premium sans abonnement Stripe. */
export function isGiftedPremium(m: PlanFields): boolean {
  return m.plan === 'premium' && !m.stripe_subscription_id;
}

/** Pour /admin : premium payé ou offert, et jusqu'à quand (fin du cadeau, ou
 *  résiliation programmée). null : gratuit. */
export type PremiumState = { gift: boolean; until: string | null } | null;

export function premiumState(m: PlanFields): PremiumState {
  return m.plan === 'premium' ? { gift: isGiftedPremium(m), until: m.plan_expires_at ?? null } : null;
}
