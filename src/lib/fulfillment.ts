// Fulfillment : génère le QR code premium d'un membre, l'upload dans Supabase
// Storage, puis crée la commande Printful en utilisant order.id comme external_id
// (idempotence Printful native).
//
// Appelé depuis deux endroits :
//   1. /api/webhook/stripe — quand un membre existant achète un t-shirt (userId
//      présent dans la metadata Stripe)
//   2. /api/member/create — après qu'un nouveau client a activé son code et
//      créé son profil. C'est le chemin principal pour les nouveaux acheteurs,
//      car au moment du paiement on n'a pas encore de member_id.

import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePremiumQRCode } from '@/lib/generate-qr-svg';
import { buildShortUrl } from '@/lib/short-code';
import type { PrintfulOrderPayload, PrintfulOrderResponse, PrintfulAddress } from '@/lib/printful.types';

type TshirtColor = 'dark' | 'light';

interface FulfillmentParams {
  orderId:     string;
  memberId:    string;
  tshirtColor: TshirtColor;
}

interface FulfillmentResult {
  ok:                boolean;
  alreadyFulfilled?: boolean;
  reason?:           string;
  printfulOrderId?:  string;
}

function getVariantId(color: TshirtColor): number {
  const v = color === 'dark'
    ? (process.env.PRINTFUL_VARIANT_ID_DARK  || process.env.PRINTFUL_VARIANT_ID)
    : (process.env.PRINTFUL_VARIANT_ID_LIGHT || process.env.PRINTFUL_VARIANT_ID);
  return parseInt(v || '0', 10);
}

function getShippingDetails(session: Stripe.Checkout.Session): PrintfulAddress | null {
  const shipping = (session as unknown as { shipping_details?: Stripe.Checkout.Session['customer_details'] }).shipping_details ?? session.customer_details;
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

export async function fulfillOrder({ orderId, memberId, tshirtColor }: FulfillmentParams): Promise<FulfillmentResult> {
  // ─── 1. Idempotence : skip si déjà fulfilled ───────────────────────────────
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, stripe_session_id, printful_order_id, status')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return { ok: false, reason: 'order_not_found' };
  if (order.status !== 'paid') return { ok: false, reason: 'order_not_paid' };
  if (order.printful_order_id) return { ok: true, alreadyFulfilled: true, printfulOrderId: order.printful_order_id };

  // ─── 2. Récupère l'adresse de livraison depuis Stripe ──────────────────────
  if (!order.stripe_session_id) return { ok: false, reason: 'no_stripe_session' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  const shipping = getShippingDetails(session);
  if (!shipping) return { ok: false, reason: 'no_shipping_details' };

  // ─── 3. Récupère le short_code du membre pour l'URL QR ─────────────────────
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id, short_code')
    .eq('id', memberId)
    .single();

  if (!member) return { ok: false, reason: 'member_not_found' };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { ok: false, reason: 'no_app_url' };

  const qrDataUrl = member.short_code
    ? buildShortUrl(member.short_code)
    : `${appUrl}/profil/${memberId}`;

  // ─── 4. Génère + upload le QR SVG premium ──────────────────────────────────
  const qr = generatePremiumQRCode(qrDataUrl, tshirtColor);
  const filePath = `${memberId}/qr-${tshirtColor}.svg`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('qrcodes')
    .upload(filePath, qr.buffer, { contentType: 'image/svg+xml', upsert: true });

  if (uploadError) return { ok: false, reason: `upload_failed: ${uploadError.message}` };

  const { data: { publicUrl } } = supabaseAdmin.storage.from('qrcodes').getPublicUrl(filePath);

  await supabaseAdmin.from('members').update({ qr_code_url: publicUrl }).eq('id', memberId);

  // ─── 5. Création Printful (idempotent via external_id) ─────────────────────
  const variantId = getVariantId(tshirtColor);
  if (!variantId) return { ok: false, reason: 'no_printful_variant_id' };

  const colorLabel = tshirtColor === 'dark' ? 'Black' : 'White';

  const payload: PrintfulOrderPayload & { external_id: string } = {
    external_id: orderId,
    recipient: shipping,
    items: [{
      variant_id: variantId,
      quantity:   1,
      name:       `In Real Society — Comfort Colors 1717 ${colorLabel} (DTF)`,
      files: [{
        type: 'back',
        url:  publicUrl,
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

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `printful_${res.status}: ${text.slice(0, 200)}` };
  }

  const printfulData = await res.json() as PrintfulOrderResponse;
  const printfulOrderId = String(printfulData.result?.id ?? '');

  // ─── 6. Mark fulfilled ─────────────────────────────────────────────────────
  await supabaseAdmin
    .from('orders')
    .update({ printful_order_id: printfulOrderId, fulfilled_at: new Date().toISOString() })
    .eq('id', orderId);

  return { ok: true, printfulOrderId };
}
