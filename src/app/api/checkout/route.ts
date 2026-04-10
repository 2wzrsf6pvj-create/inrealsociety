// app/api/checkout/route.ts
// POST /api/checkout { userId, qrCodeUrl }

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// ⚠️ Définir STRIPE_PRICE_ID dans vos variables d'environnement
const TSHIRT_PRICE_ID = process.env.STRIPE_PRICE_ID!;

export async function POST(req: NextRequest) {
  if (!TSHIRT_PRICE_ID) {
    console.error('[api/checkout] STRIPE_PRICE_ID non défini');
    return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    // Version stable — mettre à jour manuellement lors des migrations Stripe
    apiVersion: '2026-03-25.dahlia',
  });

  try {
    const body = await req.json();
    const { userId, qrCodeUrl } = body as { userId: string; qrCodeUrl: string };

    if (!userId || !qrCodeUrl) {
      return NextResponse.json(
        { error: 'userId et qrCodeUrl sont requis.' },
        { status: 400 }
      );
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