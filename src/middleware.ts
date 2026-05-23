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
  '/commande',          // suivi de commande (acheteur invité, lookup par code)
  '/confirmation',
  '/register',
  '/auth/login',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

const PUBLIC_PAGE_PREFIXES = [
  '/profil/',
  '/join/',
  '/shop/',
  '/r/',       // redirections URL courtes (QR codes t-shirts)
];

// Routes API publiques à match EXACT — évite qu'un préfixe trop large rende
// publique une route voisine (ex. /api/message ne doit PAS couvrir
// /api/messages, l'inbox authentifiée).
const PUBLIC_API_EXACT = new Set([
  '/api/message',        // envoi message scanner anonyme
  '/api/scan',
  '/api/order-code',
  '/api/order/status',   // suivi de commande public (lookup par code d'activation)
  '/api/activate',
  '/api/feedback',       // feedback conversation accessible aux scanners anonymes
  '/api/health',         // healthcheck pour monitoring uptime
  '/api/newsletter',     // capture email newsletter
  '/api/newsletter/unsubscribe', // lien de désinscription (cliqué depuis un email)
]);

// Vrais préfixes (familles de routes avec sous-chemins).
const PUBLIC_API_PREFIXES = [
  '/api/webhook/',
  '/api/push/',
  '/api/shop/',          // checkout public du shop
  '/api/conversation/',  // réponses dans le thread (scanner anonyme)
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  if (PUBLIC_PAGE_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

// Dev-friendly : sans les clés Supabase, on bypasse le middleware au lieu de
// crasher toutes les routes. Ça permet d'explorer le code et les pages
// statiques (/, /shop, /manifeste, /cgv, /confidentialite) sans .env.local.
// Les pages qui interrogent Supabase échoueront évidemment à l'exécution.
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON);

if (!SUPABASE_CONFIGURED && process.env.NODE_ENV !== 'production') {
  console.warn('[middleware] Supabase env vars absentes — auth check désactivé. Configure .env.local pour activer l\'auth.');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next({ request: { headers: req.headers } });

  if (!SUPABASE_CONFIGURED) {
    return res;
  }

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON!,
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

  // getUser() peut rafraîchir la session → cookies écrits sur `res`. Les
  // redirections doivent les recopier, sinon une rotation de token est perdue.
  const redirectWithSession = (url: URL) => {
    const r = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!isPublic && !user) {
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return redirectWithSession(loginUrl);
  }

  if (user && (pathname === '/auth/login' || pathname === '/')) {
    return redirectWithSession(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};