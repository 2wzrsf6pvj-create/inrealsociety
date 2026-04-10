// src/lib/env.ts
// Valide toutes les variables d'environnement au démarrage.
// Import dans layout.tsx ou dans un fichier chargé tôt pour un crash explicite
// si une variable critique est manquante — plutôt qu'un crash silencieux en prod.
//
// Usage : import '@/lib/env' (import side-effect suffit)

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
  'PRINTFUL_API_TOKEN',
  'PRINTFUL_VARIANT_ID',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
] as const;

type EnvKey = typeof required[number];

function validateEnv(): Record<EnvKey, string> {
  const missing: string[] = [];
  const env = {} as Record<EnvKey, string>;

  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      env[key] = value;
    }
  }

  if (missing.length > 0) {
    // En développement : message clair dans la console
    // En production : crash immédiat plutôt qu'une erreur cryptique plus tard
    throw new Error(
      `[env] Variables d'environnement manquantes :\n${missing.map(k => `  - ${k}`).join('\n')}\n\nVérifiez votre fichier .env.local`
    );
  }

  return env;
}

// Valide uniquement côté serveur (pas dans le browser)
export const env = typeof window === 'undefined' ? validateEnv() : ({} as Record<EnvKey, string>);