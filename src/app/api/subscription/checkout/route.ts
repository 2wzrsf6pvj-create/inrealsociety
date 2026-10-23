// POST /api/subscription/checkout
// Crée une session Stripe Checkout pour l'abonnement premium (2.99€/mois).
// Exige l'acceptation des CGV (article 8 : renouvellement, résiliation,
// rétractation), cochée dans les réglages ; sa date est gardée chez Stripe, sur
// la session et sur l'abonnement.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';
import { isActiveSubscriptionStatus } from '@/lib/subscription';
import { activatePremium } from '@/lib/premium';
import { reportError } from '@/lib/report-error';
import { VAT_EXEMPT } from '@/lib/constants';

const BodySchema = z.object({
  // Même règle qu'à l'activation du profil : pas d'acceptation implicite.
  acceptedTerms: z.literal(true),
});

const ALREADY_SUBSCRIBED = { error: 'Votre abonnement premium est déjà actif.', code: 'already_subscribed' };

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { error: 'Veuillez accepter les Conditions Générales de Vente pour continuer.', code: 'terms_required' },
        { status: 400 },
      );
    }

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) {
      reportError('subscription/checkout', new Error('STRIPE_PREMIUM_PRICE_ID non défini'));
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      reportError('subscription/checkout', new Error('NEXT_PUBLIC_APP_URL non défini'));
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    // Récupère le membre
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, email, stripe_customer_id, plan')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }

    if (member.plan === 'premium') {
      return NextResponse.json(ALREADY_SUBSCRIBED, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-03-25.dahlia',
    });

    // Garde anti-double-abonnement : le webhook qui pose plan='premium' peut être
    // en retard (double-clic, 2e onglet, retry réseau). Le seul check `plan` local
    // laisse alors créer une 2e session → 2e abonnement actif + double prélèvement,
    // et le 1er devient orphelin (plus référencé → ni portail ni cron ne le voient).
    // On vérifie donc directement chez Stripe qu'aucun abonnement actif n'existe.
    if (member.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({ customer: member.stripe_customer_id, status: 'all', limit: 10 });
      const active = subs.data.find((s) => isActiveSubscriptionStatus(s.status));
      if (active) {
        // Self-heal : le webhook n'est pas encore passé (ou a été manqué) → recale
        // en premium. Même chemin que le webhook : l'email de bienvenue part une
        // fois, quel que soit celui qui arrive le premier.
        await activatePremium({ memberId: member.id, customerId: member.stripe_customer_id, subscriptionId: active.id });
        return NextResponse.json(ALREADY_SUBSCRIBED, { status: 400 });
      }
    }

    // Réutilise ou crée le customer Stripe
    let customerId = member.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: member.email || auth.user.email || undefined,
        metadata: { memberId: member.id },
      });
      customerId = customer.id;

      const { error: updateErr } = await supabaseAdmin
        .from('members')
        .update({ stripe_customer_id: customerId })
        .eq('id', member.id);

      if (updateErr) {
        reportError('subscription/checkout', updateErr, { step: 'Échec update customer_id' });
        return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
      }
    }

    // Crée la session checkout pour l'abonnement
    // Franchise de TVA (VAT_EXEMPT) : ni TVA ni adresse de facturation à demander.
    // Assujetti : automatic_tax calcule la TVA selon l'adresse de facturation,
    // enregistrée sur le customer (customer_update) s'il en change.
    // Preuve d'acceptation des CGV : sur la session ET sur l'abonnement, qui vit
    // aussi longtemps que le contrat.
    const termsAcceptedAt = new Date().toISOString();
    const session = await stripe.checkout.sessions.create({
      mode:              'subscription',
      customer:          customerId,
      line_items:        [{ price: priceId, quantity: 1 }],
      ...(VAT_EXEMPT ? {} : {
        customer_update:            { address: 'auto', name: 'auto' },
        automatic_tax:              { enabled: true },
        billing_address_collection: 'required',
      } as const),
      metadata:          { memberId: member.id, termsAcceptedAt },
      subscription_data: { metadata: { memberId: member.id, termsAcceptedAt } },
      success_url:       `${appUrl}/dashboard?upgraded=1`,
      cancel_url:        `${appUrl}/dashboard?tab=settings`,
    });

    return NextResponse.json({ url: session.url });

  } catch (err) {
    reportError('subscription/checkout', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
