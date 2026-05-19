// POST /api/subscription/portal
// Redirige vers le portail client Stripe (gérer/annuler l'abonnement).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (isHttpError(auth)) return auth;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    const { data: member } = await supabaseAdmin
      .from('members')
      .select('stripe_customer_id')
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member?.stripe_customer_id) {
      return NextResponse.json({ error: 'Aucun abonnement trouvé.' }, { status: 404 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-03-25.dahlia',
    });

    const session = await stripe.billingPortal.sessions.create({
      customer:   member.stripe_customer_id,
      return_url: `${appUrl}/dashboard`,
    });

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('[subscription/portal]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
