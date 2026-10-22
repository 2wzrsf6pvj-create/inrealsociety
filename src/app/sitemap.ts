import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inrealsociety.com';
  const now = new Date();

  // Pages statiques publiques.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`,                 lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/shop`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/manifeste`,        lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/faq`,              lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/cgv`,              lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/confidentialite`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/mentions-legales`, lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ];

  // Les profils des porteurs n'y figurent PAS : on découvre un profil en scannant
  // un t-shirt, dans la vraie vie. Les lister permettait de récupérer tous les
  // porteurs et de leur écrire à distance (et Google les indexait). Les pages
  // profil portent en plus `robots: noindex` (cf. profil/[memberId]/page.tsx).
  return staticPages;
}
