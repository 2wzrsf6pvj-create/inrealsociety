// app/profil/[memberId]/page.tsx — Server Component
import { notFound } from 'next/navigation';
import { getMemberById, getFirstScanAt } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import ProfilClient from './ProfilClient';

interface Props { params: { memberId: string } }

export async function generateMetadata({ params }: Props) {
  const member = await getMemberById(params.memberId);
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
    getMemberById(params.memberId),
    getFirstScanAt(params.memberId),
  ]);

  if (!member) notFound();

  // Détecte si le visiteur est le propriétaire de ce profil
  let isOwner = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && member.auth_user_id === user.id) {
      isOwner = true;
    }
  } catch {}

  return <ProfilClient member={member} firstScanAt={firstScanAt} isOwner={isOwner} />;
}