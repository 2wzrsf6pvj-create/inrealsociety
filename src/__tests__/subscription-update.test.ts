// Régression C1 : le downgrade d'abonnement ne doit jamais dépendre de
// subscription.current_period_end (supprimé de l'objet en API 2025+), qui
// faisait throw `new Date(NaN).toISOString()` et empêchait le passage en `free`
// (membre premium à vie). subscriptionMemberUpdate est pur et ne le lit pas.

import { describe, it, expect } from 'vitest';
import { subscriptionMemberUpdate } from '@/lib/subscription';

describe('subscriptionMemberUpdate', () => {
  it('active → premium, garde le subscription id, plan_expires_at null', () => {
    expect(subscriptionMemberUpdate({ status: 'active', id: 'sub_1' })).toEqual({
      plan: 'premium', stripe_subscription_id: 'sub_1', plan_expires_at: null,
    });
  });

  it('trialing → premium', () => {
    expect(subscriptionMemberUpdate({ status: 'trialing', id: 'sub_1' }).plan).toBe('premium');
  });

  it('canceled → free, subscription id null (downgrade effectif)', () => {
    expect(subscriptionMemberUpdate({ status: 'canceled', id: 'sub_1' })).toEqual({
      plan: 'free', stripe_subscription_id: null, plan_expires_at: null,
    });
  });

  it('unpaid → free (relances Stripe épuisées)', () => {
    expect(subscriptionMemberUpdate({ status: 'unpaid', id: 'sub_1' }).plan).toBe('free');
  });

  // Délai de grâce dunning : un échec de renouvellement ne doit pas couper le
  // premium sur-le-champ (l'email de relance promet l'inverse), et l'abo doit
  // rester en base pour que le cron de réconciliation le surveille encore.
  it('past_due → premium + garde le subscription id (délai de grâce)', () => {
    expect(subscriptionMemberUpdate({ status: 'past_due', id: 'sub_1' })).toEqual({
      plan: 'premium', stripe_subscription_id: 'sub_1', plan_expires_at: null,
    });
  });

  it('NE THROW PAS sur un objet sans current_period_end (cœur du bug C1)', () => {
    // On passe délibérément un objet « minimal » comme le fait l'API 2026 :
    // aucun current_period_end. L'ancien code faisait new Date(NaN).toISOString().
    const sub = { status: 'canceled', id: 'sub_x' } as { status: string; id: string };
    expect(() => subscriptionMemberUpdate(sub)).not.toThrow();
    expect(subscriptionMemberUpdate(sub).plan_expires_at).toBeNull();
  });
});
