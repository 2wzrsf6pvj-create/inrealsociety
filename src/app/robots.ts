import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inrealsociety.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow:     ['/'],
        disallow:  [
          '/api/',
          '/auth/',
          '/dashboard',
          '/dashboard/',
          '/conversation/',
          '/message',
          '/register',
          '/migrate',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
