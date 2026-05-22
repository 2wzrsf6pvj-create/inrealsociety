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

export function subscriptionMemberUpdate(sub: { status: string; id: string }): MemberPlanUpdate {
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  return {
    plan:                   isActive ? 'premium' : 'free',
    stripe_subscription_id: isActive ? sub.id : null,
    plan_expires_at:        null,
  };
}
