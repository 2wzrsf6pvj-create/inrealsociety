// src/app/r/[code]/route.ts
// GET /r/:code — Redirection URL courte → profil membre.
// Utilisé par les QR codes imprimés sur les t-shirts.

import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from '@/lib/constants';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkPublicRateLimit, getIp } from '@/lib/ratelimit';

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
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

  // Lookup du membre par short_code
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('short_code', code)
    .single();

  if (!member) {
    return NextResponse.redirect(new URL('/?error=qr_not_found', _req.url));
  }

  // Redirige vers la page profil du membre
  const appUrl = APP_URL;
  return NextResponse.redirect(`${appUrl}/profil/${member.id}`);
}
