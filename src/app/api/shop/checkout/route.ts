// src/app/api/shop/checkout/route.ts
// POST /api/shop/checkout { email, tshirtColor }
// Route PUBLIQUE pour le shop — pas d'auth requise.
// Crée une session Stripe pour l'achat initial d'un t-shirt.
// Le QR code sera généré après activation (dans le webhook).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';

const schema = z.object({
  email:       z.string().email().max(320),
  tshirtColor: z.enum(['dark', 'light']),
  tshirtSize:  z.enum(['S', 'M', 'L', 'XL', 'XXL']),
  referrerId:  z.string().uuid().optional(),
});

const TSHIRT_PRICE_ID = process.env.STRIPE_PRICE_ID!;

export async function POST(req: NextRequest) {
  if (!TSHIRT_PRICE_ID) {
    console.error('[api/shop/checkout] STRIPE_PRICE_ID non défini');
    return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
  }

  // ─── Rate limiting par IP ───────────────────────────────────────────────
  const ip = getIp(req);
  const rl = await checkPublicRateLimit(ip);
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
  });

  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
    }

    const { email, tshirtColor, tshirtSize, referrerId } = body.data;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('[api/shop/checkout] NEXT_PUBLIC_APP_URL non défini');
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    // ─── Crée une commande en BDD (statut pending) ────────────────────────
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        email,
        tshirt_color:  tshirtColor,
        tshirt_size:   tshirtSize,
        status:        'pending',
        amount:        4900,
        referrer_id:   referrerId || null,
      })
      .select('id')
      .single();

    if (orderError) {
      console.error('[api/shop/checkout] Order insert error:', orderError);
      return NextResponse.json({ error: 'Erreur création commande.' }, { status: 500 });
    }

    // ─── Crée la session Stripe ───────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode:           'payment',
      customer_email: email,
      line_items:     [{ price: TSHIRT_PRICE_ID, quantity: 1 }],

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

      metadata: {
        orderId:     order.id,
        tshirtColor,
        tshirtSize,
      },

      success_url: `${appUrl}/shop/success?session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/shop`,
    });

    // ─── Lie la session Stripe à la commande ──────────────────────────────
    await supabaseAdmin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('[api/shop/checkout]', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: 'Erreur de paiement.' }, { status: err.statusCode ?? 500 });
    }
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
