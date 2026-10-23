// GET /api/cron/premium-reconcile
// Filet de sécurité (C2) : le downgrade premium dépend du webhook
// customer.subscription.deleted. Si un webhook est manqué (panne, retries Stripe
// épuisés), un membre resterait premium à vie. Ce cron vérifie chaque membre
// premium auprès de Stripe et le repasse `free` si l'abonnement n'est plus actif
// (email de fin compris). Il rattrape aussi une résiliation programmée dont le
// webhook a été manqué : date de fin et email de confirmation (L215-1-1). Les
// transitions sont réservées en base (lib/premium) : jamais d'email en double
// avec le webhook.
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { subscriptionMemberUpdate, isActiveSubscriptionStatus, scheduledEnd } from '@/lib/subscription';
import { applyScheduledEnd, endPremium } from '@/lib/premium';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { reportError } from '@/lib/report-error';

const BATCH_SIZE = 100;
// Garde-fou anti-boucle infinie : BATCH_SIZE × MAX_BATCHES = 100k membres premium.
const MAX_BATCHES = 1000;
// Sentinelle keyset : UUID nul, < à tout UUID réel (et valide pour le cast Postgres).
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    reportError('cron/premium-reconcile', new Error('STRIPE_SECRET_KEY non défini'));
    return NextResponse.json({ error: 'Stripe non configuré.' }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' });
  let checked = 0, downgraded = 0, errors = 0;

  // Pagination KEYSET par id (pas .limit() seul ni offset) : couvre TOUS les
  // membres premium, pas seulement les 100 premiers — sinon un webhook
  // subscription.deleted manqué pour le membre #101+ = premium à vie. Keyset (et
  // non offset) car les downgradés sortent du filtre `plan=premium` en cours de
  // route ; avancer par id est monotone → ni saut ni reprise.
  let lastId = ZERO_UUID;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: members, error } = await supabaseAdmin
      .from('members')
      .select('id, name, email, stripe_subscription_id')
      .eq('plan', 'premium')
      .not('stripe_subscription_id', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      reportError('cron/premium-reconcile', error);
      return NextResponse.json({ error: 'Erreur SQL.', checked, downgraded, errors }, { status: 500 });
    }
    if (!members || members.length === 0) break;

    for (const m of members) {
      lastId = m.id;
      if (!m.stripe_subscription_id) continue;
      checked++;
      try {
        const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
        // Même règle que le webhook (past_due = délai de grâce → reste premium),
        // sinon le cron downgraderait un membre que le webhook vient de garder.
        if (!isActiveSubscriptionStatus(sub.status)) {
          const endedAt = new Date(((sub.ended_at ?? sub.canceled_at) ?? Date.now() / 1000) * 1000);
          await endPremium(m.id, subscriptionMemberUpdate(sub), { endedAt, reason: sub.status });
          downgraded++;
        } else {
          await applyScheduledEnd(m, scheduledEnd(sub));
        }
      } catch (err) {
        // resource_missing = abonnement supprimé côté Stripe → downgrade.
        if ((err as { code?: string }).code === 'resource_missing') {
          try {
            await endPremium(m.id, { plan: 'free', stripe_subscription_id: null, plan_expires_at: null },
              { endedAt: new Date(), reason: 'resource_missing' });
            downgraded++;
          } catch (endErr) {
            errors++;
            reportError('cron/premium-reconcile', endErr, { memberId: m.id });
          }
        } else {
          errors++;
          reportError('cron/premium-reconcile', err, { memberId: m.id });
        }
      }
    }

    if (members.length < BATCH_SIZE) break;
  }

  console.log('[cron/premium-reconcile] checked:', checked, 'downgraded:', downgraded, 'errors:', errors);
  return NextResponse.json({ ok: true, checked, downgraded, errors });
}
