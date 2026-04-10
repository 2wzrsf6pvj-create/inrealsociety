// src/app/r/[code]/route.ts
// GET /r/:code — Redirection URL courte → profil membre.
// Utilisé par les QR codes imprimés sur les t-shirts.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  const { code } = params;

  // Validation basique : alphanumériques minuscules, 2-6 chars
  if (!/^[a-z0-9]{2,6}$/.test(code)) {
    return NextResponse.redirect(new URL('/', _req.url));
  }

  // Lookup du membre par short_code
  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('short_code', code)
    .single();

  if (!member) {
    return NextResponse.redirect(new URL('/', _req.url));
  }

  // Redirige vers la page profil du membre
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://inrealsociety.vercel.app';
  return NextResponse.redirect(`${appUrl}/profil/${member.id}`);
}
