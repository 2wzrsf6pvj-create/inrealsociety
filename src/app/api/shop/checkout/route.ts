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
import { getOptionalUser } from '@/lib/require-auth';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { QR_STYLES, DEFAULT_QR_STYLE } from '@/lib/constants';
import { isValidTaglineId } from '@/lib/taglines';
import { TSHIRT_PRICE_CENTS, SHIPPING_STANDARD_CENTS, SHIPPING_EXPRESS_CENTS } from '@/lib/constants';

const schema = z.object({
  // `.toLowerCase()` : orders.email sert de clé de lookup (renvoi de code, match
  // membre au webhook). Stocké en minuscules → un renvoi/rachat tapé « Bob@X.com »
  // vs « bob@x.com » ne rate plus la commande. Cohérent avec le check auto-parrainage.
  email:       z.string().email().max(320).toLowerCase(),
  tshirtColor: z.enum(['dark', 'light']),
  tshirtSize:  z.enum(['S', 'M', 'L', 'XL', 'XXL']),
  qrStyle:     z.enum(QR_STYLES).default(DEFAULT_QR_STYLE),
  // Accroche : id de la bibliothèque fermée, ou null (QR seul). On refuse tout id
  // inconnu — jamais de texte arbitraire imprimé. `nullish` accepte null ET absent.
  taglineId:   z.string().max(64).refine(isValidTaglineId, 'Accroche inconnue').nullish(),
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

    const { email, tshirtColor, tshirtSize, qrStyle, taglineId, referrerId } = body.data;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('[api/shop/checkout] NEXT_PUBLIC_APP_URL non défini');
      return NextResponse.json({ error: 'Configuration serveur manquante.' }, { status: 500 });
    }

    // ─── Rachat par un membre EXISTANT : lie la commande à son profil ──────
    // Si l'acheteur est CONNECTÉ (session serveur, jamais un id envoyé par le
    // client — sinon usurpation), on résout son membre et on le passe au webhook
    // via metadata.userId (= member.id, ce que lit handleCheckoutCompleted). Ça
    // fiabilise le rachat sans dépendre du match par email (un email de checkout
    // ≠ email de membre laissait le 2e tee orphelin). Anonyme / non-membre → rien.
    let buyerMemberId: string | null = null;
    const buyer = await getOptionalUser(req);
    if (buyer) {
      const { data: m } = await supabaseAdmin
        .from('members').select('id').eq('auth_user_id', buyer.id).maybeSingle();
      buyerMemberId = m?.id ?? null;
    }

    // ─── Valide le parrainage avant d'accorder la remise ──────────────────
    // referrerId est un UUID public (visible sur /profil/[id]) → on exige que le
    // membre existe vraiment et qu'il ne soit pas l'acheteur (anti auto-parrainage
    // par email). Sinon on ignore (pas de remise, pas d'attribution).
    let validReferrerId: string | null = null;
    if (referrerId) {
      const { data: ref } = await supabaseAdmin
        .from('members').select('id, email').eq('id', referrerId).maybeSingle();
      // Comparaison insensible à la casse : sinon Bob@x.com ≠ bob@x.com laisserait
      // un membre se parrainer lui-même pour décrocher la remise.
      if (ref && ref.email?.toLowerCase() !== email.toLowerCase()) validReferrerId = ref.id;
    }

    // ─── Crée une commande en BDD (statut pending) ────────────────────────
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        email,
        tshirt_color:  tshirtColor,
        tshirt_size:   tshirtSize,
        qr_style:      qrStyle,
        tagline_id:    taglineId ?? null,
        status:        'pending',
        // Placeholder : le webhook réécrit avec le vrai total Stripe (TVA + port).
        amount:        TSHIRT_PRICE_CENTS,
        referrer_id:   validReferrerId,
      })
      .select('id')
      .single();

    if (orderError) {
      console.error('[api/shop/checkout] Order insert error:', orderError);
      return NextResponse.json({ error: 'Erreur création commande.' }, { status: 500 });
    }

    // ─── Crée la session Stripe ───────────────────────────────────────────
    // automatic_tax : Stripe calcule la TVA selon l'adresse de livraison.
    // Requiert Stripe Tax activé dans le dashboard + enregistrements TVA déclarés
    // (sinon Stripe applique 0%). Sans config, ça n'échoue pas en mode test.
    const session = await stripe.checkout.sessions.create({
      mode:           'payment',
      customer_email: email,
      line_items:     [{ price: TSHIRT_PRICE_ID, quantity: 1 }],
      automatic_tax:  { enabled: true },

      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH', 'LU', 'DE', 'GB', 'US', 'CA'],
      },

      // Discount automatique uniquement si le parrainage est validé
      ...(validReferrerId && process.env.STRIPE_REFERRAL_COUPON_ID
        ? { discounts: [{ coupon: process.env.STRIPE_REFERRAL_COUPON_ID }] }
        : {}),

      // tax_behavior « inclusive » : le port affiché (« 5€ ») est TTC, comme le t-shirt.
      // Non précisé, Stripe appliquerait le réglage par défaut du compte et pourrait
      // ajouter la TVA par-dessus (5 € affichés → 6 € débités).
      shipping_options: [
        {
          shipping_rate_data: {
            type:         'fixed_amount',
            display_name: 'Livraison standard',
            fixed_amount: { amount: SHIPPING_STANDARD_CENTS, currency: 'eur' },
            tax_behavior: 'inclusive',
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
            fixed_amount: { amount: SHIPPING_EXPRESS_CENTS, currency: 'eur' },
            tax_behavior: 'inclusive',
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
        qrStyle,
        // Présent seulement pour un rachat connecté → le webhook imprime vers ce
        // membre (member.id), sans dépendre du match par email.
        ...(buyerMemberId ? { userId: buyerMemberId } : {}),
      },

      success_url: `${appUrl}/shop/success?session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/shop`,
    });

    // ─── Lie la session Stripe à la commande ──────────────────────────────
    // Si cet UPDATE échoue, le webhook retombe sur session.metadata.orderId pour
    // ne pas perdre la commande — mais on logue pour garder une trace du cas.
    const { error: linkErr } = await supabaseAdmin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);
    if (linkErr) {
      console.error('[api/shop/checkout] Lien stripe_session_id échoué (filet webhook actif):', linkErr.message);
    }

    return NextResponse.json({ url: session.url });

  } catch (err) {
    console.error('[api/shop/checkout]', err);
    if (err instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ error: 'Erreur de paiement.' }, { status: err.statusCode ?? 500 });
    }
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
