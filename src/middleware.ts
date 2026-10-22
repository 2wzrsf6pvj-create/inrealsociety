// src/middleware.ts

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PAGES = new Set([
  '/',
  '/unlock',
  '/manifeste',
  '/faq',
  '/cgv',
  '/confidentialite',   // politique RGPD — DOIT être accessible au public
  '/mentions-legales',  // LCEN — DOIT être accessible au public
  '/message',
  '/shop',
  '/commande',          // suivi de commande (acheteur invité, lookup par code)
  '/confirmation',
  '/register',
  '/auth/login',
  '/auth/signup',       // stub → redirect('/register') ; bookmark/lien externe
  '/auth/callback',
  '/auth/confirm',      // confirmation OTP token_hash (reset cross-device, signup)
  '/auth/forgot-password',
  '/auth/reset-password',
  '/tee/en-attente',    // scan d'un tee imprimé mais profil pas encore activé — public, noindex
  '/demo-message',      // page démo (aperçu « message reçu » pour screenshot) — noindex, à retirer
  '/demo-notif',        // page démo (aperçu notif écran verrouillé pour screenshot) — noindex, à retirer
  '/robots.txt',        // lu par les moteurs, anonymes : sans ça, redirigé vers la connexion
  '/sitemap.xml',       // pages publiques seulement (aucun profil de porteur)
  '/opengraph-image',   // image d'aperçu des liens partagés, lue par les robots des messageries
  '/contact/confirme',  // arrivée du lien de confirmation d'email du passant — noindex
]);

const PUBLIC_PAGE_PREFIXES = [
  '/profil/',
  '/join/',
  '/shop/',
  '/r/',       // redirections URL courtes (QR codes t-shirts)
  '/conversation/', // fil du passant, anonyme par conception (lien-capability, cf. la page)
];

// Routes API publiques à match EXACT — évite qu'un préfixe trop large rende
// publique une route voisine (ex. /api/message ne doit PAS couvrir
// /api/messages, l'inbox authentifiée).
const PUBLIC_API_EXACT = new Set([
  '/api/message',        // envoi message scanner anonyme
  '/api/contact/verify', // lien de confirmation de l'email du passant (jeton, rate-limité)
  '/api/profile/report', // signalement d'un profil par n'importe qui (DSA), rate-limité
  '/api/scan',
  '/api/order-code',
  '/api/order/status',       // suivi de commande public (lookup par code d'activation)
  '/api/order/resend-code',  // renvoi de code (acheteur invité déconnecté) — rate-limit email
  '/api/activate',
  '/api/feedback',       // feedback conversation accessible aux scanners anonymes
  '/api/health',         // healthcheck pour monitoring uptime
  '/api/newsletter',     // capture email newsletter
  '/api/newsletter/unsubscribe', // lien de désinscription (cliqué depuis un email)
  '/api/scan-emails/unsubscribe', // couper les emails de scan (lien signé, cliqué depuis l'email)
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

// CSP stricte à nonce — construite par requête, ENFORÇANTE (Phase 2). Seule
// source de CSP de l'app (next.config n'en pose plus). Observée d'abord en
// Report-Only (Phase 1) → 0 violation script-src constatée → bascule en enforce.
// 'strict-dynamic' : un script de confiance (noncé) peut en charger d'autres
// (PostHog/Sentry init JS) → plus besoin d'allowlister chaque domaine de script.
// 'unsafe-inline'/https: gardés en fallback : ignorés par les navigateurs qui
// honorent le nonce (CSP3), tolérés par les anciens.
// Pour revenir en observation (si un script casse en prod) : remettre le header
// réponse en 'Content-Security-Policy-Report-Only' (cf. DEPLOY_CHECKLIST §2bis).
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
  // Header RÉPONSE enforçant : le navigateur bloque ce qui n'est pas noncé.
  res.headers.set('Content-Security-Policy', csp);

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
    r.headers.set('Content-Security-Policy', csp);
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
    // Hors middleware : fichiers statiques, et les deux fichiers publics que le
    // navigateur va chercher tout seul. /sw.js et /manifest.json passaient par le
    // middleware : un visiteur non connecté était redirigé vers la connexion, le
    // navigateur refusait alors le service worker (notifications « Me notifier de
    // sa réponse » du passant jamais reçues) et le manifeste (installation).
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};