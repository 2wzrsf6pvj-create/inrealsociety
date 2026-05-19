// src/app/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/** Accepte uniquement les redirections internes pour éviter les open redirects */
function safeRedirectPath(raw: string | null, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  try {
    // Si c'est une URL absolue, on rejette
    const url = new URL(raw, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
  } catch {
    // URL invalide — on rejette aussi
    return fallback;
  }
  // Doit commencer par / et ne pas contenir //
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard');

  if (!code) {
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback]', error.message);
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  return res;
}