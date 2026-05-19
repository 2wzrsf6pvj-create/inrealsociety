import { withSentryConfig } from '@sentry/nextjs';

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
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// withSentryConfig est un no-op si SENTRY_AUTH_TOKEN n'est pas défini (pas d'upload de source maps).
// Désactive le tunneling côté client pour éviter une route /monitoring conflictuelle.
export default withSentryConfig(nextConfig, {
  silent:             !process.env.CI,
  org:                process.env.SENTRY_ORG,
  project:            process.env.SENTRY_PROJECT,
  authToken:          process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload:   true,
  disableLogger:           true,
  automaticVercelMonitors: false,
});