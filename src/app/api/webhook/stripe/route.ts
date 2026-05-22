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
import { sendEmail, emailActivation, emailPremium, emailPaymentFailed } from '@/lib/email-templates';
import { APP_URL } from '@/lib/constants';
import { captureServerEvent } from '@/lib/posthog-server';
import { audit } from '@/lib/audit';
import { fulfillOrder } from '@/lib/fulfillment';
import { subscriptionMemberUpdate } from '@/lib/subscription';

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
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
    }
  } catch (err) {
    console.error('[webhook] Erreur traitement:', err);
    // 5xx → Stripe RÉESSAIE. Les handlers sont idempotents (flip de statut
    // optimiste, fulfillOrder idempotent, rollback du code) donc un retry est
    // sûr. Renvoyer 200 ici laissait des commandes payées coincées en 'pending'
    // sans code, sans nouvelle tentative.
    return NextResponse.json({ error: 'Erreur traitement interne.' }, { status: 500 });
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
      // Montant réellement encaissé (produit + livraison + TVA − remise), pas le
      // 4900 figé du checkout — source fiable pour la compta/les remboursements.
      amount:            session.amount_total ?? undefined,
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

  // ─── 2. Fulfillment (membre existant) ────────────────────────────────
  // Résout le membre par userId (achat connecté) OU, à défaut, par email
  // (rachat d'un membre existant — shop/checkout ne met pas de userId). Pour un
  // NOUVEAU client, aucun membre ne matche encore (il n'a pas de profil) → le
  // fulfillment sera déclenché par /api/member/create après création du profil.
  // L'email du checkout est celui de l'acheteur (il en a besoin pour le code),
  // donc le match email→membre n'attribue pas à tort.
  let fulfillMemberId: string | null = userId ?? null;
  if (!fulfillMemberId && email) {
    const { data: m } = await supabaseAdmin
      .from('members').select('id').eq('email', email).maybeSingle();
    fulfillMemberId = m?.id ?? null;
  }

  if (fulfillMemberId) {
    const result = await fulfillOrder({ orderId: existingOrder.id, memberId: fulfillMemberId, tshirtColor });
    if (result.ok) {
      audit({
        action:   'order.fulfilled',
        memberId: fulfillMemberId,
        metadata: { orderId: existingOrder.id, printfulOrderId: result.printfulOrderId, alreadyFulfilled: result.alreadyFulfilled, trigger: 'webhook' },
      });
    } else {
      audit({
        action:   'order.fulfillment_failed',
        memberId: fulfillMemberId,
        metadata: { orderId: existingOrder.id, reason: result.reason, trigger: 'webhook' },
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

// ─── Handler échec de paiement abonnement ────────────────────────────────────

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) {
    console.warn('[webhook] invoice.payment_failed sans customer — ignoré');
    return;
  }

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id, name, email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!member?.email) {
    console.warn('[webhook] invoice.payment_failed : member sans email pour customer', customerId);
    return;
  }

  const attemptNumber = (invoice as unknown as { attempt_count?: number }).attempt_count ?? 1;

  audit({
    action:   'subscription.payment_failed',
    memberId: member.id,
    metadata: { customerId, invoiceId: invoice.id, attemptNumber, amountDue: invoice.amount_due },
  });

  // N'envoie qu'à la première tentative — Stripe envoie son propre email aux suivantes,
  // et on évite le spam. Pour les autres tentatives, l'audit log suffit.
  if (attemptNumber > 1) {
    console.log('[webhook] Payment failed attempt', attemptNumber, '— email skipped (Stripe handles)');
    return;
  }

  const dashboardUrl = `${APP_URL}/dashboard`;
  const { subject, html } = emailPaymentFailed({ name: member.name, dashboardUrl, attemptNumber });

  try {
    await sendEmail({ to: member.email, subject, html });
  } catch (err) {
    console.error('[webhook] Échec envoi email payment_failed:', err);
  }
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

  // Helper pur (cf. lib/subscription.ts) : NE lit PAS current_period_end.
  const update = subscriptionMemberUpdate(subscription);

  await supabaseAdmin
    .from('members')
    .update(update)
    .eq('id', member.id);

  if (update.plan === 'free') {
    await captureServerEvent({
      distinctId: member.id,
      event:      'subscription_cancelled',
      properties: { member_id: member.id, reason: subscription.status },
    });
  }

  console.log('[webhook] Membre', member.id, update.plan === 'premium' ? 'premium actif' : 'repassé en free');
}
