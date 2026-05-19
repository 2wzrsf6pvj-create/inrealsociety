// POST /api/subscription/checkout
// Crée une session Stripe Checkout pour l'abonnement premium (2.99€/mois).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const rl = await checkAuthRateLimit(auth.user.id);
    if (!rl.success) {
      return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    if (!priceId) {
      console.error('[subscription/checkout] STRIPE_PREMIUM_PRICE_ID non défini');
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
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
      return NextResponse.json({ error: 'Vous êtes déjà premium.' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-03-25.dahlia',
    });

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
        console.error('[subscription/checkout] Échec update customer_id:', updateErr);
        return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
      }
    }

    // Crée la session checkout pour l'abonnement
    const session = await stripe.checkout.sessions.create({
      mode:     'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { memberId: member.id },
      success_url: `${appUrl}/dashboard?upgraded=1`,
      cancel_url:  `${appUrl}/dashboard`,
    });

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('[subscription/checkout]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
