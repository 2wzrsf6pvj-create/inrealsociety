// app/api/order-code/route.ts
// GET /api/order-code?session=xxx
// Retourne le code d'activation d'une commande payée.
// Vérifie que la session Stripe est bien complétée avant de retourner le code.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import Stripe from 'stripe';

const querySchema = z.object({
  session: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
  // Rate limit : sans throttle, un attaquant peut brute-force des session IDs
  // Stripe pour récupérer des codes d'activation par inférence.
  const rl = await checkPublicRateLimit(getIp(req));
  if (!rl.success) {
    return NextResponse.json(
      { code: null, error: 'Trop de requêtes.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const parsed = querySchema.safeParse({
    session: req.nextUrl.searchParams.get('session'),
  });

  if (!parsed.success) {
    return NextResponse.json({ code: null });
  }

  const { session: sessionId } = parsed.data;

  // ─── Vérifie que la session Stripe est bien payée ──────────────────────
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-03-25.dahlia',
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ code: null });
    }
  } catch {
    return NextResponse.json({ code: null });
  }

  // ─── Récupère le code en BDD ──────────────────────────────────────────
  const { data } = await supabaseAdmin
    .from('orders')
    .select('activation_code, status')
    .eq('stripe_session_id', sessionId)
    .single();

  if (!data || data.status !== 'paid' || !data.activation_code) {
    return NextResponse.json({ code: null });
  }

  // Ne ré-affiche pas un code déjà consommé : un acheteur qui revient sur la page
  // succès après avoir activé son profil verrait sinon un code « actionnable »
  // (bouton « Créer mon profil ») qui ne sert plus à rien. La page bascule alors
  // sur le message « code envoyé par email » (neutre).
  const { data: codeRow } = await supabaseAdmin
    .from('activation_codes')
    .select('used')
    .eq('code', data.activation_code)
    .maybeSingle();
  if (codeRow?.used) {
    return NextResponse.json({ code: null });
  }

  return NextResponse.json({ code: data.activation_code });
}
