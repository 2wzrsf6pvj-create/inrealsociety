// Calcule la mise à jour `members` à partir du statut d'un abonnement Stripe.
// Fonction PURE (aucune I/O) → testable unitairement.
//
// ⚠️ Ne lit PAS subscription.current_period_end : ce champ a disparu de l'objet
// Subscription (API Stripe 2025-03+, déplacé sur les items). Y accéder donnait
// `undefined` → `new Date(NaN).toISOString()` → throw → le downgrade n'avait
// jamais lieu (membre premium à vie après annulation). Stripe émet l'événement
// `customer.subscription.deleted` à la fin de période, donc passer `free` à ce
// moment est le bon timing ; plan_expires_at reste null (non lu ailleurs).

export interface MemberPlanUpdate {
  plan: 'premium' | 'free';
  stripe_subscription_id: string | null;
  plan_expires_at: null;
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

export function subscriptionMemberUpdate(sub: { status: string; id: string }): MemberPlanUpdate {
  const isActive = isActiveSubscriptionStatus(sub.status);
  return {
    plan:                   isActive ? 'premium' : 'free',
    stripe_subscription_id: isActive ? sub.id : null,
    plan_expires_at:        null,
  };
}
