// src/app/api/webhook/stripe/route.ts
// ⚠️ WEBHOOK UNIQUE — Configurer cette URL dans le dashboard Stripe.
//
// Flux :
// 1. Stripe envoie checkout.session.completed
// 2. On génère un code d'activation + email
// 3. On génère le QR code SVG premium (couleur adaptée au t-shirt)
// 4. On upload le SVG dans Supabase Storage
// 5. On envoie la commande Printful avec le bon variant (noir/blanc)

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateSecureCode } from '@/lib/generate-code';
import { sendEmail, emailActivation } from '@/lib/email-templates';
import { generatePremiumQRCode } from '@/lib/generate-qr-svg';
import { buildShortUrl } from '@/lib/short-code';
import type { PrintfulOrderPayload, PrintfulOrderResponse, PrintfulAddress } from '@/lib/printful.types';
import { APP_URL } from '@/lib/constants';

// ─── Variant IDs Printful — Comfort Colors 1717 ──────────────────────────────
// À configurer dans .env.local :
//   PRINTFUL_VARIANT_ID_DARK=xxx   (Comfort Colors 1717 Black)
//   PRINTFUL_VARIANT_ID_LIGHT=xxx  (Comfort Colors 1717 White)
// Fallback : l'ancien PRINTFUL_VARIANT_ID unique
const VARIANT_DARK  = parseInt(process.env.PRINTFUL_VARIANT_ID_DARK  || process.env.PRINTFUL_VARIANT_ID || '0', 10);
const VARIANT_LIGHT = parseInt(process.env.PRINTFUL_VARIANT_ID_LIGHT || process.env.PRINTFUL_VARIANT_ID || '0', 10);

type TshirtColor = 'dark' | 'light';

function getVariantId(color: TshirtColor): number {
  return color === 'dark' ? VARIANT_DARK : VARIANT_LIGHT;
}

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

// ─── Handler principal ────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId      = session.metadata?.userId;
  const tshirtColor = (session.metadata?.tshirtColor as TshirtColor) || 'dark';
  const sessionId   = session.id;
  const email       = session.customer_details?.email ?? (session as any).customer_email;

  // 1. Code d'activation + email
  if (email) {
    const code = await generateUniqueActivationCode();

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status:            'paid',
        activation_code:   code,
        stripe_payment_id: session.payment_intent,
        tshirt_color:      tshirtColor,
      })
      .eq('stripe_session_id', sessionId);

    if (orderError) console.error('[webhook] Erreur mise à jour order:', orderError);

    const appUrl = APP_URL;
    const { subject, html } = emailActivation({
      code,
      registerUrl: `${appUrl}/register?code=${code}`,
    });
    await sendEmail({ to: email, subject, html });
  }

  // 2. Génération QR code SVG + commande Printful
  if (userId) {
    const shipping = getShippingDetails(session);
    if (!shipping) {
      console.warn('[webhook] Adresse de livraison manquante — commande Printful ignorée.');
      return;
    }

    const variantId = getVariantId(tshirtColor);
    if (!variantId) throw new Error('PRINTFUL_VARIANT_ID non défini pour cette couleur.');

    // ─── Récupère le short_code du membre pour le QR code ───────────────────
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('id, short_code')
      .eq('id', userId)
      .single();

    // URL courte si short_code disponible, sinon fallback sur l'URL profil
    const appUrl    = APP_URL;
    const qrDataUrl = member?.short_code
      ? buildShortUrl(member.short_code)
      : `${appUrl}/profil/${userId}`;

    // ─── Génère le QR code SVG premium ────────────────────────────────────
    const qr = generatePremiumQRCode(qrDataUrl, tshirtColor);

    // ─── Upload dans Supabase Storage ─────────────────────────────────────
    const filePath = `${userId}/qr-${tshirtColor}.svg`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('qrcodes')
      .upload(filePath, qr.buffer, {
        contentType: 'image/svg+xml',
        upsert:      true,
      });

    if (uploadError) {
      throw new Error(`Upload SVG échoué: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('qrcodes')
      .getPublicUrl(filePath);

    // ─── Met à jour le membre avec l'URL du QR ───────────────────────────
    await supabaseAdmin
      .from('members')
      .update({ qr_code_url: publicUrl })
      .eq('id', userId);

    // ─── Envoie la commande Printful ──────────────────────────────────────
    await createPrintfulOrder({
      recipient: shipping,
      qrCodeUrl: publicUrl,
      variantId,
      tshirtColor,
    });

    console.log('[webhook] Commande Printful créée.');
  }
}

// ─── Fonctions utilitaires ────────────────────────────────────────────────────

async function generateUniqueActivationCode(): Promise<string> {
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = generateSecureCode(8);
    const { error } = await supabaseAdmin.from('activation_codes').insert({ code });
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

async function createPrintfulOrder({ recipient, qrCodeUrl, variantId, tshirtColor }: {
  recipient:    PrintfulAddress;
  qrCodeUrl:    string;
  variantId:    number;
  tshirtColor:  TshirtColor;
}): Promise<PrintfulOrderResponse> {
  const colorLabel = tshirtColor === 'dark' ? 'Black' : 'White';

  const payload: PrintfulOrderPayload = {
    recipient,
    items: [{
      variant_id: variantId,
      quantity:   1,
      name:       `In Real Society — Comfort Colors 1717 ${colorLabel} (DTF)`,
      files: [{
        type: 'back',
        url:  qrCodeUrl,
        position: {
          area_width:  1800,
          area_height: 2400,
          width:       800,
          height:      800,
          top:         200,
          left:        500,
        },
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
