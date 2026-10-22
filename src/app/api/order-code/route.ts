// app/api/order-code/route.ts
// GET /api/order-code?session=xxx
// Retourne le code d'activation d'une commande payée (poll par /shop/success),
// avec le récapitulatif de la commande.
// Preuve de paiement = la BDD (status='paid' + code, posés par le webhook signé),
// pas un appel Stripe. Ne révèle pas un code déjà consommé.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp, rateLimitHeaders } from '@/lib/ratelimit';
import { buildOrderRecap } from '@/lib/order-recap';

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

  // ─── Récupère le code en BDD ──────────────────────────────────────────
  // Pas d'appel Stripe : `status='paid'` + `activation_code` ne sont posés QUE par
  // le webhook (signature Stripe vérifiée), et uniquement sur paiement confirmé. La
  // BDD EST donc la preuve de paiement — un `sessions.retrieve` par poll serait
  // redondant (jusqu'à 8 appels Stripe par achat rien que pour cette page).
  // `maybeSingle` : 0 ligne est le cas NORMAL tant que le webhook n'a pas écrit
  // le code (le front poll) — pas une erreur (evite les 406 dans les logs Supabase).
  const { data } = await supabaseAdmin
    .from('orders')
    .select('activation_code, status, tshirt_color, tshirt_size, tagline_id, amount')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (!data || data.status !== 'paid' || !data.activation_code) {
    return NextResponse.json({ code: null });
  }

  // Récapitulatif affiché sur la page de confirmation. Rien de personnel (ni email,
  // ni adresse) ; `amount` est le total réel, réécrit par le webhook au paiement.
  const recap = buildOrderRecap({
    color:      data.tshirt_color,
    size:       data.tshirt_size,
    taglineId:  data.tagline_id,
    totalCents: data.amount,
  });

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
    return NextResponse.json({ code: null, recap });
  }

  return NextResponse.json({ code: data.activation_code, recap });
}
