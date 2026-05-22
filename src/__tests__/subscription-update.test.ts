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

  it('unpaid / past_due → free', () => {
    expect(subscriptionMemberUpdate({ status: 'unpaid', id: 'sub_1' }).plan).toBe('free');
    expect(subscriptionMemberUpdate({ status: 'past_due', id: 'sub_1' }).plan).toBe('free');
  });

  it('NE THROW PAS sur un objet sans current_period_end (cœur du bug C1)', () => {
    // On passe délibérément un objet « minimal » comme le fait l'API 2026 :
    // aucun current_period_end. L'ancien code faisait new Date(NaN).toISOString().
    const sub = { status: 'canceled', id: 'sub_x' } as { status: string; id: string };
    expect(() => subscriptionMemberUpdate(sub)).not.toThrow();
    expect(subscriptionMemberUpdate(sub).plan_expires_at).toBeNull();
  });
});
