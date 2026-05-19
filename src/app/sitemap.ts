import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Revalide chaque heure — équilibre fraîcheur / coût Supabase.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inrealsociety.com';
  const now = new Date();

  // Pages statiques publiques.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`,                 lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/shop`,             lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/manifeste`,        lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/cgv`,              lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/confidentialite`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ];

  // Profils publics actifs — limite à 5000 pour rester sous la limite Google (50k urls / sitemap).
  // Les membres en pause sont exclus pour ne pas exposer de profil inactif.
  const { data: members } = await supabaseAdmin
    .from('members')
    .select('id, updated_at')
    .eq('is_paused', false)
    .order('updated_at', { ascending: false })
    .limit(5000);

  const memberPages: MetadataRoute.Sitemap = (members ?? []).map(m => ({
    url:             `${baseUrl}/profil/${m.id}`,
    lastModified:    new Date(m.updated_at),
    changeFrequency: 'weekly' as const,
    priority:        0.7,
  }));

  return [...staticPages, ...memberPages];
}
