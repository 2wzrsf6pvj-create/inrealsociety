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
import { sendEmail, emailActivation, emailPremium } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import { captureServerEvent } from '@/lib/posthog-server';
import { audit } from '@/lib/audit';
import { fulfillOrder } from '@/lib/fulfillment';

type TshirtColor = 'dark' | 'light';

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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Abonnement = mode subscription, achat unique = mode payment
        if (session.mode === 'subscription') {
          await handleSubscriptionCheckout(session);
        } else {
          await handleCheckoutCompleted(session);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
        break;
      }
    }
  } catch (err) {
    console.error('[webhook] Erreur traitement:', err);
    return NextResponse.json({ received: true, warning: 'Erreur traitement interne.' });
  }

  return NextResponse.json({ received: true });
}

// ─── Handler principal ────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId    = session.metadata?.userId;
  const rawColor  = session.metadata?.tshirtColor;
  const tshirtColor: TshirtColor = (rawColor === 'dark' || rawColor === 'light') ? rawColor : 'dark';
  const sessionId = session.id;
  const email     = session.customer_details?.email ?? session.customer_email;

  // ─── Idempotence : vérifie si cet événement a déjà été traité ──────────
  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('id, status, activation_code')
    .eq('stripe_session_id', sessionId)
    .single();

  if (!existingOrder) {
    console.warn('[webhook] Order introuvable pour session:', sessionId);
    return;
  }

  if (existingOrder.status === 'paid') {
    console.log('[webhook] Événement déjà traité pour session:', sessionId);
    return;
  }

  // ─── 1. Code d'activation + email ──────────────────────────────────────
  if (!email) {
    audit({ action: 'order.email_missing', metadata: { orderId: existingOrder.id, sessionId } });
    console.warn('[webhook] Email manquant — code non envoyé pour session:', sessionId);
    return;
  }

  const code = await generateUniqueActivationCode();

  // UPDATE optimiste : si une autre invocation a déjà flippé l'order en 'paid'
  // entre la lecture ci-dessus et maintenant, .neq('status', 'paid') retourne 0
  // lignes. On rollback alors le code qu'on vient d'insérer pour éviter le bloat,
  // et on return sans envoyer l'email (l'autre invocation s'en est chargée).
  const { data: updated, error: orderError } = await supabaseAdmin
    .from('orders')
    .update({
      status:            'paid',
      activation_code:   code,
      stripe_payment_id: session.payment_intent,
      tshirt_color:      tshirtColor,
    })
    .eq('stripe_session_id', sessionId)
    .neq('status', 'paid')
    .select('id');

  if (orderError) {
    console.error('[webhook] Erreur mise à jour order:', orderError);
    await supabaseAdmin.from('activation_codes').delete().eq('code', code);
    return;
  }

  if (!updated || updated.length === 0) {
    // Race lost : un autre webhook a déjà finalisé cet order
    console.log('[webhook] Race lost on session', sessionId, '— code rollback');
    await supabaseAdmin.from('activation_codes').delete().eq('code', code);
    return;
  }

  const appUrl = APP_URL;
  const { subject, html } = emailActivation({
    code,
    registerUrl: `${appUrl}/register?code=${code}`,
  });

  try {
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    audit({
      action:   'order.email_failed',
      metadata: { orderId: existingOrder.id, email, error: err instanceof Error ? err.message : String(err) },
    });
    console.error('[webhook] Échec envoi email activation:', err);
    // L'order reste en 'paid' avec le code — support peut renvoyer manuellement.
  }

  // ─── 2. Fulfillment (membre existant uniquement) ─────────────────────
  // Pour les nouveaux acheteurs, le fulfillment est déclenché depuis
  // /api/member/create après création du profil (le member_id n'existe pas
  // encore au moment du webhook).
  if (userId) {
    const result = await fulfillOrder({ orderId: existingOrder.id, memberId: userId, tshirtColor });
    if (result.ok) {
      audit({
        action:   'order.fulfilled',
        memberId: userId,
        metadata: { orderId: existingOrder.id, printfulOrderId: result.printfulOrderId, alreadyFulfilled: result.alreadyFulfilled },
      });
    } else {
      audit({
        action:   'order.fulfillment_failed',
        memberId: userId,
        metadata: { orderId: existingOrder.id, reason: result.reason },
      });
      console.error('[webhook] Fulfillment failed:', result.reason);
    }
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

// ─── Handler refund ──────────────────────────────────────────────────────────

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntent = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntent) {
    console.warn('[webhook] charge.refunded sans payment_intent — ignoré');
    return;
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, activation_code')
    .eq('stripe_payment_id', paymentIntent)
    .maybeSingle();

  if (!order) {
    // Probablement un refund de subscription (géré par customer.subscription.deleted)
    console.log('[webhook] charge.refunded sans order match — payment_intent:', paymentIntent);
    return;
  }

  if (order.status === 'refunded') {
    console.log('[webhook] Order déjà refunded:', order.id);
    return;
  }

  await supabaseAdmin
    .from('orders')
    .update({ status: 'refunded' })
    .eq('id', order.id);

  // Si le code n'a pas encore été consommé, on l'invalide en le supprimant.
  // Si déjà utilisé : le profil existe, on ne touche pas (refund commercial,
  // pas annulation technique — décision business à arbitrer côté support).
  if (order.activation_code) {
    const { data: codeRow } = await supabaseAdmin
      .from('activation_codes')
      .select('used')
      .eq('code', order.activation_code)
      .maybeSingle();
    if (codeRow && !codeRow.used) {
      await supabaseAdmin.from('activation_codes').delete().eq('code', order.activation_code);
    }
  }

  audit({
    action:   'order.refunded',
    metadata: { orderId: order.id, paymentIntent, amountRefunded: charge.amount_refunded },
  });

  console.log('[webhook] Order', order.id, 'refunded');
}

// ─── Handlers abonnement premium ─────────────────────────────────────────────

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const memberId      = session.metadata?.memberId;
  const subscriptionId = session.subscription as string;
  const customerId     = session.customer as string;

  if (!memberId) {
    console.warn('[webhook] Subscription checkout sans memberId dans metadata');
    return;
  }

  await supabaseAdmin
    .from('members')
    .update({
      plan:                    'premium',
      stripe_customer_id:      customerId,
      stripe_subscription_id:  subscriptionId,
      plan_expires_at:         null,
    })
    .eq('id', memberId);

  // Email de bienvenue premium
  const { data: upgradedMember } = await supabaseAdmin
    .from('members')
    .select('name, email')
    .eq('id', memberId)
    .single();

  if (upgradedMember?.email) {
    const appUrl = APP_URL;
    const { subject, html } = emailPremium({
      name: upgradedMember.name,
      dashboardUrl: `${appUrl}/dashboard`,
    });
    sendEmail({ to: upgradedMember.email, subject, html }).catch((err) => console.error('[webhook] Échec email premium:', err));
  }

  await captureServerEvent({
    distinctId: memberId,
    event:      'subscription_active',
    properties: { member_id: memberId, plan: 'premium' },
  });

  console.log('[webhook] Membre', memberId, 'upgradé en premium.');
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;

  // Trouve le membre par customer ID
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!member) {
    console.warn('[webhook] Subscription change pour customer inconnu:', customerId);
    return;
  }

  const isActive = subscription.status === 'active' || subscription.status === 'trialing';

  await supabaseAdmin
    .from('members')
    .update({
      plan:                    isActive ? 'premium' : 'free',
      stripe_subscription_id:  isActive ? subscription.id : null,
      plan_expires_at:         isActive ? null : new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
    })
    .eq('id', member.id);

  if (!isActive) {
    await captureServerEvent({
      distinctId: member.id,
      event:      'subscription_cancelled',
      properties: { member_id: member.id, reason: subscription.status },
    });
  }

  console.log('[webhook] Membre', member.id, isActive ? 'premium actif' : 'repassé en free');
}
