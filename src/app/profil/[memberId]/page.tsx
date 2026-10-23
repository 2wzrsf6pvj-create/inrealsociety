// app/profil/[memberId]/page.tsx — Server Component
import { notFound } from 'next/navigation';
import { getPublicMember } from '@/lib/supabase';
import { getFirstScanAt, isProfileOwner } from '@/lib/queries-server';
import { createClient } from '@/lib/supabase-server';
import ProfilClient from './ProfilClient';

interface Props { params: Promise<{ memberId: string }>; searchParams: Promise<{ preview?: string }> }

// Un profil se découvre en scannant un t-shirt, pas sur un moteur de recherche :
// jamais indexé (prénom, photo, Instagram d'un porteur). Les balises de partage
// restent, pour l'aperçu quand le porteur partage lui-même son lien.
const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const member = await getPublicMember(params.memberId);
  if (!member) return { title: 'In Real Society', robots: NOINDEX };

  // OG/Twitter explicites pour garantir le partage social viral.
  // L'image dynamique est générée par /profil/[id]/opengraph-image.tsx (edge).
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inrealsociety.com';
  const profileUrl = `${appUrl}/profil/${params.memberId}`;
  const ogImage    = `${profileUrl}/opengraph-image`;

  return {
    title:       member.name,   // le gabarit du layout ajoute « — In Real Society »
    description: member.pitch,
    robots:      NOINDEX,
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

export default async function ProfilPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const member = await getPublicMember(params.memberId);
  if (!member) notFound();

  // Détecte si le visiteur est le propriétaire de ce profil. member.auth_user_id
  // est nullé (profil public), donc on vérifie l'ownership côté serveur (admin).
  let isOwner = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      isOwner = await isProfileOwner(params.memberId, user.id);
    }
  } catch {}

  // `firstScanAt` n'est utilisé que dans la vue propriétaire → on ne le récupère et
  // ne le sérialise QUE pour le propriétaire. Avant, il était calculé pour tous et
  // envoyé dans le HTML même à un scanneur anonyme (exposition inutile d'un timestamp).
  const firstScanAt = isOwner ? await getFirstScanAt(params.memberId) : null;

  // Aperçu « vis ton premier scan » : le porteur voit son profil tel qu'un
  // scanneur le voit. Réservé au propriétaire (sinon ignoré → vue scanneur).
  const preview = isOwner && searchParams?.preview === '1';

  return <ProfilClient member={member} firstScanAt={firstScanAt} isOwner={isOwner} preview={preview} />;
}