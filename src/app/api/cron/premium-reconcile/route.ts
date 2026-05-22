// GET /api/cron/premium-reconcile
// Filet de sécurité (C2) : le downgrade premium dépend du webhook
// customer.subscription.deleted. Si un webhook est manqué (panne, retries Stripe
// épuisés), un membre resterait premium à vie. Ce cron vérifie chaque membre
// premium auprès de Stripe et le repasse `free` si l'abonnement n'est plus actif.
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { subscriptionMemberUpdate } from '@/lib/subscription';
import { isAuthorizedCron } from '@/lib/cron-auth';

const BATCH_SIZE = 100;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe non configuré.' }, { status: 500 });
  }

  const { data: members, error } = await supabaseAdmin
    .from('members')
    .select('id, stripe_subscription_id')
    .eq('plan', 'premium')
    .not('stripe_subscription_id', 'is', null)
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[cron/premium-reconcile]', error);
    return NextResponse.json({ error: 'Erreur SQL.' }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' });
  let checked = 0, downgraded = 0, errors = 0;

  for (const m of members ?? []) {
    if (!m.stripe_subscription_id) continue;
    checked++;
    try {
      const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      if (!isActive) {
        await supabaseAdmin
          .from('members')
          .update(subscriptionMemberUpdate({ status: sub.status, id: sub.id }))
          .eq('id', m.id);
        downgraded++;
      }
    } catch (err) {
      // resource_missing = abonnement supprimé côté Stripe → downgrade.
      if ((err as { code?: string }).code === 'resource_missing') {
        await supabaseAdmin
          .from('members')
          .update({ plan: 'free', stripe_subscription_id: null, plan_expires_at: null })
          .eq('id', m.id);
        downgraded++;
      } else {
        errors++;
        console.error('[cron/premium-reconcile] failed for', m.id, err);
      }
    }
  }

  console.log('[cron/premium-reconcile] checked:', checked, 'downgraded:', downgraded, 'errors:', errors);
  return NextResponse.json({ ok: true, checked, downgraded, errors });
}
