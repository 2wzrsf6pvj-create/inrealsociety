import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer, webpack }) {
    // Sentry dans le navigateur : les erreurs seulement (choix de Clément). Le
    // code de suivi de performance est retiré du bundle client — moins de
    // JavaScript et de calcul sur chaque page. Le serveur garde son tracing.
    if (!isServer) {
      config.plugins.push(new webpack.DefinePlugin({ __SENTRY_TRACING__: false }));
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    // ⚠️ Content-Security-Policy : N'EST PLUS POSÉE ICI. Elle est désormais
    // générée par requête dans `src/middleware.ts` avec un nonce + 'strict-dynamic'
    // (CSP3 stricte, sans 'unsafe-inline' sur les scripts). Voir DEPLOY_CHECKLIST
    // §2bis. Ne PAS ré-ajouter de CSP statique ici : elle entrerait en conflit
    // avec celle du middleware (deux headers Content-Security-Policy enforçants).
    const isProd = process.env.NODE_ENV === 'production';

    const headers = [
      { key: 'X-Frame-Options',          value: 'DENY' },
      { key: 'X-Content-Type-Options',   value: 'nosniff' },
      { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control',   value: 'on' },
      { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(self)' },
    ];

    // HSTS : n'a de sens que sur HTTPS réel. Inutile (et ignoré) sur http://localhost,
    // mais on évite de l'envoyer en dev pour ne pas polluer l'état du navigateur.
    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/(.*)',
        headers,
      },
    ];
  },
};

// withSentryConfig est un no-op si SENTRY_AUTH_TOKEN n'est pas défini (pas d'upload de source maps).
// withBundleAnalyzer s'active uniquement avec ANALYZE=true (npm run analyze).
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent:               !process.env.CI,
  org:                  process.env.SENTRY_ORG,
  project:              process.env.SENTRY_PROJECT,
  authToken:            process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  webpack: {
    treeshake:               { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});