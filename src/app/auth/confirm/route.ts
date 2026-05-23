// src/app/auth/confirm/route.ts
// Confirme un lien email Supabase via OTP `token_hash` (recovery, signup, magic
// link, email change). CROSS-DEVICE SAFE : verifyOtp valide le token côté
// SERVEUR auprès de Supabase, sans `code_verifier` PKCE local — contrairement à
// /auth/callback (?code=) qui exige que le lien soit ouvert sur l'appareil AYANT
// initié la demande (verifier en cookie/localStorage du device d'origine).
// C'est le correctif du reset cross-device : « demande sur PC, ouvre sur mobile ».
//
// ⚠️ Nécessite que le template email Supabase pointe ici, ex. (template
// « Reset Password ») :
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password
// (template « Confirm signup » : type=signup&next=/dashboard, etc.)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeInternalPath } from '@/lib/safe-redirect';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type') as EmailOtpType | null;
  const next      = safeInternalPath(searchParams.get('next'), '/dashboard');

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const res = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error('[auth/confirm]', error.message);
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  return res;
}
