// src/middleware.ts

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGES = new Set([
  '/',
  '/unlock',
  '/manifeste',
  '/faq',
  '/cgv',
  '/message',
  '/shop',
  '/commande',          // suivi de commande (acheteur invité, lookup par code)
  '/confirmation',
  '/register',
  '/auth/login',
  '/auth/callback',
  '/auth/confirm',      // confirmation OTP token_hash (reset cross-device, signup)
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
  '/api/newsletter/send',        // broadcast — protégé par INTERNAL_SECRET (pas session)
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

// CSP stricte à nonce — construite par requête. Phase 1 : émise en
// Content-Security-Policy-Report-Only (n'enforce RIEN ; la CSP enforçante avec
// 'unsafe-inline' reste posée par next.config en parallèle). On observe les
// violations, puis Phase 2 = bascule en enforce + retrait de la CSP next.config.
// 'strict-dynamic' : un script de confiance (noncé) peut en charger d'autres
// (PostHog/Sentry init JS) → plus besoin d'allowlister chaque domaine de script.
// 'unsafe-inline'/https: gardés en fallback : ignorés par les navigateurs qui
// honorent le nonce (CSP3), tolérés par les anciens.
function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isProd ? '' : "'unsafe-eval' "}https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.posthog.com https://*.sentry.io https://api.openai.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Nonce unique par requête (Web Crypto, edge). On le pose sur les headers de
  // REQUÊTE : x-nonce (lu par le root layout) + Content-Security-Policy (lue par
  // Next pour noncer automatiquement ses propres scripts inline d'hydratation).
  // Ces headers de requête ne sont PAS renvoyés au navigateur.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  req.headers.set('x-nonce', nonce);
  req.headers.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: req.headers } });
  // Header RÉPONSE en Report-Only : le navigateur signale sans bloquer.
  res.headers.set('Content-Security-Policy-Report-Only', csp);

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
    r.headers.set('Content-Security-Policy-Report-Only', csp);
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