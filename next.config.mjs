import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    // Content-Security-Policy : whitelist stricte des sources autorisées.
    // Inspiré des bonnes pratiques OWASP + intégrations réelles du projet :
    //   - scripts : self + Stripe + Vercel (analytics si activé) + 'unsafe-inline'
    //     pour le snippet Next.js (encore nécessaire en App Router)
    //   - connect : self + Supabase + Stripe + PostHog + Sentry + Resend (webhook)
    //   - img : self + data: + Supabase storage + Stripe assets
    //   - frame : Stripe Checkout iframe
    // Si tu utilises Vercel Analytics ou un autre service tierce, ajouter sa
    // source ici. 'unsafe-eval' évité (pas nécessaire en prod Next.js).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com https://*.sentry.io",
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
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',  value: csp },
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control',   value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
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