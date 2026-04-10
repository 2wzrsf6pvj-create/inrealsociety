// src/app/api/webhook/stripe/route.ts
// ⚠️ WEBHOOK UNIQUE — Configurer cette URL dans le dashboard Stripe.
// L'ancien /api/webhook/route.ts est obsolète et peut être supprimé.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';
import { generateSecureCode } from '@/lib/generate-code';
import { sendEmail, emailActivation } from '@/lib/email-templates';
import type { PrintfulOrderPayload, PrintfulOrderResponse, PrintfulAddress } from '@/lib/printful.types';

const PRINTFUL_VARIANT_ID = parseInt(process.env.PRINTFUL_VARIANT_ID || '0', 10);

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia',
  });

  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error('[webhook] Signature invalide:', err);
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await handleCheckoutCompleted(session);
    } catch (err) {
      console.error('[webhook] Erreur traitement session:', err);
      return NextResponse.json({ received: true, warning: 'Erreur traitement interne.' });
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId    = session.metadata?.userId;
  const qrCodeUrl = session.metadata?.qrCodeUrl;
  const sessionId = session.id;
  const email     = session.customer_details?.email ?? (session as any).customer_email;

  // 1. Code d'activation + email
  if (email) {
    const code = await generateUniqueActivationCode();

    const { error: orderError } = await supabase
      .from('orders')
      .update({
        status:            'paid',
        activation_code:   code,
        stripe_payment_id: session.payment_intent,
      })
      .eq('stripe_session_id', sessionId);

    if (orderError) console.error('[webhook] Erreur mise à jour order:', orderError);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';
    const { subject, html } = emailActivation({
      code,
      registerUrl: `${appUrl}/register?code=${code}`,
    });
    await sendEmail({ to: email, subject, html });
  }

  // 2. Commande Printful
  if (userId && qrCodeUrl) {
    const shipping = getShippingDetails(session);
    if (shipping) {
      if (!PRINTFUL_VARIANT_ID) throw new Error('PRINTFUL_VARIANT_ID non défini.');
      const order = await createPrintfulOrder({ recipient: shipping, qrCodeUrl });
      console.log(`[webhook] Commande Printful créée — ID: ${order.result.id} | Membre: ${userId}`);
    } else {
      console.warn('[webhook] Adresse de livraison manquante — commande Printful ignorée.');
    }
  }
}

async function generateUniqueActivationCode(): Promise<string> {
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = generateSecureCode(8);
    const { error } = await supabase.from('activation_codes').insert({ code });
    if (!error) return code;
    if (error.code !== '23505') throw new Error(`Erreur insertion code: ${error.message}`);
  }
  throw new Error(`Impossible de générer un code unique après ${MAX_ATTEMPTS} tentatives.`);
}

function getShippingDetails(session: Stripe.Checkout.Session): PrintfulAddress | null {
  const shipping = (session as any).shipping_details ?? session.customer_details;
  if (!shipping?.address || !shipping.name) return null;
  return {
    name:         shipping.name,
    address1:     shipping.address.line1 ?? '',
    address2:     shipping.address.line2 ?? undefined,
    city:         shipping.address.city ?? '',
    state_code:   shipping.address.state ?? '',
    country_code: shipping.address.country ?? '',
    zip:          shipping.address.postal_code ?? '',
  };
}

async function createPrintfulOrder({ recipient, qrCodeUrl }: {
  recipient: PrintfulAddress;
  qrCodeUrl: string;
}): Promise<PrintfulOrderResponse> {
  const payload: PrintfulOrderPayload = {
    recipient,
    items: [{
      variant_id: PRINTFUL_VARIANT_ID,
      quantity:   1,
      name:       'In Real Society — Comfort Colors 1717 (DTF)',
      files: [{
        type: 'back',
        url:  qrCodeUrl,
        position: { area_width: 1800, area_height: 2400, width: 800, height: 800, top: 200, left: 500 },
      }],
    }],
  };

  const res = await fetch('https://api.printful.com/orders', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.PRINTFUL_API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Printful API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PrintfulOrderResponse>;
}