// app/api/order-code/route.ts
// GET /api/order-code?session=xxx&email=xxx
// Retourne le code d'activation d'une commande payée.
// Double vérification : session_id ET email du payeur.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import Stripe from 'stripe';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session');
  const email     = req.nextUrl.searchParams.get('email');

  if (!sessionId || !email) {
    return NextResponse.json({ error: 'session et email requis' }, { status: 400 });
  }

  // ─── Récupère la session Stripe pour vérifier l'email du payeur ───────
  // Cela empêche qu'une personne connaissant un session_id récupère un code qui ne lui appartient pas.
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-03-25.dahlia',
    });

    const session      = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionEmail = session.customer_details?.email ?? session.customer_email;

    if (!sessionEmail || sessionEmail.toLowerCase() !== email.toLowerCase()) {
      // On renvoie intentionnellement la même réponse qu'un code introuvable
      return NextResponse.json({ code: null });
    }
  } catch {
    return NextResponse.json({ code: null });
  }

  // ─── Récupère le code en BDD ──────────────────────────────────────────
  const { data } = await supabase
    .from('orders')
    .select('activation_code, status')
    .eq('stripe_session_id', sessionId)
    .single();

  if (!data || data.status !== 'paid' || !data.activation_code) {
    return NextResponse.json({ code: null });
  }

  return NextResponse.json({ code: data.activation_code });
}