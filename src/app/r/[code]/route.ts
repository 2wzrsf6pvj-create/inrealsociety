// src/app/r/[code]/route.ts
// GET /r/:code — Redirection URL courte → profil membre.
// Utilisé par les QR codes imprimés sur les t-shirts.

import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/lib/constants';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';

export async function GET(_req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const { code } = params;

  // Validation basique : alphanumériques minuscules, 2-6 chars
  if (!/^[a-z0-9]{2,6}$/.test(code)) {
    return NextResponse.redirect(new URL('/?error=qr_invalid', _req.url));
  }

  // Rate limit : empêche l'énumération de l'espace des short-codes (codes courts
  // → mapping vers les profils). 30/min/IP suffit largement pour des scans réels.
  const rl = await checkPublicRateLimit(getIp(_req));
  if (!rl.success) {
    return NextResponse.redirect(new URL('/?error=rate_limited', _req.url));
  }

  const appUrl = APP_URL;

  // Lookup du membre par short_code (maybeSingle : 0 ligne = pas encore activé,
  // cas NORMAL depuis qu'on imprime AU PAIEMENT — single y émettait une erreur).
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('short_code', code)
    .maybeSingle();

  if (member) {
    // Redirige vers la page profil du membre
    return NextResponse.redirect(`${appUrl}/profil/${member.id}`);
  }

  // Pas de membre : le code est-il RÉSERVÉ sur une commande payée (tee imprimé,
  // profil pas encore activé) ? Alors on montre une page « bientôt » plutôt qu'une
  // erreur — le porteur a reçu son tee mais n'a pas encore créé son profil.
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('short_code', code)
    .eq('status', 'paid')
    .maybeSingle();

  if (order) {
    return NextResponse.redirect(`${appUrl}/tee/en-attente`);
  }

  return NextResponse.redirect(new URL('/?error=qr_not_found', _req.url));
}
