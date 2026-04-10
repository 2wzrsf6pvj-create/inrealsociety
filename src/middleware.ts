// src/middleware.ts

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGES = new Set([
  '/',
  '/unlock',
  '/manifeste',
  '/cgv',
  '/message',
  '/shop',
  '/confirmation',
  '/register',
  '/migrate',        // page migration legacy — doit être accessible sans session
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

const PUBLIC_PAGE_PREFIXES = [
  '/profil/',
  '/join/',
  '/shop/',
];

const PUBLIC_API_PREFIXES = [
  '/api/webhook/',
  '/api/message',
  '/api/scan',
  '/api/silent-view',
  '/api/push/',
  '/api/order-code',
  '/api/activate',
  '/api/member/link',    // liaison legacy — protégée par session dans le handler
  '/api/member/migrate', // migration email — protégée par admin secret
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (PUBLIC_PAGE_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = isPublicRoute(pathname);

  if (!isPublic && !user) {
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === '/auth/login' || pathname === '/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};