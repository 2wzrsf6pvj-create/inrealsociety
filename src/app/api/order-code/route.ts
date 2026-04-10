// app/api/order-code/route.ts
// GET /api/order-code?session=xxx
// Retourne le code d'activation d'une commande payée.
// Vérifie que la session Stripe est bien complétée avant de retourner le code.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Stripe from 'stripe';

const querySchema = z.object({
  session: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
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

  return NextResponse.json({ code: data.activation_code });
}
