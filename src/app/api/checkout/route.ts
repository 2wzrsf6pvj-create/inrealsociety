// app/api/checkout/route.ts
// POST /api/checkout { userId, qrCodeUrl }

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isHttpError } from '@/lib/require-auth';
import { checkAuthRateLimit, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  userId:    z.string().uuid(),
  qrCodeUrl: z.string().url().max(2048),
});

const TSHIRT_PRICE_ID = process.env.STRIPE_PRICE_ID!;

export async function POST(req: NextRequest) {
  if (!TSHIRT_PRICE_ID) {
    console.error('[api/checkout] STRIPE_PRICE_ID non défini');
    return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
  }

  const auth = await requireAuth(req);
  if (isHttpError(auth)) return auth;

  const rl = await checkAuthRateLimit(auth.user.id);
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
  });

  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten().fieldErrors }, { status: 400 });
    }

    const { userId, qrCodeUrl } = body.data;

    // ─── Vérifie ownership ───────────────────────────────────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('id', userId)
      .eq('auth_user_id', auth.user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: TSHIRT_PRICE_ID, quantity: 1 }],

      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'DE', 'GB', 'US', 'CA'],
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type:         'fixed_amount',
            display_name: 'Livraison standard',
            fixed_amount: { amount: 500, currency: 'eur' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type:         'fixed_amount',
            display_name: 'Livraison express',
            fixed_amount: { amount: 1200, currency: 'eur' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 4 },
            },
          },
        },
      ],

      metadata:    { userId, qrCodeUrl },
      success_url: `${appUrl}/confirmation?status=success&memberId=${userId}`,
      cancel_url:  `${appUrl}/confirmation?status=cancelled&memberId=${userId}`,
    });

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('[api/checkout]', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 500 });
    }
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
