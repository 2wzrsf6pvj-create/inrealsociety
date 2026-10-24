// src/lib/env.ts
// Valide toutes les variables d'environnement au démarrage.
// Import dans layout.tsx ou dans un fichier chargé tôt pour un crash explicite
// si une variable critique est manquante — plutôt qu'un crash silencieux en prod.
//
// Usage : import '@/lib/env' (import side-effect suffit)

// Variables requises au démarrage (sans elles, rien ne fonctionne)
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const;

// Variables recommandées (features dégradées si absentes, warning au lieu de crash)
const recommended = [
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'PRINTFUL_API_TOKEN',
  // Une variante par couleur et par taille (cf. fulfillment, lib/setup-status).
  ...['DARK', 'LIGHT'].flatMap((c) => ['S', 'M', 'L', 'XL', 'XXL'].map((s) => `PRINTFUL_VARIANT_ID_${c}_${s}`)),
  'STRIPE_PREMIUM_PRICE_ID',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'INTERNAL_SECRET',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'CRON_SECRET',
  'STRIPE_REFERRAL_COUPON_ID',
  'ADMIN_ALERT_EMAIL',
  'ADMIN_EMAILS',
  // Domaine court des QR imprimés (inreal.me), indispensable pour le test terrain.
  'SHORT_DOMAIN',
] as const;

type EnvKey = typeof required[number] | typeof recommended[number];

function validateEnv(): Record<string, string> {
  const missing: string[] = [];
  const warned: string[] = [];
  const env: Record<string, string> = {};

  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      env[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Variables d'environnement REQUISES manquantes :\n${missing.map(k => `  - ${k}`).join('\n')}\n\nVérifiez votre fichier .env.local`
    );
  }

  for (const key of recommended) {
    const value = process.env[key];
    if (!value) {
      warned.push(key);
    } else {
      env[key] = value;
    }
  }

  if (warned.length > 0) {
    console.warn(
      `[env] Variables recommandées manquantes (features dégradées) :\n${warned.map(k => `  ⚠ ${k}`).join('\n')}`
    );
  }

  return env;
}

// Valide uniquement côté serveur en production (pas dans le browser, pas au build)
export const env = (typeof window === 'undefined' && process.env.NODE_ENV === 'production')
  ? validateEnv()
  : (() => {
      if (typeof window === 'undefined') {
        try { return validateEnv(); }
        catch { return {} as Record<string, string>; }
      }
      return {} as Record<EnvKey, string>;
    })();