// app/profil/[memberId]/page.tsx — Server Component
import { notFound } from 'next/navigation';
import { getPublicMember } from '@/lib/supabase';
import { getFirstScanAt, isProfileOwner } from '@/lib/queries-server';
import { createClient } from '@/lib/supabase-server';
import ProfilClient from './ProfilClient';

interface Props { params: { memberId: string } }

export async function generateMetadata({ params }: Props) {
  const member = await getPublicMember(params.memberId);
  if (!member) return { title: 'In Real Society' };

  // OG/Twitter explicites pour garantir le partage social viral.
  // L'image dynamique est générée par /profil/[id]/opengraph-image.tsx (edge).
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inrealsociety.com';
  const profileUrl = `${appUrl}/profil/${params.memberId}`;
  const ogImage    = `${profileUrl}/opengraph-image`;

  return {
    title:       `${member.name} — In Real Society`,
    description: member.pitch,
    alternates:  { canonical: profileUrl },
    openGraph: {
      type:        'profile',
      url:         profileUrl,
      title:       `${member.name} — In Real Society`,
      description: member.pitch,
      siteName:    'In Real Society',
      images:      [{ url: ogImage, width: 1200, height: 630, alt: `Profil ${member.name}` }],
      locale:      'fr_FR',
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${member.name} — In Real Society`,
      description: member.pitch,
      images:      [ogImage],
    },
  };
}

export default async function ProfilPage({ params }: Props) {
  const [member, firstScanAt] = await Promise.all([
    getPublicMember(params.memberId),
    getFirstScanAt(params.memberId),
  ]);

  if (!member) notFound();

  // Détecte si le visiteur est le propriétaire de ce profil. member.auth_user_id
  // est nullé (profil public), donc on vérifie l'ownership côté serveur (admin).
  let isOwner = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      isOwner = await isProfileOwner(params.memberId, user.id);
    }
  } catch {}

  return <ProfilClient member={member} firstScanAt={firstScanAt} isOwner={isOwner} />;
}