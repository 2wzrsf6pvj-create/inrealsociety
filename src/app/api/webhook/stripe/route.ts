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
import { cancelPrintfulOrder } from '@/lib/printful-status';
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
  const tshirtSize = session.metadata?.tshirtSize ?? 'M';  // coercé dans fulfillOrder
  const sessionId = session.id;
  const email     = session.customer_details?.email ?? session.customer_email;

  // ─── Idempotence : vérifie si cet événement a déjà été traité ──────────
  let { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('id, status, activation_code')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  // Filet money-path : si le lien `stripe_session_id` n'a pas pu être écrit au
  // checkout (UPDATE post-création échoué), on retombe sur l'orderId porté par la
  // metadata Stripe — toujours présent — pour ne pas perdre une commande payée.
  if (!existingOrder && session.metadata?.orderId) {
    ({ data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('id, status, activation_code')
      .eq('id', session.metadata.orderId)
      .maybeSingle());
  }

  if (!existingOrder) {
    console.warn('[webhook] Order introuvable pour session:', sessionId);
    return;
  }

  // Idempotence + sûreté remboursement : on ne (re)traite QUE depuis 'pending'.
  // 'paid' = déjà finalisé. 'refunded' = remboursé → un checkout.session.completed
  // rejoué après un refund (ordre de livraison Stripe) ne doit PAS ré-activer la
  // commande ni émettre un nouveau code valide.
  if (existingOrder.status !== 'pending') {
    console.log('[webhook] Order déjà en statut', existingOrder.status, '— ignoré pour session:', sessionId);
    return;
  }

  // ─── 1. Code d'activation + email ──────────────────────────────────────
  if (!email) {
    audit({ action: 'order.email_missing', metadata: { orderId: existingOrder.id, sessionId } });
    console.warn('[webhook] Email manquant — code non envoyé pour session:', sessionId);
    return;
  }

  const code = await generateUniqueActivationCode();

  // UPDATE optimiste verrouillé sur 'pending' : si une autre invocation a déjà
  // finalisé l'order (paid) OU s'il a été remboursé entre-temps, .eq('status',
  // 'pending') retourne 0 ligne. On rollback alors le code qu'on vient d'insérer
  // pour éviter le bloat, et on return sans envoyer l'email.
  const { data: updated, error: orderError } = await supabaseAdmin
    .from('orders')
    .update({
      status:            'paid',
      activation_code:   code,
      // Back-fill : si l'order a été retrouvée via metadata.orderId (lien manquant),
      // on réécrit le `stripe_session_id` pour que refund/lookups futurs marchent.
      stripe_session_id: sessionId,
      stripe_payment_id: session.payment_intent,
      tshirt_color:      tshirtColor,
      // Montant réellement encaissé (produit + livraison + TVA − remise), pas le
      // 4900 figé du checkout — source fiable pour la compta/les remboursements.
      amount:            session.amount_total ?? undefined,
    })
    .eq('id', existingOrder.id)
    .eq('status', 'pending')
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

  // sendEmail renvoie false (sans throw) en cas d'échec → on DOIT tester le
  // retour, pas un catch (qui ne se déclencherait jamais). Sans ça, une panne
  // Resend laissait la commande payée + code généré mais SANS email, SANS trace,
  // SANS retry → client qui paie et ne reçoit rien.
  const activationSent = await sendEmail({ to: email, subject, html });
  if (!activationSent) {
    audit({
      action:   'order.email_failed',
      metadata: { orderId: existingOrder.id, email },
    });
    console.error('[webhook] Échec envoi email activation pour', email,
      '— order reste paid avec code, renvoi possible via /api/order/resend-code');
    // L'order reste en 'paid' avec le code — l'acheteur peut le récupérer via la
    // page /commande ou le self-service resend ; le support a la trace d'audit.
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
    const result = await fulfillOrder({ orderId: existingOrder.id, memberId: fulfillMemberId, tshirtColor, tshirtSize });
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
    .select('id, status, activation_code, printful_order_id')
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

  // Remboursement PARTIEL (ex. les frais de port seuls) : Stripe émet aussi
  // charge.refunded. On ne doit PAS traiter ça comme une annulation totale
  // (marquer refunded + supprimer le code + annuler Printful) sinon le client
  // garde son t-shirt payé mais perd son accès / voit sa commande annulée.
  // `charge.refunded` = true seulement si TOTALEMENT remboursé.
  const fullyRefunded = charge.refunded || charge.amount_refunded >= charge.amount;
  if (!fullyRefunded) {
    console.log('[webhook] Refund partiel sur order', order.id, '— pas d\'annulation.');
    audit({
      action:   'order.refunded',
      metadata: { orderId: order.id, paymentIntent, partial: true, amountRefunded: charge.amount_refunded, amount: charge.amount },
    });
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

  // Annulation Printful : un refund ne doit pas laisser partir le t-shirt en
  // production. cancelPrintfulOrder ne tente l'annulation QUE si la commande
  // n'est pas encore en prod/expédiée (lit le statut réel d'abord) — fenêtre
  // paiement→expédition courte (~1 j), d'où l'intérêt d'agir dès le refund.
  // Fail-soft : si déjà expédiée / API KO, on garde la trace en audit (le
  // support traite le résiduel à la main) sans bloquer le marquage refunded.
  let printfulCancel: Awaited<ReturnType<typeof cancelPrintfulOrder>> | null = null;
  if (order.printful_order_id) {
    printfulCancel = await cancelPrintfulOrder(order.printful_order_id);
    if (!printfulCancel.canceled) {
      console.warn('[webhook] refund : Printful non annulé', order.printful_order_id, printfulCancel.reason, printfulCancel.status);
    }
  }

  audit({
    action:   'order.refunded',
    metadata: {
      orderId:        order.id,
      paymentIntent,
      amountRefunded: charge.amount_refunded,
      printfulOrderId: order.printful_order_id ?? null,
      printfulCanceled: printfulCancel?.canceled ?? null,
      printfulCancelReason: printfulCancel?.reason ?? null,
      printfulStatus:  printfulCancel?.status ?? null,
    },
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

  const sent = await sendEmail({ to: member.email, subject, html });
  if (!sent) console.error('[webhook] Échec envoi email payment_failed pour', member.email);
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

  // Idempotence : sur un retry Stripe, ce membre a déjà CET abonnement → on ne
  // ré-update pas, on ne ré-envoie pas l'email de bienvenue et on n'émet pas un
  // 2e event analytics.
  const { data: current } = await supabaseAdmin
    .from('members')
    .select('stripe_subscription_id')
    .eq('id', memberId)
    .maybeSingle();
  if (current?.stripe_subscription_id === subscriptionId) {
    console.log('[webhook] Subscription checkout déjà traité pour', memberId);
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

  // Trouve le membre par customer ID. maybeSingle (PAS single) : 0 ligne = membre
  // inconnu (course avec le checkout, customer supprimé) → single throw → 500 →
  // Stripe réessaie en boucle. maybeSingle renvoie null proprement.
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

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
